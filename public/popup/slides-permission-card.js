(function () {
  function createSlidesPermissionCardController(deps) {
    const {
      api,
      captureOrigin,
      getRuntimeLastError,
      normalizeText,
      slidesPermissionCard,
      slidesPermissionStatusNode,
      grantSlidesPermissionButton,
      getCurrentDownloadState,
      setCurrentDownloadState,
      setDownloadStateMessage,
    } = deps;

    function stateNeedsCapturePermission(state) {
      return !!state?.needsCapturePermission;
    }

    function setSlidesPermissionStatus(message = '') {
      if (!slidesPermissionStatusNode) return;
      const normalized = normalizeText(message);
      slidesPermissionStatusNode.textContent = normalized;
      slidesPermissionStatusNode.style.display = normalized ? '' : 'none';
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

    async function checkSlidesPermission() {
      if (!slidesPermissionCard) return;
      const shouldOfferPermission = stateNeedsCapturePermission(
        getCurrentDownloadState(),
      );
      if (!shouldOfferPermission) {
        slidesPermissionCard.style.display = 'none';
        setSlidesPermissionStatus('');
        return;
      }

      slidesPermissionCard.style.display = '';
      setSlidesPermissionStatus('');

      try {
        const granted = await permissionsContains({
          origins: [captureOrigin],
        });
        slidesPermissionCard.style.display = granted ? 'none' : '';
      } catch {
        slidesPermissionCard.style.display = '';
        setSlidesPermissionStatus(
          '権限状態の自動確認に失敗しました。許可ボタンをそのまま押して確認してください。',
        );
      }
    }

    async function handleGrantSlidesPermission() {
      try {
        grantSlidesPermissionButton.disabled = true;
        setSlidesPermissionStatus('');
        const granted = await permissionsRequest({
          origins: [captureOrigin],
        });
        if (granted) {
          slidesPermissionCard.style.display = 'none';
          setDownloadStateMessage('Slides キャプチャを許可しました。');
          setCurrentDownloadState({
            ...(getCurrentDownloadState() || {}),
            lastError: '',
            needsCapturePermission: false,
          });
          return;
        }
        setSlidesPermissionStatus('権限が許可されませんでした。');
      } catch (error) {
        setSlidesPermissionStatus(
          normalizeText(
            error?.message,
            '権限要求に失敗しました。about:debugging のポップアップコンソールを確認してください。',
          ),
        );
      } finally {
        grantSlidesPermissionButton.disabled = false;
      }
    }

    return {
      checkSlidesPermission,
      handleGrantSlidesPermission,
    };
  }

  globalThis.__glassmoocsCreateSlidesPermissionCardController =
    createSlidesPermissionCardController;
})();
