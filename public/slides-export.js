(function () {
  if (globalThis.__glassmoocsExporterBooted) {
    return;
  }
  globalThis.__glassmoocsExporterBooted = true;

  const MESSAGE_TYPES = {
    getSlidesSessionInfo: 'glassmoocs:get-slides-session-info',
    waitForSlideReady: 'glassmoocs:wait-for-slide-ready',
    goToFirstSlide: 'glassmoocs:go-to-first-slide',
    goToSlide: 'glassmoocs:go-to-slide',
  };

  function normalizeText(value, fallback = '') {
    if (typeof value !== 'string') return fallback;
    const normalized = value.replace(/\s+/g, ' ').trim();
    return normalized || fallback;
  }

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
    return [
      svg.childElementCount,
      svg.getAttribute('viewBox') || '',
      svg.innerHTML.length,
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
    await waitFor(
      () => {
        const svg = getSlideSvg();
        if (!svg) return false;
        if (getCurrentPage() !== page) return false;

        const snapshot = getSlideSnapshot(svg);
        if (previousSnapshot && snapshot === previousSnapshot) {
          return false;
        }

        return svg.childElementCount > 0;
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

      return false;
    });
  }

  bootExporter();
})();
