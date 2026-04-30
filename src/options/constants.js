import {
  COLOR_MODES,
  DEFAULT_TAB_COLORS,
  TAB_COLOR_OPTIONS,
} from './settings.js';

export const BACKGROUND_URL_ERROR =
  '背景画像は http:// または https:// のURLだけ使えます。';
export const LOAD_ERROR_MESSAGE =
  '設定の読み込みに失敗しました。初期値で表示しています。';
export const SAVE_ERROR_MESSAGE =
  '設定の保存に失敗しました。アドオンを再読み込みしてください。';
export const RESET_CONFIRM_MESSAGE =
  'すべての設定を初期値に戻します。まだ保存していない変更も消えます。よろしいですか？';
export const BACKGROUND_SHORTCUT_LABEL = 'Shift + Alt + B';
export const LOCKED_TAB_MODE = COLOR_MODES.full;
export const LOCKED_TAB_MODE_COPY = {
  title: '全面カラー',
  description: 'タブ全体を塗り分けて、一目で種類を判別します。',
};

export const TAB_COLOR_PRESETS = [
  { value: '#f59e0b', label: 'アンバー' },
  { value: '#f97316', label: 'オレンジ' },
  { value: '#f43f5e', label: 'ローズ' },
  { value: '#8b5cf6', label: 'バイオレット' },
  { value: '#6366f1', label: 'インディゴ' },
  { value: '#0ea5e9', label: 'スカイ' },
  { value: '#06b6d4', label: 'シアン' },
  { value: '#10b981', label: 'エメラルド' },
  { value: '#84cc16', label: 'ライム' },
];

export const SECONDARY_TAB_COLOR_OPTIONS = TAB_COLOR_OPTIONS.filter(
  (option) => option.key !== 'slide',
);

export const PREVIEW_TABS = [
  { key: 'attendanceTest', label: '出席' },
  { key: 'slide', label: '資料' },
  { key: 'assignment', label: '課題' },
];

export const TAB_THEME_PRESETS = [
  {
    key: 'default',
    label: 'デフォルト',
    description: '今の基準配色です。まず迷ったらこれで十分です。',
    colors: { ...DEFAULT_TAB_COLORS },
  },
  {
    key: 'soft',
    label: 'パステル',
    description: '柔らかい配色で、色差は残しつつ目を疲れにくくします。',
    colors: {
      attendanceTest: '#fbbf24',
      attendanceAssignment: '#22d3ee',
      assignment: '#fb7185',
      check: '#a78bfa',
      slide: '#38bdf8',
    },
  },
  {
    key: 'vivid',
    label: 'ビビッド',
    description: '講義・資料・課題を強めに見分けたいとき向けです。',
    colors: {
      attendanceTest: '#f97316',
      attendanceAssignment: '#06b6d4',
      assignment: '#e11d48',
      check: '#7c3aed',
      slide: '#0284c7',
    },
  },
  {
    key: 'forest',
    label: 'フォレスト',
    description: '緑寄りの落ち着いた雰囲気に寄せます。',
    colors: {
      attendanceTest: '#d97706',
      attendanceAssignment: '#14b8a6',
      assignment: '#f43f5e',
      check: '#6366f1',
      slide: '#0f766e',
    },
  },
];
