import { LOCKED_TAB_MODE, PREVIEW_TABS } from '../constants.js';
import { toAlphaColor } from '../utils.js';

export function TabAppearancePreview({ enabled, tabColors }) {
  return (
    <div className="tab-appearance-preview">
      <PreviewTabRow enabled={enabled} tabColors={tabColors} />
    </div>
  );
}

export function PreviewTabRow({ enabled, tabColors, compact = false }) {
  return (
    <div
      className={compact ? 'preview-tab-row compact' : 'preview-tab-row'}
      data-mode={LOCKED_TAB_MODE}
      data-enabled={enabled}
      aria-hidden="true"
    >
      {PREVIEW_TABS.map((tab) => {
        const color = tabColors[tab.key];
        return (
          <span
            key={tab.key}
            className="preview-tab-chip"
            data-active={tab.key === 'slide'}
            style={{
              '--preview-tab-color': color,
              '--preview-tab-soft': toAlphaColor(color, 0.22),
            }}
          >
            {tab.label}
          </span>
        );
      })}
    </div>
  );
}

export function BackgroundScenePreview({
  backgroundPreviewUrl,
  backgroundIsValid,
  backgroundPreviewHost,
  enabled,
  tabColors,
}) {
  const hasPreview = backgroundPreviewUrl && backgroundIsValid;

  return (
    <div className="background-scene-card">
      <div
        className={hasPreview ? 'background-scene active' : 'background-scene'}
        style={
          hasPreview
            ? {
                '--background-preview-url': `url("${backgroundPreviewUrl}")`,
              }
            : undefined
        }
        aria-hidden="true"
      >
        <div className="background-scene-glass">
          <div className="background-scene-toolbar">
            <span />
            <span />
            <span />
          </div>

          <div className="background-scene-header">
            <strong>MOOCS Preview</strong>
            <small>{hasPreview ? '背景あり' : '既定背景'}</small>
          </div>

          <PreviewTabRow enabled={enabled} tabColors={tabColors} compact />

          <div className="background-scene-panels">
            <div className="background-scene-panel large">
              <strong>講義ページ</strong>
              <small>背景を敷いたときのコントラストを確認できます。</small>
            </div>
            <div className="background-scene-panel">
              <strong>資料エリア</strong>
              <small>タブ色と背景の相性もここで見られます。</small>
            </div>
          </div>
        </div>
      </div>

      <div className="background-preview-copy">
        <strong>
          {hasPreview ? '背景ライブプレビュー' : '背景画像は未設定'}
        </strong>
        <small>
          {hasPreview
            ? backgroundPreviewHost
            : '保存すると、開いているMOOCSページにも自動で反映されます。'}
        </small>
      </div>
    </div>
  );
}
