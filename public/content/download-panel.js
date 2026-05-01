(function () {
  function createDownloadPanelComponent(deps) {
    const {
      AGENT_LOG_HYPOTHESES,
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
    } = deps;

    let downloadRefreshTimer = 0;

    function getDownloadPanelAnchor() {
      const pageNavigation = document.querySelector(
        'nav[aria-label="page navigation"]',
      );
      if (pageNavigation?.querySelector('.pagination')) {
        return {
          node: pageNavigation,
          placement: 'beforebegin',
        };
      }

      const contentHeader = document.querySelector('.content-header');
      if (contentHeader) {
        return {
          node: contentHeader,
          placement: 'afterend',
        };
      }

      const contentWrapper = document.querySelector('.content-wrapper');
      if (contentWrapper) {
        return {
          node: contentWrapper,
          placement: 'prepend',
        };
      }

      return {
        node: document.body,
        placement: 'prepend',
      };
    }

    function mountDownloadPanel(panel, anchorTarget) {
      const anchor = anchorTarget?.node;
      const placement = anchorTarget?.placement || 'prepend';

      if (!anchor || (placement !== 'prepend' && !anchor.parentElement)) {
        document.body.prepend(panel);
        return;
      }

      if (placement === 'beforebegin') {
        anchor.insertAdjacentElement('beforebegin', panel);
        return;
      }

      if (placement === 'afterend') {
        anchor.insertAdjacentElement('afterend', panel);
        return;
      }

      anchor.prepend(panel);
    }

    async function refreshDownloadPanels() {
      const panels = [
        ...document.querySelectorAll('.glassmoocs-download-panel'),
      ];
      if (!panels.length) return;

      const pageContext = getCurrentPageContext(document, window.location.href);
      const state = await getDownloadState();
      let slidesCapturePermissionGranted = false;
      try {
        slidesCapturePermissionGranted =
          await getSlidesCapturePermissionState();
      } catch {
        slidesCapturePermissionGranted = false;
      }
      const busy =
        state.status === DOWNLOAD_STATUS.collecting ||
        state.status === DOWNLOAD_STATUS.downloading ||
        state.status === DOWNLOAD_STATUS.rendering ||
        state.status === DOWNLOAD_STATUS.printing;

      panels.forEach((panel) => {
        const contextNode = panel.querySelector('.glassmoocs-download-context');
        const progressNode = panel.querySelector(
          '.glassmoocs-download-progress',
        );
        const progressBarNode = panel.querySelector(
          '.glassmoocs-download-progress-bar',
        );
        const progressLabelNode = panel.querySelector(
          '.glassmoocs-download-progress-label',
        );
        const statusNode = panel.querySelector('.glassmoocs-download-status');
        const collectButton = panel.querySelector(
          '[data-glassmoocs-download-action="course"]',
        );
        const lectureButton = panel.querySelector(
          '[data-glassmoocs-download-action="lecture"]',
        );
        const pageButton = panel.querySelector(
          '[data-glassmoocs-download-action="page"]',
        );
        const permissionSection = panel.querySelector(
          '.glassmoocs-download-permission',
        );
        const permissionStatusNode = panel.querySelector(
          '.glassmoocs-download-permission-status',
        );
        const permissionButton = panel.querySelector(
          '[data-glassmoocs-download-action="grant-slides-capture"]',
        );

        const contextLines = [];
        if (pageContext?.courseName)
          contextLines.push(`科目: ${pageContext.courseName}`);
        if (pageContext?.lectureGroup)
          contextLines.push(`区分: ${pageContext.lectureGroup}`);
        if (pageContext?.lectureName)
          contextLines.push(`講義: ${pageContext.lectureName}`);
        if (pageContext?.pageTitle)
          contextLines.push(`ページ: ${pageContext.pageTitle}`);

        if (contextNode) {
          contextNode.textContent =
            contextLines.join(' / ') ||
            '科目・講義情報を取得できませんでした。';
        }

        if (statusNode) {
          statusNode.textContent = formatDownloadStateText(state, pageContext);
        }

        const progress = getDownloadProgress(state);
        if (progressNode instanceof HTMLElement) {
          progressNode.hidden = !progress;
        }
        if (progressBarNode instanceof HTMLElement) {
          progressBarNode.style.width = progress
            ? `${progress.percent}%`
            : '0%';
        }
        if (progressLabelNode instanceof HTMLElement) {
          progressLabelNode.textContent = progress
            ? `進捗 ${progress.percent}%${progress.label ? ` · ${progress.label}` : ''}`
            : '';
        }

        const needsPermission = pageNeedsSlidesCapturePermission(
          state,
          slidesCapturePermissionGranted,
        );

        if (permissionSection instanceof HTMLElement) {
          permissionSection.hidden = !needsPermission;
        }

        if (permissionStatusNode instanceof HTMLElement) {
          permissionStatusNode.textContent = slidesCapturePermissionGranted
            ? 'キャプチャ権限は付与済みです。'
            : needsPermission
              ? '高速エクスポートが失敗したため、フォールバック用のキャプチャ権限を許可してください。'
              : '';
        }

        if (permissionButton instanceof HTMLButtonElement) {
          permissionButton.disabled = busy || slidesCapturePermissionGranted;
        }

        if (collectButton instanceof HTMLButtonElement) {
          collectButton.disabled = busy || !pageContext?.courseUrl;
        }

        if (lectureButton instanceof HTMLButtonElement) {
          lectureButton.disabled = busy || !pageContext?.lectureUrl;
        }

        if (pageButton instanceof HTMLButtonElement) {
          pageButton.disabled =
            busy ||
            !pageContext?.assetCandidates ||
            pageContext.assetCandidates.length === 0;
        }
      });
    }

    function scheduleDownloadPanelRefresh() {
      if (downloadRefreshTimer) return;

      downloadRefreshTimer = window.setTimeout(() => {
        downloadRefreshTimer = 0;
        refreshDownloadPanels();
      }, 60);
    }

    async function handleCourseCollectionRequest() {
      const debugLogContext = createDebugLogContext('course-collection');
      const result = await collectCourseAssetsFromCurrentPage();
      await requestBackgroundDownload(
        {
          courseName: result.courseName,
          assets: result.assets,
        },
        debugLogContext,
      );
      return result;
    }

    async function handleCurrentPageDownloadRequest() {
      const pageContext = getCurrentPageContext(document, window.location.href);
      const debugLogContext = createDebugLogContext('current-page-download');
      postAgentLog(
        'content.js:handleCurrentPageDownloadRequest',
        'starting current-page download request',
        {
          debugLogContext,
          href: window.location.href,
          assetCount: pageContext?.assetCandidates?.length || 0,
          pageTitle: pageContext?.pageTitle || '',
        },
        AGENT_LOG_HYPOTHESES.queue,
      );

      const payload = await buildCurrentPageDownloadPayload();
      if (!payload.assets.length) {
        postAgentLog(
          'content.js:handleCurrentPageDownloadRequest',
          'current-page download found no assets',
          {
            debugLogContext,
            href: window.location.href,
            pageTitle: pageContext?.pageTitle || '',
          },
          AGENT_LOG_HYPOTHESES.page,
        );
        throw new Error(
          'このページでダウンロード可能な資料が見つかりませんでした。',
        );
      }

      await requestBackgroundDownload(payload, debugLogContext);
      postAgentLog(
        'content.js:handleCurrentPageDownloadRequest',
        'current-page download request queued',
        {
          debugLogContext,
          href: window.location.href,
          assetCount: payload.assets.length,
          kinds: payload.assets.map((asset) => asset.kind),
        },
        AGENT_LOG_HYPOTHESES.queue,
      );
      return payload;
    }

    async function handleLectureDownloadRequest() {
      const debugLogContext = createDebugLogContext('lecture-download');
      const payload = await collectLectureAssetsFromCurrentPage();
      await requestBackgroundDownload(
        {
          courseName: payload.courseName,
          assets: payload.assets,
        },
        debugLogContext,
      );
      return payload;
    }

    function setPanelBusy(panel, busy) {
      panel.dataset.glassmoocsDownloadBusy = busy ? 'true' : 'false';
      panel
        .querySelectorAll('button')
        .forEach((button) => (button.disabled = busy));
    }

    async function runPanelAction(panel, action) {
      const statusNode = panel.querySelector('.glassmoocs-download-status');
      setPanelBusy(panel, true);
      if (statusNode) {
        statusNode.textContent = '資料保存を開始しています...';
      }

      try {
        await action();
      } catch (error) {
        if (statusNode) {
          statusNode.textContent = normalizeText(
            error?.message,
            '資料処理に失敗しました。',
          );
        }
      } finally {
        setPanelBusy(panel, false);
        scheduleDownloadPanelRefresh();
      }
    }

    function createDownloadPanel() {
      const panel = document.createElement('section');
      panel.className = 'glassmoocs-download-panel';
      panel.dataset.glassmoocsDownloadPanel = 'true';
      panel.innerHTML = `
      <div class="glassmoocs-download-copy">
        <p class="glassmoocs-download-eyebrow">GlassMOOCs Download</p>
        <h2>授業資料を整理して保存</h2>
        <p class="glassmoocs-download-context"></p>
      </div>
      <div class="glassmoocs-download-actions">
        <button type="button" class="glassmoocs-download-button primary" data-glassmoocs-download-action="course">この科目を収集</button>
        <button type="button" class="glassmoocs-download-button" data-glassmoocs-download-action="lecture">この回の資料を全部保存</button>
        <button type="button" class="glassmoocs-download-button" data-glassmoocs-download-action="page">このページの資料を保存</button>
      </div>
      <div class="glassmoocs-download-permission" hidden>
        <p class="glassmoocs-download-permission-title">Slides キャプチャ</p>
        <p class="glassmoocs-download-permission-body">通常は不要ですが、高速エクスポートが失敗した場合は表示タブキャプチャのフォールバックを使います。</p>
        <div class="glassmoocs-download-permission-actions">
          <button type="button" class="glassmoocs-download-button" data-glassmoocs-download-action="grant-slides-capture">権限を許可する</button>
        </div>
        <p class="glassmoocs-download-permission-status"></p>
      </div>
      <div class="glassmoocs-download-progress" hidden>
        <div class="glassmoocs-download-progress-track">
          <div class="glassmoocs-download-progress-bar"></div>
        </div>
        <p class="glassmoocs-download-progress-label"></p>
      </div>
      <p class="glassmoocs-download-status"></p>
    `;

      const permissionButton = panel.querySelector(
        '[data-glassmoocs-download-action="grant-slides-capture"]',
      );
      const permissionStatusNode = panel.querySelector(
        '.glassmoocs-download-permission-status',
      );

      panel.addEventListener(
        'click',
        (event) => {
          const button = event.target?.closest?.(
            '[data-glassmoocs-download-action]',
          );
          if (!(button instanceof HTMLButtonElement)) return;
          if (!panel.contains(button)) return;
          if (button.disabled) return;

          const action = button.dataset.glassmoocsDownloadAction;
          if (
            action !== 'course' &&
            action !== 'lecture' &&
            action !== 'page'
          ) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();

          const handler =
            action === 'course'
              ? handleCourseCollectionRequest
              : action === 'lecture'
                ? handleLectureDownloadRequest
                : handleCurrentPageDownloadRequest;
          runPanelAction(panel, handler);
        },
        true,
      );

      permissionButton?.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!(permissionStatusNode instanceof HTMLElement)) return;
        permissionButton.disabled = true;
        permissionStatusNode.textContent =
          '拡張機能の popup を開いて、Slides キャプチャ権限を許可してください。';

        try {
          await openSlidesCapturePermissionWindow();
          permissionStatusNode.textContent =
            '許可ウィンドウを開きました。Chromium で反応しない場合は、ツールバーの拡張機能 popup から許可してください。';
        } catch (error) {
          permissionStatusNode.textContent = normalizeText(
            error?.message,
            '許可ウィンドウを開けませんでした。',
          );
        } finally {
          permissionButton.disabled = false;
        }
      });

      return panel;
    }

    function injectDownloadControls() {
      const pageContext = getCurrentPageContext(document, window.location.href);
      let panel = document.querySelector('.glassmoocs-download-panel');

      if (!pageContext) {
        postAgentLog(
          'content.js:injectDownloadControls',
          'page context unavailable; removing panel if present',
          {
            href: window.location.href,
          },
          AGENT_LOG_HYPOTHESES.page,
        );
        panel?.remove();
        return;
      }

      if (!panel) {
        panel = createDownloadPanel();
      }

      const anchor = getDownloadPanelAnchor();
      mountDownloadPanel(panel, anchor);

      scheduleDownloadPanelRefresh();
    }

    return {
      handleCourseCollectionRequest,
      handleLectureDownloadRequest,
      handleCurrentPageDownloadRequest,
      injectDownloadControls,
      scheduleDownloadPanelRefresh,
    };
  }

  globalThis.__glassmoocsCreateDownloadPanelComponent =
    createDownloadPanelComponent;
})();
