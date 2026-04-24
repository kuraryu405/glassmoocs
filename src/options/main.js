import './options.css';
import {
  createDefaultSettings,
  isModifierOnlyKey,
  loadBackgroundImage,
  loadSettings,
  saveBackgroundImage,
  saveSettings,
  shortcutFromEvent,
  shortcutToLabel,
  validateSettings,
} from './settings.js';

const BACKGROUND_URL_ERROR =
  '背景画像は http:// または https:// のURLだけ使えます。';
const LOAD_ERROR_MESSAGE =
  '設定の読み込みに失敗しました。初期値で表示しています。';
const SAVE_ERROR_MESSAGE =
  '設定の保存に失敗しました。アドオンを再読み込みしてください。';
const SAVE_SUCCESS_MESSAGE =
  '保存しました。開いているMOOCSページにも自動で反映されます。';

const state = {
  settings: createDefaultSettings(),
  backgroundUrl: '',
  loading: true,
  recording: null,
  errors: [],
  savedMessage: '',
};

const elements = {
  settingsGrid: queryRequired('#settings-grid'),
  previousRecorder: queryRequired('#shortcut-previous'),
  previousLabel: queryRequired('#shortcut-previous-label'),
  previousButton: queryRequired('#shortcut-previous-button'),
  nextRecorder: queryRequired('#shortcut-next'),
  nextLabel: queryRequired('#shortcut-next-label'),
  nextButton: queryRequired('#shortcut-next-button'),
  colorTabsToggle: queryRequired('#color-tabs-toggle'),
  colorTabsState: queryRequired('#color-tabs-state'),
  reloadToggle: queryRequired('#reload-toggle'),
  reloadState: queryRequired('#reload-state'),
  backgroundInput: queryRequired('#background-url'),
  clearBackgroundButton: queryRequired('#clear-background-button'),
  backgroundNote: queryRequired('#background-note'),
  errorMessage: queryRequired('#error-message'),
  savedMessage: queryRequired('#saved-message'),
  resetButton: queryRequired('#reset-button'),
  saveButton: queryRequired('#save-button'),
};

bindEvents();
render();
loadInitialValues();

function queryRequired(selector) {
  const element = document.querySelector(selector);
  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }
  return element;
}

function bindEvents() {
  elements.previousButton.addEventListener('click', () =>
    beginRecording('previous'),
  );
  elements.nextButton.addEventListener('click', () => beginRecording('next'));

  elements.colorTabsToggle.addEventListener('click', () => {
    state.settings = {
      ...state.settings,
      colorTabsEnabled: !state.settings.colorTabsEnabled,
    };
    clearFeedback();
    render();
  });

  elements.reloadToggle.addEventListener('click', () => {
    state.settings = {
      ...state.settings,
      reloadAfterSubmit: !state.settings.reloadAfterSubmit,
    };
    clearFeedback();
    render();
  });

  elements.backgroundInput.addEventListener('input', (event) => {
    state.backgroundUrl = event.target.value;
    clearFeedback();
    render();
  });

  elements.clearBackgroundButton.addEventListener('click', () => {
    state.backgroundUrl = '';
    clearFeedback();
    render();
  });

  elements.resetButton.addEventListener('click', () => {
    state.settings = createDefaultSettings();
    state.backgroundUrl = '';
    state.recording = null;
    clearFeedback();
    render();
  });

  elements.saveButton.addEventListener('click', handleSave);
  window.addEventListener('keydown', handleRecordingKeyDown, true);
}

function clearFeedback() {
  state.savedMessage = '';
  state.errors = [];
}

function beginRecording(target) {
  state.recording = target;
  clearFeedback();
  render();
}

function handleRecordingKeyDown(event) {
  if (!state.recording) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  if (event.key === 'Escape') {
    state.recording = null;
    render();
    return;
  }

  if (isModifierOnlyKey(event.key)) {
    return;
  }

  const nextShortcut = shortcutFromEvent(event);
  if (!nextShortcut) {
    return;
  }

  state.settings = {
    ...state.settings,
    shortcuts: {
      ...state.settings.shortcuts,
      [state.recording]: nextShortcut,
    },
  };
  state.recording = null;
  clearFeedback();
  render();
}

function validateBackgroundUrl(value) {
  const normalized = value.trim();
  if (!normalized) {
    return '';
  }

  try {
    const { protocol } = new URL(normalized);
    if (protocol === 'http:' || protocol === 'https:') {
      return '';
    }
  } catch {
    return BACKGROUND_URL_ERROR;
  }

  return BACKGROUND_URL_ERROR;
}

function getValidationErrors() {
  const nextErrors = validateSettings(state.settings);
  const backgroundError = validateBackgroundUrl(state.backgroundUrl);
  if (backgroundError) {
    nextErrors.push(backgroundError);
  }
  return nextErrors;
}

async function loadInitialValues() {
  try {
    const [loadedSettings, loadedBackgroundImage] = await Promise.all([
      loadSettings(),
      loadBackgroundImage(),
    ]);
    state.settings = loadedSettings;
    state.backgroundUrl = loadedBackgroundImage;
  } catch {
    state.errors = [LOAD_ERROR_MESSAGE];
  } finally {
    state.loading = false;
    render();
  }
}

async function handleSave() {
  const nextErrors = getValidationErrors();
  if (nextErrors.length > 0) {
    state.errors = nextErrors;
    state.savedMessage = '';
    render();
    return;
  }

  try {
    await saveSettings(state.settings);
    await saveBackgroundImage(state.backgroundUrl);
    state.errors = [];
    state.savedMessage = SAVE_SUCCESS_MESSAGE;
  } catch {
    state.savedMessage = '';
    state.errors = [SAVE_ERROR_MESSAGE];
  }

  render();
}

function render() {
  renderLoadingState();
  renderShortcutRecorder(
    elements.previousRecorder,
    elements.previousLabel,
    elements.previousButton,
    state.settings.shortcuts.previous,
    state.recording === 'previous',
  );
  renderShortcutRecorder(
    elements.nextRecorder,
    elements.nextLabel,
    elements.nextButton,
    state.settings.shortcuts.next,
    state.recording === 'next',
  );

  renderToggle(
    elements.colorTabsToggle,
    elements.colorTabsState,
    state.settings.colorTabsEnabled,
  );
  renderToggle(
    elements.reloadToggle,
    elements.reloadState,
    state.settings.reloadAfterSubmit,
  );

  const backgroundInputValue = state.backgroundUrl.startsWith('data:')
    ? ''
    : state.backgroundUrl;
  if (elements.backgroundInput.value !== backgroundInputValue) {
    elements.backgroundInput.value = backgroundInputValue;
  }
  elements.backgroundNote.textContent = state.backgroundUrl
    ? '入力したURLを次回保存時に反映します。'
    : '背景画像は未設定です。';

  renderMessages();
}

function renderLoadingState() {
  elements.settingsGrid.setAttribute(
    'aria-busy',
    state.loading ? 'true' : 'false',
  );
  elements.saveButton.disabled = state.loading;
}

function renderShortcutRecorder(
  recorderElement,
  labelElement,
  buttonElement,
  shortcut,
  active,
) {
  recorderElement.className = active
    ? 'shortcut-recorder recording'
    : 'shortcut-recorder';
  labelElement.textContent = active
    ? 'キー入力待ち...'
    : shortcutToLabel(shortcut);
  buttonElement.textContent = active ? 'Escでキャンセル' : '録画する';
}

function renderToggle(toggleElement, stateElement, enabled) {
  toggleElement.className = enabled ? 'toggle-card active' : 'toggle-card';
  toggleElement.setAttribute('aria-pressed', enabled ? 'true' : 'false');
  stateElement.textContent = enabled ? 'ON' : 'OFF';
}

function renderMessages() {
  if (state.errors.length > 0) {
    elements.errorMessage.hidden = false;
    clearElementChildren(elements.errorMessage);
    state.errors.forEach((error) => {
      const line = document.createElement('p');
      line.textContent = error;
      elements.errorMessage.appendChild(line);
    });
  } else {
    elements.errorMessage.hidden = true;
    clearElementChildren(elements.errorMessage);
  }

  if (state.savedMessage) {
    elements.savedMessage.hidden = false;
    elements.savedMessage.textContent = state.savedMessage;
  } else {
    elements.savedMessage.hidden = true;
    elements.savedMessage.textContent = '';
  }
}

function clearElementChildren(element) {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}
