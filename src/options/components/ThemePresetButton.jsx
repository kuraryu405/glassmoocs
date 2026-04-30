import { PREVIEW_TABS } from '../constants.js';

export function ThemePresetButton({ preset, active, onSelect }) {
  return (
    <button
      type="button"
      className={active ? 'theme-preset active' : 'theme-preset'}
      onClick={onSelect}
      aria-pressed={active}
    >
      <div className="theme-preset-swatches" aria-hidden="true">
        {PREVIEW_TABS.map((tab) => (
          <span
            key={tab.key}
            style={{ '--theme-swatch-color': preset.colors[tab.key] }}
          />
        ))}
      </div>
      <div className="theme-preset-copy">
        <strong>{preset.label}</strong>
        <small>{preset.description}</small>
      </div>
      <span className="theme-preset-state">
        <span className="theme-preset-check" aria-hidden="true">
          {active ? '✓' : ''}
        </span>
        <span>{active ? '選択中' : '選ぶ'}</span>
      </span>
    </button>
  );
}
