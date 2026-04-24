(async () => {
  const api = globalThis.browser || globalThis.chrome;

  if (!api?.runtime?.openOptionsPage) {
    window.close();
    return;
  }

  try {
    await api.runtime.openOptionsPage();
  } finally {
    window.close();
  }
})();
