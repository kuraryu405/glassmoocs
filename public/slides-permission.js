(function () {
  const CAPTURE_ORIGIN = '<all_urls>';
  const api = globalThis.browser || globalThis.chrome;
  const grantButton = document.getElementById('grant-button');
  const statusNode = document.getElementById('status');

  function getRuntimeLastError() {
    return globalThis.chrome?.runtime?.lastError || null;
  }

  function normalizeText(value, fallback = '') {
    if (typeof value !== 'string') return fallback;
    const normalized = value.replace(/\s+/g, ' ').trim();
    return normalized || fallback;
  }

  function setStatus(message) {
    if (!statusNode) return;
    statusNode.textContent = normalizeText(message);
  }

  function permissionsContains(permissions) {
    if (!api?.permissions?.contains) {
      return Promise.reject(new Error('permissions.contains unavailable'));
    }

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
          const error = getRuntimeLastError();
          if (error) {
            reject(new Error(error.message));
            return;
          }

          resolve(granted);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  function permissionsRequest(permissions) {
    if (!api?.permissions?.request) {
      return Promise.reject(new Error('permissions.request unavailable'));
    }

    try {
      const result = api.permissions.request(permissions);
      if (result && typeof result.then === 'function') {
        return result;
      }
    } catch (error) {
      return Promise.reject(error);
    }

    return new Promise((resolve, reject) => {
      try {
        api.permissions.request(permissions, (granted) => {
          const error = getRuntimeLastError();
          if (error) {
            reject(new Error(error.message));
            return;
          }

          resolve(granted);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async function refreshPermissionState() {
    try {
      const granted = await permissionsContains({ origins: [CAPTURE_ORIGIN] });
      if (grantButton instanceof HTMLButtonElement) {
        grantButton.disabled = !!granted;
      }
      if (granted) {
        setStatus(
          'キャプチャ権限は付与済みです。このウィンドウを閉じて保存をやり直してください。',
        );
      }
    } catch (error) {
      setStatus(
        normalizeText(
          error?.message,
          '権限状態を確認できませんでした。ボタンを押して再試行してください。',
        ),
      );
    }
  }

  grantButton?.addEventListener('click', async () => {
    if (!(grantButton instanceof HTMLButtonElement)) return;

    grantButton.disabled = true;
    setStatus('Firefox の確認ダイアログで「許可」を選んでください。');

    try {
      const granted = await permissionsRequest({ origins: [CAPTURE_ORIGIN] });
      if (!granted) {
        setStatus('権限が許可されませんでした。もう一度やり直してください。');
        grantButton.disabled = false;
        return;
      }

      setStatus(
        'キャプチャ権限を許可しました。このウィンドウを閉じて保存をやり直してください。',
      );
      window.setTimeout(() => {
        window.close();
      }, 700);
    } catch (error) {
      setStatus(
        normalizeText(
          error?.message,
          '権限要求に失敗しました。もう一度やり直してください。',
        ),
      );
      grantButton.disabled = false;
    }
  });

  refreshPermissionState();
})();
