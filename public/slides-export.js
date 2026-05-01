(function () {
  if (globalThis.__glassmoocsExporterBooted) {
    return;
  }
  globalThis.__glassmoocsExporterBooted = true;

  const DEBUG_LOGS_ENABLED = __GLASSMOOCS_ENABLE_DEBUG_LOGS__;
  const MESSAGE_TYPES = {
    ...(DEBUG_LOGS_ENABLED
      ? {
          relayAgentLog: __GLASSMOOCS_DEBUG_STRING__(
            'glassmoocs:relay-agent-log',
          ),
        }
      : {}),
    fetchImageDataUrl: 'glassmoocs:fetch-image-data-url',
    getSlidesSessionInfo: 'glassmoocs:get-slides-session-info',
    waitForSlideReady: 'glassmoocs:wait-for-slide-ready',
    goToFirstSlide: 'glassmoocs:go-to-first-slide',
    goToSlide: 'glassmoocs:go-to-slide',
    serializeCurrentSlideSvg: 'glassmoocs:serialize-current-slide-svg',
  };
  const INLINE_IMAGE_CONCURRENCY = 6;
  const FRESH_SLIDE_SETTLE_MS = 120;
  const POST_FRESH_SLIDE_DELAY_MS = 80;
  const AGENT_LOG_RUNTIME = 'slides-export';
  const AGENT_LOG_ENDPOINT = DEBUG_LOGS_ENABLED
    ? __GLASSMOOCS_DEBUG_STRING__('http://127.0.0.1:7443/ingest')
    : '';
  const DEBUG_AGENT_LOG_PARAM = DEBUG_LOGS_ENABLED
    ? __GLASSMOOCS_DEBUG_STRING__('glassmoocs_debug_log')
    : '';
  // [H-SLIDE-A] Slides viewer 上のページ遷移/描画待機が不安定
  // [H-SVG-A] Slides タブ上で SVG の直列化自体が遅い/失敗している
  // [H-SVG-B] 画像の data URL 化で direct fetch/background fetch に時間が掛かっている
  // #region agent log
  const AGENT_LOG_SESSION_ID = `glassmoocs-se-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  const AGENT_LOG_HYPOTHESES = DEBUG_LOGS_ENABLED
    ? {
        slide: __GLASSMOOCS_DEBUG_STRING__('H-SLIDE-A'),
        svg: __GLASSMOOCS_DEBUG_STRING__('H-SVG-A'),
        image: __GLASSMOOCS_DEBUG_STRING__('H-SVG-B'),
      }
    : {};
  let activeDebugLogContext = null;

  function normalizeText(value, fallback = '') {
    if (typeof value !== 'string') return fallback;
    const normalized = value.replace(/\s+/g, ' ').trim();
    return normalized || fallback;
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
          : hasDebugLogQueryOverride(),
      endpoint: normalizeText(context.endpoint, AGENT_LOG_ENDPOINT),
      sessionId: normalizeText(context.sessionId, fallbackSessionId),
      source: normalizeText(context.source),
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
      headers: { 'Content-Type': 'application/json' },
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
  // #endregion agent log

  function sleep(ms) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }

  function getApi() {
    return globalThis.browser || globalThis.chrome || null;
  }

  function getRuntimeLastError() {
    return globalThis.chrome?.runtime?.lastError || null;
  }

  function runtimeSendMessage(message) {
    const api = getApi();
    if (!api?.runtime?.sendMessage) {
      return Promise.reject(new Error('runtime.sendMessage unavailable'));
    }

    try {
      const result = api.runtime.sendMessage(message);
      if (result && typeof result.then === 'function') {
        return result;
      }
    } catch (error) {
      return Promise.reject(error);
    }

    return new Promise((resolve, reject) => {
      try {
        api.runtime.sendMessage(message, (response) => {
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

  function getSlideA11yLabel() {
    return normalizeText(
      document
        .querySelector('.punch-viewer-svgpage-a11yelement')
        ?.getAttribute('aria-label'),
    );
  }

  function hashTextSampled(text, step = 1) {
    const normalized = normalizeText(text);
    if (!normalized) return '0';

    let hash = 0;
    const stride = Math.max(1, step);
    for (let index = 0; index < normalized.length; index += stride) {
      hash = (hash * 33 + normalized.charCodeAt(index)) >>> 0;
    }
    return hash.toString(16);
  }

  function getSvgTextSignature(svg) {
    if (!svg) return '';

    const textContent = normalizeText(svg.textContent);
    return [
      textContent.length,
      hashTextSampled(textContent, 1),
      hashTextSampled(textContent, 17),
    ].join(':');
  }

  function getSvgImageSignature(svg) {
    if (!svg) return '';

    const hrefs = [...svg.querySelectorAll('image')]
      .map((image) => {
        return (
          normalizeText(image.getAttribute('href')) ||
          normalizeText(
            image.getAttributeNS('http://www.w3.org/1999/xlink', 'href'),
          ) ||
          normalizeText(image.getAttribute('xlink:href'))
        );
      })
      .filter(Boolean)
      .join('|');

    return [hrefs.length, hashTextSampled(hrefs, 29)].join(':');
  }

  function getSlideSnapshot(svg) {
    if (!svg) return '';
    const markup = svg.innerHTML || '';
    const a11yLabel = getSlideA11yLabel();
    return [
      getCurrentPage() || 0,
      svg.childElementCount,
      svg.getAttribute('viewBox') || '',
      markup.length,
      hashTextSampled(markup, 97),
      getSvgTextSignature(svg),
      getSvgImageSignature(svg),
      a11yLabel.length,
      hashTextSampled(a11yLabel, 17),
    ].join(':');
  }

  function getSlideTitle(fallback) {
    const ariaLabel = getSlideA11yLabel();
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
    postAgentLog(
      'slides-export.js:waitForViewerReady',
      'slides viewer readiness start',
      {
        currentUrl: window.location.href,
      },
      AGENT_LOG_HYPOTHESES.slide,
    );
    const startedAt = Date.now();
    try {
      await waitFor(() => getTotalPages() !== null && getSlideSvg(), {
        timeout: 30000,
        message: 'Slides viewer の初期化待機がタイムアウトしました。',
      });
      postAgentLog(
        'slides-export.js:waitForViewerReady',
        'slides viewer readiness done',
        {
          currentUrl: window.location.href,
          currentPage: getCurrentPage(),
          totalPages: getTotalPages(),
          durationMs: Date.now() - startedAt,
        },
        AGENT_LOG_HYPOTHESES.slide,
      );
    } catch (error) {
      postAgentLog(
        'slides-export.js:waitForViewerReady',
        'slides viewer readiness failed',
        {
          currentUrl: window.location.href,
          currentPage: getCurrentPage(),
          totalPages: getTotalPages(),
          durationMs: Date.now() - startedAt,
          error: summarizeError(error),
        },
        AGENT_LOG_HYPOTHESES.slide,
      );
      throw error;
    }
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
    const startedAt = Date.now();
    postAgentLog(
      'slides-export.js:goToFirstSlide',
      'navigate to first slide start',
      {
        currentPage: getCurrentPage(),
      },
      AGENT_LOG_HYPOTHESES.slide,
    );
    let safety = 0;

    while (getCurrentPage() !== 1 && safety < 1000) {
      dispatchArrowKey('left');
      await sleep(30);
      safety += 1;
    }

    try {
      await waitFor(() => getCurrentPage() === 1, {
        timeout: 10000,
        message: '最初のページへの移動に失敗しました。',
      });
      postAgentLog(
        'slides-export.js:goToFirstSlide',
        'navigate to first slide done',
        {
          currentPage: getCurrentPage(),
          durationMs: Date.now() - startedAt,
        },
        AGENT_LOG_HYPOTHESES.slide,
      );
    } catch (error) {
      postAgentLog(
        'slides-export.js:goToFirstSlide',
        'navigate to first slide failed',
        {
          currentPage: getCurrentPage(),
          durationMs: Date.now() - startedAt,
          error: summarizeError(error),
        },
        AGENT_LOG_HYPOTHESES.slide,
      );
      throw error;
    }
  }

  async function goToSlide(page) {
    await waitForViewerReady();
    const startedAt = Date.now();
    const currentPage = getCurrentPage();
    if (!currentPage) {
      throw new Error('現在ページを取得できませんでした。');
    }
    if (!Number.isFinite(page) || page < 1) {
      throw new Error('移動先ページ番号が不正です。');
    }

    postAgentLog(
      'slides-export.js:goToSlide',
      'navigate to target slide start',
      {
        currentPage,
        targetPage: page,
      },
      AGENT_LOG_HYPOTHESES.slide,
    );
    const direction = page > currentPage ? 'right' : 'left';
    let safety = 0;

    while (getCurrentPage() !== page && safety < 1000) {
      dispatchArrowKey(direction);
      await sleep(55);
      safety += 1;
    }

    if (getCurrentPage() !== page) {
      const error = new Error(`${page} ページへの移動に失敗しました。`);
      postAgentLog(
        'slides-export.js:goToSlide',
        'navigate to target slide failed',
        {
          currentPage: getCurrentPage(),
          targetPage: page,
          durationMs: Date.now() - startedAt,
          error: summarizeError(error),
        },
        AGENT_LOG_HYPOTHESES.slide,
      );
      throw error;
    }
    postAgentLog(
      'slides-export.js:goToSlide',
      'navigate to target slide done',
      {
        currentPage: getCurrentPage(),
        targetPage: page,
        durationMs: Date.now() - startedAt,
      },
      AGENT_LOG_HYPOTHESES.slide,
    );
  }

  async function waitForSlideReady(page, previousSnapshot = '') {
    const startedAt = Date.now();
    let pageMatchedAt = 0;
    let snapshotStableAt = 0;
    let observedSnapshot = '';
    let repeatedSnapshotCount = 0;
    let acceptedBy = '';
    let acceptedPageMatchedDuration = 0;
    let acceptedSnapshotStableDuration = 0;

    postAgentLog(
      'slides-export.js:waitForSlideReady',
      'slide ready wait start',
      {
        page,
        currentPage: getCurrentPage(),
        previousSnapshotLength: normalizeText(previousSnapshot).length,
      },
      AGENT_LOG_HYPOTHESES.slide,
    );
    await waitFor(
      () => {
        const svg = getSlideSvg();
        if (!svg) return false;
        if (getCurrentPage() !== page) return false;
        if (!pageMatchedAt) {
          pageMatchedAt = Date.now();
        }

        const snapshot = getSlideSnapshot(svg);
        if (svg.childElementCount <= 0) {
          return false;
        }
        const metrics = getCaptureMetrics(svg);
        if (metrics.rect.width <= 0 || metrics.rect.height <= 0) {
          return false;
        }

        if (snapshot !== observedSnapshot) {
          observedSnapshot = snapshot;
          snapshotStableAt = Date.now();
          repeatedSnapshotCount = 1;
        } else {
          repeatedSnapshotCount += 1;
        }

        const pageMatchedDuration = Date.now() - pageMatchedAt;
        const snapshotStableDuration = snapshotStableAt
          ? Date.now() - snapshotStableAt
          : 0;
        const hasSettledSnapshot =
          snapshotStableDuration >= FRESH_SLIDE_SETTLE_MS ||
          repeatedSnapshotCount >= 2;

        const ready =
          pageMatchedDuration >= FRESH_SLIDE_SETTLE_MS && hasSettledSnapshot;
        if (ready) {
          acceptedBy =
            normalizeText(previousSnapshot) && snapshot === previousSnapshot
              ? 'page-indicator-reused-snapshot'
              : 'page-indicator-fresh-snapshot';
          acceptedPageMatchedDuration = pageMatchedDuration;
          acceptedSnapshotStableDuration = snapshotStableDuration;
        }
        return ready;
      },
      {
        timeout: 30000,
        message: `${page} ページの描画待機がタイムアウトしました。`,
      },
    );

    const svg = getSlideSvg();
    if (!svg) {
      throw new Error(`${page} ページの SVG を取得できませんでした。`);
    }

    const currentSnapshot = getSlideSnapshot(svg);
    const reusedSnapshot =
      normalizeText(previousSnapshot) && currentSnapshot === previousSnapshot;
    await sleep(POST_FRESH_SLIDE_DELAY_MS);

    const metrics = getCaptureMetrics(svg);
    if (metrics.rect.width <= 0 || metrics.rect.height <= 0) {
      throw new Error(`${page} ページのキャプチャ範囲が取得できませんでした。`);
    }

    postAgentLog(
      'slides-export.js:waitForSlideReady',
      'slide ready wait done',
      {
        page,
        currentPage: getCurrentPage(),
        durationMs: Date.now() - startedAt,
        acceptedBy,
        reusedSnapshot,
        pageMatchedDuration: acceptedPageMatchedDuration,
        snapshotStableDuration: acceptedSnapshotStableDuration,
        snapshotLength: getSlideSnapshot(svg).length,
        previousSnapshotLength: normalizeText(previousSnapshot).length,
        width: metrics.rect.width,
        height: metrics.rect.height,
      },
      AGENT_LOG_HYPOTHESES.slide,
    );
    return {
      snapshot: getSlideSnapshot(svg),
      captureMetrics: metrics,
      durationMs: Date.now() - startedAt,
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
      activeDebugLogContext = normalizeDebugLogContext(
        message?.debugLogContext,
        AGENT_LOG_SESSION_ID,
      );

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
              durationMs: result.durationMs,
              waitDurationMs: result.waitDurationMs,
            }),
          )
          .catch(
            (error) => (
              postAgentLog(
                'slides-export.js:onMessage',
                'waitForSlideReady failed',
                {
                  page,
                  previousSnapshot,
                  error: summarizeError(error),
                  currentPage: getCurrentPage(),
                },
                AGENT_LOG_HYPOTHESES.slide,
              ),
              sendResponse({
                ok: false,
                error: normalizeText(
                  error?.message,
                  `${page} ページの描画待機に失敗しました。`,
                ),
              })
            ),
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
          .catch(
            (error) => (
              postAgentLog(
                'slides-export.js:onMessage',
                'serializeCurrentSlideSvg failed',
                {
                  page,
                  error: summarizeError(error),
                  currentPage: getCurrentPage(),
                },
                AGENT_LOG_HYPOTHESES.svg,
              ),
              sendResponse({
                ok: false,
                error: normalizeText(
                  error?.message,
                  `${page} ページ SVG の直列化に失敗しました。`,
                ),
              })
            ),
          );
        return true;
      }

      return false;
    });
  }

  bootExporter();
})();
