import { useEffect, useState } from 'react';
import {
  createDefaultSettings,
  DEFAULT_TAB_COLORS,
  isModifierOnlyKey,
  loadBackgroundImage,
  loadSettings,
  saveBackgroundImage,
  saveSettings,
  shortcutFromEvent,
  validateSettings,
} from '../settings.js';
import {
  BACKGROUND_URL_ERROR,
  LOAD_ERROR_MESSAGE,
  RESET_CONFIRM_MESSAGE,
  SAVE_ERROR_MESSAGE,
} from '../constants.js';
import {
  createSettingsSnapshot,
  normalizeSettingsForOptions,
  validateBackgroundUrl,
} from '../utils.js';

export function useOptionsSettings() {
  const [settings, setSettings] = useState(createDefaultSettings);
  const [backgroundUrl, setBackgroundUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [recording, setRecording] = useState(null);
  const [tabDetailsOpen, setTabDetailsOpen] = useState(false);
  const [errors, setErrors] = useState([]);
  const [savedMessage, setSavedMessage] = useState('');
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState('');

  function clearFeedback() {
    setSavedMessage('');
    setErrors([]);
  }

  function applySettingsPatch(patch) {
    setSettings((current) => ({
      ...current,
      ...patch,
    }));
    clearFeedback();
  }

  function getValidationErrors() {
    const nextErrors = validateSettings(settings);
    const backgroundError = validateBackgroundUrl(
      backgroundUrl,
      BACKGROUND_URL_ERROR,
    );
    if (backgroundError) {
      nextErrors.push(backgroundError);
    }
    return nextErrors;
  }

  useEffect(() => {
    let mounted = true;

    Promise.all([loadSettings(), loadBackgroundImage()])
      .then(([loadedSettings, loadedBackgroundImage]) => {
        if (!mounted) return;

        const normalizedSettings = normalizeSettingsForOptions(loadedSettings);
        setSettings(normalizedSettings);
        setBackgroundUrl(loadedBackgroundImage);
        setLastSavedSnapshot(
          createSettingsSnapshot(normalizedSettings, loadedBackgroundImage),
        );
      })
      .catch(() => {
        if (!mounted) return;

        const defaultSettings = normalizeSettingsForOptions(
          createDefaultSettings(),
        );
        setSettings(defaultSettings);
        setBackgroundUrl('');
        setLastSavedSnapshot(createSettingsSnapshot(defaultSettings, ''));
        setErrors([LOAD_ERROR_MESSAGE]);
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!recording) return undefined;

    const handleKeyDown = (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (event.key === 'Escape') {
        setRecording(null);
        return;
      }

      if (isModifierOnlyKey(event.key)) {
        return;
      }

      const nextShortcut = shortcutFromEvent(event);
      if (!nextShortcut) return;

      setSettings((current) => ({
        ...current,
        shortcuts: {
          ...current.shortcuts,
          [recording]: nextShortcut,
        },
      }));
      clearFeedback();
      setRecording(null);
    };

    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [recording]);

  async function handleSave() {
    const nextErrors = getValidationErrors();

    if (nextErrors.length > 0) {
      setErrors(nextErrors);
      setSavedMessage('');
      return;
    }

    try {
      const normalizedSettings = normalizeSettingsForOptions(settings);
      await saveSettings(normalizedSettings);
      await saveBackgroundImage(backgroundUrl);
      setErrors([]);
      setSavedMessage('直前の変更を保存しました。');
      setLastSavedSnapshot(
        createSettingsSnapshot(normalizedSettings, backgroundUrl),
      );
    } catch {
      setSavedMessage('');
      setErrors([SAVE_ERROR_MESSAGE]);
    }
  }

  function setColorTabsEnabled(colorTabsEnabled) {
    applySettingsPatch({ colorTabsEnabled });
  }

  function setReloadAfterSubmit(reloadAfterSubmit) {
    applySettingsPatch({ reloadAfterSubmit });
  }

  function setDebugLoggingEnabled(debugLoggingEnabled) {
    applySettingsPatch({ debugLoggingEnabled });
  }

  function setTabColor(kind, color) {
    setSettings((current) => ({
      ...current,
      tabColors: {
        ...current.tabColors,
        [kind]: color,
      },
    }));
    clearFeedback();
  }

  function setTabTheme(colors) {
    setSettings((current) => ({
      ...current,
      tabColors: { ...colors },
    }));
    clearFeedback();
  }

  function resetTabColors() {
    setSettings((current) => ({
      ...current,
      tabColors: { ...DEFAULT_TAB_COLORS },
    }));
    clearFeedback();
  }

  function handleBackgroundUrlChange(event) {
    setBackgroundUrl(event.target.value);
    clearFeedback();
  }

  function clearBackgroundImage() {
    setBackgroundUrl('');
    clearFeedback();
  }

  function resetDefaults() {
    if (!globalThis.confirm?.(RESET_CONFIRM_MESSAGE)) {
      return;
    }

    setSettings(createDefaultSettings());
    setBackgroundUrl('');
    clearFeedback();
    setRecording(null);
    setTabDetailsOpen(false);
  }

  const currentSnapshot = createSettingsSnapshot(settings, backgroundUrl);
  const isDirty = !loading && currentSnapshot !== lastSavedSnapshot;
  const hasStoredDataImage = backgroundUrl.trim().startsWith('data:');
  const backgroundInputValue = hasStoredDataImage ? '' : backgroundUrl;
  const backgroundIsValid =
    hasStoredDataImage ||
    !validateBackgroundUrl(backgroundUrl, BACKGROUND_URL_ERROR);

  return {
    settings,
    backgroundUrl,
    loading,
    recording,
    tabDetailsOpen,
    errors,
    savedMessage,
    isDirty,
    hasStoredDataImage,
    backgroundInputValue,
    backgroundIsValid,
    setRecording,
    setTabDetailsOpen,
    setColorTabsEnabled,
    setDebugLoggingEnabled,
    setReloadAfterSubmit,
    setTabColor,
    setTabTheme,
    resetTabColors,
    handleBackgroundUrlChange,
    clearBackgroundImage,
    resetDefaults,
    handleSave,
  };
}
