# AGENTS

このファイルは、このリポジトリで作業する AI エージェント・人間開発者向けの **入口・索引・絶対ルール** である。詳細仕様は `docs/agent/` 配下へ分割しているため、作業内容に応じて必要な文書だけ読む。

コードとドキュメントが矛盾した場合は **コードを正** とし、恒久的な知見はこの入口または `docs/agent/` に反映する。

---

## 作業開始時の手順

1. [`HANDOFF.md`](HANDOFF.md) を読む。
2. 今回のタスクに対応する `docs/agent/*.md` だけ読む。
3. 関係する実装ファイルを読む。
4. 最小差分で変更する。
5. 可能なら `corepack pnpm run ci` を通す。
6. 必要なら [`HANDOFF.md`](HANDOFF.md) を更新する。

Codex Hooks が有効な環境では、`.codex/hooks/route_agent_docs.py` がユーザーの依頼文から読むべき `docs/agent/*.md` を追加コンテキストとして案内する。

---

## プロジェクト概要

- **対象**: `https://moocs.iniad.org/*` 向けの **Manifest V3** ブラウザ拡張。Firefox / Chrome 双方を意識し、`browser` / `chrome` を併用する。
- **主目的**: MOOCs ページの UI 改変（グラスモーフィズム等）と、授業資料の収集・階層付きダウンロード。
- **保存先の基本形**: `Downloads/glassmoocs/年度/科目/講義グループ - 講義名/ファイル`
- **実行の核**: ページ改変は [`public/content.js`](public/content.js) の `MutationObserver` + `enhancePage()`。ダウンロード制御は [`public/background.js`](public/background.js)。Google Slides は [`public/slides-export.js`](public/slides-export.js) が `docs.google.com` 上で動作する。
- **設定 UI**: [`src/options/`](src/options/)（Vite + React）。ビルド成果物が `options.html` 等として配布される。

---

## 主要ファイル

| ファイル                                                                                                                        | 役割                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| [`public/manifest.json`](public/manifest.json)                                                                                  | MV3 manifest。権限、host permissions、content scripts を定義する。                                |
| [`public/content.js`](public/content.js)                                                                                        | MOOCs DOM の解析、資料候補の抽出、ページ内ダウンロード UI、`download-assets` ペイロード組み立て。 |
| [`public/content/download-panel.js`](public/content/download-panel.js)                                                          | ページ内ダウンロードパネルの UI コンポーネント。                                                  |
| [`public/background.js`](public/background.js)                                                                                  | `storage.local` のダウンロード状態、キュー処理、`downloads.download`、Slides 用タブ制御。         |
| [`public/background/pdf.js`](public/background/pdf.js)                                                                          | canvas / JPEG / PDF 組み立てユーティリティ。                                                      |
| [`public/slides-export.js`](public/slides-export.js)                                                                            | `docs.google.com` 上で Slides SVG を収集し、画像をインライン化して background に渡す。            |
| [`public/slides-export/svg-export.js`](public/slides-export/svg-export.js)                                                      | SVG 直列化と画像インライン化。                                                                    |
| [`public/popup.js`](public/popup.js) / [`public/popup.html`](public/popup.html)                                                 | 進捗表示、科目単位 / 授業回単位 / ページ単位の収集トリガ。                                        |
| [`public/popup/slides-permission-card.js`](public/popup/slides-permission-card.js)                                              | popup 内の Slides 権限カード制御。                                                                |
| [`public/slides-permission.js`](public/slides-permission.js) / [`public/slides-permission.html`](public/slides-permission.html) | ページ内 UI から開く Slides キャプチャ権限専用ウィンドウ。                                        |
| [`src/options/`](src/options/)                                                                                                  | Options page。設定項目を増やす時は content 側のデフォルトと整合させる。                           |

---

## 詳細ドキュメント

| 作業内容                                          | 読むファイル                                                   |
| ------------------------------------------------- | -------------------------------------------------------------- |
| 全体構造、主要関数、共通実装ルールを確認する      | [`docs/agent/architecture.md`](docs/agent/architecture.md)     |
| `runtime.sendMessage` / `tabs.sendMessage` を触る | [`docs/agent/messages.md`](docs/agent/messages.md)             |
| storage / download state / queue 復旧を触る       | [`docs/agent/download-state.md`](docs/agent/download-state.md) |
| Google Slides / PDF 化 / capture fallback を触る  | [`docs/agent/slides-flow.md`](docs/agent/slides-flow.md)       |
| ログ・再現調査・仮説検証をする                    | [`docs/agent/debugging.md`](docs/agent/debugging.md)           |
| CI / release / dev build / `dist/` を触る         | [`docs/agent/ci-release.md`](docs/agent/ci-release.md)         |
| PR 分割・コミット粒度で迷う                       | [`docs/agent/pr-rules.md`](docs/agent/pr-rules.md)             |

関連ドキュメント:

| ファイル                   | 用途                                                           |
| -------------------------- | -------------------------------------------------------------- |
| [`HANDOFF.md`](HANDOFF.md) | 現在のブランチ・バグ状況・次に触るべき箇所のスナップショット。 |
| [`PLAN.md`](PLAN.md)       | フェーズ単位の Todo / Done。                                   |

---

## 絶対に守るルール

- **実装前に読む**: `HANDOFF.md` と、今回の作業に必要な `docs/agent/*.md` だけを読む。
- **コード優先**: ドキュメントとコードが矛盾したらコードを正とし、必要ならドキュメントを更新する。
- **実装コードにローカルマシン固有の絶対パスを書かない。**
- **DOM 優先**: 資料 URL はまずページ内の `a[href]` / `iframe[src]` / `embed[src]` / `object[data]` から得る。不要な権限・API を増やさない。
- **content の責務分離**: 対象検出と UI 注入を分ける。
- **二重挿入防止**: 一度きりの UI には `data-glassmoocs-*` を付与する。
- **遅延描画耐性**: `MutationObserver` + `enhancePage()` に乗せ、再実行しても壊れないようにする。
- **設定を増やす時**: [`public/content.js`](public/content.js) のデフォルトと [`src/options/settings.js`](src/options/settings.js) のデフォルト値・merge を必ず整合させる。
- **設定は最小化**: 本当に必要になるまで設定項目を増やさない。
- **ブラウザ API**: `const api = globalThis.browser || globalThis.chrome`。Promise / callback 両対応は既存ラッパに合わせる。
- **Slides URL**: Slides を別タブで開く URL は必ず `buildSlidesViewerUrl` 経由の viewer を使う。`/embed` のまま `complete` 待ちに依存しない。
- **PDF 化**: 大きな PDF は background 側で逐次組み立てて Blob download する。全ページ JPEG を配列に貯めてから別形式へ二重保持しない。
- **ログ**: デバッグログは JSON 一行 + 仮説 ID を基本とし、本番に不要な `console.log` だけで終わらせない。
- **PR / コミット**: 無関係な修正を混ぜない。未コミット差分を溜めたまま別件へ移らない。詳しくは [`docs/agent/pr-rules.md`](docs/agent/pr-rules.md)。
- **Markdown 以外を触る依頼ではない時**: 実装コードを変更しない。

---

## CI

```bash
corepack pnpm run ci
```

`package.json` の `ci` は **`eslint . && prettier --check . && pnpm run build:release`**。詳細は [`docs/agent/ci-release.md`](docs/agent/ci-release.md) を読む。

---

## Chromium ビルド成果物の注意

- Chromium の通常ビルドは `corepack pnpm run build:chromium`、開発ビルドは `corepack pnpm run build:chromium:dev`。
- 出力先は `dist/chromium/`。
- `dist/chromium/` は最後に実行した `release` / `dev` variant で上書きされる。
- release build では構造化デバッグログ UI、localhost 送信先、ログ用 storage/message 文字列が `dist/chromium/` から除去される。
- 開発中にログが必要な場合だけ `build:chromium:dev` を使う。
