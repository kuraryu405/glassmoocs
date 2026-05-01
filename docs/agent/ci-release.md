# CI / Release / Dev Build

この文書は CI、ブラウザ別 build、`dist/`、release / dev variant の注意をまとめる。

---

## CI

```bash
corepack pnpm run ci
```

`package.json` の `ci` は **`eslint . && prettier --check . && pnpm run build:release`**。

---

## Build コマンド

```bash
corepack pnpm run build:release
corepack pnpm run build:dev
corepack pnpm run build:firefox
corepack pnpm run build:firefox:dev
corepack pnpm run build:chromium
corepack pnpm run build:chromium:dev
corepack pnpm run build:amo
```

- `pnpm run build:release`: Firefox + Chromium の release build。
- `pnpm run build:dev`: Firefox + Chromium の dev build。
- `pnpm run build:firefox`: Firefox release build。
- `pnpm run build:firefox:dev`: Firefox dev build。
- `pnpm run build:chromium`: Chromium release build。
- `pnpm run build:chromium:dev`: Chromium dev build。
- `pnpm run build:amo`: Firefox 公開向けの互換エイリアス。実体は `pnpm run build:firefox`。

---

## 出力先

- Firefox: `dist/firefox/`
- Chromium: `dist/chromium/`

各ディレクトリは、ブラウザごとに最後に実行した `release` または `dev` variant で上書きされる。

---

## Chromium ビルド成果物の注意

- Chromium の通常ビルドは `corepack pnpm run build:chromium`。
- Chromium の開発ビルドは `corepack pnpm run build:chromium:dev`。
- 出力先は `dist/chromium/`。
- `dist/chromium/` は最後に実行した `release` / `dev` variant で上書きされる。
- release build では構造化デバッグログ UI、localhost 送信先、ログ用 storage/message 文字列が `dist/chromium/` から除去される。
- 開発中にログが必要な場合だけ `build:chromium:dev` を使う。

---

## Release build の注意

release ビルドは構造化デバッグログ UI・localhost 送信先・ログ用 storage/message 文字列を対応する `dist/<browser>/` から除去する。

開発中にログが必要な場合だけ `pnpm run build:firefox:dev` または `pnpm run build:chromium:dev` を使う。
