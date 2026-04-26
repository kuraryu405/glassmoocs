(function () {
  const DOWNLOAD_STATE_STORAGE_KEY = 'glassmoocs_download_state';
  const MESSAGE_TYPES = {
    getState: 'glassmoocs:get-download-state',
    setState: 'glassmoocs:set-download-state',
    resetState: 'glassmoocs:reset-download-state',
    downloadAssets: 'glassmoocs:download-assets',
    getSlidesSessionInfo: 'glassmoocs:get-slides-session-info',
    waitForSlideReady: 'glassmoocs:wait-for-slide-ready',
    goToFirstSlide: 'glassmoocs:go-to-first-slide',
    goToSlide: 'glassmoocs:go-to-slide',
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
  const CAPTURE_INTERVAL_MS = 600;
  const CAPTURE_REACTIVATE_DELAY_MS = 900;
  const api = globalThis.browser || globalThis.chrome;

  let queueNonce = 0;

  if (!api?.runtime?.onMessage) {
    return;
  }

  function getRuntimeLastError() {
    return globalThis.chrome?.runtime?.lastError || null;
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

  function storageRemove(keys) {
    try {
      const result = api.storage.local.remove(keys);
      if (result && typeof result.then === 'function') {
        return result.then(() => {});
      }
    } catch {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      try {
        api.storage.local.remove(keys, () => {
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
    };
  }

  function normalizeText(value, fallback = '') {
    if (typeof value !== 'string') return fallback;
    const normalized = value.replace(/\s+/g, ' ').trim();
    return normalized || fallback;
  }

  function sanitizePathSegment(value, fallback) {
    const normalized = normalizeText(value, fallback);
    const replaced = normalized
      .split('')
      .map((char) => {
        if (char < ' ') return '_';
        if ('<>:"/\\|?*'.includes(char)) return '_';
        return char;
      })
      .join('')
      .replace(/\.+$/g, '')
      .trim();
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
    });
  }

  async function loadState() {
    const result = await storageGet([DOWNLOAD_STATE_STORAGE_KEY]);
    return recoverStaleState(result[DOWNLOAD_STATE_STORAGE_KEY]);
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

  async function processDirectDownload(courseName, entry) {
    const filename = buildDownloadFilename(courseName, entry);
    const downloadId = await downloadFile({
      url: entry.url,
      filename,
      conflictAction: 'uniquify',
      saveAs: false,
    });
    await waitForDownloadCompletion(downloadId);
    return {
      downloadId,
      storedFilename: filename,
    };
  }

  async function downloadStoredPdf(pdfStorageKey, fallbackFilename) {
    const storageResult = await storageGet([pdfStorageKey]);
    const pdfData = storageResult[pdfStorageKey];

    if (!pdfData?.pdfBase64) {
      throw new Error('storage から PDF データを取得できませんでした。');
    }

    const binaryStr = atob(pdfData.pdfBase64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let index = 0; index < binaryStr.length; index += 1) {
      bytes[index] = binaryStr.charCodeAt(index);
    }

    const blob = new Blob([bytes], { type: 'application/pdf' });
    const blobUrl = URL.createObjectURL(blob);

    try {
      const storedFilename = normalizeText(
        pdfData.filename,
        normalizeText(fallbackFilename, 'slides.pdf'),
      );
      const downloadId = await downloadFile({
        url: blobUrl,
        filename: storedFilename,
        conflictAction: 'uniquify',
        saveAs: false,
      });
      await waitForDownloadCompletion(downloadId);
      return {
        downloadId,
        storedFilename,
      };
    } finally {
      URL.revokeObjectURL(blobUrl);
      await storageRemove([pdfStorageKey]).catch(() => {});
    }
  }

  async function sendTabMessageWithRetry(tabId, message, options = {}) {
    const attempts = Number.isFinite(options.attempts) ? options.attempts : 10;
    const intervalMs = Number.isFinite(options.intervalMs)
      ? options.intervalMs
      : 800;
    let lastError = null;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
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

  async function waitForTabLoad(tabId, targetUrl = '') {
    const timeoutAt = Date.now() + 60000;
    let lastUrl = '';

    while (Date.now() < timeoutAt) {
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

  async function waitForDownloadCompletion(downloadId) {
    const timeoutAt = Date.now() + 120000;

    while (Date.now() < timeoutAt) {
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

  function uint8ArrayToBase64(bytes) {
    let binary = '';
    const chunkSize = 0x8000;

    for (let index = 0; index < bytes.length; index += chunkSize) {
      const chunk = bytes.subarray(index, index + chunkSize);
      binary += String.fromCharCode(...chunk);
    }

    return btoa(binary);
  }

  function concatUint8Arrays(chunks) {
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;

    chunks.forEach((chunk) => {
      result.set(chunk, offset);
      offset += chunk.length;
    });

    return result;
  }

  async function dataUrlToBlob(dataUrl) {
    const response = await fetch(dataUrl);
    return await response.blob();
  }

  async function blobToUint8Array(blob) {
    return new Uint8Array(await blob.arrayBuffer());
  }

  async function canvasToJpegBytes(canvas) {
    if (typeof canvas.convertToBlob === 'function') {
      return await blobToUint8Array(
        await canvas.convertToBlob({
          type: 'image/jpeg',
          quality: CAPTURE_QUALITY / 100,
        }),
      );
    }

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (value) => {
          if (!value) {
            reject(new Error('capture canvas export failed'));
            return;
          }

          resolve(value);
        },
        'image/jpeg',
        CAPTURE_QUALITY / 100,
      );
    });

    return await blobToUint8Array(blob);
  }

  function createCanvas(width, height) {
    if (typeof OffscreenCanvas !== 'undefined') {
      return new OffscreenCanvas(width, height);
    }

    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      return canvas;
    }

    throw new Error('Slides capture 用キャンバスを作成できませんでした。');
  }

  async function cropCapturedSlide(dataUrl, captureMetrics) {
    const blob = await dataUrlToBlob(dataUrl);
    const bitmap = await createImageBitmap(blob);

    try {
      const viewportWidth = Number(captureMetrics?.viewportWidth) || 0;
      const viewportHeight = Number(captureMetrics?.viewportHeight) || 0;
      const rect = captureMetrics?.rect || {};
      if (!viewportWidth || !viewportHeight) {
        throw new Error('Slides capture viewport 情報が不足しています。');
      }

      const scaleX = bitmap.width / viewportWidth;
      const scaleY = bitmap.height / viewportHeight;
      const sourceX = Math.max(
        0,
        Math.round((Number(rect.left) || 0) * scaleX),
      );
      const sourceY = Math.max(0, Math.round((Number(rect.top) || 0) * scaleY));
      const sourceWidth = Math.max(
        1,
        Math.round((Number(rect.width) || 0) * scaleX),
      );
      const sourceHeight = Math.max(
        1,
        Math.round((Number(rect.height) || 0) * scaleY),
      );
      const clampedWidth = Math.min(sourceWidth, bitmap.width - sourceX);
      const clampedHeight = Math.min(sourceHeight, bitmap.height - sourceY);

      if (clampedWidth <= 0 || clampedHeight <= 0) {
        throw new Error('Slides capture 範囲が無効です。');
      }

      const canvas = createCanvas(clampedWidth, clampedHeight);
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Slides capture canvas context unavailable');
      }

      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, clampedWidth, clampedHeight);
      context.drawImage(
        bitmap,
        sourceX,
        sourceY,
        clampedWidth,
        clampedHeight,
        0,
        0,
        clampedWidth,
        clampedHeight,
      );

      return {
        width: clampedWidth,
        height: clampedHeight,
        jpegBytes: await canvasToJpegBytes(canvas),
      };
    } finally {
      if (typeof bitmap.close === 'function') {
        bitmap.close();
      }
    }
  }

  function createPdfFromJpegs(pages) {
    const encoder = new TextEncoder();
    const pdfWidth = 841.89;
    const pdfHeight = 595.28;
    const objects = [];
    const catalogId = 1;
    const pagesId = 2;
    let nextObjectId = 3;

    pages.forEach((page, index) => {
      const imageId = nextObjectId++;
      const contentId = nextObjectId++;
      const pageId = nextObjectId++;
      const imageName = `Im${index + 1}`;
      const scale = Math.min(pdfWidth / page.width, pdfHeight / page.height);
      const drawWidth = page.width * scale;
      const drawHeight = page.height * scale;
      const offsetX = (pdfWidth - drawWidth) / 2;
      const offsetY = (pdfHeight - drawHeight) / 2;
      const contentStream = [
        'q',
        `${drawWidth.toFixed(2)} 0 0 ${drawHeight.toFixed(2)} ${offsetX.toFixed(2)} ${offsetY.toFixed(2)} cm`,
        `/${imageName} Do`,
        'Q',
        '',
      ].join('\n');

      objects.push({
        id: imageId,
        dict:
          `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} ` +
          `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpegBytes.length} >>`,
        stream: page.jpegBytes,
      });
      objects.push({
        id: contentId,
        dict: `<< /Length ${encoder.encode(contentStream).length} >>`,
        stream: encoder.encode(contentStream),
      });
      objects.push({
        id: pageId,
        body:
          `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pdfWidth} ${pdfHeight}] ` +
          `/Resources << /XObject << /${imageName} ${imageId} 0 R >> >> ` +
          `/Contents ${contentId} 0 R >>`,
      });
    });

    const pageRefs = objects
      .filter((object) => object.body && /\/Type \/Page\b/.test(object.body))
      .map((object) => `${object.id} 0 R`)
      .join(' ');

    objects.unshift({
      id: pagesId,
      body: `<< /Type /Pages /Count ${pages.length} /Kids [${pageRefs}] >>`,
    });
    objects.unshift({
      id: catalogId,
      body: `<< /Type /Catalog /Pages ${pagesId} 0 R >>`,
    });

    const chunks = [encoder.encode('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n')];
    const offsets = [0];
    let currentOffset = chunks[0].length;

    objects
      .sort((left, right) => left.id - right.id)
      .forEach((object) => {
        offsets[object.id] = currentOffset;
        const header = encoder.encode(`${object.id} 0 obj\n`);
        chunks.push(header);
        currentOffset += header.length;

        if (object.stream) {
          const dict = encoder.encode(`${object.dict}\nstream\n`);
          const footer = encoder.encode('\nendstream\nendobj\n');
          chunks.push(dict, object.stream, footer);
          currentOffset += dict.length + object.stream.length + footer.length;
          return;
        }

        const body = encoder.encode(`${object.body}\nendobj\n`);
        chunks.push(body);
        currentOffset += body.length;
      });

    const xrefOffset = currentOffset;
    const totalObjects = objects.length;
    const xrefLines = ['xref', `0 ${totalObjects + 1}`, '0000000000 65535 f '];

    for (let objectId = 1; objectId <= totalObjects; objectId += 1) {
      xrefLines.push(
        `${String(offsets[objectId] || 0).padStart(10, '0')} 00000 n `,
      );
    }

    const trailer = [
      ...xrefLines,
      'trailer',
      `<< /Size ${totalObjects + 1} /Root ${catalogId} 0 R >>`,
      'startxref',
      String(xrefOffset),
      '%%EOF',
      '',
    ].join('\n');

    chunks.push(encoder.encode(trailer));
    return concatUint8Arrays(chunks);
  }

  async function storePdfBytes(storageKey, filename, pdfBytes) {
    await storageSet({
      [storageKey]: {
        filename,
        pdfBase64: uint8ArrayToBase64(pdfBytes),
        createdAt: new Date().toISOString(),
      },
    });
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

  async function waitForCaptureTurn(lastCaptureAt) {
    const waitMs = CAPTURE_INTERVAL_MS - (Date.now() - lastCaptureAt);
    if (waitMs > 0) {
      await sleep(waitMs);
    }
  }

  async function requestSlidesSessionInfo(tabId) {
    const response = await sendTabMessageWithRetry(tabId, {
      type: MESSAGE_TYPES.getSlidesSessionInfo,
    });
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

  async function requestGoToFirstSlide(tabId) {
    const response = await sendTabMessageWithRetry(tabId, {
      type: MESSAGE_TYPES.goToFirstSlide,
    });
    if (!response?.ok) {
      throw new Error(
        normalizeText(
          response?.error,
          'Slides の先頭ページへの移動に失敗しました。',
        ),
      );
    }
  }

  async function requestGoToSlide(tabId, page) {
    const response = await sendTabMessageWithRetry(tabId, {
      type: MESSAGE_TYPES.goToSlide,
      page,
    });
    if (!response?.ok) {
      throw new Error(
        normalizeText(
          response?.error,
          `Slides の ${page} ページ移動に失敗しました。`,
        ),
      );
    }
  }

  async function requestWaitForSlideReady(tabId, page, previousSnapshot) {
    const response = await sendTabMessageWithRetry(
      tabId,
      {
        type: MESSAGE_TYPES.waitForSlideReady,
        page,
        previousSnapshot,
      },
      { attempts: 4, intervalMs: 300 },
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

  async function processSlidesDownload(courseName, entry, state) {
    const hasPermission = await permissionsContains({
      origins: [CAPTURE_PERMISSION_ORIGIN],
    });
    if (!hasPermission) {
      throw new Error(
        'Slides を画像キャプチャで保存するには表示タブのキャプチャ許可が必要です。' +
          'ポップアップの「Slides キャプチャを許可」ボタンをクリックしてください。',
      );
    }

    const viewerUrl = buildSlidesViewerUrl(entry);
    if (!viewerUrl) {
      throw new Error('Google Slides の URL を組み立てられませんでした。');
    }

    await saveState({
      ...state,
      status: STATUS.rendering,
      viewerUrl,
      stage: 'open-slides-viewer',
    });

    const filename = buildDownloadFilename(courseName, entry);
    let tabId = -1;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (tabId !== -1) {
        await closeTabQuietly(tabId);
        tabId = -1;
      }
      if (attempt > 0) {
        await sleep(2000);
      }

      const slidesTab = await tabsCreate({ url: viewerUrl, active: true });
      tabId = slidesTab.id;
      const loadedTab = await waitForTabLoad(tabId, viewerUrl);
      if (loadedTab?.url && loadedTab.url !== 'about:blank') {
        const windowId = loadedTab.windowId;
        try {
          await saveState({
            ...state,
            status: STATUS.rendering,
            viewerUrl,
            stage: 'prepare-slide-capture',
          });

          const session = await requestSlidesSessionInfo(tabId);
          if (!Number.isFinite(session.totalPages) || session.totalPages <= 0) {
            throw new Error('Slides の総ページ数を取得できませんでした。');
          }

          await requestGoToFirstSlide(tabId);
          let previousSnapshot = '';
          let lastCaptureAt = 0;
          let hasRecoveredActivation = false;
          const capturedPages = [];

          for (let page = 1; page <= session.totalPages; page += 1) {
            if (page > 1) {
              await requestGoToSlide(tabId, page);
            }

            let ready = await requestWaitForSlideReady(
              tabId,
              page,
              previousSnapshot,
            );

            await saveState({
              ...state,
              status: STATUS.rendering,
              viewerUrl,
              stage: `capture-slide-${page}/${session.totalPages}`,
            });

            const reactivated = await ensureCaptureTabActive(
              tabId,
              windowId,
              hasRecoveredActivation,
            );
            if (reactivated) {
              hasRecoveredActivation = true;
              ready = await requestWaitForSlideReady(tabId, page, '');
            }

            await waitForCaptureTurn(lastCaptureAt);
            const capturedImage = await captureVisibleTab(windowId, {
              format: 'jpeg',
              quality: CAPTURE_QUALITY,
            });
            lastCaptureAt = Date.now();
            capturedPages.push(
              await cropCapturedSlide(capturedImage, ready.captureMetrics),
            );
            previousSnapshot = normalizeText(ready.snapshot);
          }

          await saveState({
            ...state,
            status: STATUS.rendering,
            viewerUrl,
            stage: 'build-pdf',
          });

          const pdfBytes = createPdfFromJpegs(capturedPages);
          const pdfStorageKey = `glassmoocs_generated_pdf_${entry.id}_${Date.now()}`;
          await storePdfBytes(pdfStorageKey, filename, pdfBytes);
          return await downloadStoredPdf(pdfStorageKey, filename);
        } finally {
          await closeTabQuietly(tabId);
        }
      }
    }

    if (tabId !== -1) {
      await closeTabQuietly(tabId);
    }
    throw new Error(
      'Google スライドのタブを開けませんでした。しばらく待ってから再試行してください。',
    );
  }

  async function queueDownloads(payload) {
    const courseName = normalizeText(payload?.courseName, 'course');
    const rawEntries = Array.isArray(payload?.assets)
      ? payload.assets.map(normalizeEntry).filter((entry) => entry.url)
      : [];

    const seenUrls = new Set();
    const entries = rawEntries.filter((entry) => {
      const key = normalizeText(entry.viewerUrl || entry.url);
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
      });
      return;
    }

    let state = await loadState();

    for (const entry of entries) {
      if (currentNonce !== queueNonce) {
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
      });
      await saveState(state);

      try {
        const result =
          entry.kind === 'google_slides'
            ? await processSlidesDownload(courseName, entry, state)
            : await processDirectDownload(courseName, entry);

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
        });
      } catch (error) {
        state = normalizeState({
          ...state,
          pending: state.pending.filter((item) => item.id !== entry.id),
          failed: [
            ...state.failed,
            {
              ...summarizeEntry(entry),
              url: entry.url,
              error: normalizeText(error?.message, 'download failed'),
            },
          ],
          stage: '',
          lastError: normalizeText(error?.message, 'download failed'),
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
    });
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
        }).catch(() => {});
      });
      return false;
    }

    return false;
  });

  loadState().catch(() => {
    saveState(createIdleState()).catch(() => {});
  });

  storageGet([DOWNLOAD_STATE_STORAGE_KEY])
    .then((result) => {
      const recovered = recoverStaleState(result[DOWNLOAD_STATE_STORAGE_KEY]);
      return saveState(recovered);
    })
    .catch(() => {
      saveState(createIdleState()).catch(() => {});
    });
})();
