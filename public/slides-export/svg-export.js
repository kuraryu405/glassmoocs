(function () {
  function createSlidesSvgExportUtils(deps) {
    const {
      INLINE_IMAGE_CONCURRENCY,
      MESSAGE_TYPES,
      getApi,
      getCurrentPage,
      getSlideSvg,
      normalizeText,
      postAgentLog,
    } = deps;

    function getSvgDimensions(svg) {
      const viewBox = normalizeText(svg?.getAttribute('viewBox'));
      if (viewBox) {
        const parts = viewBox
          .split(/[\s,]+/)
          .map((value) => Number.parseFloat(value))
          .filter((value) => Number.isFinite(value));
        if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
          return {
            viewBoxWidth: parts[2],
            viewBoxHeight: parts[3],
          };
        }
      }

      const rect = svg?.getBoundingClientRect?.();
      return {
        viewBoxWidth: rect?.width || 0,
        viewBoxHeight: rect?.height || 0,
      };
    }

    async function readBlobAsDataUrl(blob) {
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('FileReader failure'));
        reader.readAsDataURL(blob);
      });
    }

    async function fetchImageDirect(url) {
      const response = await fetch(url.toString(), {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const contentType = normalizeText(response.headers.get('Content-Type'));
      if (!/^image\//i.test(contentType)) {
        throw new Error(`Not an image: ${contentType}`);
      }

      return await readBlobAsDataUrl(await response.blob());
    }

    async function fetchImageViaBackground(url) {
      const api = getApi();
      if (!api?.runtime?.sendMessage) {
        throw new Error('runtime.sendMessage unavailable');
      }

      const response = await api.runtime.sendMessage({
        type: MESSAGE_TYPES.fetchImageDataUrl,
        url: url.toString(),
      });
      if (!response?.ok || !normalizeText(response.dataUrl)) {
        throw new Error(
          normalizeText(response?.error, 'background image fetch failed'),
        );
      }

      return response.dataUrl;
    }

    async function mapWithConcurrency(items, limit, worker) {
      const queue = [...items];
      const workerCount = Math.max(1, Math.min(limit, queue.length));

      await Promise.all(
        Array.from({ length: workerCount }, async () => {
          while (queue.length > 0) {
            const item = queue.shift();
            if (!item) {
              return;
            }

            await worker(item);
          }
        }),
      );
    }

    async function inlineSlideImages(svg, pageIndex) {
      const imageNodes = [...svg.querySelectorAll('image')];
      const startedAt = Date.now();
      let directSuccessCount = 0;
      let backgroundSuccessCount = 0;
      let failedCount = 0;

      postAgentLog(
        'slides-export.js:inlineSlideImages',
        'inline slide images start',
        {
          page: pageIndex,
          imageNodeCount: imageNodes.length,
        },
        __GLASSMOOCS_DEBUG_STRING__('H-SVG-B'),
      );

      await mapWithConcurrency(
        imageNodes,
        INLINE_IMAGE_CONCURRENCY,
        async (imageNode) => {
          const href =
            normalizeText(imageNode.getAttribute('href')) ||
            normalizeText(
              imageNode.getAttributeNS('http://www.w3.org/1999/xlink', 'href'),
            ) ||
            normalizeText(imageNode.getAttribute('xlink:href'));
          if (!href || href.startsWith('data:')) {
            return;
          }

          let url;
          try {
            url = new URL(href, window.location.href);
          } catch {
            return;
          }
          if (url.protocol !== 'https:') {
            return;
          }

          const allowed =
            url.hostname === 'docs.google.com' ||
            url.hostname.endsWith('.googleusercontent.com') ||
            url.hostname.endsWith('.gstatic.com');
          if (!allowed) {
            return;
          }

          try {
            const dataUrl = await fetchImageDirect(url);
            imageNode.setAttribute('href', dataUrl);
            imageNode.setAttributeNS(
              'http://www.w3.org/1999/xlink',
              'xlink:href',
              dataUrl,
            );
            directSuccessCount += 1;
          } catch (directError) {
            postAgentLog(
              'slides-export.js:inlineSlideImages',
              'direct image fetch failed',
              {
                page: pageIndex,
                imageUrl: url.toString(),
                error: {
                  message: normalizeText(directError?.message),
                  name: normalizeText(directError?.name),
                },
              },
              __GLASSMOOCS_DEBUG_STRING__('H-SVG-B'),
            );
            try {
              const dataUrl = await fetchImageViaBackground(url);
              imageNode.setAttribute('href', dataUrl);
              imageNode.setAttributeNS(
                'http://www.w3.org/1999/xlink',
                'xlink:href',
                dataUrl,
              );
              backgroundSuccessCount += 1;
            } catch (backgroundError) {
              failedCount += 1;
              postAgentLog(
                'slides-export.js:inlineSlideImages',
                'background image fetch failed',
                {
                  page: pageIndex,
                  imageUrl: url.toString(),
                  directError: {
                    message: normalizeText(directError?.message),
                    name: normalizeText(directError?.name),
                  },
                  backgroundError: {
                    message: normalizeText(backgroundError?.message),
                    name: normalizeText(backgroundError?.name),
                  },
                },
                __GLASSMOOCS_DEBUG_STRING__('H-SVG-B'),
              );
              console.warn(
                '[glassmoocs] slide image inline failed',
                pageIndex,
                directError,
                backgroundError,
              );
            }
          }
        },
      );

      postAgentLog(
        'slides-export.js:inlineSlideImages',
        'inline slide images done',
        {
          page: pageIndex,
          imageNodeCount: imageNodes.length,
          directSuccessCount,
          backgroundSuccessCount,
          failedCount,
          durationMs: Date.now() - startedAt,
        },
        __GLASSMOOCS_DEBUG_STRING__('H-SVG-B'),
      );
    }

    async function serializeCurrentSlideSvg(page) {
      const startedAt = Date.now();
      postAgentLog(
        'slides-export.js:serializeCurrentSlideSvg',
        'serialize slide svg start',
        {
          page,
          currentPage: getCurrentPage(),
        },
        __GLASSMOOCS_DEBUG_STRING__('H-SVG-A'),
      );
      const svg = getSlideSvg();
      if (!svg) {
        postAgentLog(
          'slides-export.js:serializeCurrentSlideSvg',
          'serialize slide svg failed: svg missing',
          {
            page,
            currentPage: getCurrentPage(),
          },
          __GLASSMOOCS_DEBUG_STRING__('H-SVG-A'),
        );
        throw new Error(`${page} ページの SVG を取得できませんでした。`);
      }
      if (getCurrentPage() !== page) {
        postAgentLog(
          'slides-export.js:serializeCurrentSlideSvg',
          'serialize slide svg failed: page mismatch',
          {
            page,
            currentPage: getCurrentPage(),
          },
          __GLASSMOOCS_DEBUG_STRING__('H-SVG-A'),
        );
        throw new Error(`${page} ページが表示されていません。`);
      }

      const cloned = svg.cloneNode(true);
      if (!(cloned instanceof SVGElement)) {
        throw new Error(`${page} ページ SVG の複製に失敗しました。`);
      }

      cloned.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      cloned.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');

      await inlineSlideImages(cloned, page);
      const dimensions = getSvgDimensions(svg);
      const rect = svg.getBoundingClientRect();

      const result = {
        svgText: new XMLSerializer().serializeToString(cloned),
        renderWidth: rect.width || dimensions.viewBoxWidth || 0,
        renderHeight: rect.height || dimensions.viewBoxHeight || 0,
        viewBoxWidth: dimensions.viewBoxWidth || 0,
        viewBoxHeight: dimensions.viewBoxHeight || 0,
      };
      postAgentLog(
        'slides-export.js:serializeCurrentSlideSvg',
        'serialize slide svg done',
        {
          page,
          svgLength: result.svgText.length,
          renderWidth: result.renderWidth,
          renderHeight: result.renderHeight,
          durationMs: Date.now() - startedAt,
        },
        __GLASSMOOCS_DEBUG_STRING__('H-SVG-A'),
      );
      return result;
    }

    return {
      serializeCurrentSlideSvg,
    };
  }

  globalThis.__glassmoocsCreateSlidesSvgExportUtils =
    createSlidesSvgExportUtils;
})();
