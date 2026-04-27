(function () {
  const MESSAGE_TYPES = {
    getState: 'glassmoocs:get-download-state',
    resetState: 'glassmoocs:reset-download-state',
    getPageContext: 'glassmoocs:get-page-context',
    startCourseCollection: 'glassmoocs:start-course-collection',
    downloadCurrentPage: 'glassmoocs:download-current-page',
  };
  const DOWNLOAD_STATE_STORAGE_KEY = 'glassmoocs_download_state';
  const api = globalThis.browser || globalThis.chrome;

  const pageContextNode = document.getElementById('page-context');
  const downloadStateNode = document.getElementById('download-state');
  const collectCourseButton = document.getElementById('collect-course-button');
  const downloadPageButton = document.getElementById('download-page-button');
  const openSettingsButton = document.getElementById('open-settings-button');
  const resetStateButton = document.getElementById('reset-state-button');
  const slidesPermissionCard = document.getElementById(
    'slides-permission-card',
  );
  const grantSlidesPermissionButton = document.getElementById(
    'grant-slides-permission-button',
  );
  const slidesPermissionStatusNode = document.getElementById(
    'slides-permission-status',
  );

  const CAPTURE_ORIGIN = '<all_urls>';
  const MOOcs_ORIGIN_PREFIX = 'https://moocs.iniad.org/';

  let currentTabId = null;
  let currentPageContext = null;
  let currentDownloadState = null;

  function getRuntimeLastError() {
    return globalThis.chrome?.runtime?.lastError || null;
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

  function runtimeSendMessage(message) {
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

  function scriptingExecuteScript(details) {
    if (!api?.scripting?.executeScript) {
      return Promise.reject(new Error('scripting.executeScript unavailable'));
    }

    try {
      const result = api.scripting.executeScript(details);
      if (result && typeof result.then === 'function') {
        return result;
      }
    } catch (error) {
      return Promise.reject(error);
    }

    return new Promise((resolve, reject) => {
      try {
        api.scripting.executeScript(details, (injectionResults) => {
          const error = getRuntimeLastError();
          if (error) {
            reject(new Error(error.message));
            return;
          }

          resolve(injectionResults);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  function scriptingInsertCss(details) {
    if (!api?.scripting?.insertCSS) {
      return Promise.reject(new Error('scripting.insertCSS unavailable'));
    }

    try {
      const result = api.scripting.insertCSS(details);
      if (result && typeof result.then === 'function') {
        return result.then(() => {});
      }
    } catch (error) {
      return Promise.reject(error);
    }

    return new Promise((resolve, reject) => {
      try {
        api.scripting.insertCSS(details, () => {
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

  function normalizeText(value, fallback = '') {
    if (typeof value !== 'string') return fallback;
    const normalized = value.replace(/\s+/g, ' ').trim();
    return normalized || fallback;
  }

  function isMoocsUrl(rawUrl) {
    return typeof rawUrl === 'string' && rawUrl.startsWith(MOOcs_ORIGIN_PREFIX);
  }

  async function ensureMoocsContentReady(activeTab) {
    if (!activeTab?.id || !isMoocsUrl(activeTab.url)) {
      return false;
    }

    try {
      await scriptingInsertCss({
        target: { tabId: activeTab.id },
        files: ['styles.css'],
      });
    } catch {
      // CSS may already be present. Continue to JS injection.
    }

    await scriptingExecuteScript({
      target: { tabId: activeTab.id },
      files: ['content.js'],
    });
    return true;
  }

  async function fetchPageContextWithRecovery(activeTab) {
    try {
      return await tabsSendMessage(activeTab.id, {
        type: MESSAGE_TYPES.getPageContext,
      });
    } catch (error) {
      const message = normalizeText(error?.message);
      if (!isMoocsUrl(activeTab.url)) {
        throw error;
      }
      if (
        message &&
        !/Receiving end does not exist|Could not establish connection|No matching message handler/i.test(
          message,
        )
      ) {
        throw error;
      }

      const injected = await ensureMoocsContentReady(activeTab);
      if (!injected) {
        throw error;
      }

      await new Promise((resolve) => window.setTimeout(resolve, 120));
      return await tabsSendMessage(activeTab.id, {
        type: MESSAGE_TYPES.getPageContext,
      });
    }
  }

  function setButtonsDisabled(disabled) {
    collectCourseButton.disabled = disabled;
    downloadPageButton.disabled = disabled;
  }

  function formatState(state) {
    if (!state || state.status === 'idle') {
      return '待機中です。';
    }

    const parts = [
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

    return parts.join('\n');
  }

  function formatPageContext(context) {
    if (!context) {
      return 'MOOCs の科目・講義・ページ情報を取得できませんでした。';
    }

    const directCount = Array.isArray(context.assetCandidates)
      ? context.assetCandidates.filter((item) => item.kind === 'direct_file')
          .length
      : 0;
    const slidesCount = Array.isArray(context.assetCandidates)
      ? context.assetCandidates.filter((item) => item.kind === 'google_slides')
          .length
      : 0;

    const lines = [
      context.courseName ? `科目: ${context.courseName}` : '',
      context.lectureName ? `講義: ${context.lectureName}` : '',
      context.pageTitle ? `ページ: ${context.pageTitle}` : '',
      Array.isArray(context.assetCandidates)
        ? `このページの候補資料: ${context.assetCandidates.length} 件`
        : '',
      slidesCount > 0 ? `Slides: ${slidesCount} 件` : '',
      directCount > 0 ? `Direct: ${directCount} 件` : '',
    ].filter(Boolean);

    return lines.join('\n') || 'このページの情報を判定できませんでした。';
  }

  const slidesPermissionCardController =
    globalThis.__glassmoocsCreateSlidesPermissionCardController({
      api,
      captureOrigin: CAPTURE_ORIGIN,
      getCurrentDownloadState() {
        return currentDownloadState;
      },
      getRuntimeLastError,
      grantSlidesPermissionButton,
      normalizeText,
      setCurrentDownloadState(nextState) {
        currentDownloadState = nextState;
      },
      setDownloadStateMessage(message) {
        downloadStateNode.textContent = message;
      },
      slidesPermissionCard,
      slidesPermissionStatusNode,
    });

  const { checkSlidesPermission, handleGrantSlidesPermission } =
    slidesPermissionCardController;

  async function loadActivePageContext() {
    try {
      const tabs = await tabsQuery({ active: true, currentWindow: true });
      const activeTab = tabs[0];

      if (!activeTab?.id) {
        currentTabId = null;
        currentPageContext = null;
        pageContextNode.textContent = 'アクティブタブを取得できませんでした。';
        setButtonsDisabled(true);
        return;
      }

      currentTabId = activeTab.id;
      const response = await fetchPageContextWithRecovery(activeTab);

      if (!response?.ok || !response.context) {
        currentPageContext = null;
        pageContextNode.textContent =
          'MOOCs ページを開いた状態でポップアップを使ってください。';
        setButtonsDisabled(true);
        return;
      }

      currentPageContext = response.context;
      pageContextNode.textContent = formatPageContext(response.context);
      setButtonsDisabled(false);
      downloadPageButton.disabled =
        !Array.isArray(response.context.assetCandidates) ||
        response.context.assetCandidates.length === 0;
      await checkSlidesPermission();
    } catch {
      currentTabId = null;
      currentPageContext = null;
      pageContextNode.textContent =
        'MOOCs ページを開いた状態でポップアップを使ってください。';
      setButtonsDisabled(true);
      slidesPermissionCard.style.display = 'none';
    }
  }

  async function refreshState() {
    try {
      const response = await runtimeSendMessage({
        type: MESSAGE_TYPES.getState,
      });
      currentDownloadState = response?.state || null;
      downloadStateNode.textContent = formatState(response?.state);
      await checkSlidesPermission();
    } catch (error) {
      currentDownloadState = null;
      downloadStateNode.textContent = normalizeText(
        error?.message,
        '状態の取得に失敗しました。',
      );
    }
  }

  async function handleCollectCourse() {
    if (currentTabId == null || !currentPageContext) return;

    setButtonsDisabled(true);
    downloadStateNode.textContent = '科目収集を開始しています...';

    try {
      let response;
      try {
        response = await tabsSendMessage(currentTabId, {
          type: MESSAGE_TYPES.startCourseCollection,
        });
      } catch {
        const tabs = await tabsQuery({ active: true, currentWindow: true });
        const activeTab = tabs[0];
        if (activeTab?.id === currentTabId) {
          await ensureMoocsContentReady(activeTab);
          response = await tabsSendMessage(currentTabId, {
            type: MESSAGE_TYPES.startCourseCollection,
          });
        } else {
          throw new Error('科目収集対象のタブを再取得できませんでした。');
        }
      }

      if (!response?.ok) {
        throw new Error(response?.error || '科目収集の開始に失敗しました。');
      }
    } catch (error) {
      downloadStateNode.textContent = normalizeText(
        error?.message,
        '科目収集の開始に失敗しました。',
      );
    } finally {
      await loadActivePageContext();
      await refreshState();
    }
  }

  async function handleDownloadCurrentPage() {
    if (currentTabId == null || !currentPageContext) return;

    setButtonsDisabled(true);
    downloadStateNode.textContent = 'このページの資料保存を開始しています...';

    try {
      let response;
      try {
        response = await tabsSendMessage(currentTabId, {
          type: MESSAGE_TYPES.downloadCurrentPage,
        });
      } catch {
        const tabs = await tabsQuery({ active: true, currentWindow: true });
        const activeTab = tabs[0];
        if (activeTab?.id === currentTabId) {
          await ensureMoocsContentReady(activeTab);
          response = await tabsSendMessage(currentTabId, {
            type: MESSAGE_TYPES.downloadCurrentPage,
          });
        } else {
          throw new Error('資料保存対象のタブを再取得できませんでした。');
        }
      }

      if (!response?.ok) {
        throw new Error(response?.error || '資料保存の開始に失敗しました。');
      }
    } catch (error) {
      downloadStateNode.textContent = normalizeText(
        error?.message,
        '資料保存の開始に失敗しました。',
      );
    } finally {
      await loadActivePageContext();
      await refreshState();
    }
  }

  async function handleOpenSettings() {
    if (!api?.runtime?.openOptionsPage) return;

    try {
      await api.runtime.openOptionsPage();
    } catch {
      return;
    }
  }

  async function handleResetState() {
    try {
      await runtimeSendMessage({ type: MESSAGE_TYPES.resetState });
      await refreshState();
    } catch {
      return;
    }
  }

  collectCourseButton.addEventListener('click', handleCollectCourse);
  downloadPageButton.addEventListener('click', handleDownloadCurrentPage);
  openSettingsButton.addEventListener('click', handleOpenSettings);
  resetStateButton.addEventListener('click', handleResetState);
  grantSlidesPermissionButton?.addEventListener(
    'click',
    handleGrantSlidesPermission,
  );

  if (api?.storage?.onChanged) {
    api.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') return;
      if (!changes[DOWNLOAD_STATE_STORAGE_KEY]) return;
      refreshState();
    });
  }

  checkSlidesPermission();
  loadActivePageContext().finally(() => {
    refreshState();
  });
})();
