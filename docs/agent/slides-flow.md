# Google Slides / PDF 化フロー

この文書は Google Slides の viewer URL、SVG export、PDF 化、capture fallback、既知の注意点をまとめる。

---

## 処理フロー（読む順）

1. **`permissions.contains({ origins: ['<all_urls>'] })`** — 未付与ならページ内 UI・popup・専用許可ウィンドウのいずれかから付与してもらう。
2. **`buildSlidesViewerUrl(entry)`**。`/embed`・`/pubembed` は **`/pub`**、private `/presentation/d/{id}/embed` は **`/present`** に寄せる（`waitForTabLoad` が `complete` になりにくい問題の対策）。
3. **`tabs.create({ url: viewerUrl })`** — `about:blank` のまま固まる場合は最大 5 回リトライ（2 秒間隔）。
4. まず Slides タブ上の SVG を順に直列化し、画像を data URL にインライン化して background へ返す。
5. background 側で SVG を JPEG 化して PDF を組み立てる。失敗時のみ `captureVisibleTab` フォールバックへ落とす。
6. **`finally` でタブを閉じる**。

---

## `buildSlidesViewerUrl` の注意

- Slides を別タブで開く URL は **`buildSlidesViewerUrl` 経由の viewer** を使う。
- `/embed`・`/pubembed` は **`/pub`** に寄せる。
- private `/presentation/d/{id}/embed` は **`/present`** に寄せる。
- ここを迂回すると `waitForTabLoad` が `complete` になりにくく、タイムアウトや `about:blank` 固着の原因になる。

---

## `/embed` を避ける理由

`/embed` のまま別タブで開いて「読み込み complete を待つ」だけに依存すると、`waitForTabLoad` が完了しにくい。Slides viewer URL は background 側の `buildSlidesViewerUrl` で `/pub` / `/present` に正規化する。

---

## SVG export → PDF 化 → capture fallback

- 通常ルートでは、Slides タブ上の SVG を順に直列化する。
- `slides-export.js` / `svg-export.js` が画像を data URL にインライン化する。
- background 側で SVG を JPEG 化し、PDF を組み立てる。
- SVG export や画像取得に失敗した場合のみ、表示タブの `captureVisibleTab` フォールバックへ落とす。
- capture fallback は `<all_urls>` の optional permission が必要になる場合がある。権限不足で止まったときは `needsCapturePermission` を `true` にし、popup / ページ内 UI の導線表示に使う。
- 大きな PDF は **background 側で逐次組み立てて Blob download** する。全ページ JPEG を配列に貯めてから別形式へ二重保持しない。

---

## 既知の注意点

詳細は [`../../HANDOFF.md`](../../HANDOFF.md) も見る。ここではエージェントがハマりやすい Slides 論点だけ列挙する。

| 論点                   | 内容                                                                                                                                                 |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`about:blank` タブ** | `processSlidesDownload` で `waitForTabLoad` 後も URL が `about:blank` のままになることがある。権限・URL 組み立て・タイミングの仮説でログを取ること。 |
| **Slides URL**         | `buildSlidesViewerUrl` が **embed → pub / present** 変換の要。ここを迂回するとタイムアウトしやすい。                                                 |

---

## DO / DON'T

| DO                                                                           | DON'T                                                       |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Slides を別タブで開く URL は **`buildSlidesViewerUrl` 経由の viewer** を使う | `/embed` のまま「読み込み complete を待つ」だけに依存しない |
| 大きな PDF は **background 側で逐次組み立てて Blob download**                | 全ページ JPEG を配列に貯めてから別形式へ二重保持しない      |
