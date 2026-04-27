(function () {
  if (
    typeof globalThis.importScripts === 'function' &&
    !globalThis.__glassmoocsBackgroundPdfUtilsLoaded
  ) {
    globalThis.importScripts('background/pdf.js');
    globalThis.__glassmoocsBackgroundPdfUtilsLoaded = true;
  }

  const DOWNLOAD_STATE_STORAGE_KEY = 'glassmoocs_download_state';
  const MESSAGE_TYPES = {
    getState: 'glassmoocs:get-download-state',
    setState: 'glassmoocs:set-download-state',
    resetState: 'glassmoocs:reset-download-state',
    downloadAssets: 'glassmoocs:download-assets',
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
  const CAPTURE_QUALITY = 92;
  const CAPTURE_INTERVAL_MS = 250;
  const CAPTURE_REACTIVATE_DELAY_MS = 500;
  const MAX_PATH_SEGMENT_LENGTH = 120;
  const AGENT_LOG_ENABLED = false;
  const ERROR_CODES = {
    canceled: 'canceled',
    capturePermissionRequired: 'capture_permission_required',
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
  // [H-SVG-A] SVG 直列化経路に入れていない、または途中失敗している
  // [H-SVG-B] SVG 直列化後のラスタライズ/PDF 化が支配的に遅い
  // [H-SVG-C] SVG 経路が失敗して capture フォールバックに落ちている
  // [H-TAB-A] Slides タブ生成/読み込みが不安定で about:blank に留まる
  // #region agent log
  const AGENT_LOG_SESSION_ID = `glassmoocs-bg-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;

  let queueNonce = 0;
  let activeSlidesTabId = null;

  if (!api?.runtime?.onMessage) {
    return;
  }

  function getRuntimeLastError() {
    return globalThis.chrome?.runtime?.lastError || null;
  }

  function postAgentLog(location, message, data = {}, hypothesisId = '') {
    if (!AGENT_LOG_ENABLED) {
      return;
    }

    fetch(`http://127.0.0.1:7443/ingest/${AGENT_LOG_SESSION_ID}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: AGENT_LOG_SESSION_ID,
        location,
        message,
        data,
        hypothesisId,
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  }
  // #endregion agent log

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

  async function loadState() {
    const result = await storageGet([DOWNLOAD_STATE_STORAGE_KEY]);
    return normalizeState(result[DOWNLOAD_STATE_STORAGE_KEY]);
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
    }
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
    const downloadId = await downloadFile({
      url: entry.url,
      filename,
      conflictAction: 'uniquify',
      saveAs: false,
    });
    await waitForDownloadCompletion(downloadId, cancelToken);
    return {
      downloadId,
      storedFilename: filename,
    };
  }

  async function downloadPdfBlob(blob, filename, cancelToken) {
    const blobUrl = URL.createObjectURL(blob);

    try {
      const downloadId = await downloadFile({
        url: blobUrl,
        filename: normalizeText(filename, 'slides.pdf'),
        conflictAction: 'uniquify',
        saveAs: false,
      });
      await waitForDownloadCompletion(downloadId, cancelToken);
      return {
        downloadId,
        storedFilename: normalizeText(filename, 'slides.pdf'),
      };
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
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
        return await tabsSendMessage(tabId, message);
      } catch (error) {
        lastError = error;
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

    while (Date.now() < timeoutAt) {
      assertNotCanceled(cancelToken);
      const items = await downloadsSearch({ id: downloadId });
      const item = items[0];

      if (!item) {
        throw new Error(`download disappeared: ${downloadId}`);
      }

      if (item.state === 'complete') {
        return item;
      }

      if (item.state === 'interrupted') {
        throw new Error(normalizeText(item.error, 'download interrupted'));
      }

      await sleep(400);
    }

    throw new Error(`download timeout: ${downloadId}`);
  }

  async function ensureCaptureTabActive(tabId, windowId, alreadyRecovered) {
    const activeTabs = await tabsQuery({ active: true, windowId });
    if (activeTabs[0]?.id === tabId) {
      return false;
    }

    if (alreadyRecovered) {
      throw new Error(
        '操作により Slides キャプチャが中断されたため、保存を中止しました。',
      );
    }

    await tabsUpdate(tabId, { active: true });
    await sleep(CAPTURE_REACTIVATE_DELAY_MS);
    return true;
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
      {
        type: MESSAGE_TYPES.getSlidesSessionInfo,
      },
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
      {
        type: MESSAGE_TYPES.goToFirstSlide,
      },
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
      {
        type: MESSAGE_TYPES.goToSlide,
        page,
      },
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
      {
        type: MESSAGE_TYPES.waitForSlideReady,
        page,
        previousSnapshot,
      },
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
      'H-SVG-A',
    );
    const response = await sendTabMessageWithRetry(
      tabId,
      {
        type: MESSAGE_TYPES.serializeCurrentSlideSvg,
        page,
      },
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
        'H-SVG-A',
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
      'H-SVG-A',
    );
    return response;
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
      1280,
      requestedWidth ? requestedWidth * 2 : 0,
      Number(page?.viewBoxWidth)
        ? Math.round(Number(page.viewBoxWidth) * 2)
        : 0,
    );
    const targetHeight = Math.max(
      720,
      requestedHeight ? requestedHeight * 2 : 0,
      Number(page?.viewBoxHeight)
        ? Math.round(Number(page.viewBoxHeight) * 2)
        : 0,
    );

    const blob = new Blob([svgText], {
      type: 'image/svg+xml;charset=utf-8',
    });
    const bitmap = await createImageBitmap(blob);

    try {
      const canvas = createCanvas(targetWidth, targetHeight);
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('svg render canvas context unavailable');
      }

      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, targetWidth, targetHeight);
      context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);

      return {
        width: targetWidth,
        height: targetHeight,
        jpegBytes: await canvasToJpegBytes(canvas),
      };
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
        'H-SVG-B',
      );
      if (typeof bitmap.close === 'function') {
        bitmap.close();
      }
    }
  }

  async function fetchImageDataUrl(url) {
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
      'H-SVG-A',
    );

    assertNotCanceled(cancelToken);
    await saveState({
      ...state,
      status: STATUS.rendering,
      stage: 'prepare-slide-svg-export',
    });

    const session = await requestSlidesSessionInfo(tabId, cancelToken);
    if (!Number.isFinite(session.totalPages) || session.totalPages <= 0) {
      postAgentLog(
        'background.js:processSlidesDownloadBySvg',
        'invalid slide session',
        {
          tabId,
          totalPages: session?.totalPages,
          currentPage: session?.currentPage,
        },
        'H-SVG-A',
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
      'H-SVG-A',
    );

    await requestGoToFirstSlide(tabId, cancelToken);
    let previousSnapshot = '';
    const pdfBuilder = createPdfBuilder();

    for (let page = 1; page <= session.totalPages; page += 1) {
      assertNotCanceled(cancelToken);
      if (page > 1) {
        await requestGoToSlide(tabId, page, cancelToken);
      }

      const ready = await requestWaitForSlideReady(
        tabId,
        page,
        previousSnapshot,
        cancelToken,
      );
      previousSnapshot = normalizeText(ready.snapshot);

      await saveState({
        ...state,
        status: STATUS.rendering,
        stage: `serialize-slide-${page}/${session.totalPages}`,
      });

      const serializedPage = await requestSerializeCurrentSlideSvg(
        tabId,
        page,
        cancelToken,
      );
      pdfBuilder.addJpegPage(await renderSerializedSlidePage(serializedPage));
    }

    assertNotCanceled(cancelToken);
    await saveState({
      ...state,
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
      'H-SVG-B',
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
      'H-SVG-C',
    );
    assertNotCanceled(cancelToken);
    const hasPermission = await permissionsContains({
      origins: [CAPTURE_PERMISSION_ORIGIN],
    });
    if (!hasPermission) {
      throw createCapturePermissionRequiredError();
    }

    await saveState({
      ...state,
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

      await saveState({
        ...state,
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
    await saveState({
      ...state,
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
      'H-SVG-C',
    );
    return await downloadPdfBlob(pdfBlob, filename, cancelToken);
  }

  async function processSlidesDownload(courseName, entry, state, cancelToken) {
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
      'H-SVG-A',
    );
    if (!viewerUrl) {
      throw new Error('Google Slides の URL を組み立てられませんでした。');
    }

    await saveState({
      ...state,
      status: STATUS.rendering,
      viewerUrl,
      stage: 'open-slides-viewer',
    });

    let tabId = -1;

    try {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        assertNotCanceled(cancelToken);
        if (tabId !== -1) {
          await closeTabQuietly(tabId);
          tabId = -1;
        }
        if (attempt > 0) {
          await sleep(2000);
        }

        const slidesTab = await tabsCreate({ url: viewerUrl, active: true });
        tabId = slidesTab.id;
        activeSlidesTabId = tabId;
        postAgentLog(
          'background.js:processSlidesDownload',
          'slides tab created',
          {
            attempt: attempt + 1,
            tabId,
            viewerUrl,
            createdUrl: normalizeText(slidesTab?.url),
          },
          'H-TAB-A',
        );
        const loadedTab = await waitForTabLoad(tabId, viewerUrl, cancelToken);
        postAgentLog(
          'background.js:processSlidesDownload',
          'slides tab loaded',
          {
            attempt: attempt + 1,
            tabId,
            loadedUrl: normalizeText(loadedTab?.url),
            status: normalizeText(loadedTab?.status),
          },
          'H-TAB-A',
        );
        if (loadedTab?.url && loadedTab.url !== 'about:blank') {
          const windowId = loadedTab.windowId;
          try {
            return await processSlidesDownloadBySvg(
              courseName,
              entry,
              {
                ...state,
                viewerUrl,
              },
              tabId,
              cancelToken,
            );
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
              'H-SVG-C',
            );
            return await processSlidesDownloadByCapture(
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
          'H-TAB-A',
        );
        await closeTabQuietly(tabId);
      }
      activeSlidesTabId = null;
    }
  }

  async function queueDownloads(payload) {
    const courseName = normalizeText(payload?.courseName, 'course');
    const rawEntries = Array.isArray(payload?.assets)
      ? payload.assets.map(normalizeEntry).filter((entry) => entry.url)
      : [];

    const seenUrls = new Set();
    const entries = rawEntries.filter((entry) => {
      const key = getEntryDedupKey(entry);
      if (seenUrls.has(key)) return false;
      seenUrls.add(key);
      return true;
    });

    const startedAt = new Date().toISOString();
    const pending = entries.map(summarizeEntry);
    const currentNonce = ++queueNonce;

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

    let state = await loadState();
    const cancelToken = createCancelToken(currentNonce);

    for (const entry of entries) {
      if (cancelToken.isCanceled()) {
        return;
      }

      state = normalizeState({
        ...state,
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
            ? 'open-slides-viewer'
            : 'download-direct-file',
        lastError: '',
        needsCapturePermission: false,
      });
      await saveState(state);

      try {
        const result =
          entry.kind === 'google_slides'
            ? await processSlidesDownload(courseName, entry, state, cancelToken)
            : await processDirectDownload(courseName, entry, cancelToken);

        state = normalizeState({
          ...state,
          pending: state.pending.filter((item) => item.id !== entry.id),
          completed: [
            ...state.completed,
            {
              ...summarizeEntry(entry),
              downloadId: result.downloadId,
              storedFilename: result.storedFilename,
            },
          ],
          stage: '',
          lastError: '',
          needsCapturePermission: false,
        });
      } catch (error) {
        if (isCancellationError(error)) {
          return;
        }

        state = normalizeState({
          ...state,
          pending: state.pending.filter((item) => item.id !== entry.id),
          failed: [
            ...state.failed,
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
        });
      }

      await saveState(state);
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
      const closingTabId = activeSlidesTabId;
      activeSlidesTabId = null;
      closeTabQuietly(closingTabId).catch(() => {});
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

    if (type === MESSAGE_TYPES.downloadAssets) {
      sendResponse({ ok: true });
      queueDownloads(message?.payload).catch((error) => {
        if (isCancellationError(error)) {
          return;
        }
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
