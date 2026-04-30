import { shortcutToLabel } from '../settings.js';

export function ShortcutRecorder({ title, value, active, onStart }) {
  return (
    <div
      className={active ? 'shortcut-recorder recording' : 'shortcut-recorder'}
    >
      <div className="shortcut-recorder-copy">
        <span>{title}</span>
        <strong>{active ? 'キー入力待ち...' : shortcutToLabel(value)}</strong>
        <small>
          {active
            ? '押し終えたら自動で確定します。Escで中止できます。'
            : '保存すると、開いているMOOCSページにも自動で反映されます。'}
        </small>
      </div>
      <button type="button" onClick={onStart}>
        {active ? '入力をやめる' : 'キーを変更'}
      </button>
    </div>
  );
}
