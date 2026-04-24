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

export default function App() {
  const [settings, setSettings] = useState(createDefaultSettings);
  const [backgroundUrl, setBackgroundUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [recording, setRecording] = useState(null);
  const [errors, setErrors] = useState([]);
  const [savedMessage, setSavedMessage] = useState('');

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

        setErrors(['設定の読み込みに失敗しました。初期値で表示しています。']);
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
      setRecording(null);
      setSavedMessage('');
      setErrors([]);
    };

    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [recording]);

  function setReloadAfterSubmit(reloadAfterSubmit) {
    setSettings((current) => ({
      ...current,
      reloadAfterSubmit,
    }));
    setSavedMessage('');
    setErrors([]);
  }

  function setColorTabsEnabled(colorTabsEnabled) {
    setSettings((current) => ({
      ...current,
      colorTabsEnabled,
    }));
    setSavedMessage('');
    setErrors([]);
  }

  function handleBackgroundUrlChange(event) {
    setBackgroundUrl(event.target.value);
    setSavedMessage('');
    setErrors([]);
  }

  function clearBackgroundImage() {
    setBackgroundUrl('');
    setSavedMessage('');
    setErrors([]);
  }

  function validateBackgroundUrl(value) {
    const normalized = value.trim();
    if (!normalized) return '';

    try {
      const url = new URL(normalized);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        return '';
      }
    } catch {
      return '背景画像は http:// または https:// のURLだけ使えます。';
    }

    return '背景画像は http:// または https:// のURLだけ使えます。';
  }

  function resetDefaults() {
    setSettings(createDefaultSettings());
    setBackgroundUrl('');
    setSavedMessage('');
    setErrors([]);
    setRecording(null);
  }

  async function handleSave() {
    const nextErrors = validateSettings(settings);
    const backgroundError = validateBackgroundUrl(backgroundUrl);

    if (backgroundError) {
      nextErrors.push(backgroundError);
    }

    if (nextErrors.length > 0) {
      setErrors(nextErrors);
      setSavedMessage('');
      return;
    }

    try {
      await saveSettings(settings);
      await saveBackgroundImage(backgroundUrl);
      setErrors([]);
      setSavedMessage(
        '保存しました。開いているMOOCSページにも自動で反映されます。',
      );
    } catch {
      setSavedMessage('');
      setErrors([
        '設定の保存に失敗しました。アドオンを再読み込みしてください。',
      ]);
    }
  }

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
          <div className="section-heading">
            <span>01</span>
            <div>
              <h2>タブ移動ショートカット</h2>
              <p>
                ボタンを押してから、使いたいキーの組み合わせを入力してください。
              </p>
            </div>
          </div>

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
          <div className="section-heading">
            <span>02</span>
            <div>
              <h2>タブ表示</h2>
              <p>
                出席テスト、出席課題、課題、理解度確認、スライドをタイトルから自動判定して、全面カラーで表示します。
              </p>
            </div>
          </div>

          <button
            type="button"
            className={
              settings.colorTabsEnabled ? 'toggle-card active' : 'toggle-card'
            }
            onClick={() => setColorTabsEnabled(!settings.colorTabsEnabled)}
            aria-pressed={settings.colorTabsEnabled}
          >
            <div className="toggle-copy">
              <strong>全面カラーを使う</strong>
              <small>
                ON のときだけ、タブ全体を色で塗って種類を見分けます。
              </small>
            </div>
            <span className="toggle-meta">
              <span className="toggle-state">
                {settings.colorTabsEnabled ? 'ON' : 'OFF'}
              </span>
              <span className="toggle-switch" aria-hidden="true">
                <span />
              </span>
            </span>
          </button>
        </article>

        <article className="panel">
          <div className="section-heading">
            <span>03</span>
            <div>
              <h2>提出後の自動リロード</h2>
              <p>
                出席課題や課題の「提出」成功ダイアログを閉じたあと、ページを自動で再読み込みします。
              </p>
            </div>
          </div>

          <button
            type="button"
            className={
              settings.reloadAfterSubmit ? 'toggle-card active' : 'toggle-card'
            }
            onClick={() => setReloadAfterSubmit(!settings.reloadAfterSubmit)}
            aria-pressed={settings.reloadAfterSubmit}
          >
            <div className="toggle-copy">
              <strong>提出後にページを更新する</strong>
              <small>
                初期値はOFFです。保存成功メッセージのあとにだけ再読み込みします。
              </small>
            </div>
            <span className="toggle-meta">
              <span className="toggle-state">
                {settings.reloadAfterSubmit ? 'ON' : 'OFF'}
              </span>
              <span className="toggle-switch" aria-hidden="true">
                <span />
              </span>
            </span>
          </button>
        </article>

        <article className="panel">
          <div className="section-heading">
            <span>04</span>
            <div>
              <h2>背景画像</h2>
              <p>
                初期状態では背景なしです。画像URLを貼るか、ローカル画像をアップロードして使えます。
              </p>
            </div>
          </div>

          <div className="background-editor">
            <label className="field-label" htmlFor="background-url">
              画像URL
            </label>
            <input
              id="background-url"
              className="text-field"
              type="url"
              placeholder="https://example.com/background.jpg"
              value={backgroundUrl.startsWith('data:') ? '' : backgroundUrl}
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
