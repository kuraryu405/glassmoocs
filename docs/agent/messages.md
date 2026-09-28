# メッセージプロトコル

この文書は `runtime.sendMessage` / `tabs.sendMessage` の型と送受信先をまとめる。型識別子は **文字列の完全一致**。定数は各ファイルの `MESSAGE_TYPES` を参照する。

---

## MOOCs `content.js` が処理する `type`

いずれも **`tabs.sendMessage(moocsTabId, message)`** で届く（popup がアクティブタブに送信）。

| type                                  | 送信元 | `message` 主フィールド | `sendResponse`                                                       |
| ------------------------------------- | ------ | ---------------------- | -------------------------------------------------------------------- |
| `glassmoocs:get-page-context`         | popup  | なし                   | `{ ok, context }` — `getCurrentPageContext(document, location.href)` |
| `glassmoocs:collect-assignments`      | popup  | なし                   | `{ ok, result }` — 科目配下の課題ページと提出状態の推定結果          |
| `glassmoocs:start-course-collection`  | popup  | なし                   | `{ ok, courseName, assetCount }` / `{ ok:false, error }`             |
| `glassmoocs:download-current-lecture` | popup  | なし                   | 同上                                                                 |
| `glassmoocs:download-current-page`    | popup  | なし                   | 同上                                                                 |

---

## `background.js` が処理する `type`

**`runtime.sendMessage`** で届く（popup の状態取得・リセット、content の `set-download-state` / `download-assets` 等）。

| type                                               | 送信元           | 主フィールド                                             | `sendResponse` / 挙動                                                                      |
| -------------------------------------------------- | ---------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `glassmoocs:get-download-state`                    | popup / content  | なし                                                     | async `{ ok, state }`                                                                      |
| `glassmoocs:set-download-state`                    | content          | `state`                                                  | async `{ ok, state }`                                                                      |
| `glassmoocs:reset-download-state`                  | popup / content  | なし                                                     | async `{ ok, state }`（`queueNonce` インクリメント）                                       |
| `glassmoocs:download-assets`                       | content          | **`payload`**: `{ courseName, assets: DownloadEntry[] }` | 即時 `{ ok:true }` の後 **`queueDownloads` を非同期実行**（失敗時は state を `failed` に） |
| `glassmoocs:get-slides-capture-permission`         | popup / content  | なし                                                     | async `{ ok, granted }`                                                                    |
| `glassmoocs:open-slides-capture-permission-window` | content          | なし                                                     | async `{ ok, windowId }`                                                                   |
| `glassmoocs:fetch-image-data-url`                  | slides-export.js | `url`                                                    | async `{ ok, dataUrl }`。Slides タブ内 fetch が失敗した画像を background 経由で取得        |

---

## `slides-export.js` が処理する `type`

`tabs.sendMessage` で届く。

| type                                     | 送信元     | 主フィールド               | `sendResponse`                                                                                         |
| ---------------------------------------- | ---------- | -------------------------- | ------------------------------------------------------------------------------------------------------ |
| `glassmoocs:get-slides-session-info`     | background | なし                       | `{ ok, totalPages, currentPage, title }`                                                               |
| `glassmoocs:wait-for-slide-ready`        | background | `page`, `previousSnapshot` | `{ ok, snapshot, captureMetrics, waitDurationMs }` または `{ ok:false, error }`                        |
| `glassmoocs:go-to-first-slide`           | background | なし                       | `{ ok:true }` / `{ ok:false, error }`                                                                  |
| `glassmoocs:go-to-slide`                 | background | `page`                     | `{ ok:true }` / `{ ok:false, error }`                                                                  |
| `glassmoocs:serialize-current-slide-svg` | background | `page`                     | `{ ok, svgText, renderWidth, renderHeight, viewBoxWidth, viewBoxHeight }` または `{ ok:false, error }` |
