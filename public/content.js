(function () {
  if (globalThis.__glassmoocsContentBooted) {
    return;
  }
  globalThis.__glassmoocsContentBooted = true;

  const BACKGROUND_STORAGE_KEY = 'glassmoocs_background_image';
  const LEGACY_BACKGROUND_STORAGE_KEY = 'iniad_bg_image';
  const SETTINGS_STORAGE_KEY = 'glassmoocs_settings';
  const DOWNLOAD_STATE_STORAGE_KEY = 'glassmoocs_download_state';
  const SUBMIT_SUCCESS_EVENT = 'glassmoocs:submit-success';
  const MODE_FULL = 'full';
  const MODE_BADGE = 'badge';
  const MODE_ICON = 'icon';
  const VALID_TAB_COLOR_MODES = new Set([MODE_FULL, MODE_BADGE, MODE_ICON]);
  const SUBMIT_RELOAD_WINDOW_MS = 15000;
  const SUBMIT_RELOAD_DELAY_MS = 180;
  const DEBUG_LOGS_ENABLED = __GLASSMOOCS_ENABLE_DEBUG_LOGS__;
  const DEFAULT_TAB_COLORS = {
    attendanceTest: '#f59e0b',
    attendanceAssignment: '#06b6d4',
    assignment: '#f43f5e',
    check: '#8b5cf6',
    slide: '#38bdf8',
  };
  const MESSAGE_TYPES = {
    getDownloadState: 'glassmoocs:get-download-state',
    setDownloadState: 'glassmoocs:set-download-state',
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
    getPageContext: 'glassmoocs:get-page-context',
    startCourseCollection: 'glassmoocs:start-course-collection',
    downloadCurrentLecture: 'glassmoocs:download-current-lecture',
    downloadCurrentPage: 'glassmoocs:download-current-page',
  };
  const DOWNLOAD_STATUS = {
    idle: 'idle',
    collecting: 'collecting',
    downloading: 'downloading',
    rendering: 'rendering',
    printing: 'printing',
    done: 'done',
    partialFailed: 'partial_failed',
    failed: 'failed',
  };
  const DOWNLOADABLE_EXTENSIONS = new Set([
    'pdf',
    'ppt',
    'pptx',
    'doc',
    'docx',
    'xls',
    'xlsx',
    'zip',
    'rar',
    '7z',
    'txt',
    'csv',
    'tsv',
    'json',
    'jpg',
    'jpeg',
    'png',
    'gif',
    'svg',
    'webp',
    'mp4',
    'mp3',
  ]);
  const extensionApi = globalThis.browser || globalThis.chrome || null;
  const AGENT_LOG_RUNTIME = 'content';
  const AGENT_LOG_ENDPOINT = DEBUG_LOGS_ENABLED
    ? __GLASSMOOCS_DEBUG_STRING__('http://127.0.0.1:7443/ingest')
    : '';
  const DEBUG_AGENT_LOG_PARAM = DEBUG_LOGS_ENABLED
    ? __GLASSMOOCS_DEBUG_STRING__('glassmoocs_debug_log')
    : '';
  // [H-QUEUE-A] payload construction or background queue handoff is mismatched
  // [H-PAGE-A] page context or asset extraction is incomplete on the current page
  const AGENT_LOG_SESSION_ID = `glassmoocs-cs-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  const AGENT_LOG_HYPOTHESES = DEBUG_LOGS_ENABLED
    ? {
        queue: __GLASSMOOCS_DEBUG_STRING__('H-QUEUE-A'),
        page: __GLASSMOOCS_DEBUG_STRING__('H-PAGE-A'),
      }
    : {};
  const DEBUG_AUTO_DOWNLOAD_PARAM = DEBUG_LOGS_ENABLED
    ? __GLASSMOOCS_DEBUG_STRING__('glassmoocs_debug_auto_download')
    : '';

  const TAB_TYPES = {
    attendanceTest: {
      label: '出席',
      icon: 'AT',
    },
    attendanceAssignment: {
      label: '出席課題',
      icon: 'AA',
    },
    assignment: {
      label: '課題',
      icon: 'HW',
    },
    check: {
      label: '確認',
      icon: 'QZ',
    },
    slide: {
      label: '資料',
      icon: 'SL',
    },
  };

  let settings = getDefaultSettings();
  let enhancementFrame = 0;
  let submitIntentAt = 0;
  let reloadTimer = 0;
  const loggedAssetCandidateSignatures = new Set();

  function getExtensionStorage() {
    if (globalThis.browser?.storage?.local) {
      return {
        area: globalThis.browser.storage.local,
        areaName: 'local',
        promiseBased: true,
      };
    }

    if (globalThis.chrome?.storage?.local) {
      return {
        area: chrome.storage.local,
        areaName: 'local',
        promiseBased: false,
      };
    }

    if (globalThis.chrome?.storage?.sync) {
      return {
        area: chrome.storage.sync,
        areaName: 'sync',
        promiseBased: false,
      };
    }

    return null;
  }

  function getRuntimeLastError() {
    return globalThis.chrome?.runtime?.lastError || null;
  }

  function storageGet(storage, keys, callback, fallback) {
    if (storage.promiseBased) {
      storage.area.get(keys).then(callback).catch(fallback);
      return;
    }

    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      callback(value);
    };
    const runFallback = () => {
      if (settled) return;
      settled = true;
      fallback();
    };

    try {
      storage.area.get(keys, (result) => {
        if (getRuntimeLastError()) {
          runFallback();
          return;
        }

        finish(result);
      });
    } catch {
      runFallback();
    }
  }

  function storageSet(storage, values) {
    try {
      if (storage.promiseBased) {
        storage.area.set(values).catch(() => {});
        return;
      }

      storage.area.set(values);
    } catch {
      return;
    }
  }

  function runtimeSendMessage(message) {
    if (!extensionApi?.runtime?.sendMessage) {
      return Promise.reject(new Error('runtime messaging unavailable'));
    }

    try {
      const result = extensionApi.runtime.sendMessage(message);
      if (result && typeof result.then === 'function') {
        return result;
      }
    } catch (error) {
      return Promise.reject(error);
    }

    return new Promise((resolve, reject) => {
      try {
        extensionApi.runtime.sendMessage(message, (response) => {
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

  function createSessionId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

  function hasDebugLogQueryOverride(rawUrl = '') {
    if (!DEBUG_LOGS_ENABLED) {
      return false;
    }

    try {
      const params = new URL(rawUrl || window.location.href).searchParams;
      const value = normalizeText(
        params.get(DEBUG_AGENT_LOG_PARAM),
      ).toLowerCase();
      return value === '1' || value === 'true' || value === 'on';
    } catch {
      return false;
    }
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
          : !!settings?.debugLoggingEnabled || hasDebugLogQueryOverride(),
      endpoint: normalizeText(context.endpoint, AGENT_LOG_ENDPOINT),
      sessionId: normalizeText(context.sessionId, fallbackSessionId),
      source: normalizeText(context.source),
    };
  }

  function createDebugLogContext(source) {
    if (!DEBUG_LOGS_ENABLED) {
      return normalizeDebugLogContext(null, AGENT_LOG_SESSION_ID);
    }

    return normalizeDebugLogContext(
      {
        enabled: !!settings?.debugLoggingEnabled || hasDebugLogQueryOverride(),
        endpoint: AGENT_LOG_ENDPOINT,
        sessionId: createSessionId('glassmoocs-flow'),
        source,
      },
      AGENT_LOG_SESSION_ID,
    );
  }

  function summarizePageContext(pageContext) {
    if (!pageContext || typeof pageContext !== 'object') return {};

    return {
      courseName: normalizeText(pageContext.courseName),
      lectureGroup: normalizeText(pageContext.lectureGroup),
      lectureName: normalizeText(pageContext.lectureName),
      pageTitle: normalizeText(pageContext.pageTitle),
      courseUrl: normalizeText(pageContext.courseUrl),
      lectureUrl: normalizeText(pageContext.lectureUrl),
      assetCandidateCount: Array.isArray(pageContext.assetCandidates)
        ? pageContext.assetCandidates.length
        : 0,
    };
  }

  function postAgentLog(location, message, data = {}, hypothesisId = '') {
    if (!DEBUG_LOGS_ENABLED) {
      return;
    }

    const payload =
      data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    const context = normalizeDebugLogContext(
      payload.debugLogContext,
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

    const logPayload = {
      endpoint: context.endpoint,
      sessionId: context.sessionId,
      runtime: AGENT_LOG_RUNTIME,
      location,
      message,
      hypothesisId,
      timestamp: Date.now(),
      ...rest,
    };

    fetch(`${context.endpoint}/${context.sessionId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId: context.sessionId,
        runtime: AGENT_LOG_RUNTIME,
        location,
        message,
        data: rest,
        hypothesisId,
        timestamp: logPayload.timestamp,
      }),
    }).catch(() => {
      runtimeSendMessage({
        type: MESSAGE_TYPES.relayAgentLog,
        payload: logPayload,
      }).catch(() => {});
    });
  }

  function isMacLike() {
    return /Mac|iPhone|iPad|iPod/i.test(
      navigator.platform || navigator.userAgent || '',
    );
  }

  function normalizeText(value, fallback = '') {
    if (typeof value !== 'string') return fallback;
    const normalized = value.replace(/\s+/g, ' ').trim();
    return normalized || fallback;
  }

  function normalizePathLabel(value, fallback) {
    const normalized = normalizeText(value, fallback);
    return (
      normalized
        .split('')
        .map((char) => {
          if (char < ' ') return '_';
          if ('<>:"/\\|?*'.includes(char)) return '_';
          return char;
        })
        .join('')
        .replace(/\.+$/g, '')
        .trim() || fallback
    );
  }

  function getDefaultSettings() {
    const mac = isMacLike();

    return {
      shortcuts: {
        previous: {
          key: 'ArrowLeft',
          code: 'ArrowLeft',
          ctrl: !mac,
          meta: mac,
          alt: false,
          shift: false,
        },
        next: {
          key: 'ArrowRight',
          code: 'ArrowRight',
          ctrl: !mac,
          meta: mac,
          alt: false,
          shift: false,
        },
      },
      tabColorMode: MODE_FULL,
      colorTabsEnabled: true,
      tabColors: { ...DEFAULT_TAB_COLORS },
      reloadAfterSubmit: false,
      ...(DEBUG_LOGS_ENABLED ? { debugLoggingEnabled: false } : {}),
    };
  }

  function mergeSettings(rawSettings) {
    const defaults = getDefaultSettings();
    const raw =
      rawSettings && typeof rawSettings === 'object' ? rawSettings : {};
    const rawTabColors =
      raw.tabColors && typeof raw.tabColors === 'object' ? raw.tabColors : {};

    return {
      shortcuts: {
        previous: {
          ...defaults.shortcuts.previous,
          ...(raw.shortcuts && raw.shortcuts.previous
            ? raw.shortcuts.previous
            : {}),
        },
        next: {
          ...defaults.shortcuts.next,
          ...(raw.shortcuts && raw.shortcuts.next ? raw.shortcuts.next : {}),
        },
      },
      tabColorMode: VALID_TAB_COLOR_MODES.has(raw.tabColorMode)
        ? raw.tabColorMode
        : defaults.tabColorMode,
      colorTabsEnabled:
        typeof raw.colorTabsEnabled === 'boolean'
          ? raw.colorTabsEnabled
          : defaults.colorTabsEnabled,
      tabColors: Object.fromEntries(
        Object.entries(DEFAULT_TAB_COLORS).map(([key, fallback]) => [
          key,
          normalizeTabColor(rawTabColors[key], fallback),
        ]),
      ),
      reloadAfterSubmit:
        typeof raw.reloadAfterSubmit === 'boolean'
          ? raw.reloadAfterSubmit
          : defaults.reloadAfterSubmit,
      ...(DEBUG_LOGS_ENABLED
        ? {
            debugLoggingEnabled:
              typeof raw.debugLoggingEnabled === 'boolean'
                ? raw.debugLoggingEnabled
                : defaults.debugLoggingEnabled,
          }
        : {}),
    };
  }

  function normalizeTabColor(value, fallback) {
    if (typeof value !== 'string') return fallback;

    const normalized = value.trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(normalized)) {
      return normalized;
    }

    return fallback;
  }

  function hexToRgb(hex) {
    const normalized = normalizeTabColor(hex, '');
    if (!normalized) return null;

    return {
      r: Number.parseInt(normalized.slice(1, 3), 16),
      g: Number.parseInt(normalized.slice(3, 5), 16),
      b: Number.parseInt(normalized.slice(5, 7), 16),
    };
  }

  function toAlphaColor(hex, alpha) {
    const rgb = hexToRgb(hex);
    if (!rgb) return `rgba(15, 23, 42, ${alpha})`;

    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
  }

  function readSettings(callback) {
    const extensionStorage = getExtensionStorage();

    if (extensionStorage) {
      storageGet(
        extensionStorage,
        [SETTINGS_STORAGE_KEY],
        (result) => {
          callback(mergeSettings(result[SETTINGS_STORAGE_KEY]));
        },
        () => {
          try {
            callback(
              mergeSettings(
                JSON.parse(
                  localStorage.getItem(SETTINGS_STORAGE_KEY) || 'null',
                ),
              ),
            );
          } catch {
            callback(mergeSettings(null));
          }
        },
      );
      return;
    }

    try {
      callback(
        mergeSettings(
          JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || 'null'),
        ),
      );
    } catch {
      callback(mergeSettings(null));
    }
  }

  function readBackgroundImage(callback) {
    const extensionStorage = getExtensionStorage();

    if (extensionStorage) {
      storageGet(
        extensionStorage,
        [BACKGROUND_STORAGE_KEY],
        (result) => {
          const syncImage = result[BACKGROUND_STORAGE_KEY];
          if (typeof syncImage === 'string' && syncImage.trim()) {
            callback(syncImage.trim());
            return;
          }

          const legacyImage =
            localStorage.getItem(LEGACY_BACKGROUND_STORAGE_KEY) || '';
          callback(legacyImage.trim());
        },
        () => {
          const legacyImage =
            localStorage.getItem(LEGACY_BACKGROUND_STORAGE_KEY) || '';
          callback(legacyImage.trim());
        },
      );
      return;
    }

    const legacyImage =
      localStorage.getItem(LEGACY_BACKGROUND_STORAGE_KEY) || '';
    callback(legacyImage.trim());
  }

  function applyBackgroundImage(url) {
    if (!document.body) return;
    if (!url) {
      document.documentElement.dataset.glassmoocsBackground = 'none';
      document.body.style.removeProperty('background-image');
      document.body.style.removeProperty('background-repeat');
      return;
    }

    document.documentElement.dataset.glassmoocsBackground = 'custom';
    document.body.style.setProperty(
      'background-image',
      `url("${url}")`,
      'important',
    );
    document.body.style.setProperty('background-size', 'cover', 'important');
    document.body.style.setProperty(
      'background-attachment',
      'fixed',
      'important',
    );
    document.body.style.setProperty(
      'background-position',
      'center',
      'important',
    );
    document.body.style.setProperty(
      'background-repeat',
      'no-repeat',
      'important',
    );
  }

  function setBackground() {
    readBackgroundImage((savedImage) => {
      applyBackgroundImage(savedImage);
    });
  }

  function isBackgroundShortcut(event) {
    return event.shiftKey && event.altKey && event.code === 'KeyB';
  }

  function handleBackgroundShortcut(event) {
    if (!isBackgroundShortcut(event)) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const url = prompt(
      '背景画像のURLを入力:',
      localStorage.getItem(LEGACY_BACKGROUND_STORAGE_KEY) || '',
    );

    if (url) {
      const normalized = url.trim();
      if (!normalized) return;

      localStorage.setItem(LEGACY_BACKGROUND_STORAGE_KEY, normalized);

      const extensionStorage = getExtensionStorage();
      if (extensionStorage) {
        storageSet(extensionStorage, {
          [BACKGROUND_STORAGE_KEY]: normalized,
        });
      }

      applyBackgroundImage(normalized);
    }
  }

  function injectSubmitBridge() {
    if (document.documentElement.dataset.glassmoocsSubmitBridge === 'true') {
      return;
    }

    if (!extensionApi?.runtime?.getURL) return;

    const script = document.createElement('script');
    script.src = extensionApi.runtime.getURL('page-bridge.js');
    script.async = false;
    script.dataset.glassmoocsSubmitBridge = 'true';
    script.onload = () => script.remove();
    script.onerror = () => {
      delete document.documentElement.dataset.glassmoocsSubmitBridge;
      script.remove();
    };

    document.documentElement.dataset.glassmoocsSubmitBridge = 'true';
    (document.head || document.documentElement).appendChild(script);
  }

  function getSubmitTrigger(target) {
    if (!(target instanceof Element)) return null;

    const trigger = target.closest(
      'button, input[type="submit"], a.submit-answer, button.submit-answer, .btn-submit',
    );

    if (!trigger) return null;
    if (trigger.matches('.submit-answer, .btn-submit')) return trigger;

    const label = `${trigger.textContent || ''} ${trigger.getAttribute('value') || ''}`;
    if (
      trigger.closest('.problem-container, .problem-contentpage') &&
      /提出|submit/i.test(label)
    ) {
      return trigger;
    }

    return null;
  }

  function handleSubmitIntent(event) {
    if (!settings.reloadAfterSubmit) return;
    if (!getSubmitTrigger(event.target)) return;

    submitIntentAt = Date.now();
  }

  function handleSubmitSuccess() {
    if (!settings.reloadAfterSubmit) return;
    if (!submitIntentAt) return;
    if (Date.now() - submitIntentAt > SUBMIT_RELOAD_WINDOW_MS) return;
    if (reloadTimer) return;

    submitIntentAt = 0;
    reloadTimer = window.setTimeout(() => {
      reloadTimer = 0;
      window.location.reload();
    }, SUBMIT_RELOAD_DELAY_MS);
  }

  const segmenter =
    globalThis.Intl && Intl.Segmenter
      ? new Intl.Segmenter('ja', { granularity: 'grapheme' })
      : null;

  function countGraphemes(text) {
    if (segmenter) {
      return [...segmenter.segment(text)].length;
    }

    return Array.from(text).length;
  }

  function attachTextareaEnhancements() {
    document.querySelectorAll('textarea').forEach((textarea) => {
      if (textarea.dataset.glassmoocsEnhanced) return;
      if (!textarea.parentElement) return;

      textarea.dataset.glassmoocsEnhanced = 'true';

      const counter = document.createElement('div');
      counter.className = 'glassmoocs-char-counter';

      if (getComputedStyle(textarea.parentElement).position === 'static') {
        textarea.parentElement.style.position = 'relative';
      }

      textarea.parentElement.appendChild(counter);

      const update = () => {
        const count = countGraphemes(textarea.value);

        counter.textContent = `${count} chars`;
        counter.style.opacity = count > 0 ? '1' : '0';
        textarea.style.height = 'auto';
        textarea.style.height = `${textarea.scrollHeight + 5}px`;
      };

      textarea.addEventListener('input', update);
      update();
    });
  }

  function isNumberTabLink(link) {
    return /^\d+$/.test((link.textContent || '').trim());
  }

  function getNumberTabLinks() {
    const pagination = document.querySelector(
      'nav[aria-label="page navigation"] .pagination',
    );

    if (!pagination) return [];

    return [...pagination.querySelectorAll('li > a')].filter(isNumberTabLink);
  }

  function isNavigableLink(link) {
    return Boolean(link && link.href && link.getAttribute('href') !== '#');
  }

  function getPaginationArrowLink(direction) {
    const pagination = document.querySelector(
      'nav[aria-label="page navigation"] .pagination',
    );

    if (!pagination) return null;

    const symbol = direction < 0 ? '«' : '»';

    return (
      [...pagination.querySelectorAll('li > a')].find(
        (link) => link.textContent?.trim() === symbol && isNavigableLink(link),
      ) || null
    );
  }

  function getPagerLink(direction) {
    const selector = direction < 0 ? '.pager .previous a' : '.pager .next a';
    const link = document.querySelector(selector);
    return isNavigableLink(link) ? link : null;
  }

  function getTabPagerLink(direction) {
    return getPaginationArrowLink(direction) || getPagerLink(direction);
  }

  function getTabKind(text) {
    if (/出席\s*テスト/.test(text)) return 'attendanceTest';
    if (/出席\s*課題/.test(text)) return 'attendanceAssignment';
    if (/課題/.test(text)) return 'assignment';
    if (/理解度確認|テスト|確認/.test(text)) return 'check';
    if (/スライド|資料/.test(text)) return 'slide';
    return '';
  }

  function resetTabDecoration(link) {
    delete link.dataset.glassmoocsTabKind;
    link.style.removeProperty('--glassmoocs-tab-color');
    link.style.removeProperty('--glassmoocs-tab-soft');
    link.style.removeProperty('--glassmoocs-tab-text');
    link
      .querySelectorAll('.glassmoocs-tab-mark')
      .forEach((mark) => mark.remove());
  }

  function decorateTabs() {
    document.documentElement.dataset.glassmoocsTabMode =
      settings.colorTabsEnabled ? settings.tabColorMode : 'off';

    getNumberTabLinks().forEach((link) => {
      resetTabDecoration(link);

      if (!settings.colorTabsEnabled) return;

      const title = link.getAttribute('title') || '';
      const combinedText = `${title} ${link.textContent || ''}`;
      const kind = getTabKind(combinedText);

      if (!kind || !TAB_TYPES[kind]) return;

      const color = settings.tabColors?.[kind] || DEFAULT_TAB_COLORS[kind];
      link.dataset.glassmoocsTabKind = kind;
      link.style.setProperty('--glassmoocs-tab-color', color);
      link.style.setProperty(
        '--glassmoocs-tab-soft',
        toAlphaColor(color, 0.18),
      );
      link.style.setProperty(
        '--glassmoocs-tab-text',
        toAlphaColor(color, 0.92),
      );

      if (settings.tabColorMode === MODE_FULL) return;
    });
  }

  function shortcutToId(shortcut) {
    const storedKey = getShortcutStoredKey(shortcut);
    if (!storedKey) return '';

    return [
      shortcut.ctrl ? 'ctrl' : '',
      shortcut.meta ? 'meta' : '',
      shortcut.alt ? 'alt' : '',
      shortcut.shift ? 'shift' : '',
      storedKey,
    ]
      .filter(Boolean)
      .join('+');
  }

  function isModifierOnlyKey(key) {
    return ['Meta', 'Shift', 'Alt', 'Control'].includes(key);
  }

  function isUnreliableKey(key) {
    return ['Process', 'Unidentified', 'Dead', 'Compose'].includes(key);
  }

  function keyFromCode(code) {
    if (!code) return '';
    if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
    if (/^Digit[0-9]$/.test(code)) return code.slice(5);
    if (/^Numpad[0-9]$/.test(code)) return code.slice(6);

    const codeLabels = {
      Space: ' ',
      Enter: 'Enter',
      Escape: 'Escape',
      Tab: 'Tab',
      Backspace: 'Backspace',
      Delete: 'Delete',
      Home: 'Home',
      End: 'End',
      PageUp: 'PageUp',
      PageDown: 'PageDown',
      ArrowLeft: 'ArrowLeft',
      ArrowRight: 'ArrowRight',
      ArrowUp: 'ArrowUp',
      ArrowDown: 'ArrowDown',
      Comma: ',',
      Period: '.',
      Slash: '/',
      Backslash: '\\',
      Semicolon: ';',
      Quote: "'",
      BracketLeft: '[',
      BracketRight: ']',
      Minus: '-',
      Equal: '=',
      Backquote: '`',
    };

    return codeLabels[code] || code;
  }

  function getShortcutStoredKey(shortcut) {
    if (!shortcut) return '';

    const codeKey = keyFromCode(shortcut.code);
    if (codeKey && !isModifierOnlyKey(codeKey)) {
      return normalizeKey(codeKey);
    }

    return normalizeKey(shortcut.key);
  }

  function getEventKey(event) {
    if (isModifierOnlyKey(event.key)) return '';

    const codeKey = keyFromCode(event.code);
    if (codeKey && !isModifierOnlyKey(codeKey)) {
      return normalizeKey(codeKey);
    }

    if (!isUnreliableKey(event.key)) {
      return normalizeKey(event.key);
    }

    return '';
  }

  function eventToShortcutId(event) {
    const key = getEventKey(event);
    if (!key) return '';

    return [
      event.ctrlKey ? 'ctrl' : '',
      event.metaKey ? 'meta' : '',
      event.altKey ? 'alt' : '',
      event.shiftKey ? 'shift' : '',
      key,
    ]
      .filter(Boolean)
      .join('+');
  }

  function normalizeKey(key) {
    if (!key) return '';
    if (key.length === 1) return key.toLowerCase();
    return key;
  }

  function isEditableTarget(target) {
    if (!(target instanceof Element)) return false;

    return Boolean(
      target.closest(
        [
          'input',
          'textarea',
          'select',
          '[contenteditable="true"]',
          '[contenteditable=""]',
          '.CodeMirror',
          '.CodeMirror-wrap',
          '.editor-toolbar',
        ].join(','),
      ),
    );
  }

  function navigateTabPager(direction) {
    const targetLink = getTabPagerLink(direction);

    if (!targetLink) return false;

    window.location.assign(targetLink.href);
    return true;
  }

  function handleTabShortcut(event) {
    if (isEditableTarget(event.target)) return;

    const eventId = eventToShortcutId(event);
    const previousId = shortcutToId(settings.shortcuts?.previous);
    const nextId = shortcutToId(settings.shortcuts?.next);
    let handled = false;

    if (eventId === previousId) {
      handled = navigateTabPager(-1);
    } else if (eventId === nextId) {
      handled = navigateTabPager(1);
    }

    if (handled) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }
  }

  function parseMoocsUrl(rawUrl) {
    try {
      const url = new URL(rawUrl, window.location.origin);
      const matched = url.pathname.match(
        /^\/courses\/(\d{4})\/([^/]+)(?:\/([^/]+)(?:\/([^/]+))?)?\/?$/,
      );

      if (!matched) {
        return null;
      }

      const [, year, courseSlug, lectureSlug = '', pageSlug = ''] = matched;
      const courseUrl = `${url.origin}/courses/${year}/${courseSlug}`;
      const lectureUrl = lectureSlug ? `${courseUrl}/${lectureSlug}` : '';
      const pageUrl = pageSlug
        ? `${lectureUrl}/${pageSlug}`
        : lectureUrl || courseUrl;
      const pageType = pageSlug ? 'page' : lectureSlug ? 'lecture' : 'course';

      return {
        year,
        courseSlug,
        lectureSlug,
        pageSlug,
        pageType,
        courseUrl,
        lectureUrl,
        pageUrl,
      };
    } catch {
      return null;
    }
  }

  function getNonHomeBreadcrumbs(root) {
    return [...root.querySelectorAll('.breadcrumb li')]
      .map((item) => normalizeText(item.textContent))
      .filter(Boolean)
      .filter((text) => !/^home$/i.test(text));
  }

  function getHeadingText(root) {
    return normalizeText(
      root.querySelector('.content-header > h1')?.textContent ||
        root.querySelector('h1')?.textContent,
    );
  }

  function getPageTitleFromDocument(root) {
    return normalizeText(root.title || '');
  }

  function getFallbackSlugLabel(slug, fallbackPrefix) {
    return normalizeText(slug, fallbackPrefix);
  }

  function extractCourseName(root, urlInfo) {
    const breadcrumbs = getNonHomeBreadcrumbs(root);
    const heading = getHeadingText(root);
    const offset = breadcrumbs[0] === urlInfo?.year ? 1 : 0;

    return (
      (urlInfo?.pageType === 'course' ? heading : '') ||
      breadcrumbs[offset] ||
      breadcrumbs[0] ||
      getFallbackSlugLabel(urlInfo?.courseSlug, 'course')
    );
  }

  function extractLectureName(root, urlInfo) {
    const breadcrumbs = getNonHomeBreadcrumbs(root);
    const offset = breadcrumbs[0] === urlInfo?.year ? 1 : 0;
    const activeSidebar = normalizeText(
      root.querySelector('ul.sidebar-menu li.active a')?.textContent ||
        root.querySelector('ul.treeview-menu li.active a')?.textContent,
    );
    const heading = getHeadingText(root);

    return (
      breadcrumbs[offset + 1] ||
      activeSidebar ||
      (urlInfo?.pageType === 'lecture' ? heading : '') ||
      getFallbackSlugLabel(urlInfo?.lectureSlug, 'lecture')
    );
  }

  function extractPageTitle(root, urlInfo) {
    const breadcrumbs = getNonHomeBreadcrumbs(root);
    const offset = breadcrumbs[0] === urlInfo?.year ? 1 : 0;
    const heading = getHeadingText(root);
    const documentTitle = getPageTitleFromDocument(root)
      .replace(/\s*\|\s*INIAD MOOCs.*$/i, '')
      .trim();

    return (
      (urlInfo?.pageType === 'page' ? heading : '') ||
      breadcrumbs[offset + 2] ||
      heading ||
      documentTitle ||
      getFallbackSlugLabel(urlInfo?.pageSlug, '')
    );
  }

  function resolveAbsoluteUrl(value, baseUrl) {
    try {
      return new URL(value, baseUrl).href;
    } catch {
      return '';
    }
  }

  async function fetchDocument(rawUrl) {
    const response = await fetch(rawUrl, {
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`fetch failed: ${response.status}`);
    }

    const html = await response.text();
    const parser = new DOMParser();
    const fetchedUrl =
      response.url || resolveAbsoluteUrl(rawUrl, window.location.href);

    return {
      document: parser.parseFromString(html, 'text/html'),
      html,
      url: fetchedUrl,
    };
  }

  function dedupeByUrl(items) {
    const seen = new Set();

    return items.filter((item) => {
      const key = getAssetDedupeKey(item);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
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

  function getAssetDedupeKey(item) {
    const preferredUrl =
      item?.kind === 'google_slides' ? item?.viewerUrl || item?.url : item?.url;
    const normalizedUrl = canonicalizeAssetUrl(preferredUrl);
    if (!normalizedUrl) {
      return '';
    }

    return `${normalizeText(item?.kind, 'direct_file')}::${normalizedUrl}`;
  }

  function getUrlBasename(rawUrl) {
    try {
      const url = new URL(rawUrl);
      const parts = url.pathname.split('/').filter(Boolean);
      return normalizeText(parts[parts.length - 1] || '');
    } catch {
      return '';
    }
  }

  function getUrlExtension(rawUrl) {
    const basename = getUrlBasename(rawUrl);
    const matched = basename.match(/\.([a-z0-9]{1,8})$/i);
    return matched ? matched[1].toLowerCase() : '';
  }

  function hasDownloadableExtension(rawUrl) {
    return DOWNLOADABLE_EXTENSIONS.has(getUrlExtension(rawUrl));
  }

  function isGoogleSlidesUrl(rawUrl) {
    return /https:\/\/docs\.google\.com\/presentation\//i.test(rawUrl);
  }

  function buildGoogleSlidesViewerUrl(rawUrl) {
    try {
      const url = new URL(rawUrl);
      url.searchParams.delete('glassmoocs_export');
      url.searchParams.delete('glassmoocs_job');
      url.searchParams.delete('glassmoocs_filename');

      if (/\/(embed|pub)$/i.test(url.pathname)) {
        return url.toString();
      }

      const publishedMatch = url.pathname.match(
        /^\/presentation\/d\/e\/([^/]+)/i,
      );
      if (publishedMatch) {
        return `https://docs.google.com/presentation/d/e/${publishedMatch[1]}/embed`;
      }

      const privateMatch = url.pathname.match(/^\/presentation\/d\/([^/]+)/i);
      if (privateMatch) {
        return `https://docs.google.com/presentation/d/${privateMatch[1]}/embed`;
      }
    } catch {
      return rawUrl;
    }
    return rawUrl;
  }

  function deriveGoogleDriveDownloadUrl(rawUrl) {
    const matched = rawUrl.match(
      /^https:\/\/drive\.google\.com\/file\/d\/([^/]+)/i,
    );
    if (!matched) return rawUrl;
    return `https://drive.google.com/uc?export=download&confirm=1&id=${matched[1]}`;
  }

  function isMoocsInternalPageUrl(rawUrl) {
    try {
      const url = new URL(rawUrl);
      if (url.origin !== window.location.origin) return false;
      return Boolean(parseMoocsUrl(url.href));
    } catch {
      return false;
    }
  }

  function isLikelyEmbeddedAsset(rawUrl) {
    if (hasDownloadableExtension(rawUrl)) return true;
    if (isGoogleSlidesUrl(rawUrl)) return true;
    if (/drive\.google\.com\/file\/d\//i.test(rawUrl)) return true;
    return false;
  }

  function isLikelyVideoAsset(rawUrl, label) {
    const text =
      `${normalizeText(rawUrl)} ${normalizeText(label)}`.toLowerCase();
    return (
      /(^|[^a-z])(video|movie|mp4|m3u8)([^a-z]|$)/i.test(text) ||
      /ビデオ|動画/.test(text)
    );
  }

  function createAssetFilename(rawUrl, label, fallbackBase, source) {
    const basename = getUrlBasename(rawUrl);
    if (basename && /\.[a-z0-9]{1,8}$/i.test(basename)) {
      return normalizePathLabel(basename, `${fallbackBase || 'asset'}`);
    }

    const normalizedLabel = normalizePathLabel(
      label || fallbackBase || 'asset',
      'asset',
    );
    const extension = getUrlExtension(rawUrl);

    if (extension) {
      return `${normalizedLabel}.${extension}`;
    }

    if (/docs\.google\.com\/presentation\//i.test(rawUrl)) {
      return `${normalizedLabel}.pdf`;
    }

    if (source === 'embed' || source === 'iframe' || source === 'object') {
      return normalizedLabel;
    }

    return normalizedLabel;
  }

  function createAssetId(url, lectureName, filename) {
    return `${lectureName}::${filename}::${url}`;
  }

  function getAssetSearchRoot(root) {
    return (
      root.querySelector(
        '.content-wrapper, .content, .tab-content, .course-content, main',
      ) || root
    );
  }

  function extractAssetCandidates(root, baseUrl, meta) {
    const courseName = normalizeText(meta?.courseName, 'course');
    const lectureGroup = normalizeText(meta?.lectureGroup);
    const lectureName = normalizeText(meta?.lectureName, 'lecture');
    const pageTitle = normalizeText(meta?.pageTitle, lectureName);
    const candidates = [];
    const searchRoot = getAssetSearchRoot(root);

    function pushCandidate(rawUrl, label, source) {
      const absoluteUrl = resolveAbsoluteUrl(rawUrl, baseUrl);
      if (!absoluteUrl || absoluteUrl === baseUrl) return;
      if (!/^https?:/i.test(absoluteUrl)) return;
      if (isLikelyVideoAsset(absoluteUrl, label)) return;

      const kind = isGoogleSlidesUrl(absoluteUrl)
        ? 'google_slides'
        : 'direct_file';
      let downloadUrl = absoluteUrl;
      let viewerUrl = '';

      if (kind === 'google_slides') {
        viewerUrl = buildGoogleSlidesViewerUrl(absoluteUrl);
        downloadUrl = viewerUrl;
      } else if (/drive\.google\.com\/file\/d\//i.test(absoluteUrl)) {
        downloadUrl = deriveGoogleDriveDownloadUrl(absoluteUrl);
      }

      const filename = createAssetFilename(
        downloadUrl,
        label,
        pageTitle,
        source,
      );

      candidates.push({
        id: createAssetId(downloadUrl, lectureName, filename),
        kind,
        url: downloadUrl,
        sourceUrl: absoluteUrl,
        viewerUrl,
        filename,
        courseName,
        year: normalizeText(meta?.year),
        lectureGroup,
        lectureName,
        pageTitle,
        source,
      });
    }

    searchRoot.querySelectorAll('a[href]').forEach((anchor) => {
      const rawUrl = anchor.getAttribute('href');
      if (!rawUrl || rawUrl === '#') return;

      const absoluteUrl = resolveAbsoluteUrl(rawUrl, baseUrl);
      const label = normalizeText(
        anchor.getAttribute('download') ||
          anchor.getAttribute('title') ||
          anchor.textContent,
      );

      if (
        isMoocsInternalPageUrl(absoluteUrl) &&
        !hasDownloadableExtension(absoluteUrl)
      ) {
        return;
      }

      if (
        !hasDownloadableExtension(absoluteUrl) &&
        !anchor.hasAttribute('download') &&
        !/docs\.google\.com\/presentation\//i.test(absoluteUrl) &&
        !/(pdf|ppt|pptx|download|ダウンロード|配布)/i.test(label)
      ) {
        return;
      }

      pushCandidate(rawUrl, label, 'anchor');
    });

    searchRoot.querySelectorAll('iframe[src]').forEach((iframe) => {
      const rawUrl = iframe.getAttribute('src');
      if (!rawUrl) return;
      const absoluteUrl = resolveAbsoluteUrl(rawUrl, baseUrl);
      if (!isLikelyEmbeddedAsset(absoluteUrl)) return;

      pushCandidate(
        rawUrl,
        normalizeText(iframe.getAttribute('title'), pageTitle),
        'iframe',
      );
    });

    searchRoot.querySelectorAll('embed[src]').forEach((embed) => {
      const rawUrl = embed.getAttribute('src');
      if (!rawUrl) return;
      const absoluteUrl = resolveAbsoluteUrl(rawUrl, baseUrl);
      if (!isLikelyEmbeddedAsset(absoluteUrl)) return;

      pushCandidate(rawUrl, pageTitle, 'embed');
    });

    searchRoot.querySelectorAll('object[data]').forEach((objectNode) => {
      const rawUrl = objectNode.getAttribute('data');
      if (!rawUrl) return;
      const absoluteUrl = resolveAbsoluteUrl(rawUrl, baseUrl);
      if (!isLikelyEmbeddedAsset(absoluteUrl)) return;

      pushCandidate(rawUrl, pageTitle, 'object');
    });

    const deduped = dedupeByUrl(candidates);

    const logSignature = [
      normalizeText(baseUrl),
      pageTitle,
      deduped
        .map((candidate) =>
          [
            normalizeText(candidate.kind),
            normalizeText(candidate.source),
            normalizeText(candidate.url),
          ].join(':'),
        )
        .join('|'),
    ].join('::');

    if (
      (deduped.length > 0 || candidates.length > 0) &&
      !loggedAssetCandidateSignatures.has(logSignature)
    ) {
      loggedAssetCandidateSignatures.add(logSignature);
      postAgentLog(
        'content.js:extractAssetCandidates',
        'asset candidates extracted from page',
        {
          baseUrl: normalizeText(baseUrl),
          pageTitle,
          candidateCount: candidates.length,
          dedupedCount: deduped.length,
          candidates: deduped.map((candidate) => ({
            kind: normalizeText(candidate.kind),
            source: normalizeText(candidate.source),
            filename: normalizeText(candidate.filename),
            url: normalizeText(candidate.url),
          })),
        },
        AGENT_LOG_HYPOTHESES.page,
      );
    }

    return deduped;
  }

  function extractLectureEntries(root, baseUrl) {
    const treeviews = [...root.querySelectorAll('ul.sidebar-menu li.treeview')];
    const entries = [];

    treeviews.forEach((treeview, treeviewIndex) => {
      const groupName = normalizeText(
        treeview.querySelector('span.sidebar-menu-text')?.textContent,
      );

      [...treeview.querySelectorAll('ul.treeview-menu li a[href]')].forEach(
        (anchor, lectureIndex) => {
          const url = resolveAbsoluteUrl(anchor.getAttribute('href'), baseUrl);
          if (!url) return;

          entries.push({
            id: `lecture-${treeviewIndex + 1}-${lectureIndex + 1}`,
            groupName,
            name: normalizeText(
              anchor.textContent,
              `lecture-${treeviewIndex + 1}-${lectureIndex + 1}`,
            ),
            url,
          });
        },
      );
    });

    return dedupeByUrl(entries);
  }

  function extractLectureGroup(root) {
    return normalizeText(
      root.querySelector(
        'ul.sidebar-menu li.treeview.active span.sidebar-menu-text',
      )?.textContent ||
        root.querySelector(
          'ul.sidebar-menu li.treeview.menu-open span.sidebar-menu-text',
        )?.textContent,
    );
  }

  function extractPageEntries(root, currentUrl, lectureEntry) {
    const items = [...root.querySelectorAll('ul.pagination li')];

    if (items.length <= 2) {
      const pageTitle =
        extractPageTitle(root, parseMoocsUrl(currentUrl)) || lectureEntry.name;
      return [
        {
          id: `${lectureEntry.id}-page-current`,
          title: pageTitle,
          url: currentUrl,
        },
      ];
    }

    const pageEntries = items
      .slice(1, -1)
      .map((item, index) => {
        const anchor = item.querySelector('a[href]');
        if (!anchor) return null;

        const href = anchor.getAttribute('href');
        const url =
          href === '#' ? currentUrl : resolveAbsoluteUrl(href, currentUrl);

        return {
          id: `${lectureEntry.id}-page-${index + 1}`,
          title: normalizeText(
            anchor.getAttribute('title') || anchor.textContent,
            `page-${index + 1}`,
          ),
          url,
        };
      })
      .filter(Boolean)
      .filter((entry) => entry.url);

    return dedupeByUrl(pageEntries);
  }

  function getCurrentPageContext(root, rawUrl) {
    const urlInfo = parseMoocsUrl(rawUrl);
    if (!urlInfo) return null;

    const courseName = extractCourseName(root, urlInfo);
    const lectureGroup = extractLectureGroup(root);
    const lectureName = extractLectureName(root, urlInfo);
    const pageTitle = extractPageTitle(root, urlInfo);
    const assetCandidates = extractAssetCandidates(root, rawUrl, {
      courseName,
      year: urlInfo.year,
      lectureGroup,
      lectureName,
      pageTitle,
    });

    return {
      pageType: urlInfo.pageType,
      year: urlInfo.year,
      courseUrl: urlInfo.courseUrl,
      lectureUrl: urlInfo.lectureUrl,
      pageUrl: urlInfo.pageUrl,
      courseName,
      lectureGroup,
      lectureName,
      pageTitle,
      assetCandidates,
    };
  }

  function createIdleDownloadState() {
    return {
      status: DOWNLOAD_STATUS.idle,
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

  async function setDownloadState(nextState) {
    try {
      await runtimeSendMessage({
        type: MESSAGE_TYPES.setDownloadState,
        state: nextState,
      });
    } catch {
      return;
    }
  }

  async function getDownloadState() {
    try {
      const response = await runtimeSendMessage({
        type: MESSAGE_TYPES.getDownloadState,
      });

      if (response?.ok && response.state) {
        return response.state;
      }
    } catch {
      return createIdleDownloadState();
    }

    return createIdleDownloadState();
  }

  async function resolveCourseName(courseUrl, fallbackName) {
    if (!courseUrl) return normalizeText(fallbackName, 'course');

    try {
      const { document: courseDocument, url } = await fetchDocument(courseUrl);
      const resolved = extractCourseName(courseDocument, parseMoocsUrl(url));
      return normalizeText(resolved, normalizeText(fallbackName, 'course'));
    } catch {
      return normalizeText(fallbackName, 'course');
    }
  }

  function createCollectingState(courseName, activeItem, lastError = '') {
    return {
      status: DOWNLOAD_STATUS.collecting,
      courseName,
      startedAt: new Date().toISOString(),
      finishedAt: '',
      activeItem: normalizeText(activeItem),
      pending: [],
      completed: [],
      failed: [],
      lastError: normalizeText(lastError),
      needsCapturePermission: false,
    };
  }

  async function requestBackgroundDownload(payload, debugLogContext = null) {
    const effectiveDebugLogContext =
      debugLogContext || createDebugLogContext('download-request');
    postAgentLog(
      'content.js:requestBackgroundDownload',
      'sending download payload to background',
      {
        debugLogContext: effectiveDebugLogContext,
        courseName: normalizeText(payload?.courseName),
        assetCount: Array.isArray(payload?.assets) ? payload.assets.length : 0,
        kinds: Array.isArray(payload?.assets)
          ? payload.assets.map((asset) => normalizeText(asset?.kind))
          : [],
      },
      AGENT_LOG_HYPOTHESES.queue,
    );
    const response = await runtimeSendMessage({
      type: MESSAGE_TYPES.downloadAssets,
      payload: {
        ...payload,
        debugLogContext: effectiveDebugLogContext,
      },
    });

    if (!response?.ok) {
      postAgentLog(
        'content.js:requestBackgroundDownload',
        'background download request rejected',
        {
          debugLogContext: effectiveDebugLogContext,
          error: summarizeError(
            new Error(
              normalizeText(
                response?.error,
                'background download request failed',
              ),
            ),
          ),
        },
        AGENT_LOG_HYPOTHESES.queue,
      );
      throw new Error(
        normalizeText(response?.error, 'background download request failed'),
      );
    }

    postAgentLog(
      'content.js:requestBackgroundDownload',
      'background download request accepted',
      {
        debugLogContext: effectiveDebugLogContext,
        courseName: normalizeText(payload?.courseName),
      },
      AGENT_LOG_HYPOTHESES.queue,
    );
  }

  async function getSlidesCapturePermissionState() {
    const response = await runtimeSendMessage({
      type: MESSAGE_TYPES.getSlidesCapturePermission,
    });
    if (!response?.ok) {
      throw new Error(
        normalizeText(
          response?.error,
          'slides capture permission check failed',
        ),
      );
    }

    return !!response.granted;
  }

  async function openSlidesCapturePermissionWindow() {
    const response = await runtimeSendMessage({
      type: MESSAGE_TYPES.openSlidesCapturePermissionWindow,
    });
    if (!response?.ok) {
      throw new Error(
        normalizeText(
          response?.error,
          'slides capture permission window failed to open',
        ),
      );
    }
  }
  async function buildCurrentPageDownloadPayload() {
    const pageContext = getCurrentPageContext(document, window.location.href);
    if (!pageContext) {
      postAgentLog(
        'content.js:buildCurrentPageDownloadPayload',
        'page context missing while building payload',
        {
          href: window.location.href,
        },
        AGENT_LOG_HYPOTHESES.page,
      );
      throw new Error('現在のページ情報を取得できませんでした。');
    }

    const courseName = await resolveCourseName(
      pageContext.courseUrl,
      pageContext.courseName,
    );
    const year = normalizeText(pageContext.year);
    const lectureGroup = normalizeText(pageContext.lectureGroup);
    const lectureName = normalizeText(pageContext.lectureName, 'lecture');
    const pageTitle = normalizeText(pageContext.pageTitle, lectureName);
    const assets = extractAssetCandidates(document, window.location.href, {
      courseName,
      year,
      lectureGroup,
      lectureName,
      pageTitle,
    }).map((entry) => ({
      ...entry,
      year,
      lectureGroup,
      lectureName,
      pageTitle,
      courseName,
    }));

    postAgentLog(
      'content.js:buildCurrentPageDownloadPayload',
      'built current-page download payload',
      {
        href: window.location.href,
        pageContext: summarizePageContext(pageContext),
        courseName,
        assetCount: assets.length,
        kinds: assets.map((asset) => normalizeText(asset.kind)),
      },
      AGENT_LOG_HYPOTHESES.queue,
    );

    return {
      courseName,
      assets,
    };
  }

  async function collectLectureAssets(lectureEntry, options = {}) {
    const courseName = normalizeText(options.courseName, 'course');
    const year = normalizeText(options.year);
    const lectureLabel = normalizeText(lectureEntry?.name, 'lecture');

    if (!lectureEntry?.url) {
      postAgentLog(
        'content.js:collectLectureAssets',
        'lecture entry missing URL',
        {
          lectureName: lectureLabel,
          lectureGroup: normalizeText(lectureEntry?.groupName),
          courseName,
        },
        AGENT_LOG_HYPOTHESES.page,
      );
      return {
        lectureName: lectureLabel,
        lectureGroup: normalizeText(lectureEntry?.groupName),
        assets: [],
        failures: [`${lectureLabel}: lecture URL missing`],
      };
    }

    await setDownloadState(
      createCollectingState(
        courseName,
        `講義を解析中: ${lectureLabel}`,
        normalizeText(options.lastError),
      ),
    );

    let lectureDocInfo;
    try {
      lectureDocInfo = await fetchDocument(lectureEntry.url);
    } catch (error) {
      postAgentLog(
        'content.js:collectLectureAssets',
        'lecture document fetch failed',
        {
          lectureName: lectureLabel,
          lectureUrl: normalizeText(lectureEntry?.url),
          error: summarizeError(error),
        },
        AGENT_LOG_HYPOTHESES.page,
      );
      return {
        lectureName: lectureLabel,
        lectureGroup: normalizeText(lectureEntry?.groupName),
        assets: [],
        failures: [
          `${lectureLabel}: ${normalizeText(error?.message, 'fetch failed')}`,
        ],
      };
    }

    const lectureName = normalizeText(
      lectureEntry.name ||
        extractLectureName(
          lectureDocInfo.document,
          parseMoocsUrl(lectureDocInfo.url),
        ),
      'lecture',
    );
    const lectureGroup = normalizeText(
      lectureEntry.groupName || extractLectureGroup(lectureDocInfo.document),
    );
    const pageEntries = extractPageEntries(
      lectureDocInfo.document,
      lectureDocInfo.url,
      lectureEntry,
    );
    const seenUrls = new Set();
    const assets = [];
    const failures = [];

    for (const pageEntry of pageEntries) {
      await setDownloadState(
        createCollectingState(
          courseName,
          `${lectureName} / ${pageEntry.title || '資料ページ'}`,
          failures[failures.length - 1] || '',
        ),
      );

      let pageDocInfo = lectureDocInfo;

      if (pageEntry.url !== lectureDocInfo.url) {
        try {
          pageDocInfo = await fetchDocument(pageEntry.url);
        } catch (error) {
          failures.push(
            `${lectureName}: ${normalizeText(error?.message, 'page fetch failed')}`,
          );
          continue;
        }
      }

      const pageTitle = normalizeText(
        pageEntry.title ||
          extractPageTitle(
            pageDocInfo.document,
            parseMoocsUrl(pageDocInfo.url),
          ),
        lectureName,
      );

      const pageAssets = extractAssetCandidates(
        pageDocInfo.document,
        pageDocInfo.url,
        {
          courseName,
          year,
          lectureGroup,
          lectureName,
          pageTitle,
        },
      );
      postAgentLog(
        'content.js:collectLectureAssets',
        'page asset candidates extracted',
        {
          lectureName,
          lectureGroup,
          pageTitle,
          pageUrl: normalizeText(pageDocInfo.url),
          assetCount: pageAssets.length,
          assets: pageAssets.map((candidate) => ({
            kind: normalizeText(candidate.kind),
            filename: normalizeText(candidate.filename),
            source: normalizeText(candidate.source),
            url: normalizeText(candidate.url),
          })),
        },
        AGENT_LOG_HYPOTHESES.page,
      );

      pageAssets.forEach((entry) => {
        const dedupeKey = getAssetDedupeKey(entry);
        if (!dedupeKey || seenUrls.has(dedupeKey)) return;
        seenUrls.add(dedupeKey);
        assets.push({
          ...entry,
          courseName,
          year,
          lectureGroup,
          lectureName,
          pageTitle,
        });
      });
    }

    return {
      lectureName,
      lectureGroup,
      assets,
      failures,
    };
  }

  async function collectLectureAssetsFromCurrentPage() {
    const currentContext = getCurrentPageContext(
      document,
      window.location.href,
    );
    if (!currentContext?.lectureUrl) {
      throw new Error('講義ページを特定できませんでした。');
    }

    const courseName = await resolveCourseName(
      currentContext.courseUrl,
      currentContext.courseName,
    );
    const lectureEntry = {
      id: `lecture-current-${normalizeText(currentContext.lectureUrl)}`,
      groupName: normalizeText(currentContext.lectureGroup),
      name: normalizeText(currentContext.lectureName, 'lecture'),
      url: currentContext.lectureUrl,
    };
    const result = await collectLectureAssets(lectureEntry, {
      courseName,
      year: normalizeText(currentContext.year),
    });

    if (!result.assets.length) {
      throw new Error('この回でダウンロード可能な資料が見つかりませんでした。');
    }

    return {
      courseName,
      lectureName: result.lectureName,
      assets: result.assets,
      failures: result.failures,
    };
  }

  async function collectCourseAssetsFromCurrentPage() {
    const currentContext = getCurrentPageContext(
      document,
      window.location.href,
    );
    if (!currentContext?.courseUrl) {
      throw new Error('科目ページを特定できませんでした。');
    }

    const courseDocInfo = await fetchDocument(currentContext.courseUrl);
    const courseName = normalizeText(
      extractCourseName(
        courseDocInfo.document,
        parseMoocsUrl(courseDocInfo.url),
      ),
      normalizeText(currentContext.courseName, 'course'),
    );
    const year = normalizeText(currentContext.year);
    const lectureEntries = extractLectureEntries(
      courseDocInfo.document,
      courseDocInfo.url,
    );

    if (!lectureEntries.length) {
      throw new Error('科目配下の講義一覧を取得できませんでした。');
    }

    await setDownloadState(
      createCollectingState(
        courseName,
        `講義一覧を取得: ${lectureEntries.length} 件`,
      ),
    );

    const seenUrls = new Set();
    const assets = [];
    const failures = [];

    for (const lectureEntry of lectureEntries) {
      const lectureResult = await collectLectureAssets(lectureEntry, {
        courseName,
        year,
        lastError: failures[failures.length - 1] || '',
      });

      failures.push(...lectureResult.failures);
      lectureResult.assets.forEach((entry) => {
        const dedupeKey = getAssetDedupeKey(entry);
        if (!dedupeKey || seenUrls.has(dedupeKey)) return;
        seenUrls.add(dedupeKey);
        assets.push(entry);
      });
    }

    if (!assets.length) {
      throw new Error(
        '科目配下にダウンロード可能な資料が見つかりませんでした。',
      );
    }

    return {
      courseName,
      assets,
      failures,
    };
  }

  function formatDownloadStateText(state, context) {
    const candidateCount = Array.isArray(context?.assetCandidates)
      ? context.assetCandidates.length
      : 0;

    if (!state || state.status === DOWNLOAD_STATUS.idle) {
      return candidateCount > 0
        ? `このページから ${candidateCount} 件の候補資料を保存できます。`
        : 'このページで保存対象になりそうな資料はまだ見つかっていません。';
    }

    const lines = [
      `状態: ${state.status}`,
      state.courseName ? `科目: ${state.courseName}` : '',
      state.activeItem ? `処理中: ${state.activeItem}` : '',
      state.activeJobType ? `種別: ${state.activeJobType}` : '',
      state.stage ? `段階: ${state.stage}` : '',
      `残り: ${Array.isArray(state.pending) ? state.pending.length : 0}`,
      `完了: ${Array.isArray(state.completed) ? state.completed.length : 0}`,
      `失敗: ${Array.isArray(state.failed) ? state.failed.length : 0}`,
      state.lastError ? `最新エラー: ${state.lastError}` : '',
    ].filter(Boolean);

    return lines.join(' / ');
  }

  function getDownloadProgress(state) {
    if (!state || state.status === DOWNLOAD_STATUS.idle) {
      return null;
    }

    const completedCount = Array.isArray(state.completed)
      ? state.completed.length
      : 0;
    const failedCount = Array.isArray(state.failed) ? state.failed.length : 0;
    const pendingCount = Array.isArray(state.pending)
      ? state.pending.length
      : 0;
    const totalEntries = completedCount + failedCount + pendingCount;
    const settledCount = completedCount + failedCount;
    let ratio = totalEntries > 0 ? settledCount / totalEntries : 0;
    let label = totalEntries > 0 ? `${settledCount} / ${totalEntries} 件` : '';

    if (totalEntries <= 0) {
      ratio =
        state.status === DOWNLOAD_STATUS.done ||
        state.status === DOWNLOAD_STATUS.partialFailed ||
        state.status === DOWNLOAD_STATUS.failed
          ? 1
          : 0;
      label = state.status === DOWNLOAD_STATUS.collecting ? '収集中' : '';
    }

    return {
      ratio: Math.max(0, Math.min(1, ratio)),
      percent: Math.round(Math.max(0, Math.min(1, ratio)) * 100),
      label,
    };
  }

  function pageNeedsSlidesCapturePermission(state, granted) {
    if (granted) return false;
    return !!state?.needsCapturePermission;
  }

  const downloadPanelComponent =
    globalThis.__glassmoocsCreateDownloadPanelComponent({
      AGENT_LOG_HYPOTHESES: DEBUG_LOGS_ENABLED ? AGENT_LOG_HYPOTHESES : {},
      DOWNLOAD_STATUS,
      buildCurrentPageDownloadPayload,
      createDebugLogContext,
      collectCourseAssetsFromCurrentPage,
      collectLectureAssetsFromCurrentPage,
      formatDownloadStateText,
      getDownloadProgress,
      getCurrentPageContext,
      getDownloadState,
      getSlidesCapturePermissionState,
      normalizeText,
      openSlidesCapturePermissionWindow,
      pageNeedsSlidesCapturePermission,
      postAgentLog,
      requestBackgroundDownload,
    });

  const {
    handleCourseCollectionRequest,
    handleLectureDownloadRequest,
    handleCurrentPageDownloadRequest,
    injectDownloadControls: injectDownloadControlsBase,
    scheduleDownloadPanelRefresh,
  } = downloadPanelComponent;

  function injectDownloadControls() {
    const pageContext = getCurrentPageContext(document, window.location.href);
    injectDownloadControlsBase();
    if (pageContext) {
      maybeAutoTriggerDebugDownload(pageContext);
    }
  }

  function maybeAutoTriggerDebugDownload(pageContext) {
    if (!DEBUG_LOGS_ENABLED) {
      return;
    }

    if (
      !new URL(window.location.href).searchParams.has(DEBUG_AUTO_DOWNLOAD_PARAM)
    ) {
      return;
    }

    if (globalThis.__glassmoocsDebugAutoDownloadStarted) {
      return;
    }

    if (!pageContext?.assetCandidates?.length) {
      postAgentLog(
        'content.js:maybeAutoTriggerDebugDownload',
        'debug auto-download waiting for asset candidates',
        {
          href: window.location.href,
          pageTitle: pageContext?.pageTitle || '',
          assetCount: 0,
        },
        AGENT_LOG_HYPOTHESES.page,
      );
      return;
    }

    globalThis.__glassmoocsDebugAutoDownloadStarted = true;
    postAgentLog(
      'content.js:maybeAutoTriggerDebugDownload',
      'triggering debug auto-download for current page',
      {
        href: window.location.href,
        pageTitle: pageContext.pageTitle || '',
        assetCount: pageContext.assetCandidates.length,
      },
      AGENT_LOG_HYPOTHESES.queue,
    );

    handleCurrentPageDownloadRequest()
      .then((payload) => {
        postAgentLog(
          'content.js:maybeAutoTriggerDebugDownload',
          'debug auto-download request completed',
          {
            href: window.location.href,
            assetCount: payload.assets.length,
          },
          AGENT_LOG_HYPOTHESES.queue,
        );
      })
      .catch((error) => {
        postAgentLog(
          'content.js:maybeAutoTriggerDebugDownload',
          'debug auto-download request failed',
          {
            href: window.location.href,
            error: summarizeError(error),
          },
          AGENT_LOG_HYPOTHESES.queue,
        );
      })
      .finally(() => {
        scheduleDownloadPanelRefresh();
      });
  }

  function handleRuntimeMessage(message, _sender, sendResponse) {
    const type = normalizeText(message?.type);

    if (type === MESSAGE_TYPES.getPageContext) {
      sendResponse({
        ok: true,
        context: getCurrentPageContext(document, window.location.href),
      });
      return false;
    }

    if (type === MESSAGE_TYPES.startCourseCollection) {
      handleCourseCollectionRequest()
        .then((result) =>
          sendResponse({
            ok: true,
            courseName: result.courseName,
            assetCount: result.assets.length,
          }),
        )
        .catch((error) =>
          sendResponse({
            ok: false,
            error: normalizeText(error?.message, 'course collection failed'),
          }),
        );
      return true;
    }

    if (type === MESSAGE_TYPES.downloadCurrentPage) {
      handleCurrentPageDownloadRequest()
        .then((result) =>
          sendResponse({
            ok: true,
            courseName: result.courseName,
            assetCount: result.assets.length,
          }),
        )
        .catch((error) =>
          sendResponse({
            ok: false,
            error: normalizeText(error?.message, 'page download failed'),
          }),
        );
      return true;
    }

    if (type === MESSAGE_TYPES.downloadCurrentLecture) {
      handleLectureDownloadRequest()
        .then((result) =>
          sendResponse({
            ok: true,
            courseName: result.courseName,
            lectureName: result.lectureName,
            assetCount: result.assets.length,
          }),
        )
        .catch((error) =>
          sendResponse({
            ok: false,
            error: normalizeText(error?.message, 'lecture download failed'),
          }),
        );
      return true;
    }

    return false;
  }

  function enhancePage() {
    attachTextareaEnhancements();
    decorateTabs();
    injectDownloadControls();
  }

  function scheduleEnhancements() {
    if (enhancementFrame) return;

    enhancementFrame = requestAnimationFrame(() => {
      enhancementFrame = 0;
      enhancePage();
    });
  }

  function init() {
    readSettings((loadedSettings) => {
      settings = loadedSettings;
      enhancePage();
    });

    setBackground();
    injectSubmitBridge();

    window.addEventListener('keydown', handleBackgroundShortcut, true);
    window.addEventListener('keydown', handleTabShortcut, true);
    window.addEventListener('focus', scheduleDownloadPanelRefresh);
    document.addEventListener('click', handleSubmitIntent, true);
    window.addEventListener(SUBMIT_SUCCESS_EVENT, handleSubmitSuccess);
    window.addEventListener('load', scheduleEnhancements);

    const observer = new MutationObserver(scheduleEnhancements);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    if (extensionApi?.runtime?.onMessage) {
      extensionApi.runtime.onMessage.addListener(handleRuntimeMessage);
    }

    const extensionStorage = getExtensionStorage();
    const storageChanges =
      globalThis.browser?.storage?.onChanged ||
      globalThis.chrome?.storage?.onChanged;

    if (extensionStorage && storageChanges?.addListener) {
      storageChanges.addListener((changes, areaName) => {
        if (
          areaName === extensionStorage.areaName &&
          changes[SETTINGS_STORAGE_KEY]
        ) {
          settings = mergeSettings(changes[SETTINGS_STORAGE_KEY].newValue);
          enhancePage();
        }

        if (
          areaName === extensionStorage.areaName &&
          changes[BACKGROUND_STORAGE_KEY]
        ) {
          const nextImage = changes[BACKGROUND_STORAGE_KEY].newValue;
          if (typeof nextImage === 'string') {
            applyBackgroundImage(nextImage.trim());
          } else if (nextImage == null) {
            applyBackgroundImage('');
          }
        }

        if (
          areaName === extensionStorage.areaName &&
          changes[DOWNLOAD_STATE_STORAGE_KEY]
        ) {
          scheduleDownloadPanelRefresh();
        }
      });
    }
  }

  if (document.body) {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  }
})();
