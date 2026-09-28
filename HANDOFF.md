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

## 課題一覧スキャン

2026-05-31 に popup へ「未提出課題を確認」を追加した。

- [`public/content.js`](/Users/tsutsumin/Documents/GitHub/glassmoocs/public/content.js) の `glassmoocs:collect-assignments` が、科目配下の講義・ページを fetch して課題っぽいページを抽出する
- 判定は DOM 内テキストのヒューリスティックで、`未提出` / 提出ボタン系は `pending`、`提出済` 系は `submitted`、締切終了系は `closed`
- MOOCs ページ内にも自動表示する。講義・資料ページではその回、科目ページではその科目の出し忘れを表示する。科目一覧 `/courses` には表示しない
- 出し忘れ判定には、空の提出 textarea / text input と file input / ファイル未提出表示も含める
- サーバー側の専用 API ではなく、ログイン済みユーザーが MOOCs 上で見えるページだけを読む
- 実ページごとに表記揺れがあり得るため、判定不明は popup に残して追加パターンを拾えるようにしている
- 2026-09-28 に Dia + テストプロファイル(CDP)で実機検証した。判明した事実:
  - 旧ロジックはキーワードをページ全文で見るため、ページ内ナビの「課題1」リンクで資料・ビデオ頁まで課題扱いになっていた
  - 回答欄は「問題を開く」後に AJAX で差し込まれるため、静的 HTML では空欄が見つからず `pending` に到達不能だった
  - 対策: 課題らしさに回答 UI(`.problem-container` / `.problem-contentpage` / file input / 解答欄 / 提出ボタン)の有無を必須条件化、状態判定の文言探索を問題ブロック内に限定、受付中+未提出+UI ありは `pending` に寄せる。`未提出`系文言に `非公開`、提出済み系に数値付き `得点` を追加
  - COT201(31 講義/約 350 頁)で検証: 検出 230 件すべて `closed`、`pending` 0。学期終了後のため closed は妥当。`問1〜問4` など旧ロジックで拾えなかった頁も拾うようになった
  - `pending` / `submitted` の live 検証は未了(受付中の課題が見つからなかった)。受付中科目が出たら再検証すること
- `/courses` の課題パネルはページ上部を占有するため削除した。科目・講義・資料ページの確認機能は維持する。講義内ページ取得は `ASSIGNMENT_PAGE_CONCURRENCY = 4` で並列化済み
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
- 速度変化とプログレスバー挙動の整理は [`SLIDES_PERFORMANCE.md`](/Users/tsutsumin/Documents/GitHub/glassmoocs/SLIDES_PERFORMANCE.md) を参照

---

## まず見るべきファイル

| ファイル                                                                                          | 役割                                                                          |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| [`public/slides-export.js`](/Users/tsutsumin/Documents/GitHub/glassmoocs/public/slides-export.js) | `waitForSlideReady` / `inlineSlideImages` / `serializeCurrentSlideSvg` の本体 |
| [`public/background.js`](/Users/tsutsumin/Documents/GitHub/glassmoocs/public/background.js)       | debug log fallback buffer、Firefox 分岐、SVG ラスタライズ                     |
| [`AGENTS.md`](/Users/tsutsumin/Documents/GitHub/glassmoocs/AGENTS.md)                             | 実行ルールとログ方針                                                          |
