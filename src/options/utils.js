import { LOCKED_TAB_MODE, TAB_THEME_PRESETS } from './constants.js';

export function validateBackgroundUrl(value, backgroundUrlError) {
  const normalized = value.trim();
  if (!normalized) return '';

  try {
    const { protocol } = new URL(normalized);
    if (protocol === 'http:' || protocol === 'https:') {
      return '';
    }
  } catch {
    return backgroundUrlError;
  }

  return backgroundUrlError;
}

export function normalizeSettingsForOptions(rawSettings) {
  return {
    ...rawSettings,
    tabColorMode: LOCKED_TAB_MODE,
  };
}

export function createSettingsSnapshot(rawSettings, rawBackgroundUrl) {
  return JSON.stringify({
    settings: normalizeSettingsForOptions(rawSettings),
    backgroundUrl:
      typeof rawBackgroundUrl === 'string' ? rawBackgroundUrl.trim() : '',
  });
}

export function getBackgroundPreviewHost(value) {
  if (!value) return '';
  if (value.startsWith('data:')) return '保存済みの背景画像データ';

  try {
    return new URL(value).host;
  } catch {
    return 'URL形式を確認してください';
  }
}

export function hexToRgb(hex) {
  if (typeof hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(hex)) {
    return null;
  }

  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  };
}

export function toAlphaColor(hex, alpha) {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(15, 23, 42, ${alpha})`;

  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

export function getActiveThemeKey(tabColors) {
  const matchedPreset = TAB_THEME_PRESETS.find((preset) =>
    Object.entries(preset.colors).every(
      ([key, color]) => tabColors?.[key] === color,
    ),
  );
  return matchedPreset ? matchedPreset.key : '';
}
