export function ToggleCard({ enabled, title, description, onToggle }) {
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
