(function () {
  if (globalThis.__glassmoocsExporterBooted) {
    return;
  }
  globalThis.__glassmoocsExporterBooted = true;

  const MESSAGE_TYPES = {
    fetchImageDataUrl: 'glassmoocs:fetch-image-data-url',
    getSlidesSessionInfo: 'glassmoocs:get-slides-session-info',
    waitForSlideReady: 'glassmoocs:wait-for-slide-ready',
    goToFirstSlide: 'glassmoocs:go-to-first-slide',
    goToSlide: 'glassmoocs:go-to-slide',
    serializeCurrentSlideSvg: 'glassmoocs:serialize-current-slide-svg',
  };
  const INLINE_IMAGE_CONCURRENCY = 4;
  const AGENT_LOG_ENABLED = false;
  // [H-SVG-A] Slides タブ上で SVG の直列化自体が遅い/失敗している
  // [H-SVG-D] 画像の data URL 化で direct fetch/background fetch に時間が掛かっている
  // #region agent log
  const AGENT_LOG_SESSION_ID = `glassmoocs-se-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;

  function normalizeText(value, fallback = '') {
    if (typeof value !== 'string') return fallback;
    const normalized = value.replace(/\s+/g, ' ').trim();
    return normalized || fallback;
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

  function sleep(ms) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }

  function getApi() {
    return globalThis.browser || globalThis.chrome || null;
  }

  function getPageCaptionElement() {
    return (
      document.querySelector(
        '.docs-material-menu-button-flat-default-caption[aria-setsize]',
      ) ||
      [...document.querySelectorAll('[aria-setsize]')].find((node) => {
        const value = Number.parseInt(
          node.getAttribute('aria-setsize') || '',
          10,
        );
        return Number.isFinite(value) && value > 0;
      }) ||
      null
    );
  }

  function getTotalPages() {
    const element = getPageCaptionElement();
    if (!element) return null;

    const value = Number.parseInt(
      element.getAttribute('aria-setsize') || '',
      10,
    );
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  function getCurrentPage() {
    const element = getPageCaptionElement();
    if (!element) return null;

    const value = Number.parseInt(normalizeText(element.textContent), 10);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  function getSlideSvg() {
    const svgs = [
      ...document.querySelectorAll('.punch-viewer-svgpage-svgcontainer svg'),
    ];
    return svgs[svgs.length - 1] || null;
  }

  function getSlideSnapshot(svg) {
    if (!svg) return '';
    const markup = svg.innerHTML || '';
    let hash = 0;
    for (let index = 0; index < markup.length; index += 97) {
      hash = (hash * 33 + markup.charCodeAt(index)) >>> 0;
    }
    return [
      svg.childElementCount,
      svg.getAttribute('viewBox') || '',
      markup.length,
      hash.toString(16),
    ].join(':');
  }

  function getSlideTitle(fallback) {
    const a11yNode = document.querySelector(
      '.punch-viewer-svgpage-a11yelement',
    );
    const ariaLabel = normalizeText(a11yNode?.getAttribute('aria-label'));
    if (ariaLabel.includes(':')) {
      const title = normalizeText(ariaLabel.split(':').slice(1).join(':'));
      if (title) {
        return title;
      }
    }

    const documentTitle = normalizeText(document.title)
      .replace(/\s*-\s*Google Slides.*$/i, '')
      .trim();

    return documentTitle || fallback;
  }

  function getCaptureMetrics(svg) {
    const rect = svg.getBoundingClientRect();
    return {
      rect: {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      },
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio || 1,
    };
  }

  const { serializeCurrentSlideSvg } =
    globalThis.__glassmoocsCreateSlidesSvgExportUtils({
      INLINE_IMAGE_CONCURRENCY,
      MESSAGE_TYPES,
      getApi,
      getCurrentPage,
      getSlideSvg,
      normalizeText,
      postAgentLog,
    });

  async function waitFor(check, options = {}) {
    const timeout = options.timeout || 15000;
    const interval = options.interval || 80;
    const startedAt = Date.now();

    for (;;) {
      try {
        if (await check()) {
          return;
        }
      } catch {
        // keep polling
      }

      if (Date.now() - startedAt > timeout) {
        throw new Error(
          normalizeText(
            options.message,
            'Slides viewer の待機がタイムアウトしました。',
          ),
        );
      }

      await sleep(interval);
    }
  }

  async function waitForViewerReady() {
    await waitFor(() => getTotalPages() !== null && getSlideSvg(), {
      timeout: 30000,
      message: 'Slides viewer の初期化待機がタイムアウトしました。',
    });
  }

  function dispatchArrowKey(direction) {
    const key = direction === 'left' ? 'ArrowLeft' : 'ArrowRight';
    const keyCode = direction === 'left' ? 37 : 39;
    const eventInit = {
      key,
      code: key,
      keyCode,
      which: keyCode,
      bubbles: true,
      cancelable: true,
    };

    document.dispatchEvent(new KeyboardEvent('keydown', eventInit));
    document.dispatchEvent(new KeyboardEvent('keyup', eventInit));
  }

  async function goToFirstSlide() {
    await waitForViewerReady();
    let safety = 0;

    while (getCurrentPage() !== 1 && safety < 1000) {
      dispatchArrowKey('left');
      await sleep(30);
      safety += 1;
    }

    await waitFor(() => getCurrentPage() === 1, {
      timeout: 10000,
      message: '最初のページへの移動に失敗しました。',
    });
  }

  async function goToSlide(page) {
    await waitForViewerReady();
    const currentPage = getCurrentPage();
    if (!currentPage) {
      throw new Error('現在ページを取得できませんでした。');
    }
    if (!Number.isFinite(page) || page < 1) {
      throw new Error('移動先ページ番号が不正です。');
    }

    const direction = page > currentPage ? 'right' : 'left';
    let safety = 0;

    while (getCurrentPage() !== page && safety < 1000) {
      dispatchArrowKey(direction);
      await sleep(80);
      safety += 1;
    }

    if (getCurrentPage() !== page) {
      throw new Error(`${page} ページへの移動に失敗しました。`);
    }
  }

  async function waitForSlideReady(page, previousSnapshot = '') {
    const startedAt = Date.now();
    let pageMatchedAt = 0;

    await waitFor(
      () => {
        const svg = getSlideSvg();
        if (!svg) return false;
        if (getCurrentPage() !== page) return false;
        if (!pageMatchedAt) {
          pageMatchedAt = Date.now();
        }
        const totalPages = getTotalPages();

        const snapshot = getSlideSnapshot(svg);
        if (svg.childElementCount <= 0) {
          return false;
        }

        if (!previousSnapshot || snapshot !== previousSnapshot) {
          return true;
        }

        if (totalPages && page >= totalPages) {
          // The last slide can reuse the same SVG structure as the previous one.
          // Once the page indicator reaches the tail and the SVG is populated,
          // do not require a DOM diff to proceed.
          return Date.now() - pageMatchedAt >= 250;
        }

        // Some slide decks reuse the same DOM structure across pages.
        // If the page indicator already advanced and the SVG stays populated,
        // accept the page after a short settle window instead of timing out.
        return Date.now() - pageMatchedAt >= 1200;
      },
      {
        timeout: 30000,
        message: `${page} ページの描画待機がタイムアウトしました。`,
      },
    );

    await sleep(250);

    const svg = getSlideSvg();
    if (!svg) {
      throw new Error(`${page} ページの SVG を取得できませんでした。`);
    }

    const metrics = getCaptureMetrics(svg);
    if (metrics.rect.width <= 0 || metrics.rect.height <= 0) {
      throw new Error(`${page} ページのキャプチャ範囲が取得できませんでした。`);
    }

    return {
      snapshot: getSlideSnapshot(svg),
      captureMetrics: metrics,
      waitDurationMs: Date.now() - startedAt,
    };
  }

  function bootExporter() {
    const api = getApi();
    if (!api?.runtime?.onMessage) {
      return;
    }

    api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      const type = normalizeText(message?.type);

      if (type === MESSAGE_TYPES.getSlidesSessionInfo) {
        waitForViewerReady()
          .then(() =>
            sendResponse({
              ok: true,
              totalPages: getTotalPages(),
              currentPage: getCurrentPage(),
              title: getSlideTitle('slides'),
            }),
          )
          .catch((error) =>
            sendResponse({
              ok: false,
              error: normalizeText(
                error?.message,
                'Slides session 情報の取得に失敗しました。',
              ),
            }),
          );
        return true;
      }

      if (type === MESSAGE_TYPES.goToFirstSlide) {
        goToFirstSlide()
          .then(() => sendResponse({ ok: true, currentPage: getCurrentPage() }))
          .catch((error) =>
            sendResponse({
              ok: false,
              error: normalizeText(
                error?.message,
                '最初のページへの移動に失敗しました。',
              ),
            }),
          );
        return true;
      }

      if (type === MESSAGE_TYPES.goToSlide) {
        const page = Number(message?.page);
        goToSlide(page)
          .then(() => sendResponse({ ok: true, currentPage: getCurrentPage() }))
          .catch((error) =>
            sendResponse({
              ok: false,
              error: normalizeText(
                error?.message,
                `${page} ページへの移動に失敗しました。`,
              ),
            }),
          );
        return true;
      }

      if (type === MESSAGE_TYPES.waitForSlideReady) {
        const page = Number(message?.page);
        const previousSnapshot = normalizeText(message?.previousSnapshot);
        waitForSlideReady(page, previousSnapshot)
          .then((result) =>
            sendResponse({
              ok: true,
              snapshot: result.snapshot,
              captureMetrics: result.captureMetrics,
              waitDurationMs: result.waitDurationMs,
            }),
          )
          .catch((error) =>
            sendResponse({
              ok: false,
              error: normalizeText(
                error?.message,
                `${page} ページの描画待機に失敗しました。`,
              ),
            }),
          );
        return true;
      }

      if (type === MESSAGE_TYPES.serializeCurrentSlideSvg) {
        const page = Number(message?.page);
        serializeCurrentSlideSvg(page)
          .then((result) =>
            sendResponse({
              ok: true,
              svgText: result.svgText,
              renderWidth: result.renderWidth,
              renderHeight: result.renderHeight,
              viewBoxWidth: result.viewBoxWidth,
              viewBoxHeight: result.viewBoxHeight,
            }),
          )
          .catch((error) =>
            sendResponse({
              ok: false,
              error: normalizeText(
                error?.message,
                `${page} ページ SVG の直列化に失敗しました。`,
              ),
            }),
          );
        return true;
      }

      return false;
    });
  }

  bootExporter();
})();
