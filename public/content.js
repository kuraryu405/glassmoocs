(function () {
  const BACKGROUND_STORAGE_KEY = 'glassmoocs_background_image';
  const LEGACY_BACKGROUND_STORAGE_KEY = 'iniad_bg_image';
  const SETTINGS_STORAGE_KEY = 'glassmoocs_settings';
  const SUBMIT_SUCCESS_EVENT = 'glassmoocs:submit-success';
  const MODE_FULL = 'full';
  const SUBMIT_RELOAD_WINDOW_MS = 15000;
  const SUBMIT_RELOAD_DELAY_MS = 180;

  const TAB_TYPES = {
    attendanceTest: {
      label: '出席',
      icon: 'AT',
      color: '#f59e0b',
      soft: 'rgba(245, 158, 11, 0.18)',
      text: '#fff7ed',
    },
    attendanceAssignment: {
      label: '出席課題',
      icon: 'AA',
      color: '#06b6d4',
      soft: 'rgba(6, 182, 212, 0.18)',
      text: '#ecfeff',
    },
    assignment: {
      label: '課題',
      icon: 'HW',
      color: '#f43f5e',
      soft: 'rgba(244, 63, 94, 0.13)',
      text: '#fff1f2',
    },
    check: {
      label: '確認',
      icon: 'QZ',
      color: '#8b5cf6',
      soft: 'rgba(139, 92, 246, 0.18)',
      text: '#f5f3ff',
    },
    slide: {
      label: '資料',
      icon: 'SL',
      color: '#38bdf8',
      soft: 'rgba(56, 189, 248, 0.13)',
      text: '#f0f9ff',
    },
  };

  let settings = getDefaultSettings();
  let enhancementFrame = 0;
  let submitIntentAt = 0;
  let reloadTimer = 0;

  function getExtensionStorage() {
    if (globalThis.browser?.storage?.local) {
      return {
        area: globalThis.browser.storage.local,
        areaName: 'local',
        promiseBased: true,
      };
    }

    if (globalThis.chrome?.storage?.local) {
      return {
        area: chrome.storage.local,
        areaName: 'local',
        promiseBased: false,
      };
    }

    if (globalThis.chrome?.storage?.sync) {
      return {
        area: chrome.storage.sync,
        areaName: 'sync',
        promiseBased: false,
      };
    }

    return null;
  }

  function storageGet(storage, keys, callback, fallback) {
    if (storage.promiseBased) {
      storage.area.get(keys).then(callback).catch(fallback);
      return;
    }

    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      callback(value);
    };
    const runFallback = () => {
      if (settled) return;
      settled = true;
      fallback();
    };

    try {
      storage.area.get(keys, (result) => {
        if (globalThis.chrome?.runtime?.lastError) {
          runFallback();
          return;
        }

        finish(result);
      });
    } catch {
      runFallback();
    }
  }

  function storageSet(storage, values) {
    try {
      if (storage.promiseBased) {
        storage.area.set(values).catch(() => {});
        return;
      }

      storage.area.set(values);
    } catch {
      return;
    }
  }

  function isMacLike() {
    return /Mac|iPhone|iPad|iPod/i.test(
      navigator.platform || navigator.userAgent || '',
    );
  }

  function getDefaultSettings() {
    const mac = isMacLike();

    return {
      shortcuts: {
        previous: {
          key: 'ArrowLeft',
          code: 'ArrowLeft',
          ctrl: !mac,
          meta: mac,
          alt: false,
          shift: false,
        },
        next: {
          key: 'ArrowRight',
          code: 'ArrowRight',
          ctrl: !mac,
          meta: mac,
          alt: false,
          shift: false,
        },
      },
      tabColorMode: MODE_FULL,
      colorTabsEnabled: true,
      reloadAfterSubmit: false,
    };
  }

  function mergeSettings(rawSettings) {
    const defaults = getDefaultSettings();
    const raw =
      rawSettings && typeof rawSettings === 'object' ? rawSettings : {};

    return {
      shortcuts: {
        previous: {
          ...defaults.shortcuts.previous,
          ...(raw.shortcuts && raw.shortcuts.previous
            ? raw.shortcuts.previous
            : {}),
        },
        next: {
          ...defaults.shortcuts.next,
          ...(raw.shortcuts && raw.shortcuts.next ? raw.shortcuts.next : {}),
        },
      },
      tabColorMode: MODE_FULL,
      colorTabsEnabled:
        typeof raw.colorTabsEnabled === 'boolean'
          ? raw.colorTabsEnabled
          : defaults.colorTabsEnabled,
      reloadAfterSubmit:
        typeof raw.reloadAfterSubmit === 'boolean'
          ? raw.reloadAfterSubmit
          : defaults.reloadAfterSubmit,
    };
  }

  function readSettings(callback) {
    const extensionStorage = getExtensionStorage();

    if (extensionStorage) {
      storageGet(
        extensionStorage,
        [SETTINGS_STORAGE_KEY],
        (result) => {
          callback(mergeSettings(result[SETTINGS_STORAGE_KEY]));
        },
        () => {
          try {
            callback(
              mergeSettings(
                JSON.parse(
                  localStorage.getItem(SETTINGS_STORAGE_KEY) || 'null',
                ),
              ),
            );
          } catch {
            callback(mergeSettings(null));
          }
        },
      );
      return;
    }

    try {
      callback(
        mergeSettings(
          JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || 'null'),
        ),
      );
    } catch {
      callback(mergeSettings(null));
    }
  }

  function readBackgroundImage(callback) {
    const extensionStorage = getExtensionStorage();

    if (extensionStorage) {
      storageGet(
        extensionStorage,
        [BACKGROUND_STORAGE_KEY],
        (result) => {
          const syncImage = result[BACKGROUND_STORAGE_KEY];
          if (typeof syncImage === 'string' && syncImage.trim()) {
            callback(syncImage.trim());
            return;
          }

          const legacyImage =
            localStorage.getItem(LEGACY_BACKGROUND_STORAGE_KEY) || '';
          callback(legacyImage.trim());
        },
        () => {
          const legacyImage =
            localStorage.getItem(LEGACY_BACKGROUND_STORAGE_KEY) || '';
          callback(legacyImage.trim());
        },
      );
      return;
    }

    const legacyImage =
      localStorage.getItem(LEGACY_BACKGROUND_STORAGE_KEY) || '';
    callback(legacyImage.trim());
  }

  function applyBackgroundImage(url) {
    if (!document.body) return;
    if (!url) {
      document.body.style.removeProperty('background-image');
      return;
    }

    document.body.style.setProperty(
      'background-image',
      `url("${url}")`,
      'important',
    );
    document.body.style.setProperty('background-size', 'cover', 'important');
    document.body.style.setProperty(
      'background-attachment',
      'fixed',
      'important',
    );
    document.body.style.setProperty(
      'background-position',
      'center',
      'important',
    );
  }

  function setBackground() {
    readBackgroundImage((savedImage) => {
      applyBackgroundImage(savedImage);
    });
  }

  function isBackgroundShortcut(event) {
    return event.shiftKey && event.altKey && event.code === 'KeyB';
  }

  function handleBackgroundShortcut(event) {
    if (!isBackgroundShortcut(event)) return;

    const url = prompt(
      '背景画像のURLを入力:',
      localStorage.getItem(LEGACY_BACKGROUND_STORAGE_KEY) || '',
    );

    if (url) {
      const normalized = url.trim();
      if (!normalized) return;

      localStorage.setItem(LEGACY_BACKGROUND_STORAGE_KEY, normalized);

      const extensionStorage = getExtensionStorage();
      if (extensionStorage) {
        storageSet(extensionStorage, {
          [BACKGROUND_STORAGE_KEY]: normalized,
        });
      }

      applyBackgroundImage(normalized);
    }
  }

  function injectSubmitBridge() {
    if (document.documentElement.dataset.glassmoocsSubmitBridge === 'true') {
      return;
    }

    if (!(globalThis.chrome && chrome.runtime && chrome.runtime.getURL)) return;

    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('page-bridge.js');
    script.async = false;
    script.dataset.glassmoocsSubmitBridge = 'true';
    script.onload = () => script.remove();
    script.onerror = () => {
      delete document.documentElement.dataset.glassmoocsSubmitBridge;
      script.remove();
    };

    document.documentElement.dataset.glassmoocsSubmitBridge = 'true';
    (document.head || document.documentElement).appendChild(script);
  }

  function getSubmitTrigger(target) {
    if (!(target instanceof Element)) return null;

    const trigger = target.closest(
      'button, input[type="submit"], a.submit-answer, button.submit-answer, .btn-submit',
    );

    if (!trigger) return null;
    if (trigger.matches('.submit-answer, .btn-submit')) return trigger;

    const label = `${trigger.textContent || ''} ${trigger.getAttribute('value') || ''}`;
    if (
      trigger.closest('.problem-container, .problem-contentpage') &&
      /提出|submit/i.test(label)
    ) {
      return trigger;
    }

    return null;
  }

  function handleSubmitIntent(event) {
    if (!settings.reloadAfterSubmit) return;
    if (!getSubmitTrigger(event.target)) return;

    submitIntentAt = Date.now();
  }

  function handleSubmitSuccess() {
    if (!settings.reloadAfterSubmit) return;
    if (!submitIntentAt) return;
    if (Date.now() - submitIntentAt > SUBMIT_RELOAD_WINDOW_MS) return;
    if (reloadTimer) return;

    submitIntentAt = 0;
    reloadTimer = window.setTimeout(() => {
      reloadTimer = 0;
      window.location.reload();
    }, SUBMIT_RELOAD_DELAY_MS);
  }

  const segmenter =
    globalThis.Intl && Intl.Segmenter
      ? new Intl.Segmenter('ja', { granularity: 'grapheme' })
      : null;

  function countGraphemes(text) {
    if (segmenter) {
      return [...segmenter.segment(text)].length;
    }

    return Array.from(text).length;
  }

  function attachTextareaEnhancements() {
    document.querySelectorAll('textarea').forEach((textarea) => {
      if (textarea.dataset.glassmoocsEnhanced) return;
      if (!textarea.parentElement) return;

      textarea.dataset.glassmoocsEnhanced = 'true';

      const counter = document.createElement('div');
      counter.className = 'glassmoocs-char-counter';

      if (getComputedStyle(textarea.parentElement).position === 'static') {
        textarea.parentElement.style.position = 'relative';
      }

      textarea.parentElement.appendChild(counter);

      const update = () => {
        const count = countGraphemes(textarea.value);

        counter.textContent = `${count} chars`;
        counter.style.opacity = count > 0 ? '1' : '0';
        textarea.style.height = 'auto';
        textarea.style.height = `${textarea.scrollHeight + 5}px`;
      };

      textarea.addEventListener('input', update);
      update();
    });
  }

  function isNumberTabLink(link) {
    return /^\d+$/.test((link.textContent || '').trim());
  }

  function getNumberTabLinks() {
    const pagination = document.querySelector(
      'nav[aria-label="page navigation"] .pagination',
    );

    if (!pagination) return [];

    return [...pagination.querySelectorAll('li > a')].filter(isNumberTabLink);
  }

  function isNavigableLink(link) {
    return Boolean(link && link.href && link.getAttribute('href') !== '#');
  }

  function getPaginationArrowLink(direction) {
    const pagination = document.querySelector(
      'nav[aria-label="page navigation"] .pagination',
    );

    if (!pagination) return null;

    const symbol = direction < 0 ? '«' : '»';

    return (
      [...pagination.querySelectorAll('li > a')].find(
        (link) => link.textContent?.trim() === symbol && isNavigableLink(link),
      ) || null
    );
  }

  function getPagerLink(direction) {
    const selector = direction < 0 ? '.pager .previous a' : '.pager .next a';
    const link = document.querySelector(selector);
    return isNavigableLink(link) ? link : null;
  }

  function getTabPagerLink(direction) {
    return getPaginationArrowLink(direction) || getPagerLink(direction);
  }

  function getTabKind(text) {
    if (/出席\s*テスト/.test(text)) return 'attendanceTest';
    if (/出席\s*課題/.test(text)) return 'attendanceAssignment';
    if (/課題/.test(text)) return 'assignment';
    if (/理解度確認|テスト|確認/.test(text)) return 'check';
    if (/スライド|資料/.test(text)) return 'slide';
    return '';
  }

  function resetTabDecoration(link) {
    delete link.dataset.glassmoocsTabKind;
    link.style.removeProperty('--glassmoocs-tab-color');
    link.style.removeProperty('--glassmoocs-tab-soft');
    link.style.removeProperty('--glassmoocs-tab-text');
    link
      .querySelectorAll('.glassmoocs-tab-mark')
      .forEach((mark) => mark.remove());
  }

  function decorateTabs() {
    document.documentElement.dataset.glassmoocsTabMode =
      settings.colorTabsEnabled ? settings.tabColorMode : 'off';

    getNumberTabLinks().forEach((link) => {
      resetTabDecoration(link);

      if (!settings.colorTabsEnabled) return;

      const title = link.getAttribute('title') || '';
      const combinedText = `${title} ${link.textContent || ''}`;
      const kind = getTabKind(combinedText);

      if (!kind || !TAB_TYPES[kind]) return;

      const tabType = TAB_TYPES[kind];
      link.dataset.glassmoocsTabKind = kind;
      link.style.setProperty('--glassmoocs-tab-color', tabType.color);
      link.style.setProperty('--glassmoocs-tab-soft', tabType.soft);
      link.style.setProperty('--glassmoocs-tab-text', tabType.text);

      if (settings.tabColorMode === MODE_FULL) return;
    });
  }

  function shortcutToId(shortcut) {
    const storedKey = getShortcutStoredKey(shortcut);
    if (!storedKey) return '';

    return [
      shortcut.ctrl ? 'ctrl' : '',
      shortcut.meta ? 'meta' : '',
      shortcut.alt ? 'alt' : '',
      shortcut.shift ? 'shift' : '',
      storedKey,
    ]
      .filter(Boolean)
      .join('+');
  }

  function isModifierOnlyKey(key) {
    return ['Meta', 'Shift', 'Alt', 'Control'].includes(key);
  }

  function isUnreliableKey(key) {
    return ['Process', 'Unidentified', 'Dead', 'Compose'].includes(key);
  }

  function keyFromCode(code) {
    if (!code) return '';
    if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
    if (/^Digit[0-9]$/.test(code)) return code.slice(5);
    if (/^Numpad[0-9]$/.test(code)) return code.slice(6);

    const codeLabels = {
      Space: ' ',
      Enter: 'Enter',
      Escape: 'Escape',
      Tab: 'Tab',
      Backspace: 'Backspace',
      Delete: 'Delete',
      Home: 'Home',
      End: 'End',
      PageUp: 'PageUp',
      PageDown: 'PageDown',
      ArrowLeft: 'ArrowLeft',
      ArrowRight: 'ArrowRight',
      ArrowUp: 'ArrowUp',
      ArrowDown: 'ArrowDown',
      Comma: ',',
      Period: '.',
      Slash: '/',
      Backslash: '\\',
      Semicolon: ';',
      Quote: "'",
      BracketLeft: '[',
      BracketRight: ']',
      Minus: '-',
      Equal: '=',
      Backquote: '`',
    };

    return codeLabels[code] || code;
  }

  function getShortcutStoredKey(shortcut) {
    if (!shortcut) return '';

    const codeKey = keyFromCode(shortcut.code);
    if (codeKey && !isModifierOnlyKey(codeKey)) {
      return normalizeKey(codeKey);
    }

    return normalizeKey(shortcut.key);
  }

  function getEventKey(event) {
    if (isModifierOnlyKey(event.key)) return '';
    if (!isUnreliableKey(event.key)) {
      return normalizeKey(event.key);
    }

    const fallbackKey = keyFromCode(event.code);
    if (!fallbackKey || isModifierOnlyKey(fallbackKey)) return '';
    return normalizeKey(fallbackKey);
  }

  function eventToShortcutId(event) {
    const key = getEventKey(event);
    if (!key) return '';

    return [
      event.ctrlKey ? 'ctrl' : '',
      event.metaKey ? 'meta' : '',
      event.altKey ? 'alt' : '',
      event.shiftKey ? 'shift' : '',
      key,
    ]
      .filter(Boolean)
      .join('+');
  }

  function normalizeKey(key) {
    if (!key) return '';
    if (key.length === 1) return key.toLowerCase();
    return key;
  }

  function isEditableTarget(target) {
    if (!(target instanceof Element)) return false;

    return Boolean(
      target.closest(
        [
          'input',
          'textarea',
          'select',
          '[contenteditable="true"]',
          '[contenteditable=""]',
          '.CodeMirror',
          '.CodeMirror-wrap',
          '.editor-toolbar',
        ].join(','),
      ),
    );
  }

  function navigateTabPager(direction) {
    const targetLink = getTabPagerLink(direction);

    if (!targetLink) return false;

    window.location.assign(targetLink.href);
    return true;
  }

  function handleTabShortcut(event) {
    if (isEditableTarget(event.target)) return;

    const eventId = eventToShortcutId(event);
    const previousId = shortcutToId(settings.shortcuts.previous);
    const nextId = shortcutToId(settings.shortcuts.next);
    let handled = false;

    if (eventId === previousId) {
      handled = navigateTabPager(-1);
    } else if (eventId === nextId) {
      handled = navigateTabPager(1);
    }

    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function enhancePage() {
    attachTextareaEnhancements();
    decorateTabs();
  }

  function scheduleEnhancements() {
    if (enhancementFrame) return;

    enhancementFrame = requestAnimationFrame(() => {
      enhancementFrame = 0;
      enhancePage();
    });
  }

  function init() {
    readSettings((loadedSettings) => {
      settings = loadedSettings;
      enhancePage();
    });

    setBackground();
    injectSubmitBridge();

    document.addEventListener('keydown', handleBackgroundShortcut, true);
    document.addEventListener('keydown', handleTabShortcut, true);
    document.addEventListener('click', handleSubmitIntent, true);
    window.addEventListener(SUBMIT_SUCCESS_EVENT, handleSubmitSuccess);
    window.addEventListener('load', scheduleEnhancements);

    const observer = new MutationObserver(scheduleEnhancements);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    const extensionStorage = getExtensionStorage();

    if (extensionStorage && globalThis.chrome?.storage?.onChanged) {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (
          areaName === extensionStorage.areaName &&
          changes[SETTINGS_STORAGE_KEY]
        ) {
          settings = mergeSettings(changes[SETTINGS_STORAGE_KEY].newValue);
          enhancePage();
        }

        if (
          areaName === extensionStorage.areaName &&
          changes[BACKGROUND_STORAGE_KEY]
        ) {
          const nextImage = changes[BACKGROUND_STORAGE_KEY].newValue;
          if (typeof nextImage === 'string') {
            applyBackgroundImage(nextImage.trim());
          } else if (nextImage == null) {
            applyBackgroundImage('');
          }
        }
      });
    }
  }

  if (document.body) {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  }
})();
