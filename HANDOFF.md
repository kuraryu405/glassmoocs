# HANDOFF

## これは何か

`glassmoocs` の Google Slides 保存まわりについて、次セッションの担当者がそのまま再開するための最新引き継ぎ。
2026-04-30 時点の Firefox 実機確認を反映している。

---

## ブランチ

```text
codecode/options-refresh
```

---

## 現状の結論

- 直近の Firefox 実機では、Google Slides 保存は **capture fallback ではなく SVG 経路で完走**している
- 以前遅かった主因は [`public/background.js`](/Users/tsutsumin/Documents/GitHub/glassmoocs/public/background.js) の `renderSerializedSlidePage()` 内で、Firefox が `createImageBitmap(svg blob)` に毎ページ `InvalidStateError` を返し、**毎ページ HTML image fallback に落ちていたこと**
- その点は修正済みで、Firefox では最初から `Image` 経由でラスタライズする分岐を入れている
- 修正後 session では `createImageBitmap failed` は 0 件、`falling back to html image rasterization` も 0 件、`status: done` を確認済み

つまり、**いま詰めるべき主戦場は `createImageBitmap` ではない**。
次は SVG 経路の中でどこに時間が掛かっているかを定量化して詰める段階。

---

## 今回までに入っている修正

### [`public/slides-export.js`](/Users/tsutsumin/Documents/GitHub/glassmoocs/public/slides-export.js)

- `getSlideSnapshot()` に `getCurrentPage()` を入れた
- 別ページなのに previous snapshot と同一扱いされる問題を軽減した

### [`public/background.js`](/Users/tsutsumin/Documents/GitHub/glassmoocs/public/background.js)

- `7443` への structured log 送信に失敗したときの fallback buffer として `glassmoocs_debug_log_buffer` を追加
- プレーンテキスト mirror として `glassmoocs_debug_log_text` を追加
- `isFirefoxLike()` を追加
- `renderSerializedSlidePage()` で Firefox は `createImageBitmap` を通さず、最初から `Image` 経由ラスタライズに変更

---

## structured log の扱い

### 7443 の扱い

- Firefox 側では `7443` 送信が `load_success:false` のままになるケースが続いている
- そのため [`artifacts/slides-debug-7443.log`](/Users/tsutsumin/Documents/GitHub/glassmoocs/artifacts/slides-debug-7443.log) は **現時点では信頼しない**
- 代わりに extension storage の fallback buffer を使う

### 現在見るべき storage key

- `glassmoocs_debug_log_buffer`
- `glassmoocs_debug_log_text`
- `glassmoocs_download_state`

### Firefox profile 情報

現 UUID:

```text
iniad-glassmorphism@local -> e57cf4da-ba16-4b74-8ab5-316947114258
```

storage path:

```text
~/Library/Application Support/Firefox/Profiles/ksdnla8n.default-release/storage/default/moz-extension+++e57cf4da-ba16-4b74-8ab5-316947114258^userContextId=4294967295/idb/
```

### 補足

- `strings .../*.sqlite*` で抜く方法はかなり壊れやすい
- 次セッションでは **`glassmoocs_debug_log_text` を background message 経由、または options / popup から見やすく出す導線を追加する方がよい**

---

## 直近で確認した session

### 遅い旧 session

```text
glassmoocs-flow-1777514742058-b57rhr
```

- `createImageBitmap failed` が大量発生していた

### 修正後 session

```text
glassmoocs-flow-1777522397563-mk3mkd
```

この session では:

- `createImageBitmap failed`: 0
- `falling back to html image rasterization`: 0
- `using html image rasterization for firefox`: 1
- `status: done`

## 課題の出し忘れ確認機能

2026-09-28 にページ内パネル・popup の確認ボタンと結果欄・課題収集と提出状態推定・専用スクリプトとCSSを削除した。資料ダウンロード、課題タブの色分け、提出操作の補助は維持する。

## 既存機能の監査履歴

- 2026-09-28 に 4 領域並列で厳密監査し、P0/P1 を中心に修正した(`pnpm run ci` 通過):
  - content: パネル mount 冪等化+配置順固定(header,A,D)で rAF 自己ループと順序反転を停止、render の同一内容スキップ、タイトルフォールバック'課題'の like 汚染除去、判定文言の問題ブロック限定+`unanswered`除外+得点数値化+`closed-caption`除外、fetch 文書の空欄 pending 廃止、講義 mapper の try/catch、科目スキャンの stale ガード+cache 上限、boot ボタンのデッドタイム解消、DL パネル回復注入に download-panel 追加、popup の科目一覧での課題ボタン無効化+取得リトライ+表示世代管理
  - background: 前面化タブ割り込みの Chromium 除外(Chromium の rasterize は前面が前提のため毎回自殺していた)、getState の副作用分離、状態書き込みの一本化、リセット後のゾンビ書き込み防止、権限フラグの OR 蓄積、孤児 Slides タブの始末、DL 完了待ちの初回空結果耐性、Firefox 描画の二段フォールバック、起動競合の startupReady、capture 前の前面化
  - slides/popup/build: stale スナップショット受理の廃止、画像等のタイムアウト付与、worker 例外の吸収、canvas 上限、factory ガード(popup/slides-export)、権限カードのウィンドウ経由化+永続化、許可文言修正、goToSlide の方向再評価、画像 fetch の allowlist、SCRIPT_FILES 追加分、デバッグマクロ残留のビルド失敗化
  - 盲目 innerHTML 置換は削除した(対象が Preact 本体のため)。src/ で innerHTML を使わない運用で対応する
- 未対応(P2 として報告のみ): Chrome SW の大 PDF blob 寿命、storage エラーの握り潰し、同一名ファイルの overwrite、上書き競合の uniquify 化、capture 権限の実行中 revoke 検出、root dist/ の stale ミラー、version 二重管理

---

## 次に詰めるべき箇所

優先順はこの 3 つ。

1. `waitForSlideReady`
2. `inlineSlideImages`
3. `serializeCurrentSlideSvg`

いま必要なのは「失敗の切り分け」より **各区間の duration 可視化**。

### 次セッションでやること

1. session ごとに上記 3 箇所の `durationMs` を JSON として抜けるようにする
2. 可能なら `glassmoocs_debug_log_text` を message 経由か options / popup から見やすく出す
3. そのうえで最長区間を最適化する

---

## Firefox 実機での実行ルール

毎回これを守ること。

1. `corepack pnpm build`
2. `about:debugging#/runtime/this-firefox` で temporary addon を `Reload`
3. MOOCs ページ再読み込み
4. `この回の資料を保存`
5. Slides タブは触らない

---

## 既知の事実と注意

- いまの主問題は `createImageBitmap` ではない
- `7443` ログは Firefox では取り切れないことがあるので、storage fallback 前提で見る
- capture fallback が主因だった時期の引き継ぎは古い。現時点では **SVG 経路の中の待機・インライン化・直列化コスト** を見るべき
- 最新コードでは `corepack pnpm run ci` は通過済み
- 速度変化とプログレスバー挙動の整理は [`docs/reports/SLIDES_PERFORMANCE.md`](docs/reports/SLIDES_PERFORMANCE.md) を参照

---

## Chromium の Slides 権限ダイアログ問題 (2026-10-05 対応)

- 症状: Chromium で Slides 保存時に権限要求が出て、許可ボタンを押してもダイアログが出ない
- 原因の整理:
  - Chromium は `shouldRasterizeSlidesInTab() == true` でタブ内ラスタライズを使うが、それが失敗すると capture fallback に落ち、`permissions.contains({ origins: ['<all_urls>'] })` 不足で `needsCapturePermission=true` になる
  - `manifest.json` の `host_permissions` が `moocs.iniad.org` のみで、background の画像 fetch (`fetchImageDataUrl`) と `tabs.captureVisibleTab` (Slides タブ) が `<all_urls>` なしでは動かない構成だった
  - 参考: `akahoshi1421/INIAD-` の `js/download.js` はページ内 content script だけで SVG 収集→画像 inline→HTML ダウンロードしており、追加権限なしで動く。DOM 優先なら `<all_urls>` は不要なはずという指摘と一致
  - popup の許可ボタンは専用ウィンドウを先に開く順序で、popup ボタンクリックのジェスチャが `permissions.request` に活かされていなかった
- 対応 (未コミット差分あり):
  - `public/manifest.json`: `host_permissions` に `https://docs.google.com/*`, `https://*.googleusercontent.com/*`, `https://*.gstatic.com/*` を追加 (background の `isAllowedSlideImageUrl` allowlist と一致する最小範囲。`optional_host_permissions: [<all_urls>]` は fallback 用に維持)。通常の Slides 保存では権限プロンプト自体が出なくなる想定
  - `public/popup/slides-permission-card.js`: `handleGrantSlidesPermission` を inline `permissions.request` 優先に変更 (ジェスチャが生きているうちに要求。失敗時のみ専用ウィンドウにフォールバック。拒否時はウィンドウを開き直さない)
  - `docs/agent/architecture.md`: `host_permissions` の記述を更新
  - `pnpm run ci` (eslint + prettier + build:release) 通過済み。`dist/chromium` / `dist/firefox` の manifest に新 host_permissions が入ることを確認済み
- 次の実機確認 (Chromium):
  1. `pnpm run build:chromium` → `chrome://extensions` で `dist/chromium` を再読み込み
  2. MOOCs ページで Slides 保存 → 権限カードが出ずに PDF が落ちることを確認
  3. 万が一権限カードが出た場合は popup の許可ボタン → ダイアログが表示されることを確認

## Chromium の権限ゲート修正 (2026-10-05 追記)

- 前回修正後に権限カードが出続けたのは仕様ではない。前回は manifest に host を足しただけで、capture 前のゲート `permissions.contains({ origins: ['<all_urls>'] })` がそのまま残っていたため、高速エクスポート失敗時はいぜん権限不足になっていた
- Chrome 公式仕様では `tabs.captureVisibleTab` は対象 origin の host 権限 (または `activeTab`) があれば動き、`<all_urls>` は必須ではない。Slides viewer タブは常に `docs.google.com` のためゲートを緩和した
- 対応 (未コミット差分あり):
  - `public/background.js`: `CAPTURE_PERMISSION_ORIGIN` を `https://docs.google.com/*` に変更し、`hasCapturePermission()` (docs origin または `<all_urls>`。Firefox では従来通り `<all_urls>` 要求) を追加。`processSlidesDownloadByCapture` のゲートと `get-slides-capture-permission` ハンドラを同関数に一本化
  - `public/popup.js`: `CAPTURE_ORIGIN` を `https://docs.google.com/*` に変更 (カード表示判定を background と一致)
  - `docs/agent/slides-flow.md` / `architecture.md`: capture 権限の記述を更新
- 期待動作: Chromium では高速エクスポート失敗時も capture fallback が無許可で走り、権限カードは出ない。カードが出るのは Firefox で `<all_urls>` 未付与の場合のみ
- 残る仮説 (スライド画像抜けがあれば): `slides-export/svg-export.js` と background の画像 fetch が `credentials: 'include'` 付きで、googleusercontent の `Access-Control-Allow-Origin: *` と相性が悪い可能性。未対応。画像抜けを確認したら切り分ける
- 注意: manifest 変更後は `build:chromium` + `chrome://extensions` の再読み込みが必須。前回カードが出続けた一因は旧ビルドのまま試した可能性もある

## 権限・manifest 拾い忘れ監査 (2026-10-05)

- `permissions` (`storage`/`downloads`/`tabs`/`scripting`) は全て使用中。`scripting` は popup の `ensureMoocsContentReady` (MOOCs タブ限定) で使用。`windows` / `permissions` API は宣言不要。`tabs` は非 MOOCs タブの URL 判定にも使うため維持
- `host_permissions` は取得・注入・capture 対象 (moocs / docs.google / googleusercontent / gstatic) をカバー。画像 allowlist (`isAllowedSlideImageUrl` + svg-export) と一致確認済み
- `drive.google.com/uc` の直接 DL は downloads API のため host 権限不要。`fetchDocument` は MOOCs 同一 origin のみ。デバッグ用 `127.0.0.1:7443` fetch は dev build のみ (release で除去)
- 残存 `<all_urls>` 参照は manifest の optional + background の fallback OR + 専用許可ウィンドウ (最終手段) のみで整合
- 拾い忘れ 1 件を修正: `public/popup-launcher.html` / `public/popup-launcher.js` はどこからも開かれないデッドファイル ("add settingpages" の残骸。popup は直接 `openOptionsPage()` 呼び)。削除 + `scripts/build-extension.mjs` の `SCRIPT_FILES` から除去。`pnpm run ci` 通過済み

## ページ内パネルの「ボタン無反応」報告 (2026-10-05)

- 症状: 「このページから N 件の候補資料を保存できます」と出るのに保存ボタンを押しても無反応
- 見立て: `runPanelAction` の失敗時に `finally` で `scheduleDownloadPanelRefresh()` しており、エラーメッセージが約60ms後に idle 表示で上書きされていた (無反応に見える正体)。かつ `getDownloadState()` が全エラーを握り潰して idle を返すため、background 通信不能でもパネルは正常表示になる
- 最有力の根本原因: 拡張機能の再読み込み/更新後に MOOCs ページを再読み込みしておらず、content script が孤児化 (`Extension context invalidated`)。DOM 抽出は動くが background 通信だけ死ぬ
- 対応:
  - `public/content/download-panel.js`: 失敗時は refresh せずエラーメッセージを残す。`context invalidated` 系エラーは「拡張機能の更新後はページの再読み込みが必要」旨の文言に変換
- ユーザーへの案内: MOOCs ページを再読み込み (F5) して再試行。それでも失敗する場合はパネルに残るエラーメッセージを教えてもらう

## 11 件全滅 + 権限エラーの報告 (2026-10-05)

- 症状: 「完了: 0 / 失敗: 11 / 最新エラー: 権限が必要です...」。11 件全て `google_slides` で高速エクスポート失敗→capture 権限エラーの流れ
- 権限メッセージが出る = 旧ゲート (`<all_urls>` 要求) のまま。PR ブランチの新ビルド (`hasCapturePermission` 緩和) に更新 + 拡張機能の再読み込み + MOOCs ページの再読み込みが必要
- 真因特定の問題: `processSlidesDownload` が svgError を捨てて capture エラーのみ投げていたため、パネルの `lastError` に権限メッセージしか残らず切り分け不能だった
- 対応:
  - `public/background.js`: capture fallback 失敗時に `code` を保ったまま高速エクスポート失敗の要約を chained message として投げ直す (`needsCapturePermission` 導線は維持)。これで次回失敗時は真因がパネルに残る
- 次の実機確認: 新ビルドで再試行し、(1) 権限カードが出るか、(2) 出る場合・失敗する場合のエラーメッセージ全文をもらう

## 真因は SVG の内在寸法不足 (2026-10-05)

- 新エラーメッセージで真因が判明: `The source image could not be decoded.` (Chromium の `createImageBitmap` が SVG Blob を拒否する文言)
- 仕様上 `createImageBitmap` は内在寸法 (width/height 属性) のない SVG をデコードできない。`serializeCurrentSlideSvg` は xmlns のみ付与し width/height を付けていなかった
- なお権限エラーが併発した = その環境で `hasCapturePermission()` が false を返した。Chromium 新ビルドなら docs origin で true になるはずのため、次回切り分け用にゲート判定のログを追加した
- 対応:
  - `public/slides-export/svg-export.js`: 直列化 SVG に計測寸法 (rect → viewBox の順) を width/height 属性として刻む。Image 経由・bitmap 経由の双方に効く
  - `public/background.js`: ゲート判定の内訳 (fallback 付与 / firefoxLike / origin 付与) を agent log に記録。ラスタ失敗時は寸法付きメッセージで投げ直す (code なしのため権限導線に影響なし)
- 次の実機確認: 新ビルド (`dist/chromium` 再生成済み) + 拡張機能の再読み込み + MOOCs ページ再読み込みで 11 件が完走するか。失敗時はエラーメッセージ全文をもらう

## Dia 環境での Firefox 誤検出 (2026-10-05)

- ユーザー環境は Dia (Chromium 系)。権限エラー + `createImageBitmap` デコード失敗 + Image フォールバック失敗の三重苦は、`isFirefoxLike()` が Dia で true を返していたことで全て説明がつく (Firefox 経路: タブ非活性・background ラスタ・ゲート不通過)
- `browser` 名前空間の有無だけでは Chromium 派生での誤検出があり得るため、`navigator.userAgentData.brands` (Chromium 系のみ存在。SW 含む) があれば Chromium と判定する順に変更。素の Firefox (brands なし) の挙動は不変
- これで Dia ではタブラスタライズ→background bitmap (内在寸法付きで可) →capture (無許可) の三段が全て Chromium 経路で動く
- 新旧ビルドの見分け方: 失敗メッセージに `(svg N chars, request WxH, target WxH)` が付けば寸法対応版。それがなければ拡張機能の再読み込みが古い dist のまま

## フォーカス奪取・速度・残り 4 件の失敗 (2026-10-05)

- 寸法修正で 11 件中 7 件が完走 (`partial_failed`, 完了 7 / 失敗 4)。残り 4 件のエラー文は未入手
- 指摘: (1) 保存中に Slides タブが前面に出てくる、(2) 速度が遅い
- 原因の整理: `DOWNLOAD_PARALLEL_LIMIT=2` で Slides タブが 2 枚同時前面化されフォーカスを奪い合う + 描画待機が不安定化 (失敗の一因の可能性)。画像 fetch は `credentials:include` 固定で CDN (ACAO:\*) に必ず失敗→background 経由の二重取得になっていた
- 対応:
  - `public/background.js`: `google_slides` は `runSlidesExclusively` で直列化 (direct_file の並列 2 は維持)。`processSlidesDownload` で開始前のアクティブタブを記録し、終了時にユーザーが移動していなければ復元 (best-effort)
  - `public/slides-export/svg-export.js`: `fetchImageDirect` を `credentials:same-origin` に変更 (同一 origin は Cookie 送信、CDN は CORS 成功。認証要画像は background fetch が拾う)
- 次の実機確認: 11 件全完走するか + タブのちらつきが収まったか。失敗が残る場合は最新エラー全文をもらう

## viewer の別ウィンドウ化 (2026-10-05)

- 要望: 保存ボタンを押すと Slides 画面に切り替わるのをやめ、後ろで動かしてほしい
- 同一ウィンドウの非アクティブタブはタイマー抑制で遅くなるため、Chromium 系は非フォーカスの専用ウィンドウ (`focused:false`) に viewer を開く。別ウィンドウの前面タブは可視扱いで抑制されず、フォーカスも奪わない。Firefox は従来通りバックグラウンドタブ
- 対応 (`public/background.js`):
  - `openSlidesViewerWindow` / `windowsRemove` / `closeWindowQuietly` / `activeSlidesWindowIds` を追加。Chromium 経路はウィンドウ単位で開閉・リトライ・後始末 (reset/queue finally も対応)
  - capture 経路の前面化は不要になった (タブは自ウィンドウで前面のため `ensureCaptureTabActive` は即通過)

## macOS の focused:false 無視 + ウィンドウ使い回し (2026-10-05)

- macOS では `windows.create({ focused:false })` が無視され新規ウィンドウが必ず前面化される (OS 仕様)。裏調査で確認
- 対応 (`public/background.js`):
  - `openOrReuseSlidesWindow`: viewer ウィンドウをキュー内で使い回し (タブの URL 遷移+再待機)。作成はバッチあたり 1 回に
  - 作成直後、ユーザーが移動済みでなければ `windowsUpdate(mainWindowId, { focused:true })` で即時復帰。終了時復元も `lastFocusedWindow` 基準に改善 (別所へ移動済みなら復元しない)
  - `queueDownloads` で `slidesWindowSession` を共有 (Firefox は null のまま従来通り)。後始末は queue finally / reset の tracked set に一本化
- 次の実機確認: 保存開始時の一瞬のちらつき以外は MOOCs ページに留まること

---

## まず見るべきファイル

| ファイル                                                                                          | 役割                                                                          |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| [`public/slides-export.js`](/Users/tsutsumin/Documents/GitHub/glassmoocs/public/slides-export.js) | `waitForSlideReady` / `inlineSlideImages` / `serializeCurrentSlideSvg` の本体 |
| [`public/background.js`](/Users/tsutsumin/Documents/GitHub/glassmoocs/public/background.js)       | debug log fallback buffer、Firefox 分岐、SVG ラスタライズ                     |
| [`AGENTS.md`](/Users/tsutsumin/Documents/GitHub/glassmoocs/AGENTS.md)                             | 実行ルールとログ方針                                                          |
