export const SETTINGS_STORAGE_KEY = 'glassmoocs_settings';
export const BACKGROUND_IMAGE_STORAGE_KEY = 'glassmoocs_background_image';
const LEGACY_BACKGROUND_STORAGE_KEY = 'iniad_bg_image';
export const COLOR_MODES = {
  full: 'full',
};
export const DEFAULT_TAB_COLORS = {
  attendanceTest: '#f59e0b',
  attendanceAssignment: '#06b6d4',
  assignment: '#f43f5e',
  check: '#8b5cf6',
  slide: '#38bdf8',
};
export const TAB_COLOR_OPTIONS = [
  { key: 'attendanceTest', label: '出席テスト' },
  { key: 'attendanceAssignment', label: '出席課題' },
  { key: 'assignment', label: '課題' },
  { key: 'check', label: '理解度確認 / テスト / 確認' },
  { key: 'slide', label: 'スライド / 資料' },
];

const MODIFIER_KEYS = new Set(['Meta', 'Shift', 'Alt', 'Control']);
const UNRELIABLE_KEYS = new Set(['Process', 'Unidentified', 'Dead', 'Compose']);
const CODE_KEY_LABELS = {
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
const DISPLAY_KEY_LABELS = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ' ': 'Space',
};

/**
 * @typedef {Object} Shortcut
 * @property {string} key
 * @property {string} code
 * @property {boolean} ctrl
 * @property {boolean} meta
 * @property {boolean} alt
 * @property {boolean} shift
 */

/**
 * @typedef {Object} GlassmoocsSettings
 * @property {{previous: Shortcut, next: Shortcut}} shortcuts
 * @property {string} tabColorMode
 * @property {boolean} colorTabsEnabled
 * @property {{attendanceTest: string, attendanceAssignment: string, assignment: string, check: string, slide: string}} tabColors
 * @property {boolean} reloadAfterSubmit
 */

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

function callStorageArea(storage, method, payload) {
  if (storage.promiseBased) {
    return storage.area[method](payload);
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const settleResolve = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const settleReject = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    try {
      storage.area[method](payload, (result) => {
        const error = globalThis.chrome?.runtime?.lastError;
        if (error) {
          settleReject(new Error(error.message));
          return;
        }

        settleResolve(result);
      });
    } catch (error) {
      settleReject(error);
    }
  });
}

function storageGet(storage, keys) {
  return callStorageArea(storage, 'get', keys);
}

function storageSet(storage, values) {
  return callStorageArea(storage, 'set', values).then(() => {});
}

function storageRemove(storage, keys) {
  return callStorageArea(storage, 'remove', keys).then(() => {});
}

export function isMacLike() {
  return /Mac|iPhone|iPad|iPod/i.test(
    navigator.platform || navigator.userAgent || '',
  );
}

function createDefaultShortcut(key, isMac) {
  return {
    key,
    code: key,
    ctrl: !isMac,
    meta: isMac,
    alt: false,
    shift: false,
  };
}

export function createDefaultSettings() {
  const isMac = isMacLike();

  return {
    shortcuts: {
      previous: createDefaultShortcut('ArrowLeft', isMac),
      next: createDefaultShortcut('ArrowRight', isMac),
    },
    tabColorMode: COLOR_MODES.full,
    colorTabsEnabled: true,
    tabColors: { ...DEFAULT_TAB_COLORS },
    reloadAfterSubmit: false,
  };
}

function getObjectOrEmpty(value) {
  return value && typeof value === 'object' ? value : {};
}

function mergeShortcut(defaultShortcut, rawShortcut) {
  return {
    ...defaultShortcut,
    ...getObjectOrEmpty(rawShortcut),
  };
}

function normalizeTabColor(value, fallback) {
  if (typeof value !== 'string') return fallback;

  const normalized = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(normalized)) {
    return normalized;
  }

  return fallback;
}

function mergeTabColors(rawTabColors) {
  const raw = getObjectOrEmpty(rawTabColors);

  return Object.fromEntries(
    Object.entries(DEFAULT_TAB_COLORS).map(([key, fallback]) => [
      key,
      normalizeTabColor(raw[key], fallback),
    ]),
  );
}

export function mergeSettings(rawSettings) {
  const defaults = createDefaultSettings();
  const raw = getObjectOrEmpty(rawSettings);
  const rawShortcuts = getObjectOrEmpty(raw.shortcuts);

  return {
    shortcuts: {
      previous: mergeShortcut(
        defaults.shortcuts.previous,
        rawShortcuts.previous,
      ),
      next: mergeShortcut(defaults.shortcuts.next, rawShortcuts.next),
    },
    tabColorMode: COLOR_MODES.full,
    colorTabsEnabled:
      typeof raw.colorTabsEnabled === 'boolean'
        ? raw.colorTabsEnabled
        : defaults.colorTabsEnabled,
    tabColors: mergeTabColors(raw.tabColors),
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
  return MODIFIER_KEYS.has(key);
}

function isUnreliableKey(key) {
  return UNRELIABLE_KEYS.has(key);
}

function keyFromCode(code) {
  if (!code) return '';
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Numpad[0-9]$/.test(code)) return code.slice(6);

  return CODE_KEY_LABELS[code] || code;
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
  const { previous, next } = settings.shortcuts;
  const shortcutTargets = [
    { shortcut: previous, label: '前のタブ' },
    { shortcut: next, label: '次のタブ' },
  ];

  shortcutTargets.forEach(({ shortcut, label }) => {
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

  const previousShortcutId = shortcutToId(previous);
  const nextShortcutId = shortcutToId(next);
  if (previousShortcutId && previousShortcutId === nextShortcutId) {
    errors.push('前のタブと次のタブに同じショートカットは使えません。');
  }

  TAB_COLOR_OPTIONS.forEach(({ key, label }) => {
    const color = settings.tabColors?.[key];
    if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) {
      errors.push(`${label}の色が不正です。`);
    }
  });

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
  return DISPLAY_KEY_LABELS[key] || key.toUpperCase();
}
