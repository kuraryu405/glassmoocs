(function () {
  function createDownloadPanelComponent(deps) {
    const {
      DOWNLOAD_STATUS,
      buildCurrentPageDownloadPayload,
      collectCourseAssetsFromCurrentPage,
      formatDownloadStateText,
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
      return (
        document.querySelector('.content-header') ||
        document.querySelector('.content-wrapper') ||
        document.body
      );
    }

    function mountDownloadPanel(panel, anchor) {
      if (!anchor || !anchor.parentElement) {
        document.body.prepend(panel);
        return;
      }

      if (anchor.matches('.content-header')) {
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
        const statusNode = panel.querySelector('.glassmoocs-download-status');
        const collectButton = panel.querySelector(
          '[data-glassmoocs-download-action="course"]',
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
      const result = await collectCourseAssetsFromCurrentPage();
      await requestBackgroundDownload({
        courseName: result.courseName,
        assets: result.assets,
      });
      return result;
    }

    async function handleCurrentPageDownloadRequest() {
      const pageContext = getCurrentPageContext(document, window.location.href);
      postAgentLog(
        'content.js:handleCurrentPageDownloadRequest',
        'starting current-page download request',
        {
          href: window.location.href,
          assetCount: pageContext?.assetCandidates?.length || 0,
          pageTitle: pageContext?.pageTitle || '',
        },
        'H-CT-B',
      );

      const payload = await buildCurrentPageDownloadPayload();
      if (!payload.assets.length) {
        postAgentLog(
          'content.js:handleCurrentPageDownloadRequest',
          'current-page download found no assets',
          {
            href: window.location.href,
            pageTitle: pageContext?.pageTitle || '',
          },
          'H-CT-A',
        );
        throw new Error(
          'このページでダウンロード可能な資料が見つかりませんでした。',
        );
      }

      await requestBackgroundDownload(payload);
      postAgentLog(
        'content.js:handleCurrentPageDownloadRequest',
        'current-page download request queued',
        {
          href: window.location.href,
          assetCount: payload.assets.length,
          kinds: payload.assets.map((asset) => asset.kind),
        },
        'H-CT-B',
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
      <p class="glassmoocs-download-status"></p>
    `;

      const collectButton = panel.querySelector(
        '[data-glassmoocs-download-action="course"]',
      );
      const pageButton = panel.querySelector(
        '[data-glassmoocs-download-action="page"]',
      );
      const permissionButton = panel.querySelector(
        '[data-glassmoocs-download-action="grant-slides-capture"]',
      );
      const permissionStatusNode = panel.querySelector(
        '.glassmoocs-download-permission-status',
      );

      collectButton?.addEventListener('click', () => {
        runPanelAction(panel, handleCourseCollectionRequest);
      });

      pageButton?.addEventListener('click', () => {
        runPanelAction(panel, handleCurrentPageDownloadRequest);
      });

      permissionButton?.addEventListener('click', async () => {
        if (!(permissionStatusNode instanceof HTMLElement)) return;
        permissionButton.disabled = true;
        permissionStatusNode.textContent = '許可ウィンドウを開いています...';

        try {
          await openSlidesCapturePermissionWindow();
          permissionStatusNode.textContent =
            '許可ウィンドウを開きました。許可後にもう一度保存を実行してください。';
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
          'H-CT-A',
        );
        panel?.remove();
        return;
      }

      const anchor = getDownloadPanelAnchor();
      if (!anchor) return;

      if (!panel) {
        panel = createDownloadPanel();
        mountDownloadPanel(panel, anchor);
      }

      scheduleDownloadPanelRefresh();
    }

    return {
      handleCourseCollectionRequest,
      handleCurrentPageDownloadRequest,
      injectDownloadControls,
      scheduleDownloadPanelRefresh,
    };
  }

  globalThis.__glassmoocsCreateDownloadPanelComponent =
    createDownloadPanelComponent;
})();
