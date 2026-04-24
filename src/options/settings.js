export const SETTINGS_STORAGE_KEY = 'glassmoocs_settings';
export const BACKGROUND_IMAGE_STORAGE_KEY = 'glassmoocs_background_image';
const LEGACY_BACKGROUND_STORAGE_KEY = 'iniad_bg_image';
export const COLOR_MODES = {
  full: 'full',
};

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
    return { area: chrome.storage.sync, areaName: 'sync', promiseBased: false };
  }

  return null;
}

function storageGet(storage, keys) {
  if (storage.promiseBased) {
    return storage.area.get(keys);
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const finishResolve = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const finishReject = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    try {
      storage.area.get(keys, (result) => {
        const error = globalThis.chrome?.runtime?.lastError;
        if (error) {
          finishReject(new Error(error.message));
          return;
        }

        finishResolve(result);
      });
    } catch (error) {
      finishReject(error);
    }
  });
}

function storageSet(storage, values) {
  if (storage.promiseBased) {
    return storage.area.set(values);
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const finishResolve = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const finishReject = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    try {
      storage.area.set(values, () => {
        const error = globalThis.chrome?.runtime?.lastError;
        if (error) {
          finishReject(new Error(error.message));
          return;
        }

        finishResolve();
      });
    } catch (error) {
      finishReject(error);
    }
  });
}

function storageRemove(storage, keys) {
  if (storage.promiseBased) {
    return storage.area.remove(keys);
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const finishResolve = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const finishReject = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    try {
      storage.area.remove(keys, () => {
        const error = globalThis.chrome?.runtime?.lastError;
        if (error) {
          finishReject(new Error(error.message));
          return;
        }

        finishResolve();
      });
    } catch (error) {
      finishReject(error);
    }
  });
}

export function isMacLike() {
  return /Mac|iPhone|iPad|iPod/i.test(
    navigator.platform || navigator.userAgent || '',
  );
}

export function createDefaultSettings() {
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
    tabColorMode: COLOR_MODES.full,
    colorTabsEnabled: true,
    reloadAfterSubmit: false,
  };
}

export function mergeSettings(rawSettings) {
  const defaults = createDefaultSettings();
  const raw = rawSettings && typeof rawSettings === 'object' ? rawSettings : {};

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
    tabColorMode: COLOR_MODES.full,
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

export function normalizeKey(key) {
  if (!key) return '';
  if (key.length === 1) return key.toLowerCase();
  return key;
}

export function isModifierOnlyKey(key) {
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

function getShortcutKey(event) {
  if (isModifierOnlyKey(event.key)) return '';

  if (!isUnreliableKey(event.key)) {
    return normalizeKey(event.key);
  }

  const fallbackKey = keyFromCode(event.code);
  if (!fallbackKey || isModifierOnlyKey(fallbackKey)) return '';
  return normalizeKey(fallbackKey);
}

export function shortcutToId(shortcut) {
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

export function shortcutToLabel(shortcut) {
  if (!shortcut || !shortcut.key) return '未設定';

  const pieces = [];

  if (shortcut.ctrl) pieces.push('Ctrl');
  if (shortcut.meta) pieces.push(isMacLike() ? 'Cmd' : 'Win');
  if (shortcut.alt) pieces.push(isMacLike() ? 'Option' : 'Alt');
  if (shortcut.shift) pieces.push('Shift');

  pieces.push(formatKey(shortcut.key));
  return pieces.join(' + ');
}

export function shortcutFromEvent(event) {
  const key = getShortcutKey(event);
  if (!key) return null;

  return {
    key,
    code: event.code,
    ctrl: event.ctrlKey,
    meta: event.metaKey,
    alt: event.altKey,
    shift: event.shiftKey,
  };
}

export function validateSettings(settings) {
  const errors = [];
  const previous = settings.shortcuts.previous;
  const next = settings.shortcuts.next;

  [
    ['previous', previous, '前のタブ'],
    ['next', next, '次のタブ'],
  ].forEach(([, shortcut, label]) => {
    if (!shortcut.key) {
      errors.push(`${label}のキーが未設定です。`);
      return;
    }

    if (isModifierOnlyKey(shortcut.key)) {
      errors.push(`${label}は修飾キー単体では登録できません。`);
      return;
    }

    if (!shortcut.ctrl && !shortcut.meta && !shortcut.alt && !shortcut.shift) {
      errors.push(`${label}は少なくとも1つ修飾キーを含めてください。`);
    }
  });

  if (shortcutToId(previous) && shortcutToId(previous) === shortcutToId(next)) {
    errors.push('前のタブと次のタブに同じショートカットは使えません。');
  }

  return errors;
}

export async function loadSettings() {
  const extensionStorage = getExtensionStorage();

  if (extensionStorage) {
    const result = await storageGet(extensionStorage, [SETTINGS_STORAGE_KEY]);
    return mergeSettings(result[SETTINGS_STORAGE_KEY]);
  }

  try {
    return mergeSettings(
      JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || 'null'),
    );
  } catch {
    return mergeSettings(null);
  }
}

export async function saveSettings(settings) {
  const extensionStorage = getExtensionStorage();

  if (extensionStorage) {
    await storageSet(extensionStorage, { [SETTINGS_STORAGE_KEY]: settings });
    return;
  }

  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

export async function loadBackgroundImage() {
  const extensionStorage = getExtensionStorage();

  if (extensionStorage) {
    const result = await storageGet(extensionStorage, [
      BACKGROUND_IMAGE_STORAGE_KEY,
    ]);
    const value = result[BACKGROUND_IMAGE_STORAGE_KEY];
    if (typeof value === 'string') return value;
  }

  return localStorage.getItem(LEGACY_BACKGROUND_STORAGE_KEY) || '';
}

export async function saveBackgroundImage(value) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  const extensionStorage = getExtensionStorage();

  if (extensionStorage) {
    if (normalized) {
      await storageSet(extensionStorage, {
        [BACKGROUND_IMAGE_STORAGE_KEY]: normalized,
      });
    } else {
      await storageRemove(extensionStorage, [BACKGROUND_IMAGE_STORAGE_KEY]);
    }
  }

  if (normalized) {
    localStorage.setItem(LEGACY_BACKGROUND_STORAGE_KEY, normalized);
  } else {
    localStorage.removeItem(LEGACY_BACKGROUND_STORAGE_KEY);
  }
}

function formatKey(key) {
  const labels = {
    ArrowLeft: '←',
    ArrowRight: '→',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ' ': 'Space',
  };

  return labels[key] || key.toUpperCase();
}
