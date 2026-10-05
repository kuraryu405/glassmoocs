# Google Slides / PDF 化フロー

この文書は Google Slides の viewer URL、SVG export、PDF 化、capture fallback、既知の注意点をまとめる。

---

## 処理フロー（読む順）

1. **capture 権限ゲート** — background の `hasCapturePermission()` が見る。`<all_urls>` 付与済み、または (Chromium 等では) required host 権限の `https://docs.google.com/*` があれば capture 可。Firefox では `<all_urls>` が無いと権限不足になり得る。そのときだけページ内 UI・popup・専用許可ウィンドウの導線を使う。
2. **`buildSlidesViewerUrl(entry)`**。`/embed`・`/pubembed` は **`/pub`**、private `/presentation/d/{id}/embed` は **`/present`** に寄せる（`waitForTabLoad` が `complete` になりにくい問題の対策）。
3. **viewer の展開** — Chromium 系はフォーカスを奪わないよう非フォーカスの専用ウィンドウ (`openOrReuseSlidesWindow`, `focused:false`) に開き、キュー内で使い回す。macOS は `focused:false` が無視されるため作成直後に元ウィンドウへフォーカスを戻す。Firefox は従来通りバックグラウンドタブ (`openOrReuseSlidesTab`)。`about:blank` のまま固まる場合は最大 5 回リトライ（2 秒間隔）。終了時はウィンドウ/タブを閉じ、ユーザーが移動していなければフォーカス復元する。
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
- capture fallback は Slides viewer (`docs.google.com`) の host 権限で動くため、通常は追加許可なしで使える。`needsCapturePermission` が `true` になるのはゲート不通過時 (主に Firefox で `<all_urls>` 未付与) のみで、そのときだけ popup / ページ内 UI の導線表示に使う。
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
