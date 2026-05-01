import { DEBUG_LOGS_ENABLED, shortcutToLabel } from './settings.js';
import {
  BACKGROUND_SHORTCUT_LABEL,
  LOCKED_TAB_MODE_COPY,
  SECONDARY_TAB_COLOR_OPTIONS,
  TAB_THEME_PRESETS,
} from './constants.js';
import { SectionHeading } from './components/SectionHeading.jsx';
import { ToggleCard } from './components/ToggleCard.jsx';
import { ShortcutRecorder } from './components/ShortcutRecorder.jsx';
import { ThemePresetButton } from './components/ThemePresetButton.jsx';
import {
  BackgroundScenePreview,
  TabAppearancePreview,
} from './components/TabPreviews.jsx';
import { TabColorField } from './components/TabColorField.jsx';
import { useOptionsSettings } from './hooks/useOptionsSettings.js';
import { getActiveThemeKey, getBackgroundPreviewHost } from './utils.js';

export default function App() {
  const {
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
  } = useOptionsSettings();

  const backgroundPreviewUrl = backgroundUrl.trim();
  const backgroundPreviewHost = getBackgroundPreviewHost(backgroundPreviewUrl);
  const slideTabColor = settings.tabColors.slide;
  const activeThemeKey = getActiveThemeKey(settings.tabColors);
  const backgroundNote = hasStoredDataImage
    ? '保存済みの背景画像があります。URLを入力して保存すると上書きします。'
    : backgroundUrl
      ? '保存前でも下のライブプレビューで見え方を確認できます。'
      : '背景画像は未設定です。';

  return (
    <main className="settings-shell">
      <section className="hero-card">
        <div className="hero-copy">
          <p className="eyebrow">GLASSMOOCS SETTINGS</p>
          <h1>GlassMOOCs Options</h1>
          <p className="lead">
            毎日触る項目だけを、拡張機能らしい密度でまとめた設定画面です。
          </p>
          <p className="hero-caption">
            見た目を飾るより、タブの判別・移動・背景確認をすばやく調整できる構成に寄せています。
          </p>

          <div className="hero-pills" aria-label="主な機能">
            <span>表示</span>
            <span>ショートカット</span>
            <span>提出後の動作</span>
            <span>背景</span>
            {DEBUG_LOGS_ENABLED ? <span>ログ</span> : null}
          </div>
        </div>

        <div className="hero-stage" aria-hidden="true">
          <div className="hero-preview">
            <div className="hero-preview-bar">
              <span />
              <span />
              <span />
            </div>
            <div className="hero-preview-tabs">
              <span className="hero-preview-tab warm">出席</span>
              <span className="hero-preview-tab cool">資料</span>
              <span className="hero-preview-tab accent">課題</span>
            </div>
            <div className="hero-preview-panel">
              <p className="field-label">クイックサマリー</p>
              <strong>必要な設定を上から順に整える</strong>
              <small>
                色分け、ショートカット、背景画像の3点をここから確認できます。
              </small>
            </div>
          </div>

          <div className="hero-facts">
            <div className="hero-fact">
              <small>ショートカット</small>
              <strong>
                {shortcutToLabel(settings.shortcuts.previous)} /{' '}
                {shortcutToLabel(settings.shortcuts.next)}
              </strong>
            </div>
            <div className="hero-fact">
              <small>タブ配色</small>
              <strong>
                {settings.colorTabsEnabled
                  ? activeThemeKey
                    ? TAB_THEME_PRESETS.find(
                        (preset) => preset.key === activeThemeKey,
                      )?.label
                    : 'カスタム'
                  : 'OFF'}
              </strong>
            </div>
            <div className="hero-fact">
              <small>背景画像</small>
              <strong>{backgroundPreviewHost || '未設定'}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="settings-flow" aria-busy={loading}>
        <article id="tab-display" className="panel panel-emphasis">
          <SectionHeading
            eyebrow="表示"
            title="タブ表示"
            description="色分けを使うか決めて、必要ならテーマと詳細色を調整します。"
          />

          <div className="panel-stack">
            <ToggleCard
              enabled={settings.colorTabsEnabled}
              title="タブを色分けする"
              description="画面上部のタブを種類ごとに見分けやすくします。OFF にしても色設定は保持されます。"
              onToggle={() => setColorTabsEnabled(!settings.colorTabsEnabled)}
            />

            <div className="tab-basics-grid">
              <div className="mode-locked-card" aria-label="タブ表示モード">
                <div className="mode-preview" data-mode="full">
                  <span>1</span>
                  <span>2</span>
                  <span>3</span>
                </div>
                <div className="mode-locked-copy">
                  <p className="field-label">表示モード</p>
                  <strong>{LOCKED_TAB_MODE_COPY.title}で固定</strong>
                  <small>
                    {LOCKED_TAB_MODE_COPY.description}
                    色の違いだけに集中できるよう、見分け方は1種類に絞っています。
                  </small>
                </div>
              </div>

              <div className="theme-picker-card">
                <div className="theme-picker-copy">
                  <p className="field-label">おすすめテーマ</p>
                  <p className="tab-color-subtitle">
                    最初から全色を決めなくても使えるように、まとめて切り替えられるテーマを用意しました。
                  </p>
                </div>
                <div className="theme-preset-grid">
                  {TAB_THEME_PRESETS.map((preset) => (
                    <ThemePresetButton
                      key={preset.key}
                      preset={preset}
                      active={activeThemeKey === preset.key}
                      onSelect={() => setTabTheme(preset.colors)}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="slide-color-focus">
              <div className="slide-color-focus-copy">
                <p className="field-label">現在の見え方</p>
                <p className="tab-color-subtitle">
                  「資料」タブが授業資料に対応します。まずこの色だけ整えると、日常利用での迷いが減ります。
                </p>
              </div>

              <TabAppearancePreview
                enabled={settings.colorTabsEnabled}
                tabColors={settings.tabColors}
              />
              <p className="tab-preview-note">
                下の色設定を変更すると、このプレビューに反映されます。
              </p>

              <TabColorField
                label="スライド / 資料"
                value={slideTabColor}
                onChange={(color) => setTabColor('slide', color)}
                description="背景プレビューにも同じ色を反映します。選択中はチェックで表示します。"
                featured
              />
            </div>

            <div className="detail-disclosure">
              <div className="detail-disclosure-copy">
                <p className="field-label">詳細設定</p>
                <p className="tab-color-subtitle">
                  出席や課題など、他カテゴリの色も必要ならここで個別に調整できます。
                </p>
              </div>
              <button
                type="button"
                className="ghost-button"
                aria-expanded={tabDetailsOpen}
                onClick={() => setTabDetailsOpen((current) => !current)}
              >
                {tabDetailsOpen
                  ? '詳細カラー設定を閉じる'
                  : '詳細カラー設定を開く'}
              </button>
            </div>

            {tabDetailsOpen && (
              <div className="tab-color-editor">
                <div className="tab-color-header">
                  <div>
                    <p className="field-label">カテゴリごとの色</p>
                    <p className="tab-color-subtitle">
                      パレットから選ぶか、カラーピッカーで細かく調整できます。
                    </p>
                  </div>
                  <button
                    type="button"
                    className="ghost-button compact"
                    onClick={resetTabColors}
                  >
                    既定色に戻す
                  </button>
                </div>

                <div className="tab-color-grid">
                  {SECONDARY_TAB_COLOR_OPTIONS.map((option) => (
                    <TabColorField
                      key={option.key}
                      label={option.label}
                      value={settings.tabColors[option.key]}
                      onChange={(color) => setTabColor(option.key, color)}
                    />
                  ))}
                </div>

                <p className="tab-color-note">
                  タブの種類はタイトル内の文言から自動判定しています。表記ゆれや例外には完全には対応できないため、100%の精度は保証していません。
                </p>
              </div>
            )}
          </div>
        </article>

        <div className="secondary-grid">
          <article id="shortcuts" className="panel">
            <SectionHeading
              eyebrow="操作"
              title="ショートカット"
              description="前後のタブ移動に使うキーを設定します。入力欄では自動で無効化されます。"
            />

            <div className="panel-stack">
              <ShortcutRecorder
                title="前のタブへ移動"
                value={settings.shortcuts.previous}
                active={recording === 'previous'}
                onStart={() => setRecording('previous')}
              />
              <ShortcutRecorder
                title="次のタブへ移動"
                value={settings.shortcuts.next}
                active={recording === 'next'}
                onStart={() => setRecording('next')}
              />

              <div className="support-block">
                <p className="hint">
                  注意: 文字入力欄では自動で無効化します。`Cmd + ← / →`
                  はブラウザやOS標準操作と競合する場合があります。
                </p>
              </div>
            </div>
          </article>

          <article id="post-submit" className="panel">
            <SectionHeading
              eyebrow="動作"
              title="提出後の動作"
              description="提出完了後にページを更新するかを切り替えます。"
            />

            <div className="panel-stack">
              <ToggleCard
                enabled={settings.reloadAfterSubmit}
                title="提出後にページを更新する"
                description="提出済み表示を早く反映したいときに有効です。初期値は OFF です。"
                onToggle={() =>
                  setReloadAfterSubmit(!settings.reloadAfterSubmit)
                }
              />

              <div className="support-block">
                <p className="hint">
                  ON
                  にすると提出完了後に必要な画面だけ再読み込みします。提出済み表示の反映を早めたいとき向けです。
                </p>
              </div>
            </div>
          </article>

          {DEBUG_LOGS_ENABLED ? (
            <article id="debug-log" className="panel">
              <SectionHeading
                eyebrow="診断"
                title="デバッグログ"
                description="ダウンロード不具合の調査用です。通常は OFF のままにします。"
              />

              <div className="panel-stack">
                <ToggleCard
                  enabled={settings.debugLoggingEnabled}
                  title="構造化デバッグログを有効にする"
                  description="content / background / Slides exporter の主要イベントを 127.0.0.1:7443 に送ります。"
                  onToggle={() =>
                    setDebugLoggingEnabled(!settings.debugLoggingEnabled)
                  }
                />

                <div className="support-block">
                  <p className="hint">
                    ログ受け口を立ててから使ってください。通常動作では不要です。
                    `glassmoocs_debug_log=1`
                    をURLに付けると、そのページだけ一時的に有効化することもできます。
                  </p>
                </div>
              </div>
            </article>
          ) : null}
        </div>

        <article id="background" className="panel">
          <SectionHeading
            eyebrow="背景"
            title="背景画像"
            description="MOOCS の背景画像 URL を設定します。下でプレビューも確認できます。"
          />

          <div className="panel-stack">
            <div className="shortcut-callout">
              <span className="shortcut-chip">{BACKGROUND_SHORTCUT_LABEL}</span>
              <p>MOOCS上で背景設定パネルをすぐ開くショートカットです。</p>
            </div>

            <div className="background-editor">
              <label className="field-label" htmlFor="background-url">
                画像URL
              </label>
              <input
                id="background-url"
                className="text-field url-field"
                type="url"
                placeholder="https://example.com/background.jpg"
                value={backgroundInputValue}
                onChange={handleBackgroundUrlChange}
              />
              {backgroundPreviewHost && (
                <p className="field-meta">
                  読み込み先: {backgroundPreviewHost}
                </p>
              )}

              <div className="support-block">
                <p className="hint">
                  `http://` または `https://` の URL を使えます。`jpg` `png`
                  `webp` など、ブラウザが表示できる画像形式を想定しています。
                </p>
                <p className="hint">
                  明るすぎる画像や重い画像は、文字の読みやすさや表示速度に影響することがあります。
                </p>
              </div>

              <div className="background-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={clearBackgroundImage}
                >
                  背景を消す
                </button>
              </div>

              <p className="background-note">{backgroundNote}</p>

              <BackgroundScenePreview
                backgroundPreviewUrl={backgroundPreviewUrl}
                backgroundIsValid={backgroundIsValid}
                backgroundPreviewHost={backgroundPreviewHost}
                enabled={settings.colorTabsEnabled}
                tabColors={settings.tabColors}
              />
            </div>
          </div>
        </article>
      </section>

      <section className={isDirty ? 'status-panel dirty' : 'status-panel'}>
        <div className="status-copy">
          <p className="status-kicker">
            {loading
              ? '設定を読み込み中です'
              : isDirty
                ? '変更があります。保存するとMOOCSページにも反映されます。'
                : 'すべて保存済みです。'}
          </p>
          {!errors.length && !loading && (
            <p className="status-meta">
              {isDirty
                ? '右側の保存ボタンが有効になっています。'
                : 'MOOCSページにも反映されています。'}
            </p>
          )}
          {errors.length > 0 && (
            <div className="message error" role="alert">
              {errors.map((error) => (
                <p key={error}>{error}</p>
              ))}
            </div>
          )}
          {savedMessage && <p className="status-meta">{savedMessage}</p>}
        </div>

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
            disabled={loading || !isDirty}
          >
            {isDirty ? '保存する' : '保存済み'}
          </button>
        </div>
      </section>
    </main>
  );
}
