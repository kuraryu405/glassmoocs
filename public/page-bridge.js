(() => {
  const SUBMIT_SUCCESS_EVENT = 'glassmoocs:submit-success';
  const SUCCESS_MESSAGES = [
    'すべての回答を保存しました',
    'All your answers have been saved.',
  ];

  if (window.__glassmoocsSubmitBridgeInstalled) return;
  window.__glassmoocsSubmitBridgeInstalled = true;

  const originalAlert = window.alert;

  function isSubmitSuccessMessage(message) {
    const text = String(message ?? '');
    return SUCCESS_MESSAGES.some((needle) => text.includes(needle));
  }

  window.alert = function glassmoocsPatchedAlert(message) {
    const shouldNotify = isSubmitSuccessMessage(message);
    const result = originalAlert.apply(this, arguments);

    if (shouldNotify) {
      window.dispatchEvent(new CustomEvent(SUBMIT_SUCCESS_EVENT));
    }

    return result;
  };
})();
