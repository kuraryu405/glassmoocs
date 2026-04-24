import { useEffect, useState } from 'react';
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

export default function App() {
  const [settings, setSettings] = useState(createDefaultSettings);
  const [backgroundUrl, setBackgroundUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [recording, setRecording] = useState(null);
  const [errors, setErrors] = useState([]);
  const [savedMessage, setSavedMessage] = useState('');

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

  function validateBackgroundUrl(value) {
    const normalized = value.trim();
    if (!normalized) return '';

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
    const nextErrors = validateSettings(settings);
    const backgroundError = validateBackgroundUrl(backgroundUrl);
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

        setSettings(loadedSettings);
        setBackgroundUrl(loadedBackgroundImage);
      })
      .catch(() => {
        if (!mounted) return;

        setErrors([LOAD_ERROR_MESSAGE]);
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
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

  function setReloadAfterSubmit(reloadAfterSubmit) {
    applySettingsPatch({ reloadAfterSubmit });
  }

  function setColorTabsEnabled(colorTabsEnabled) {
    applySettingsPatch({ colorTabsEnabled });
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
    setSettings(createDefaultSettings());
    setBackgroundUrl('');
    clearFeedback();
    setRecording(null);
  }

  async function handleSave() {
    const nextErrors = getValidationErrors();

    if (nextErrors.length > 0) {
      setErrors(nextErrors);
      setSavedMessage('');
      return;
    }

    try {
      await saveSettings(settings);
      await saveBackgroundImage(backgroundUrl);
      setErrors([]);
      setSavedMessage(SAVE_SUCCESS_MESSAGE);
    } catch {
      setSavedMessage('');
      setErrors([SAVE_ERROR_MESSAGE]);
    }
  }

  const backgroundInputValue = backgroundUrl.startsWith('data:')
    ? ''
    : backgroundUrl;

  return (
    <main className="settings-shell">
      <section className="hero-card">
        <p className="eyebrow">GlassMOOCs</p>
        <h1>MOOCSを、もっと手に馴染む画面へ。</h1>
        <p className="lead">
          スライド上部の番号タブをショートカットで移動し、出席テストや課題ページを色で見分けられるようにします。
        </p>
      </section>

      <section className="settings-grid" aria-busy={loading}>
        <article className="panel shortcut-panel">
          <SectionHeading
            step="01"
            title="タブ移動ショートカット"
            description="ボタンを押してから、使いたいキーの組み合わせを入力してください。"
          />

          <ShortcutRecorder
            title="前のタブ"
            value={settings.shortcuts.previous}
            active={recording === 'previous'}
            onStart={() => setRecording('previous')}
          />
          <ShortcutRecorder
            title="次のタブ"
            value={settings.shortcuts.next}
            active={recording === 'next'}
            onStart={() => setRecording('next')}
          />

          <p className="hint">
            入力欄、Markdownエディタ、コードエディタ上では誤爆防止のためタブ移動ショートカットを無効化します。
          </p>
        </article>

        <article className="panel">
          <SectionHeading
            step="02"
            title="タブ表示"
            description="出席テスト、出席課題、課題、理解度確認、スライドをタイトルから自動判定して、全面カラーで表示します。"
          />

          <ToggleCard
            enabled={settings.colorTabsEnabled}
            title="全面カラーを使う"
            description="ON のときだけ、タブ全体を色で塗って種類を見分けます。"
            onToggle={() => setColorTabsEnabled(!settings.colorTabsEnabled)}
          />
        </article>

        <article className="panel">
          <SectionHeading
            step="03"
            title="提出後の自動リロード"
            description="出席課題や課題の「提出」成功ダイアログを閉じたあと、ページを自動で再読み込みします。"
          />

          <ToggleCard
            enabled={settings.reloadAfterSubmit}
            title="提出後にページを更新する"
            description="初期値はOFFです。保存成功メッセージのあとにだけ再読み込みします。"
            onToggle={() => setReloadAfterSubmit(!settings.reloadAfterSubmit)}
          />
        </article>

        <article className="panel">
          <SectionHeading
            step="04"
            title="背景画像"
            description="初期状態では背景なしです。画像URLを貼るか、Shift+Alt+Bで設定できます。"
          />

          <div className="background-editor">
            <label className="field-label" htmlFor="background-url">
              画像URL
            </label>
            <input
              id="background-url"
              className="text-field"
              type="url"
              placeholder="https://example.com/background.jpg"
              value={backgroundInputValue}
              onChange={handleBackgroundUrlChange}
            />

            <div className="background-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={clearBackgroundImage}
              >
                背景を消す
              </button>
            </div>

            <p className="background-note">
              {backgroundUrl
                ? '入力したURLを次回保存時に反映します。'
                : '背景画像は未設定です。'}
            </p>
          </div>
        </article>
      </section>

      <section className="status-panel">
        {errors.length > 0 && (
          <div className="message error" role="alert">
            {errors.map((error) => (
              <p key={error}>{error}</p>
            ))}
          </div>
        )}
        {savedMessage && <p className="message success">{savedMessage}</p>}

        <div className="actions">
          <button
            type="button"
            className="ghost-button"
            onClick={resetDefaults}
          >
            初期値に戻す
          </button>
          <button
            type="button"
            className="save-button"
            onClick={handleSave}
            disabled={loading}
          >
            設定を保存
          </button>
        </div>
      </section>
    </main>
  );
}

function SectionHeading({ step, title, description }) {
  return (
    <div className="section-heading">
      <span>{step}</span>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </div>
  );
}

function ToggleCard({ enabled, title, description, onToggle }) {
  return (
    <button
      type="button"
      className={enabled ? 'toggle-card active' : 'toggle-card'}
      onClick={onToggle}
      aria-pressed={enabled}
    >
      <div className="toggle-copy">
        <strong>{title}</strong>
        <small>{description}</small>
      </div>
      <span className="toggle-meta">
        <span className="toggle-state">{enabled ? 'ON' : 'OFF'}</span>
        <span className="toggle-switch" aria-hidden="true">
          <span />
        </span>
      </span>
    </button>
  );
}

function ShortcutRecorder({ title, value, active, onStart }) {
  return (
    <div
      className={active ? 'shortcut-recorder recording' : 'shortcut-recorder'}
    >
      <div>
        <span>{title}</span>
        <strong>{active ? 'キー入力待ち...' : shortcutToLabel(value)}</strong>
      </div>
      <button type="button" onClick={onStart}>
        {active ? 'Escでキャンセル' : '録画する'}
      </button>
    </div>
  );
}
