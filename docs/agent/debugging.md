# デバッグと再現調査

この拡張は **background → content → サードパーティ（Google）** の非同期が直列化されており、`console.log` だけでは追えない。

---

## 構造化ログ（JSON）

バックグラウンド・コンテンツ・（必要なら）`slides-export.js` で共通フォーマットを使う。**通常は OFF にし、Options の「構造化デバッグログを有効にする」または URL の `glassmoocs_debug_log=1` で必要時だけ有効化する。**

```js
fetch('http://127.0.0.1:7443/ingest/<セッションID>', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sessionId: '<セッションID>',
    location: 'background.js:processSlidesDownload',
    message: '処理の意図を一言で',
    data: { tabId, url, status },
    hypothesisId: 'H-A',
    timestamp: Date.now(),
  }),
}).catch(() => {});
```

- `sessionId` はセッション開始時に固定し全ログに付与する。
- **`.catch(() => {})` 必須**（サーバ未起動で握りつぶす）。
- `runtime` は `content` / `background` / `slides-export` を入れる。
- 大きな本文（SVG 全文、data URL、HTML 全体）は送らず、**件数・長さ・URL・hash・要約**に留める。

---

## ログを置く場所

| 場所                | 記録内容                             |
| ------------------- | ------------------------------------ |
| 非同期関数の入口    | 引数・呼び出し元識別子               |
| `await` 直前 / 直後 | 投入値・返却値・例外                 |
| 条件分岐            | どの branch か + 判定に使った変数    |
| `catch`             | `error.message`, `error.name`, stack |
| タブ作成・削除      | `tabId`, URL, 理由                   |
| `browser.storage`   | key、値は大きければ型と長さ          |

---

## 仮説 ID

```js
// [H-A] optional_permissions 未付与でナビゲーションがブロックされている
// [H-B] tabs.create 直後は url が未確定の about:blank
```

ログの `hypothesisId` と一致させる。**棄却した仮説はコードとコメントを整理して削除する。**

---

## LLM にログを渡すフォーマット

```text
--- ログ開始 ---
{...JSON...}
--- ログ終了 ---
上記ログを読んで、[H-A][H-B] のどちらが支持されるか判断してください。
```

**30〜50 行以内**を目安に。`jq` / `grep hypothesisId` で絞る。

---

## ログ削除のタイミング

「修正後のログで成功が確認できるまで消さない」

- 成功ログが得られた
- かつ再現手順を **2 回**繰り返し **2 回とも成功**

この後、`#region agent log` ごと削除してよい。

---

## Firefox でのログの見方

| スクリプト       | 見る場所                                            |
| ---------------- | --------------------------------------------------- |
| background       | `about:debugging` → 拡張 → **調査**                 |
| content（MOOCs） | 該当 MOOCs タブの DevTools                          |
| slides-export    | **`docs.google.com` を表示しているタブ**の DevTools |

拡張リロードで background のコンソールはリセットされる。**リロード前後でログを分けて記録する。**

---

## Chromium でのログの見方

| スクリプト       | 見る場所                                                         |
| ---------------- | ---------------------------------------------------------------- |
| background       | `chrome://extensions` → 対象拡張 → Service worker の **Inspect** |
| content（MOOCs） | 該当 MOOCs タブの DevTools                                       |
| slides-export    | **`docs.google.com` を表示しているタブ**の DevTools              |

Chromium でも拡張リロードや Service Worker 停止で background のログが途切れる。再現調査ではリロード前後を分けて記録する。

---

## 再現手順テンプレート

手順なしで「直った」「壊れた」と書いても次の担当者は追えない。

```text
再現手順:
1. …
2. …

期待:
- 完了件数 / 失敗件数
- 保存先パス例: glassmoocs/2026/科目名/…

実際:
（実行後に記録）
```

---

## DO / DON'T

| DO                                                                               | DON'T                                                             |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| デバッグログは **JSON 一行＋仮説 ID**                                            | 本番に不要な `console.log` だけで終わらせない（必要なら後で削除） |
| ログ受け口は **`nc -l 7442` や `7443`、または POST を 200 応答で記録できるもの** | `python3 -m http.server 7442` だけを「取れる」と思わない          |
