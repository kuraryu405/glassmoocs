(function () {
  if (
    typeof globalThis.importScripts === 'function' &&
    !globalThis.__glassmoocsBackgroundPdfUtilsLoaded
  ) {
    globalThis.importScripts('background/pdf.js');
    globalThis.__glassmoocsBackgroundPdfUtilsLoaded = true;
  }

  const DOWNLOAD_STATE_STORAGE_KEY = 'glassmoocs_download_state';
  const DEBUG_LOGS_ENABLED = __GLASSMOOCS_ENABLE_DEBUG_LOGS__;
  const DEBUG_LOG_BUFFER_STORAGE_KEY = DEBUG_LOGS_ENABLED
    ? __GLASSMOOCS_DEBUG_STRING__('glassmoocs_debug_log_buffer')
    : '';
  const DEBUG_LOG_TEXT_STORAGE_KEY = DEBUG_LOGS_ENABLED
    ? __GLASSMOOCS_DEBUG_STRING__('glassmoocs_debug_log_text')
    : '';
  const SETTINGS_STORAGE_KEY = 'glassmoocs_settings';
  const MESSAGE_TYPES = {
    getState: 'glassmoocs:get-download-state',
    setState: 'glassmoocs:set-download-state',
    resetState: 'glassmoocs:reset-download-state',
    ...(DEBUG_LOGS_ENABLED
      ? {
          getDebugLogReport: __GLASSMOOCS_DEBUG_STRING__(
            'glassmoocs:get-debug-log-report',
          ),
        }
      : {}),
    downloadAssets: 'glassmoocs:download-assets',
    ...(DEBUG_LOGS_ENABLED
      ? {
          relayAgentLog: __GLASSMOOCS_DEBUG_STRING__(
            'glassmoocs:relay-agent-log',
          ),
        }
      : {}),
    getSlidesCapturePermission: 'glassmoocs:get-slides-capture-permission',
    openSlidesCapturePermissionWindow:
      'glassmoocs:open-slides-capture-permission-window',
    fetchImageDataUrl: 'glassmoocs:fetch-image-data-url',
    getSlidesSessionInfo: 'glassmoocs:get-slides-session-info',
    waitForSlideReady: 'glassmoocs:wait-for-slide-ready',
    goToFirstSlide: 'glassmoocs:go-to-first-slide',
    goToSlide: 'glassmoocs:go-to-slide',
    serializeCurrentSlideSvg: 'glassmoocs:serialize-current-slide-svg',
  };
  const STATUS = {
    idle: 'idle',
    collecting: 'collecting',
    downloading: 'downloading',
    rendering: 'rendering',
    printing: 'printing',
    done: 'done',
    partialFailed: 'partial_failed',
    failed: 'failed',
  };
  const CAPTURE_PERMISSION_ORIGIN = '<all_urls>';
  const CAPTURE_QUALITY = 88;
  const CAPTURE_INTERVAL_MS = 250;
  const CAPTURE_REACTIVATE_DELAY_MS = 500;
  const SLIDES_TAB_RETRY_DELAY_MS = 1000;
  const DOWNLOAD_PARALLEL_LIMIT = 2;
  const SVG_RENDER_SCALE = 1.5;
  const SVG_RENDER_MIN_WIDTH = 1024;
  const SVG_RENDER_MIN_HEIGHT = 576;
  const DEBUG_LOG_BUFFER_LIMIT = 1200;
  const DEBUG_LOG_TEXT_LINE_LIMIT = 2400;
  const MAX_PATH_SEGMENT_LENGTH = 120;
  const AGENT_LOG_RUNTIME = 'background';
  const AGENT_LOG_ENDPOINT = DEBUG_LOGS_ENABLED
    ? __GLASSMOOCS_DEBUG_STRING__('http://127.0.0.1:7443/ingest')
    : '';
  const ERROR_CODES = {
    canceled: 'canceled',
    capturePermissionRequired: 'capture_permission_required',
    captureInterrupted: 'capture_interrupted',
    slidesInteractionInterrupted: 'slides_interaction_interrupted',
  };
  const WINDOWS_RESERVED_NAMES = new Set([
    'CON',
    'PRN',
    'AUX',
    'NUL',
    'COM1',
    'COM2',
    'COM3',
    'COM4',
    'COM5',
    'COM6',
    'COM7',
    'COM8',
    'COM9',
    'LPT1',
    'LPT2',
    'LPT3',
    'LPT4',
    'LPT5',
    'LPT6',
    'LPT7',
    'LPT8',
    'LPT9',
  ]);
  const api = globalThis.browser || globalThis.chrome;
  // [H-QUEUE-A] content からのキュー投入または状態遷移が不整合
  // [H-TAB-A] Slides タブ生成/読み込みが不安定
  // [H-SLIDE-A] Slides のページ遷移/描画待機が不安定
  // [H-SVG-A] SVG 直列化/画像インライン化が不安定
  // [H-PDF-A] ラスタライズ/PDF 化または downloads 完了待ちが不安定
  // [H-CAPTURE-A] capture fallback の権限/前面タブ依存で失敗する
  // #region agent log
  const AGENT_LOG_SESSION_ID = `glassmoocs-bg-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  const AGENT_LOG_HYPOTHESES = DEBUG_LOGS_ENABLED
    ? {
        queue: __GLASSMOOCS_DEBUG_STRING__('H-QUEUE-A'),
        tab: __GLASSMOOCS_DEBUG_STRING__('H-TAB-A'),
        slide: __GLASSMOOCS_DEBUG_STRING__('H-SLIDE-A'),
        svg: __GLASSMOOCS_DEBUG_STRING__('H-SVG-A'),
        pdf: __GLASSMOOCS_DEBUG_STRING__('H-PDF-A'),
        capture: __GLASSMOOCS_DEBUG_STRING__('H-CAPTURE-A'),
      }
    : {};

  let queueNonce = 0;
  const activeSlidesTabIds = new Set();
  let settingsDebugLoggingEnabled = false;
  let activeDebugLogContext = null;
  let debugLogBufferWrite = Promise.resolve();

  if (!api?.runtime?.onMessage) {
    return;
  }

  function getRuntimeLastError() {
    return globalThis.chrome?.runtime?.lastError || null;
  }

  function summarizeError(error) {
    if (!error || typeof error !== 'object') {
      return {
        name: '',
        message: normalizeText(error),
        code: '',
        stack: '',
      };
    }

    return {
      name: normalizeText(error.name),
      message: normalizeText(error.message),
      code: normalizeText(error.code),
      stack: normalizeText(
        typeof error.stack === 'string' ? error.stack.split('\n')[0] : '',
      ),
    };
  }

  function createCaptureInterruptedError() {
    const error = new Error(
      'Slides キャプチャ中に別タブへ移動したため、保存を中止しました。',
    );
    error.code = ERROR_CODES.captureInterrupted;
    return error;
  }

  function createSlidesInteractionInterruptedError() {
    const error = new Error(
      'Slides 保存用タブを操作したため、保存を中止しました。再実行して、保存中は Slides タブを触らないでください。',
    );
    error.code = ERROR_CODES.slidesInteractionInterrupted;
    return error;
  }

  function normalizeDebugLogContext(rawContext, fallbackSessionId = '') {
    if (!DEBUG_LOGS_ENABLED) {
      return {
        enabled: false,
        endpoint: '',
        sessionId: normalizeText(fallbackSessionId),
        source: '',
      };
    }

    const context =
      rawContext && typeof rawContext === 'object' ? rawContext : {};

    return {
      enabled:
        typeof context.enabled === 'boolean'
          ? context.enabled
          : settingsDebugLoggingEnabled,
      endpoint: normalizeText(context.endpoint, AGENT_LOG_ENDPOINT),
      sessionId: normalizeText(context.sessionId, fallbackSessionId),
      source: normalizeText(context.source),
    };
  }

  function summarizeState(state) {
    return {
      status: normalizeText(state?.status),
      stage: normalizeText(state?.stage),
      activeItem: normalizeText(state?.activeItem),
      activeJobType: normalizeText(state?.activeJobType),
      pendingCount: Array.isArray(state?.pending) ? state.pending.length : 0,
      completedCount: Array.isArray(state?.completed)
        ? state.completed.length
        : 0,
      failedCount: Array.isArray(state?.failed) ? state.failed.length : 0,
      needsCapturePermission: !!state?.needsCapturePermission,
    };
  }

  function buildSlidesMessage(type, extra = {}) {
    const context = normalizeDebugLogContext(activeDebugLogContext);
    return {
      type,
      ...extra,
      debugLogContext: context,
    };
  }

  function postAgentLog(location, message, data = {}, hypothesisId = '') {
    if (!DEBUG_LOGS_ENABLED) {
      return;
    }

    const payload =
      data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    const context = normalizeDebugLogContext(
      payload.debugLogContext || activeDebugLogContext,
      AGENT_LOG_SESSION_ID,
    );
    if (!context.enabled) {
      return;
    }

    const {
      debugLogContext: UNUSED_DEBUG_LOG_CONTEXT,
      sessionId: UNUSED_SESSION_ID,
      ...rest
    } = payload;

    const entry = {
      sessionId: context.sessionId,
      runtime: AGENT_LOG_RUNTIME,
      location,
      message,
      data: rest,
      hypothesisId,
      timestamp: Date.now(),
    };

    fetch(`${context.endpoint}/${context.sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    }).catch(() => {
      appendDebugLogBuffer(entry);
    });
  }

  function relayAgentLogPayload(payload) {
    if (!DEBUG_LOGS_ENABLED) {
      return;
    }

    const normalizedPayload =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? payload
        : {};
    const sessionId = normalizeText(
      normalizedPayload.sessionId,
      AGENT_LOG_SESSION_ID,
    );
    const runtime = normalizeText(normalizedPayload.runtime, AGENT_LOG_RUNTIME);
    const endpoint = normalizeText(
      normalizedPayload.endpoint,
      AGENT_LOG_ENDPOINT,
    );
    const location = normalizeText(normalizedPayload.location);
    const message = normalizeText(normalizedPayload.message);
    if (!location || !message) {
      return;
    }

    const {
      endpoint: UNUSED_ENDPOINT,
      sessionId: UNUSED_SESSION_ID,
      runtime: UNUSED_RUNTIME,
      location: UNUSED_LOCATION,
      message: UNUSED_MESSAGE,
      hypothesisId: UNUSED_HYPOTHESIS_ID,
      timestamp: UNUSED_TIMESTAMP,
      ...data
    } = normalizedPayload;

    const entry = {
      sessionId,
      runtime,
      location,
      message,
      data,
      hypothesisId: normalizeText(normalizedPayload.hypothesisId),
      timestamp:
        Number.isFinite(normalizedPayload.timestamp) &&
        normalizedPayload.timestamp > 0
          ? normalizedPayload.timestamp
          : Date.now(),
    };

    fetch(`${endpoint}/${sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    }).catch(() => {
      appendDebugLogBuffer(entry);
    });
  }
  // #endregion agent log

  if (DEBUG_LOGS_ENABLED) {
    storageGet([SETTINGS_STORAGE_KEY])
      .then((result) => {
        settingsDebugLoggingEnabled =
          typeof result?.[SETTINGS_STORAGE_KEY]?.debugLoggingEnabled ===
          'boolean'
            ? result[SETTINGS_STORAGE_KEY].debugLoggingEnabled
            : false;
      })
      .catch(() => {});

    api.storage?.onChanged?.addListener((changes, areaName) => {
      if (areaName !== 'local' && areaName !== 'sync') {
        return;
      }

      const nextValue = changes?.[SETTINGS_STORAGE_KEY]?.newValue;
      if (!nextValue || typeof nextValue !== 'object') {
        settingsDebugLoggingEnabled = false;
        return;
      }

      settingsDebugLoggingEnabled =
        typeof nextValue.debugLoggingEnabled === 'boolean'
          ? nextValue.debugLoggingEnabled
          : false;
    });
  }

  function storageGet(keys) {
    try {
      const result = api.storage.local.get(keys);
      if (result && typeof result.then === 'function') {
        return result;
      }
    } catch {
      return Promise.resolve({});
    }

    return new Promise((resolve, reject) => {
      try {
        api.storage.local.get(keys, (value) => {
          const error = getRuntimeLastError();
          if (error) {
            reject(new Error(error.message));
            return;
          }

          resolve(value);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  function storageSet(value) {
    try {
      const result = api.storage.local.set(value);
      if (result && typeof result.then === 'function') {
        return result.then(() => {});
      }
    } catch {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      try {
        api.storage.local.set(value, () => {
          const error = getRuntimeLastError();
          if (error) {
            reject(new Error(error.message));
            return;
          }

          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  function appendDebugLogBuffer(entry) {
    const normalizedEntry =
      entry && typeof entry === 'object' && !Array.isArray(entry) ? entry : {};
    debugLogBufferWrite = debugLogBufferWrite
      .catch(() => {})
      .then(async () => {
        try {
          const result = await storageGet([DEBUG_LOG_BUFFER_STORAGE_KEY]);
          const current = Array.isArray(result?.[DEBUG_LOG_BUFFER_STORAGE_KEY])
            ? result[DEBUG_LOG_BUFFER_STORAGE_KEY]
            : [];
          const next = [
            ...current.slice(-(DEBUG_LOG_BUFFER_LIMIT - 1)),
            {
              sessionId: normalizeText(normalizedEntry.sessionId),
              runtime: normalizeText(normalizedEntry.runtime),
              location: normalizeText(normalizedEntry.location),
              message: normalizeText(normalizedEntry.message),
              data:
                normalizedEntry.data &&
                typeof normalizedEntry.data === 'object' &&
                !Array.isArray(normalizedEntry.data)
                  ? normalizedEntry.data
                  : {},
              hypothesisId: normalizeText(normalizedEntry.hypothesisId),
              timestamp:
                Number.isFinite(normalizedEntry.timestamp) &&
                normalizedEntry.timestamp > 0
                  ? normalizedEntry.timestamp
                  : Date.now(),
            },
          ];
          const line = JSON.stringify(next[next.length - 1]);
          const currentText = normalizeText(
            result?.[DEBUG_LOG_TEXT_STORAGE_KEY],
          );
          const nextText = [...currentText.split('\n').filter(Boolean), line]
            .slice(-DEBUG_LOG_TEXT_LINE_LIMIT)
            .join('\n');
          await storageSet({
            [DEBUG_LOG_BUFFER_STORAGE_KEY]: next,
            [DEBUG_LOG_TEXT_STORAGE_KEY]: nextText,
          });
        } catch {
          // Ignore debug log persistence failures.
        }
      });
    return debugLogBufferWrite;
  }

  function parseDebugLogEntry(rawEntry) {
    if (!rawEntry || typeof rawEntry !== 'object' || Array.isArray(rawEntry)) {
      return null;
    }

    return {
      sessionId: normalizeText(rawEntry.sessionId),
      runtime: normalizeText(rawEntry.runtime),
      location: normalizeText(rawEntry.location),
      message: normalizeText(rawEntry.message),
      data:
        rawEntry.data &&
        typeof rawEntry.data === 'object' &&
        !Array.isArray(rawEntry.data)
          ? rawEntry.data
          : {},
      hypothesisId: normalizeText(rawEntry.hypothesisId),
      timestamp:
        Number.isFinite(rawEntry.timestamp) && rawEntry.timestamp > 0
          ? rawEntry.timestamp
          : 0,
    };
  }

  function createDebugLogSessionSummary(sessionId) {
    return {
      sessionId,
      startedAt: 0,
      lastTimestamp: 0,
      entryCount: 0,
      durations: {
        waitForSlideReady: [],
        inlineSlideImages: [],
        serializeCurrentSlideSvg: [],
      },
    };
  }

  function appendDebugDuration(list, value, page) {
    const durationMs = Number(value);
    if (!Number.isFinite(durationMs) || durationMs < 0) {
      return;
    }

    list.push({
      durationMs: Math.round(durationMs),
      page: Number.isFinite(Number(page)) ? Number(page) : null,
    });
  }

  function finalizeDebugDurationStats(items) {
    if (!Array.isArray(items) || items.length === 0) {
      return {
        count: 0,
        totalDurationMs: 0,
        avgDurationMs: 0,
        maxDurationMs: 0,
        maxPage: null,
        items: [],
      };
    }

    let totalDurationMs = 0;
    let maxDurationMs = 0;
    let maxPage = null;
    items.forEach((item) => {
      totalDurationMs += item.durationMs;
      if (item.durationMs > maxDurationMs) {
        maxDurationMs = item.durationMs;
        maxPage = item.page;
      }
    });

    return {
      count: items.length,
      totalDurationMs,
      avgDurationMs: Math.round(totalDurationMs / items.length),
      maxDurationMs,
      maxPage,
      items,
    };
  }

  function summarizeDebugLogSessions(entries) {
    const sessions = new Map();

    entries.forEach((entry) => {
      const sessionId = normalizeText(entry?.sessionId);
      if (!sessionId) {
        return;
      }

      const normalizedEntry = parseDebugLogEntry(entry);
      if (!normalizedEntry) {
        return;
      }

      const current =
        sessions.get(sessionId) || createDebugLogSessionSummary(sessionId);
      current.entryCount += 1;
      if (normalizedEntry.timestamp > 0) {
        current.startedAt =
          current.startedAt > 0
            ? Math.min(current.startedAt, normalizedEntry.timestamp)
            : normalizedEntry.timestamp;
        current.lastTimestamp = Math.max(
          current.lastTimestamp,
          normalizedEntry.timestamp,
        );
      }

      const location = normalizedEntry.location;
      const durationMs = normalizedEntry.data?.durationMs;
      const page = normalizedEntry.data?.page;

      if (location === 'slides-export.js:waitForSlideReady') {
        appendDebugDuration(
          current.durations.waitForSlideReady,
          durationMs,
          page,
        );
      } else if (location === 'slides-export.js:inlineSlideImages') {
        appendDebugDuration(
          current.durations.inlineSlideImages,
          durationMs,
          page,
        );
      } else if (location === 'slides-export.js:serializeCurrentSlideSvg') {
        appendDebugDuration(
          current.durations.serializeCurrentSlideSvg,
          durationMs,
          page,
        );
      }

      sessions.set(sessionId, current);
    });

    return [...sessions.values()]
      .map((session) => ({
        sessionId: session.sessionId,
        startedAt: session.startedAt,
        lastTimestamp: session.lastTimestamp,
        entryCount: session.entryCount,
        durations: {
          waitForSlideReady: finalizeDebugDurationStats(
            session.durations.waitForSlideReady,
          ),
          inlineSlideImages: finalizeDebugDurationStats(
            session.durations.inlineSlideImages,
          ),
          serializeCurrentSlideSvg: finalizeDebugDurationStats(
            session.durations.serializeCurrentSlideSvg,
          ),
        },
      }))
      .sort((left, right) => right.lastTimestamp - left.lastTimestamp);
  }

  async function getDebugLogReport() {
    if (!DEBUG_LOGS_ENABLED) {
      return {
        text: '',
        entryCount: 0,
        sessions: [],
      };
    }

    const result = await storageGet([
      DEBUG_LOG_BUFFER_STORAGE_KEY,
      DEBUG_LOG_TEXT_STORAGE_KEY,
    ]);
    const entries = Array.isArray(result?.[DEBUG_LOG_BUFFER_STORAGE_KEY])
      ? result[DEBUG_LOG_BUFFER_STORAGE_KEY].map((entry) =>
          parseDebugLogEntry(entry),
        ).filter(Boolean)
      : [];
    const text =
      typeof result?.[DEBUG_LOG_TEXT_STORAGE_KEY] === 'string'
        ? result[DEBUG_LOG_TEXT_STORAGE_KEY]
        : '';

    return {
      text,
      entryCount: entries.length,
      sessions: summarizeDebugLogSessions(entries),
    };
  }

  function downloadFile(options) {
    try {
      const result = api.downloads.download(options);
      if (result && typeof result.then === 'function') {
        return result;
      }
    } catch (error) {
      return Promise.reject(error);
    }

    return new Promise((resolve, reject) => {
      try {
        api.downloads.download(options, (downloadId) => {
          const error = getRuntimeLastError();
          if (error) {
            reject(new Error(error.message));
            return;
          }

          resolve(downloadId);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  function downloadsSearch(query) {
    try {
      const result = api.downloads.search(query);
      if (result && typeof result.then === 'function') {
        return result;
      }
    } catch (error) {
      return Promise.reject(error);
    }

    return new Promise((resolve, reject) => {
      try {
        api.downloads.search(query, (items) => {
          const error = getRuntimeLastError();
          if (error) {
            reject(new Error(error.message));
            return;
          }

          resolve(items);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  function tabsCreate(createProperties) {
    try {
      const result = api.tabs.create(createProperties);
      if (result && typeof result.then === 'function') {
        return result;
      }
    } catch (error) {
      return Promise.reject(error);
    }

    return new Promise((resolve, reject) => {
      try {
        api.tabs.create(createProperties, (tab) => {
          const error = getRuntimeLastError();
          if (error) {
            reject(new Error(error.message));
            return;
          }

          resolve(tab);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  function windowsCreate(createData) {
    try {
      const result = api.windows.create(createData);
      if (result && typeof result.then === 'function') {
        return result;
      }
    } catch (error) {
      return Promise.reject(error);
    }

    return new Promise((resolve, reject) => {
      try {
        api.windows.create(createData, (windowInfo) => {
          const error = getRuntimeLastError();
          if (error) {
            reject(new Error(error.message));
            return;
          }

          resolve(windowInfo);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  function tabsRemove(tabIds) {
    try {
      const result = api.tabs.remove(tabIds);
      if (result && typeof result.then === 'function') {
        return result.then(() => {});
      }
    } catch (error) {
      return Promise.reject(error);
    }

    return new Promise((resolve, reject) => {
      try {
        api.tabs.remove(tabIds, () => {
          const error = getRuntimeLastError();
          if (error) {
            reject(new Error(error.message));
            return;
          }

          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  function tabsGet(tabId) {
    try {
      const result = api.tabs.get(tabId);
      if (result && typeof result.then === 'function') {
        return result;
      }
    } catch (error) {
      return Promise.reject(error);
    }

    return new Promise((resolve, reject) => {
      try {
        api.tabs.get(tabId, (tab) => {
          const error = getRuntimeLastError();
          if (error) {
            reject(new Error(error.message));
            return;
          }

          resolve(tab);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  function tabsUpdate(tabId, updateProperties) {
    try {
      const result = api.tabs.update(tabId, updateProperties);
      if (result && typeof result.then === 'function') {
        return result;
      }
    } catch (error) {
      return Promise.reject(error);
    }

    return new Promise((resolve, reject) => {
      try {
        api.tabs.update(tabId, updateProperties, (tab) => {
          const error = getRuntimeLastError();
          if (error) {
            reject(new Error(error.message));
            return;
          }

          resolve(tab);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  function tabsQuery(queryInfo) {
    try {
      const result = api.tabs.query(queryInfo);
      if (result && typeof result.then === 'function') {
        return result;
      }
    } catch (error) {
      return Promise.reject(error);
    }

    return new Promise((resolve, reject) => {
      try {
        api.tabs.query(queryInfo, (tabs) => {
          const error = getRuntimeLastError();
          if (error) {
            reject(new Error(error.message));
            return;
          }

          resolve(tabs);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  function tabsSendMessage(tabId, message) {
    try {
      const result = api.tabs.sendMessage(tabId, message);
      if (result && typeof result.then === 'function') {
        return result;
      }
    } catch (error) {
      return Promise.reject(error);
    }

    return new Promise((resolve, reject) => {
      try {
        api.tabs.sendMessage(tabId, message, (response) => {
          const error = getRuntimeLastError();
          if (error) {
            reject(new Error(error.message));
            return;
          }

          resolve(response);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  function captureVisibleTab(windowId, options) {
    try {
      const result = api.tabs.captureVisibleTab(windowId, options);
      if (result && typeof result.then === 'function') {
        return result;
      }
    } catch (error) {
      return Promise.reject(error);
    }

    return new Promise((resolve, reject) => {
      try {
        api.tabs.captureVisibleTab(windowId, options, (dataUrl) => {
          const error = getRuntimeLastError();
          if (error) {
            reject(new Error(error.message));
            return;
          }

          resolve(dataUrl);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  function createIdleState() {
    return {
      status: STATUS.idle,
      courseName: '',
      startedAt: '',
      finishedAt: '',
      activeItem: '',
      activeJobType: '',
      sourceUrl: '',
      viewerUrl: '',
      stage: '',
      pending: [],
      completed: [],
      failed: [],
      lastError: '',
      needsCapturePermission: false,
    };
  }

  function normalizeText(value, fallback = '') {
    if (typeof value !== 'string') return fallback;
    const normalized = value.replace(/\s+/g, ' ').trim();
    return normalized || fallback;
  }

  function isFirefoxLike() {
    const userAgent = normalizeText(globalThis.navigator?.userAgent);
    return /firefox/i.test(userAgent);
  }

  function sanitizePathSegment(value, fallback) {
    const normalized = normalizeText(value, fallback);
    let replaced = normalized
      .split('')
      .map((char) => {
        if (char < ' ') return '_';
        if ('<>:"/\\|?*'.includes(char)) return '_';
        return char;
      })
      .join('')
      .replace(/[\s.]+$/g, '')
      .replace(/^[\s.]+/g, '')
      .trim();
    if (!replaced) {
      return fallback;
    }

    const extensionMatch = replaced.match(/(\.[a-z0-9]{1,16})$/i);
    const extension = extensionMatch ? extensionMatch[1] : '';
    const baseName = extension
      ? replaced.slice(0, -extension.length)
      : replaced;
    const reservedCandidate = (baseName || replaced).toUpperCase();
    if (WINDOWS_RESERVED_NAMES.has(reservedCandidate)) {
      replaced = extension ? `${baseName}_${extension}` : `${replaced}_`;
    }

    if (replaced.length > MAX_PATH_SEGMENT_LENGTH) {
      if (extension && extension.length < MAX_PATH_SEGMENT_LENGTH) {
        const maxBaseLength = Math.max(
          1,
          MAX_PATH_SEGMENT_LENGTH - extension.length,
        );
        replaced = `${baseName.slice(0, maxBaseLength)}${extension}`;
      } else {
        replaced = replaced.slice(0, MAX_PATH_SEGMENT_LENGTH);
      }
      replaced = replaced.replace(/[\s.]+$/g, '').trim();
    }

    return replaced || fallback;
  }

  function normalizeEntry(entry, index) {
    const fallbackName = `asset-${index + 1}`;

    return {
      id: normalizeText(entry?.id, `asset-${index + 1}`),
      kind: normalizeText(entry?.kind, 'direct_file'),
      url: normalizeText(entry?.url),
      sourceUrl: normalizeText(entry?.sourceUrl || entry?.url),
      viewerUrl: normalizeText(entry?.viewerUrl),
      filename: normalizeText(entry?.filename, fallbackName),
      year: normalizeText(entry?.year),
      lectureGroup: normalizeText(entry?.lectureGroup),
      lectureName: normalizeText(entry?.lectureName, 'lecture'),
      pageTitle: normalizeText(entry?.pageTitle),
      source: normalizeText(entry?.source, 'asset'),
    };
  }

  function normalizeState(rawState) {
    const idle = createIdleState();
    const state = rawState && typeof rawState === 'object' ? rawState : {};

    return {
      status: normalizeText(state.status, idle.status),
      courseName: normalizeText(state.courseName),
      startedAt: normalizeText(state.startedAt),
      finishedAt: normalizeText(state.finishedAt),
      activeItem: normalizeText(state.activeItem),
      activeJobType: normalizeText(state.activeJobType),
      sourceUrl: normalizeText(state.sourceUrl),
      viewerUrl: normalizeText(state.viewerUrl),
      stage: normalizeText(state.stage),
      pending: Array.isArray(state.pending) ? state.pending : idle.pending,
      completed: Array.isArray(state.completed)
        ? state.completed
        : idle.completed,
      failed: Array.isArray(state.failed) ? state.failed : idle.failed,
      lastError: normalizeText(state.lastError),
      needsCapturePermission: !!state.needsCapturePermission,
    };
  }

  function isTransientStatus(status) {
    return (
      status === STATUS.collecting ||
      status === STATUS.downloading ||
      status === STATUS.rendering ||
      status === STATUS.printing
    );
  }

  function recoverStaleState(rawState) {
    const state = normalizeState(rawState);
    if (!isTransientStatus(state.status)) {
      return state;
    }

    const interruptedItem = state.activeItem
      ? [
          {
            id: 'recovered-stale-job',
            kind: normalizeText(state.activeJobType),
            filename: normalizeText(state.activeItem, 'interrupted-job'),
            error: '拡張機能の再読み込みにより中断されました。',
          },
        ]
      : [];

    return normalizeState({
      ...state,
      status: interruptedItem.length > 0 ? STATUS.failed : STATUS.idle,
      finishedAt: new Date().toISOString(),
      activeItem: '',
      activeJobType: '',
      sourceUrl: '',
      viewerUrl: '',
      stage: '',
      pending: [],
      completed: [],
      failed: interruptedItem,
      lastError:
        interruptedItem.length > 0
          ? '前回のダウンロードジョブは拡張機能の再読み込みにより中断されました。'
          : '',
      needsCapturePermission: false,
    });
  }

  function createInterruptedDownloadState(state, error) {
    const normalized = normalizeState(state);
    const errorMessage = normalizeText(
      error?.message,
      'Slides 保存用タブの操作によりダウンロードを中止しました。',
    );
    const failedEntry = normalized.activeItem
      ? [
          {
            id: 'interrupted-active-job',
            kind: normalizeText(normalized.activeJobType),
            filename: normalizeText(normalized.activeItem, 'interrupted-job'),
            url: normalizeText(normalized.sourceUrl || normalized.viewerUrl),
            errorCode: normalizeText(error?.code),
            error: errorMessage,
          },
        ]
      : [];
    const failed = [...normalized.failed, ...failedEntry];
    const finalStatus =
      failed.length > 0
        ? normalized.completed.length > 0
          ? STATUS.partialFailed
          : STATUS.failed
        : STATUS.idle;

    return normalizeState({
      ...normalized,
      status: finalStatus,
      finishedAt: new Date().toISOString(),
      activeItem: '',
      activeJobType: '',
      sourceUrl: '',
      viewerUrl: '',
      stage: '',
      pending: [],
      failed,
      lastError: errorMessage,
      needsCapturePermission: false,
    });
  }

  async function interruptSlidesQueueIfForegrounded(state) {
    const normalized = normalizeState(state);
    if (
      !isTransientStatus(normalized.status) ||
      normalizeText(normalized.activeJobType) !== 'google_slides' ||
      activeSlidesTabIds.size <= 0
    ) {
      return normalized;
    }

    const trackedTabIds = [...activeSlidesTabIds];
    for (const tabId of trackedTabIds) {
      try {
        const tab = await tabsGet(tabId);
        if (!tab?.active) {
          continue;
        }

        const error = createSlidesInteractionInterruptedError();
        queueNonce += 1;
        activeSlidesTabIds.clear();
        trackedTabIds.forEach((activeTabId) => {
          closeTabQuietly(activeTabId).catch(() => {});
        });
        const interrupted = createInterruptedDownloadState(normalized, error);
        await saveState(interrupted);
        postAgentLog(
          'background.js:interruptSlidesQueueIfForegrounded',
          'interrupted slides queue because export tab became active',
          {
            tabId,
            status: normalizeText(normalized.status),
            stage: normalizeText(normalized.stage),
            activeItem: normalizeText(normalized.activeItem),
          },
          AGENT_LOG_HYPOTHESES.slide,
        );
        return interrupted;
      } catch (error) {
        postAgentLog(
          'background.js:interruptSlidesQueueIfForegrounded',
          'failed to inspect tracked slides tab',
          {
            tabId,
            error: summarizeError(error),
          },
          AGENT_LOG_HYPOTHESES.slide,
        );
      }
    }

    return normalized;
  }

  async function loadState() {
    const result = await storageGet([DOWNLOAD_STATE_STORAGE_KEY]);
    return await interruptSlidesQueueIfForegrounded(
      result[DOWNLOAD_STATE_STORAGE_KEY],
    );
  }

  async function recoverStateOnStartup() {
    const result = await storageGet([DOWNLOAD_STATE_STORAGE_KEY]);
    const recovered = recoverStaleState(result[DOWNLOAD_STATE_STORAGE_KEY]);
    return await saveState(recovered);
  }

  async function saveState(nextState) {
    const normalized = normalizeState(nextState);
    await storageSet({
      [DOWNLOAD_STATE_STORAGE_KEY]: normalized,
    });
    return normalized;
  }

  function summarizeEntry(entry) {
    return {
      id: entry.id,
      kind: entry.kind,
      url: entry.url,
      sourceUrl: entry.sourceUrl,
      viewerUrl: entry.viewerUrl,
      filename: entry.filename,
      year: entry.year,
      lectureGroup: entry.lectureGroup,
      lectureName: entry.lectureName,
      pageTitle: entry.pageTitle,
      source: entry.source,
    };
  }

  function canonicalizeAssetUrl(rawUrl) {
    const normalized = normalizeText(rawUrl);
    if (!normalized) {
      return '';
    }

    try {
      const url = new URL(normalized);
      url.hash = '';
      url.searchParams.delete('glassmoocs_export');
      url.searchParams.delete('glassmoocs_job');
      url.searchParams.delete('glassmoocs_filename');
      url.searchParams.sort();
      url.pathname = url.pathname.replace(/\/+$/g, '') || '/';
      return url.toString();
    } catch {
      return normalized;
    }
  }

  function getEntryDedupKey(entry) {
    const preferredUrl =
      entry.kind === 'google_slides'
        ? buildSlidesViewerUrl(entry) || entry.viewerUrl || entry.url
        : entry.url;
    return `${normalizeText(entry.kind, 'direct_file')}::${canonicalizeAssetUrl(preferredUrl)}`;
  }

  function buildSlidesViewerUrl(entry) {
    const rawUrl = normalizeText(
      entry.viewerUrl || entry.sourceUrl || entry.url,
    );
    if (!rawUrl) return '';

    try {
      const url = new URL(rawUrl);
      const pubMatch = url.pathname.match(
        /^(\/presentation\/d\/e\/[^/]+)\/(embed|pubembed)$/i,
      );
      if (pubMatch) {
        return `https://docs.google.com${pubMatch[1]}/pub`;
      }

      const privateMatch = url.pathname.match(
        /^(\/presentation\/d\/[^/]+)\/embed$/i,
      );
      if (privateMatch) {
        return `https://docs.google.com${privateMatch[1]}/present`;
      }

      return url.toString();
    } catch {
      return '';
    }
  }

  function buildLectureDirectory(entry) {
    const safeLectureGroup = sanitizePathSegment(entry.lectureGroup, '');
    const safeLectureName = sanitizePathSegment(entry.lectureName, 'lecture');

    if (!safeLectureGroup) {
      return safeLectureName;
    }

    return `${safeLectureGroup} - ${safeLectureName}`;
  }

  function buildDownloadFilename(courseName, entry) {
    const safeYear = sanitizePathSegment(entry.year, '');
    const safeCourseName = sanitizePathSegment(courseName, 'course');
    const safeLectureName = buildLectureDirectory(entry);
    const safeFileName = sanitizePathSegment(entry.filename, 'asset');

    if (safeYear) {
      return `glassmoocs/${safeYear}/${safeCourseName}/${safeLectureName}/${safeFileName}`;
    }

    return `glassmoocs/${safeCourseName}/${safeLectureName}/${safeFileName}`;
  }

  const {
    blobToDataUrl,
    canvasToJpegBytes,
    createCanvas,
    createPdfBuilder,
    cropCapturedSlide,
  } = globalThis.__glassmoocsCreateBackgroundPdfUtils({
    CAPTURE_QUALITY,
    normalizeText,
  });

  async function closeTabQuietly(tabId) {
    if (typeof tabId !== 'number') {
      return;
    }

    try {
      await tabsRemove(tabId);
    } catch {
      return;
    } finally {
      activeSlidesTabIds.delete(tabId);
    }
  }

  function rememberActiveSlidesTab(tabId) {
    if (typeof tabId === 'number') {
      activeSlidesTabIds.add(tabId);
    }
  }

  async function openOrReuseSlidesTab(existingTabId, viewerUrl, cancelToken) {
    assertNotCanceled(cancelToken);

    if (typeof existingTabId === 'number' && existingTabId >= 0) {
      try {
        const reusedTab = await tabsUpdate(existingTabId, {
          url: viewerUrl,
          active: false,
        });
        rememberActiveSlidesTab(reusedTab?.id);
        return await waitForTabLoad(reusedTab.id, viewerUrl, cancelToken);
      } catch {
        await closeTabQuietly(existingTabId);
      }
    }

    const slidesTab = await tabsCreate({ url: viewerUrl, active: false });
    rememberActiveSlidesTab(slidesTab?.id);
    return await waitForTabLoad(slidesTab.id, viewerUrl, cancelToken);
  }

  function createCancellationError() {
    const error = new Error('ダウンロード処理はキャンセルされました。');
    error.code = ERROR_CODES.canceled;
    return error;
  }

  function isCancellationError(error) {
    return normalizeText(error?.code) === ERROR_CODES.canceled;
  }

  function createCapturePermissionRequiredError() {
    const error = new Error(
      'Slides の高速エクスポートに失敗したため、表示タブキャプチャの許可が必要です。' +
        'ページ内の「権限を許可する」または拡張ポップアップの「Slides キャプチャを許可」から許可してください。',
    );
    error.code = ERROR_CODES.capturePermissionRequired;
    return error;
  }

  function assertNotCanceled(cancelToken) {
    if (cancelToken?.isCanceled?.()) {
      throw createCancellationError();
    }
  }

  function createCancelToken(nonce) {
    return {
      isCanceled() {
        return nonce !== queueNonce;
      },
      throwIfCanceled() {
        assertNotCanceled(this);
      },
    };
  }

  async function processDirectDownload(courseName, entry, cancelToken) {
    assertNotCanceled(cancelToken);
    const filename = buildDownloadFilename(courseName, entry);
    postAgentLog(
      'background.js:processDirectDownload',
      'starting direct file download',
      {
        entryId: entry.id,
        entryKind: entry.kind,
        filename,
        url: normalizeText(entry.url),
      },
      AGENT_LOG_HYPOTHESES.pdf,
    );
    const downloadId = await downloadFile({
      url: entry.url,
      filename,
      conflictAction: 'overwrite',
      saveAs: false,
    });
    await waitForDownloadCompletion(downloadId, cancelToken);
    postAgentLog(
      'background.js:processDirectDownload',
      'direct file download completed',
      {
        entryId: entry.id,
        downloadId,
        filename,
      },
      AGENT_LOG_HYPOTHESES.pdf,
    );
    return {
      downloadId,
      storedFilename: filename,
    };
  }

  async function downloadPdfBlob(blob, filename, cancelToken) {
    const blobUrl = URL.createObjectURL(blob);
    postAgentLog(
      'background.js:downloadPdfBlob',
      'starting pdf blob download',
      {
        filename: normalizeText(filename, 'slides.pdf'),
        blobBytes: Number(blob?.size) || 0,
      },
      AGENT_LOG_HYPOTHESES.pdf,
    );

    try {
      const downloadId = await downloadFile({
        url: blobUrl,
        filename: normalizeText(filename, 'slides.pdf'),
        conflictAction: 'overwrite',
        saveAs: false,
      });
      await waitForDownloadCompletion(downloadId, cancelToken);
      postAgentLog(
        'background.js:downloadPdfBlob',
        'pdf blob download completed',
        {
          downloadId,
          filename: normalizeText(filename, 'slides.pdf'),
        },
        AGENT_LOG_HYPOTHESES.pdf,
      );
      return {
        downloadId,
        storedFilename: normalizeText(filename, 'slides.pdf'),
      };
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  }

  async function saveProgressState(baseState, patch) {
    const latest = normalizeState(await loadState());
    await saveState({
      ...latest,
      courseName: latest.courseName || normalizeText(baseState?.courseName),
      startedAt: latest.startedAt || normalizeText(baseState?.startedAt),
      ...patch,
    });
  }

  async function sendTabMessageWithRetry(tabId, message, options = {}) {
    const attempts = Number.isFinite(options.attempts) ? options.attempts : 10;
    const intervalMs = Number.isFinite(options.intervalMs)
      ? options.intervalMs
      : 800;
    const cancelToken = options.cancelToken || null;
    let lastError = null;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      assertNotCanceled(cancelToken);
      if (attempt > 0) {
        await sleep(intervalMs);
      }

      try {
        postAgentLog(
          'background.js:sendTabMessageWithRetry',
          'sending tab message',
          {
            tabId,
            attempt: attempt + 1,
            attempts,
            type: normalizeText(message?.type),
          },
          AGENT_LOG_HYPOTHESES.slide,
        );
        return await tabsSendMessage(tabId, message);
      } catch (error) {
        lastError = error;
        postAgentLog(
          'background.js:sendTabMessageWithRetry',
          'tab message attempt failed',
          {
            tabId,
            attempt: attempt + 1,
            attempts,
            type: normalizeText(message?.type),
            error: summarizeError(error),
          },
          AGENT_LOG_HYPOTHESES.slide,
        );
      }
    }

    throw lastError || new Error('tab message failed');
  }

  function permissionsContains(permissions) {
    try {
      const result = api.permissions.contains(permissions);
      if (result && typeof result.then === 'function') {
        return result;
      }
    } catch (error) {
      return Promise.reject(error);
    }

    return new Promise((resolve, reject) => {
      try {
        api.permissions.contains(permissions, (granted) => {
          const err = getRuntimeLastError();
          if (err) {
            reject(new Error(err.message));
            return;
          }

          resolve(granted);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  function sleep(ms) {
    return new Promise((resolve) => {
      globalThis.setTimeout(resolve, ms);
    });
  }

  async function waitForTabLoad(tabId, targetUrl = '', cancelToken) {
    const timeoutAt = Date.now() + 60000;
    let lastUrl = '';

    while (Date.now() < timeoutAt) {
      assertNotCanceled(cancelToken);
      const tab = await tabsGet(tabId);
      const status = tab?.status || 'unknown';
      const currentUrl = tab?.url || '';
      lastUrl = currentUrl;

      if (status === 'complete' && currentUrl && currentUrl !== 'about:blank') {
        return tab;
      }

      await sleep(300);
    }

    throw new Error(
      `Slides exporter 用タブの読み込みがタイムアウトしました。 最終URL: ${normalizeText(lastUrl, targetUrl || 'unknown')}`,
    );
  }

  async function waitForDownloadCompletion(downloadId, cancelToken) {
    const timeoutAt = Date.now() + 120000;
    postAgentLog(
      'background.js:waitForDownloadCompletion',
      'waiting for download completion',
      {
        downloadId,
      },
      AGENT_LOG_HYPOTHESES.pdf,
    );

    while (Date.now() < timeoutAt) {
      assertNotCanceled(cancelToken);
      const items = await downloadsSearch({ id: downloadId });
      const item = items[0];

      if (!item) {
        throw new Error(`download disappeared: ${downloadId}`);
      }

      if (item.state === 'complete') {
        postAgentLog(
          'background.js:waitForDownloadCompletion',
          'download completed',
          {
            downloadId,
            filename: normalizeText(item.filename),
            state: normalizeText(item.state),
          },
          AGENT_LOG_HYPOTHESES.pdf,
        );
        return item;
      }

      if (item.state === 'interrupted') {
        postAgentLog(
          'background.js:waitForDownloadCompletion',
          'download interrupted',
          {
            downloadId,
            state: normalizeText(item.state),
            error: normalizeText(item.error),
          },
          AGENT_LOG_HYPOTHESES.pdf,
        );
        throw new Error(normalizeText(item.error, 'download interrupted'));
      }

      await sleep(400);
    }

    postAgentLog(
      'background.js:waitForDownloadCompletion',
      'download completion timed out',
      {
        downloadId,
      },
      AGENT_LOG_HYPOTHESES.pdf,
    );
    throw new Error(`download timeout: ${downloadId}`);
  }

  async function ensureCaptureTabActive(tabId, windowId, alreadyRecovered) {
    const activeTabs = await tabsQuery({ active: true, windowId });
    if (activeTabs[0]?.id === tabId) {
      return false;
    }

    postAgentLog(
      'background.js:ensureCaptureTabActive',
      'capture tab lost foreground',
      {
        tabId,
        windowId,
        activeTabId: activeTabs[0]?.id ?? null,
        alreadyRecovered,
      },
      AGENT_LOG_HYPOTHESES.capture,
    );
    throw createCaptureInterruptedError();
  }

  async function assertSlidesTabStillInBackground(tabId) {
    let tab = null;
    try {
      tab = await tabsGet(tabId);
    } catch {
      throw new Error('Slides 保存用タブが閉じられました。');
    }

    if (!tab) {
      throw new Error('Slides 保存用タブが見つかりませんでした。');
    }

    if (tab.active) {
      postAgentLog(
        'background.js:assertSlidesTabStillInBackground',
        'slides export tab moved to foreground',
        {
          tabId,
          windowId: Number.isFinite(tab.windowId) ? tab.windowId : null,
          url: normalizeText(tab.url),
          title: normalizeText(tab.title),
        },
        AGENT_LOG_HYPOTHESES.slide,
      );
      throw createSlidesInteractionInterruptedError();
    }
  }

  async function runWithSlidesTabBackgroundGuard(
    tabId,
    cancelToken,
    task,
    options = {},
  ) {
    const label = normalizeText(options.label, 'slides task');
    const intervalMs = Number.isFinite(options.intervalMs)
      ? Math.max(100, options.intervalMs)
      : 200;
    let settled = false;

    const taskPromise = Promise.resolve()
      .then(task)
      .finally(() => {
        settled = true;
      });
    taskPromise.catch(() => {});

    const guardPromise = (async () => {
      while (!settled) {
        assertNotCanceled(cancelToken);
        await assertSlidesTabStillInBackground(tabId);
        await sleep(intervalMs);
      }
      return undefined;
    })();
    guardPromise.catch(() => {});

    try {
      return await Promise.race([taskPromise, guardPromise]);
    } catch (error) {
      postAgentLog(
        'background.js:runWithSlidesTabBackgroundGuard',
        'slides background guard interrupted task',
        {
          tabId,
          label,
          error: summarizeError(error),
        },
        AGENT_LOG_HYPOTHESES.slide,
      );
      throw error;
    } finally {
      settled = true;
    }
  }

  async function waitForCaptureTurn(lastCaptureAt, cancelToken) {
    assertNotCanceled(cancelToken);
    const waitMs = CAPTURE_INTERVAL_MS - (Date.now() - lastCaptureAt);
    if (waitMs > 0) {
      await sleep(waitMs);
    }
    assertNotCanceled(cancelToken);
  }

  async function requestSlidesSessionInfo(tabId, cancelToken) {
    assertNotCanceled(cancelToken);
    const response = await sendTabMessageWithRetry(
      tabId,
      buildSlidesMessage(MESSAGE_TYPES.getSlidesSessionInfo),
      { cancelToken },
    );
    if (!response?.ok) {
      throw new Error(
        normalizeText(
          response?.error,
          'Slides session 情報の取得に失敗しました。',
        ),
      );
    }

    return response;
  }

  async function requestGoToFirstSlide(tabId, cancelToken) {
    assertNotCanceled(cancelToken);
    const response = await sendTabMessageWithRetry(
      tabId,
      buildSlidesMessage(MESSAGE_TYPES.goToFirstSlide),
      { cancelToken },
    );
    if (!response?.ok) {
      throw new Error(
        normalizeText(
          response?.error,
          'Slides の先頭ページへの移動に失敗しました。',
        ),
      );
    }
  }

  async function requestGoToSlide(tabId, page, cancelToken) {
    assertNotCanceled(cancelToken);
    const response = await sendTabMessageWithRetry(
      tabId,
      buildSlidesMessage(MESSAGE_TYPES.goToSlide, {
        page,
      }),
      { cancelToken },
    );
    if (!response?.ok) {
      throw new Error(
        normalizeText(
          response?.error,
          `Slides の ${page} ページ移動に失敗しました。`,
        ),
      );
    }
  }

  async function requestWaitForSlideReady(
    tabId,
    page,
    previousSnapshot,
    cancelToken,
  ) {
    assertNotCanceled(cancelToken);
    const response = await sendTabMessageWithRetry(
      tabId,
      buildSlidesMessage(MESSAGE_TYPES.waitForSlideReady, {
        page,
        previousSnapshot,
      }),
      { attempts: 4, intervalMs: 300, cancelToken },
    );
    if (!response?.ok) {
      throw new Error(
        normalizeText(
          response?.error,
          `Slides の ${page} ページ描画待機に失敗しました。`,
        ),
      );
    }

    return response;
  }

  async function requestSerializeCurrentSlideSvg(tabId, page, cancelToken) {
    const startedAt = Date.now();
    assertNotCanceled(cancelToken);
    postAgentLog(
      'background.js:requestSerializeCurrentSlideSvg',
      'serializeCurrentSlideSvg request start',
      { tabId, page },
      AGENT_LOG_HYPOTHESES.svg,
    );
    const response = await sendTabMessageWithRetry(
      tabId,
      buildSlidesMessage(MESSAGE_TYPES.serializeCurrentSlideSvg, {
        page,
      }),
      { attempts: 4, intervalMs: 300, cancelToken },
    );
    if (!response?.ok || !normalizeText(response.svgText)) {
      postAgentLog(
        'background.js:requestSerializeCurrentSlideSvg',
        'serializeCurrentSlideSvg request failed',
        {
          tabId,
          page,
          error: normalizeText(response?.error),
        },
        AGENT_LOG_HYPOTHESES.svg,
      );
      throw new Error(
        normalizeText(
          response?.error,
          `Slides の ${page} ページ SVG 取得に失敗しました。`,
        ),
      );
    }

    postAgentLog(
      'background.js:requestSerializeCurrentSlideSvg',
      'serializeCurrentSlideSvg request done',
      {
        tabId,
        page,
        durationMs: Date.now() - startedAt,
        svgLength: response.svgText.length,
        renderWidth: response.renderWidth,
        renderHeight: response.renderHeight,
      },
      AGENT_LOG_HYPOTHESES.svg,
    );
    return response;
  }

  async function loadBlobImageElement(blob) {
    if (
      typeof Image === 'undefined' ||
      typeof URL?.createObjectURL !== 'function'
    ) {
      throw new Error('image element fallback unavailable');
    }

    const blobUrl = URL.createObjectURL(blob);
    try {
      return await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () =>
          reject(new Error('image element fallback failed to load svg'));
        image.src = blobUrl;
      });
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  }

  async function renderSerializedSlidePage(page) {
    const startedAt = Date.now();
    const svgText = normalizeText(page?.svgText);
    if (!svgText) {
      throw new Error('serialized slide svg is empty');
    }

    const requestedWidth = Math.max(
      1,
      Math.round(Number(page?.renderWidth) || Number(page?.viewBoxWidth) || 0),
    );
    const requestedHeight = Math.max(
      1,
      Math.round(
        Number(page?.renderHeight) || Number(page?.viewBoxHeight) || 0,
      ),
    );
    const targetWidth = Math.max(
      SVG_RENDER_MIN_WIDTH,
      requestedWidth ? Math.round(requestedWidth * SVG_RENDER_SCALE) : 0,
      Number(page?.viewBoxWidth)
        ? Math.round(Number(page.viewBoxWidth) * SVG_RENDER_SCALE)
        : 0,
    );
    const targetHeight = Math.max(
      SVG_RENDER_MIN_HEIGHT,
      requestedHeight ? Math.round(requestedHeight * SVG_RENDER_SCALE) : 0,
      Number(page?.viewBoxHeight)
        ? Math.round(Number(page.viewBoxHeight) * SVG_RENDER_SCALE)
        : 0,
    );

    const blob = new Blob([svgText], {
      type: 'image/svg+xml;charset=utf-8',
    });
    const preferImageElement = isFirefoxLike();
    let bitmap;
    let fallbackImage = null;
    if (preferImageElement) {
      postAgentLog(
        'background.js:renderSerializedSlidePage',
        'using html image rasterization for firefox',
        {
          requestedWidth,
          requestedHeight,
          targetWidth,
          targetHeight,
          svgLength: svgText.length,
        },
        AGENT_LOG_HYPOTHESES.pdf,
      );
      fallbackImage = await loadBlobImageElement(blob);
    } else {
      postAgentLog(
        'background.js:renderSerializedSlidePage',
        'creating image bitmap from serialized svg',
        {
          requestedWidth,
          requestedHeight,
          targetWidth,
          targetHeight,
          svgLength: svgText.length,
        },
        AGENT_LOG_HYPOTHESES.pdf,
      );
      try {
        bitmap = await createImageBitmap(blob);
      } catch (error) {
        postAgentLog(
          'background.js:renderSerializedSlidePage',
          'createImageBitmap failed',
          {
            requestedWidth,
            requestedHeight,
            targetWidth,
            targetHeight,
            svgLength: svgText.length,
            error: summarizeError(error),
          },
          AGENT_LOG_HYPOTHESES.pdf,
        );
        postAgentLog(
          'background.js:renderSerializedSlidePage',
          'falling back to html image rasterization',
          {
            requestedWidth,
            requestedHeight,
            targetWidth,
            targetHeight,
            svgLength: svgText.length,
          },
          AGENT_LOG_HYPOTHESES.pdf,
        );
        fallbackImage = await loadBlobImageElement(blob);
      }
    }

    try {
      postAgentLog(
        'background.js:renderSerializedSlidePage',
        'creating raster canvas',
        {
          targetWidth,
          targetHeight,
        },
        AGENT_LOG_HYPOTHESES.pdf,
      );
      const canvas = createCanvas(targetWidth, targetHeight);
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('svg render canvas context unavailable');
      }

      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, targetWidth, targetHeight);
      try {
        context.drawImage(
          bitmap || fallbackImage,
          0,
          0,
          targetWidth,
          targetHeight,
        );
      } catch (error) {
        postAgentLog(
          'background.js:renderSerializedSlidePage',
          'canvas drawImage failed',
          {
            targetWidth,
            targetHeight,
            error: summarizeError(error),
          },
          AGENT_LOG_HYPOTHESES.pdf,
        );
        throw error;
      }

      postAgentLog(
        'background.js:renderSerializedSlidePage',
        'exporting rasterized jpeg',
        {
          targetWidth,
          targetHeight,
        },
        AGENT_LOG_HYPOTHESES.pdf,
      );
      const jpegBytes = await canvasToJpegBytes(canvas);

      return {
        width: targetWidth,
        height: targetHeight,
        jpegBytes,
      };
    } catch (error) {
      postAgentLog(
        'background.js:renderSerializedSlidePage',
        'serialized slide rasterization failed',
        {
          requestedWidth,
          requestedHeight,
          targetWidth,
          targetHeight,
          svgLength: svgText.length,
          error: summarizeError(error),
        },
        AGENT_LOG_HYPOTHESES.pdf,
      );
      throw error;
    } finally {
      postAgentLog(
        'background.js:renderSerializedSlidePage',
        'serialized slide rasterized',
        {
          durationMs: Date.now() - startedAt,
          targetWidth,
          targetHeight,
          svgLength: svgText.length,
        },
        AGENT_LOG_HYPOTHESES.pdf,
      );
      if (bitmap && typeof bitmap.close === 'function') {
        bitmap.close();
      }
    }
  }

  async function fetchImageDataUrl(url) {
    postAgentLog(
      'background.js:fetchImageDataUrl',
      'fetching image via background',
      {
        url: normalizeText(url),
      },
      AGENT_LOG_HYPOTHESES.svg,
    );
    const response = await fetch(url, {
      credentials: 'include',
    });
    if (!response.ok) {
      throw new Error(`image fetch failed: ${response.status}`);
    }

    const blob = await response.blob();
    const contentType = normalizeText(blob.type);
    if (!contentType.startsWith('image/')) {
      throw new Error(`image fetch returned non-image content: ${contentType}`);
    }

    return await blobToDataUrl(blob);
  }

  async function processSlidesDownloadBySvg(
    courseName,
    entry,
    state,
    tabId,
    windowId,
    cancelToken,
  ) {
    const filename = buildDownloadFilename(courseName, entry);
    const startedAt = Date.now();
    postAgentLog(
      'background.js:processSlidesDownloadBySvg',
      'svg export path start',
      {
        tabId,
        courseName,
        filename,
        viewerUrl: state.viewerUrl,
      },
      AGENT_LOG_HYPOTHESES.svg,
    );

    assertNotCanceled(cancelToken);
    await saveProgressState(state, {
      status: STATUS.rendering,
      stage: 'prepare-slide-svg',
    });

    const session = await runWithSlidesTabBackgroundGuard(
      tabId,
      cancelToken,
      () => requestSlidesSessionInfo(tabId, cancelToken),
      { label: 'get-slides-session-info' },
    );
    if (!Number.isFinite(session.totalPages) || session.totalPages <= 0) {
      postAgentLog(
        'background.js:processSlidesDownloadBySvg',
        'invalid slide session',
        {
          tabId,
          totalPages: session?.totalPages,
          currentPage: session?.currentPage,
        },
        AGENT_LOG_HYPOTHESES.svg,
      );
      throw new Error('Slides の総ページ数を取得できませんでした。');
    }
    postAgentLog(
      'background.js:processSlidesDownloadBySvg',
      'slide session ready',
      {
        tabId,
        totalPages: session.totalPages,
        currentPage: session.currentPage,
      },
      AGENT_LOG_HYPOTHESES.svg,
    );

    await runWithSlidesTabBackgroundGuard(
      tabId,
      cancelToken,
      () => requestGoToFirstSlide(tabId, cancelToken),
      { label: 'go-to-first-slide' },
    );
    let previousSnapshot = '';
    const pdfBuilder = createPdfBuilder();

    for (let page = 1; page <= session.totalPages; page += 1) {
      assertNotCanceled(cancelToken);
      await assertSlidesTabStillInBackground(tabId);
      if (page > 1) {
        await runWithSlidesTabBackgroundGuard(
          tabId,
          cancelToken,
          () => requestGoToSlide(tabId, page, cancelToken),
          { label: `go-to-slide-${page}` },
        );
      }

      const ready = await runWithSlidesTabBackgroundGuard(
        tabId,
        cancelToken,
        () =>
          requestWaitForSlideReady(tabId, page, previousSnapshot, cancelToken),
        { label: `wait-for-slide-ready-${page}` },
      );
      previousSnapshot = normalizeText(ready.snapshot);

      await saveProgressState(state, {
        status: STATUS.rendering,
        stage: `serialize-slide-svg-${page}/${session.totalPages}`,
      });

      const serializedPage = await runWithSlidesTabBackgroundGuard(
        tabId,
        cancelToken,
        () => requestSerializeCurrentSlideSvg(tabId, page, cancelToken),
        { label: `serialize-current-slide-svg-${page}` },
      );

      await saveProgressState(state, {
        status: STATUS.rendering,
        stage: `rasterize-slide-svg-${page}/${session.totalPages}`,
      });
      postAgentLog(
        'background.js:processSlidesDownloadBySvg',
        'rasterizing serialized slide page',
        {
          tabId,
          windowId,
          page,
          totalPages: session.totalPages,
          svgLength: serializedPage.svgText.length,
        },
        AGENT_LOG_HYPOTHESES.pdf,
      );
      pdfBuilder.addJpegPage(await renderSerializedSlidePage(serializedPage));
    }

    assertNotCanceled(cancelToken);
    await saveProgressState(state, {
      status: STATUS.rendering,
      stage: 'build-pdf',
    });

    const pdfBlob = pdfBuilder.finalize();
    postAgentLog(
      'background.js:processSlidesDownloadBySvg',
      'svg export path done',
      {
        tabId,
        totalPages: pdfBuilder.getPageCount(),
        pdfBytes: pdfBlob.size,
        durationMs: Date.now() - startedAt,
      },
      AGENT_LOG_HYPOTHESES.pdf,
    );
    return await downloadPdfBlob(pdfBlob, filename, cancelToken);
  }

  async function processSlidesDownloadByCapture(
    courseName,
    entry,
    state,
    tabId,
    windowId,
    cancelToken,
  ) {
    const startedAt = Date.now();
    postAgentLog(
      'background.js:processSlidesDownloadByCapture',
      'capture fallback path start',
      {
        tabId,
        windowId,
        courseName,
        viewerUrl: state.viewerUrl,
      },
      AGENT_LOG_HYPOTHESES.capture,
    );
    assertNotCanceled(cancelToken);
    const hasPermission = await permissionsContains({
      origins: [CAPTURE_PERMISSION_ORIGIN],
    });
    if (!hasPermission) {
      postAgentLog(
        'background.js:processSlidesDownloadByCapture',
        'capture permission missing',
        {
          tabId,
          windowId,
          viewerUrl: state.viewerUrl,
        },
        AGENT_LOG_HYPOTHESES.capture,
      );
      throw createCapturePermissionRequiredError();
    }

    await saveProgressState(state, {
      status: STATUS.rendering,
      stage: 'prepare-slide-capture',
    });

    const session = await requestSlidesSessionInfo(tabId, cancelToken);
    if (!Number.isFinite(session.totalPages) || session.totalPages <= 0) {
      throw new Error('Slides の総ページ数を取得できませんでした。');
    }

    const filename = buildDownloadFilename(courseName, entry);
    await requestGoToFirstSlide(tabId, cancelToken);
    let previousSnapshot = '';
    let lastCaptureAt = 0;
    let hasRecoveredActivation = false;
    const pdfBuilder = createPdfBuilder();

    for (let page = 1; page <= session.totalPages; page += 1) {
      assertNotCanceled(cancelToken);
      if (page > 1) {
        await requestGoToSlide(tabId, page, cancelToken);
      }

      const reactivated = await ensureCaptureTabActive(
        tabId,
        windowId,
        hasRecoveredActivation,
      );
      if (reactivated) {
        hasRecoveredActivation = true;
      }

      const ready = await requestWaitForSlideReady(
        tabId,
        page,
        reactivated ? '' : previousSnapshot,
        cancelToken,
      );
      postAgentLog(
        'background.js:processSlidesDownloadByCapture',
        'capture page ready',
        {
          tabId,
          page,
          totalPages: session.totalPages,
          waitDurationMs: ready.waitDurationMs,
        },
        AGENT_LOG_HYPOTHESES.capture,
      );

      await saveProgressState(state, {
        status: STATUS.rendering,
        stage: `capture-slide-${page}/${session.totalPages}`,
      });

      await waitForCaptureTurn(lastCaptureAt, cancelToken);
      const capturedImage = await captureVisibleTab(windowId, {
        format: 'jpeg',
        quality: CAPTURE_QUALITY,
      });
      lastCaptureAt = Date.now();
      pdfBuilder.addJpegPage(
        await cropCapturedSlide(capturedImage, ready.captureMetrics),
      );
      previousSnapshot = normalizeText(ready.snapshot);
    }

    assertNotCanceled(cancelToken);
    await saveProgressState(state, {
      status: STATUS.rendering,
      stage: 'build-pdf',
    });

    const pdfBlob = pdfBuilder.finalize();
    postAgentLog(
      'background.js:processSlidesDownloadByCapture',
      'capture fallback path done',
      {
        tabId,
        totalPages: pdfBuilder.getPageCount(),
        pdfBytes: pdfBlob.size,
        durationMs: Date.now() - startedAt,
      },
      AGENT_LOG_HYPOTHESES.capture,
    );
    return await downloadPdfBlob(pdfBlob, filename, cancelToken);
  }

  async function processSlidesDownload(
    courseName,
    entry,
    state,
    cancelToken,
    slidesTabSession = null,
  ) {
    const viewerUrl = buildSlidesViewerUrl(entry);
    postAgentLog(
      'background.js:processSlidesDownload',
      'slides download entry',
      {
        courseName,
        entryId: entry.id,
        filename: entry.filename,
        sourceUrl: entry.sourceUrl,
        viewerUrl,
      },
      AGENT_LOG_HYPOTHESES.slide,
    );
    if (!viewerUrl) {
      throw new Error('Google Slides の URL を組み立てられませんでした。');
    }

    await saveProgressState(state, {
      status: STATUS.rendering,
      viewerUrl,
      stage: 'open-slides-viewer',
    });

    let tabId =
      typeof slidesTabSession?.tabId === 'number' ? slidesTabSession.tabId : -1;
    try {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        assertNotCanceled(cancelToken);
        if (attempt > 0) {
          await sleep(SLIDES_TAB_RETRY_DELAY_MS);
        }

        let loadedTab = null;
        try {
          loadedTab = await openOrReuseSlidesTab(tabId, viewerUrl, cancelToken);
        } catch {
          if (tabId !== -1) {
            await closeTabQuietly(tabId);
            tabId = -1;
          }
          if (slidesTabSession) {
            slidesTabSession.tabId = null;
          }
          continue;
        }

        tabId = loadedTab.id;
        if (slidesTabSession) {
          slidesTabSession.tabId = tabId;
        }
        postAgentLog(
          'background.js:processSlidesDownload',
          'slides tab created',
          {
            attempt: attempt + 1,
            tabId,
            viewerUrl,
            createdUrl: normalizeText(loadedTab?.url),
          },
          AGENT_LOG_HYPOTHESES.tab,
        );
        postAgentLog(
          'background.js:processSlidesDownload',
          'slides tab loaded',
          {
            attempt: attempt + 1,
            tabId,
            loadedUrl: normalizeText(loadedTab?.url),
            status: normalizeText(loadedTab?.status),
          },
          AGENT_LOG_HYPOTHESES.tab,
        );
        if (loadedTab?.url && loadedTab.url !== 'about:blank') {
          const windowId = loadedTab.windowId;
          try {
            const result = await processSlidesDownloadBySvg(
              courseName,
              entry,
              {
                ...state,
                viewerUrl,
              },
              tabId,
              windowId,
              cancelToken,
            );
            return result;
          } catch (svgError) {
            assertNotCanceled(cancelToken);
            postAgentLog(
              'background.js:processSlidesDownload',
              'svg export failed, falling back to capture',
              {
                tabId,
                windowId,
                viewerUrl,
                error: normalizeText(svgError?.message, 'svg export failed'),
              },
              AGENT_LOG_HYPOTHESES.capture,
            );
            const result = await processSlidesDownloadByCapture(
              courseName,
              entry,
              {
                ...state,
                viewerUrl,
              },
              tabId,
              windowId,
              cancelToken,
            );
            return result;
          }
        }
      }

      throw new Error(
        'Google スライドのタブを開けませんでした。しばらく待ってから再試行してください。',
      );
    } finally {
      if (tabId !== -1) {
        postAgentLog(
          'background.js:processSlidesDownload',
          'closing slides tab',
          { tabId, reason: 'process complete' },
          AGENT_LOG_HYPOTHESES.tab,
        );
        await closeTabQuietly(tabId);
      }
      if (slidesTabSession) {
        slidesTabSession.tabId = null;
      }
    }
  }

  async function queueDownloads(payload) {
    const debugLogContext = normalizeDebugLogContext(
      payload?.debugLogContext,
      AGENT_LOG_SESSION_ID,
    );
    activeDebugLogContext = debugLogContext;
    const courseName = normalizeText(payload?.courseName, 'course');
    const rawEntries = Array.isArray(payload?.assets)
      ? payload.assets.map(normalizeEntry).filter((entry) => entry.url)
      : [];

    const seenUrls = new Set();
    let dedupedCount = 0;
    const entries = rawEntries.filter((entry) => {
      const key = getEntryDedupKey(entry);
      if (seenUrls.has(key)) {
        dedupedCount += 1;
        return false;
      }
      seenUrls.add(key);
      return true;
    });

    const startedAt = new Date().toISOString();
    const pending = entries.map(summarizeEntry);
    const currentNonce = ++queueNonce;
    postAgentLog(
      'background.js:queueDownloads',
      'download queue initialized',
      {
        debugLogContext,
        queueNonce: currentNonce,
        courseName,
        rawEntryCount: rawEntries.length,
        dedupedEntryCount: dedupedCount,
        entryCount: entries.length,
        entries: entries.map((entry) => ({
          id: entry.id,
          kind: entry.kind,
          filename: entry.filename,
          viewerUrl: normalizeText(entry.viewerUrl),
          sourceUrl: normalizeText(entry.sourceUrl),
        })),
      },
      AGENT_LOG_HYPOTHESES.queue,
    );

    await saveState({
      status: STATUS.downloading,
      courseName,
      startedAt,
      finishedAt: '',
      activeItem: '',
      activeJobType: '',
      sourceUrl: '',
      viewerUrl: '',
      stage: '',
      pending,
      completed: [],
      failed: [],
      lastError: '',
      needsCapturePermission: false,
    });

    if (!entries.length) {
      postAgentLog(
        'background.js:queueDownloads',
        'download queue has no entries',
        {
          debugLogContext,
          queueNonce: currentNonce,
          courseName,
        },
        AGENT_LOG_HYPOTHESES.queue,
      );
      await saveState({
        status: STATUS.failed,
        courseName,
        startedAt,
        finishedAt: new Date().toISOString(),
        activeItem: '',
        activeJobType: '',
        sourceUrl: '',
        viewerUrl: '',
        stage: '',
        pending: [],
        completed: [],
        failed: [],
        lastError: 'ダウンロード対象の資料が見つかりませんでした。',
        needsCapturePermission: false,
      });
      return;
    }

    const cancelToken = createCancelToken(currentNonce);
    let state = await loadState();
    let stateWrite = Promise.resolve();

    async function updateQueueState(updater) {
      stateWrite = stateWrite
        .catch(() => {})
        .then(async () => {
          const latest = normalizeState(await loadState());
          state = normalizeState(updater(latest));
          await saveState(state);
          return state;
        });
      return await stateWrite;
    }

    async function processQueueEntry(entry, workerIndex) {
      if (cancelToken.isCanceled()) {
        postAgentLog(
          'background.js:queueDownloads',
          'download queue canceled before entry processing',
          {
            debugLogContext,
            queueNonce: currentNonce,
            entryId: entry.id,
            workerIndex,
          },
          AGENT_LOG_HYPOTHESES.queue,
        );
        return;
      }

      const entryState = await updateQueueState((latest) => ({
        ...latest,
        status:
          entry.kind === 'google_slides'
            ? STATUS.rendering
            : STATUS.downloading,
        activeItem: `${entry.lectureName} / ${entry.filename}`,
        activeJobType: entry.kind,
        sourceUrl: entry.sourceUrl || entry.url,
        viewerUrl: entry.viewerUrl,
        stage:
          entry.kind === 'google_slides'
            ? `open-slides-viewer (${workerIndex + 1}/${DOWNLOAD_PARALLEL_LIMIT})`
            : 'download-direct-file',
        lastError: '',
        needsCapturePermission: false,
      }));
      postAgentLog(
        'background.js:queueDownloads',
        'processing queue entry',
        {
          debugLogContext,
          queueNonce: currentNonce,
          entryId: entry.id,
          entryKind: entry.kind,
          workerIndex,
          state: summarizeState(entryState),
        },
        AGENT_LOG_HYPOTHESES.queue,
      );

      try {
        const result =
          entry.kind === 'google_slides'
            ? await processSlidesDownload(
                courseName,
                entry,
                entryState,
                cancelToken,
              )
            : await processDirectDownload(courseName, entry, cancelToken);
        postAgentLog(
          'background.js:queueDownloads',
          'queue entry completed',
          {
            debugLogContext,
            queueNonce: currentNonce,
            entryId: entry.id,
            workerIndex,
            downloadId: result.downloadId,
            storedFilename: normalizeText(result.storedFilename),
          },
          AGENT_LOG_HYPOTHESES.queue,
        );

        await updateQueueState((latest) => ({
          ...latest,
          pending: latest.pending.filter((item) => item.id !== entry.id),
          completed: [
            ...latest.completed,
            {
              ...summarizeEntry(entry),
              downloadId: result.downloadId,
              storedFilename: result.storedFilename,
            },
          ],
          stage: '',
          lastError: '',
          needsCapturePermission: false,
        }));
      } catch (error) {
        if (isCancellationError(error)) {
          postAgentLog(
            'background.js:queueDownloads',
            'queue entry canceled',
            {
              debugLogContext,
              queueNonce: currentNonce,
              entryId: entry.id,
              workerIndex,
            },
            AGENT_LOG_HYPOTHESES.queue,
          );
          return;
        }
        postAgentLog(
          'background.js:queueDownloads',
          'queue entry failed',
          {
            debugLogContext,
            queueNonce: currentNonce,
            entryId: entry.id,
            workerIndex,
            error: summarizeError(error),
          },
          AGENT_LOG_HYPOTHESES.queue,
        );

        await updateQueueState((latest) => ({
          ...latest,
          pending: latest.pending.filter((item) => item.id !== entry.id),
          failed: [
            ...latest.failed,
            {
              ...summarizeEntry(entry),
              url: entry.url,
              errorCode: normalizeText(error?.code),
              error: normalizeText(error?.message, 'download failed'),
            },
          ],
          stage: '',
          lastError: normalizeText(error?.message, 'download failed'),
          needsCapturePermission:
            normalizeText(error?.code) ===
            ERROR_CODES.capturePermissionRequired,
        }));
      }
    }

    async function runQueueWorkers() {
      let nextIndex = 0;
      const workerCount = Math.max(
        1,
        Math.min(DOWNLOAD_PARALLEL_LIMIT, entries.length),
      );
      await Promise.all(
        Array.from({ length: workerCount }, async (_, workerIndex) => {
          for (;;) {
            if (cancelToken.isCanceled()) {
              return;
            }
            const entry = entries[nextIndex];
            nextIndex += 1;
            if (!entry) {
              return;
            }
            await processQueueEntry(entry, workerIndex);
          }
        }),
      );
    }

    try {
      await runQueueWorkers();
      await stateWrite;
      state = normalizeState(await loadState());
      if (cancelToken.isCanceled()) {
        return;
      }

      const finalStatus =
        state.failed.length > 0
          ? state.completed.length > 0
            ? STATUS.partialFailed
            : STATUS.failed
          : STATUS.done;

      await saveState({
        ...state,
        status: finalStatus,
        finishedAt: new Date().toISOString(),
        activeItem: '',
        activeJobType: '',
        sourceUrl: '',
        viewerUrl: '',
        stage: '',
        needsCapturePermission: state.needsCapturePermission,
      });
      postAgentLog(
        'background.js:queueDownloads',
        'download queue finished',
        {
          debugLogContext,
          queueNonce: currentNonce,
          finalStatus,
          state: summarizeState(state),
        },
        AGENT_LOG_HYPOTHESES.queue,
      );
    } finally {
      await Promise.all([...activeSlidesTabIds].map(closeTabQuietly));
      activeDebugLogContext = null;
    }
  }

  async function openSlidesCapturePermissionWindow() {
    const permissionUrl = api.runtime.getURL('slides-permission.html');
    try {
      return await windowsCreate({
        url: permissionUrl,
        type: 'popup',
        width: 480,
        height: 560,
        focused: true,
      });
    } catch {
      return await windowsCreate({
        url: permissionUrl,
        width: 480,
        height: 560,
        focused: true,
      });
    }
  }

  api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const type = normalizeText(message?.type);

    if (type === MESSAGE_TYPES.getState) {
      loadState()
        .then((state) => sendResponse({ ok: true, state }))
        .catch((error) =>
          sendResponse({
            ok: false,
            error: normalizeText(error?.message, 'failed to load state'),
          }),
        );
      return true;
    }

    if (type === MESSAGE_TYPES.setState) {
      saveState(message?.state)
        .then((state) => sendResponse({ ok: true, state }))
        .catch((error) =>
          sendResponse({
            ok: false,
            error: normalizeText(error?.message, 'failed to save state'),
          }),
        );
      return true;
    }

    if (type === MESSAGE_TYPES.resetState) {
      queueNonce += 1;
      const closingTabIds = [...activeSlidesTabIds];
      activeSlidesTabIds.clear();
      closingTabIds.forEach((tabId) => {
        closeTabQuietly(tabId).catch(() => {});
      });
      saveState(createIdleState())
        .then((state) => sendResponse({ ok: true, state }))
        .catch((error) =>
          sendResponse({
            ok: false,
            error: normalizeText(error?.message, 'failed to reset state'),
          }),
        );
      return true;
    }

    if (type === MESSAGE_TYPES.getDebugLogReport) {
      if (!DEBUG_LOGS_ENABLED) {
        sendResponse({
          ok: false,
          error: __GLASSMOOCS_DEBUG_STRING__(
            'debug log is not available in this build',
          ),
        });
        return false;
      }

      getDebugLogReport()
        .then((report) => sendResponse({ ok: true, report }))
        .catch((error) =>
          sendResponse({
            ok: false,
            error: normalizeText(
              error?.message,
              __GLASSMOOCS_DEBUG_STRING__('failed to load debug log report'),
            ),
          }),
        );
      return true;
    }

    if (type === MESSAGE_TYPES.downloadAssets) {
      sendResponse({ ok: true });
      queueDownloads(message?.payload).catch((error) => {
        if (isCancellationError(error)) {
          return;
        }
        postAgentLog(
          'background.js:runtime.onMessage',
          'download queue failed at top level',
          {
            debugLogContext: message?.payload?.debugLogContext,
            courseName: normalizeText(message?.payload?.courseName),
            error: summarizeError(error),
          },
          AGENT_LOG_HYPOTHESES.queue,
        );
        saveState({
          status: STATUS.failed,
          courseName: normalizeText(message?.payload?.courseName),
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          activeItem: '',
          activeJobType: '',
          sourceUrl: '',
          viewerUrl: '',
          stage: '',
          pending: [],
          completed: [],
          failed: [],
          lastError: normalizeText(error?.message, 'download queue failed'),
          needsCapturePermission:
            normalizeText(error?.code) ===
            ERROR_CODES.capturePermissionRequired,
        }).catch(() => {});
      });
      return false;
    }

    if (type === MESSAGE_TYPES.relayAgentLog) {
      if (!DEBUG_LOGS_ENABLED) {
        sendResponse({ ok: false });
        return false;
      }

      sendResponse({ ok: true });
      relayAgentLogPayload(message?.payload);
      return false;
    }

    if (type === MESSAGE_TYPES.getSlidesCapturePermission) {
      permissionsContains({
        origins: [CAPTURE_PERMISSION_ORIGIN],
      })
        .then((granted) => sendResponse({ ok: true, granted: !!granted }))
        .catch((error) =>
          sendResponse({
            ok: false,
            granted: false,
            error: normalizeText(
              error?.message,
              'failed to check slides capture permission',
            ),
          }),
        );
      return true;
    }

    if (type === MESSAGE_TYPES.openSlidesCapturePermissionWindow) {
      openSlidesCapturePermissionWindow()
        .then((windowInfo) =>
          sendResponse({
            ok: true,
            windowId: Number.isFinite(windowInfo?.id) ? windowInfo.id : null,
          }),
        )
        .catch((error) =>
          sendResponse({
            ok: false,
            error: normalizeText(
              error?.message,
              'failed to open slides capture permission window',
            ),
          }),
        );
      return true;
    }

    if (type === MESSAGE_TYPES.fetchImageDataUrl) {
      fetchImageDataUrl(normalizeText(message?.url))
        .then((dataUrl) => sendResponse({ ok: true, dataUrl }))
        .catch((error) =>
          sendResponse({
            ok: false,
            error: normalizeText(error?.message, 'failed to fetch image data'),
          }),
        );
      return true;
    }

    return false;
  });

  recoverStateOnStartup().catch(() => {
    saveState(createIdleState()).catch(() => {});
  });
})();
