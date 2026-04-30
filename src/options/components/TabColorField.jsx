import { TAB_COLOR_PRESETS } from '../constants.js';

export function TabColorField({
  label,
  value,
  onChange,
  description = '画面上のカラーパレットからも選べます。',
  featured = false,
}) {
  return (
    <div className={featured ? 'tab-color-field featured' : 'tab-color-field'}>
      <div className="tab-color-copy">
        <strong>{label}</strong>
        <small>{description}</small>
      </div>

      <div className="tab-color-actions">
        <div className="tab-color-choice-grid" aria-label={`${label}の色候補`}>
          {TAB_COLOR_PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              className={
                value === preset.value
                  ? 'tab-color-choice active'
                  : 'tab-color-choice'
              }
              onClick={() => onChange(preset.value)}
              style={{ '--swatch-color': preset.value }}
              aria-label={`${label}を${preset.label}にする`}
              aria-pressed={value === preset.value}
            >
              <span className="tab-color-choice-sample" aria-hidden="true" />
              <span className="tab-color-choice-copy">
                <strong>{preset.label}</strong>
                <small>{preset.value.toUpperCase()}</small>
              </span>
              <span className="tab-color-choice-check" aria-hidden="true">
                {value === preset.value ? '✓' : ''}
              </span>
            </button>
          ))}
        </div>

        <span className="tab-color-control">
          <span
            className="tab-color-preview"
            style={{ '--tab-color-preview': value }}
            aria-hidden="true"
          >
            <span className="tab-color-dot" />
            <span className="tab-color-pill" />
          </span>
          <input
            type="color"
            className="tab-color-input"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            aria-label={`${label}の色`}
          />
          <span className="tab-color-value">
            <small>カスタム</small>
            <code>{value.toUpperCase()}</code>
          </span>
        </span>
      </div>
    </div>
  );
}
