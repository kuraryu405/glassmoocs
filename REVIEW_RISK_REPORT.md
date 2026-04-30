# REVIEW RISK REPORT

## Scope

- Branch: `main` (`origin/main` と同時刻の最新)
- Review target: リポジトリ全体（実行コード、UI、設定、ドキュメント）
- Excluded from findings: `artifacts/*.zip`、デバッグログなど生成物

## Method

- 重大度優先（P0/P1/P2）で、動作不良・障害化しうる箇所のみ抽出
- 観点: 非同期制御、状態遷移、権限、Slides処理、URL/パス正規化、互換性、運用不整合
- 同根原因は統合し、スタイルのみの指摘は除外

## Findings

### P0

#### 1) Slides 画像インライン化が全件並列でメモリ/帯域を圧迫

- 対象ファイル: `public/slides-export.js`
- 関数: `inlineSlideImages()`
- リスク内容: `Promise.all(imageNodes.map(...))` により、1スライド内の画像を無制限並列で `fetch` + Data URL 化。
- 失敗シナリオ: 画像点数が多いスライドで同時処理が集中し、タイムアウト・メモリ逼迫・SVG経路失敗を誘発。
- 影響: 高速経路の失敗率上昇、capture fallback への過剰遷移、全体時間悪化。
- 検証観点: 画像多めスライド（数十枚）での `serializeCurrentSlideSvg` 所要時間、失敗率、ブラウザメモリ使用量。

#### 2) PDF生成前に全ページJPEGを保持し、Slides大規模資料でOOMリスク

- 対象ファイル: `public/background.js`
- 関数: `processSlidesDownloadBySvg()`, `processSlidesDownloadByCapture()`, `createPdfFromJpegs()`
- リスク内容: `renderedPages` / `capturedPages` に全ページ `jpegBytes` を保持してから一括PDF生成。
- 失敗シナリオ: ページ数が多い deck でメモリピークが高騰し、クラッシュ/中断。
- 影響: ダウンロード失敗、状態が `failed` または `partial_failed` に偏る。
- 検証観点: 50~200ページ資料でのピークメモリ、完走率、処理時間。

### P1

#### 3) キャンセル/リセットがエントリ境界でしか効かず、重い1件が止まらない

- 対象ファイル: `public/background.js`
- 関数: `queueDownloads()`, `processSlidesDownload()`
- リスク内容: `queueNonce` チェックは `for` ループ先頭のみで、実行中エントリ内は中断不可。
- 失敗シナリオ: ユーザーがリセットしても進行中のSlides処理が継続し、UI表示と実処理が乖離。
- 影響: UX悪化、意図しないダウンロード継続、状態理解困難。
- 検証観点: 実行中に `reset` した際の実際の処理停止性、state遷移整合。

#### 4) 権限導線の表示判定がエラーメッセージ文字列依存

- 対象ファイル: `public/popup.js`, `public/content.js`
- 関数: `stateNeedsCapturePermission()`, `pageNeedsSlidesCapturePermission()`
- リスク内容: `lastError` の部分一致（`表示タブキャプチャの許可が必要です。`）でUI表示判定。
- 失敗シナリオ: 文言変更/別経路エラーで導線が出ず、ユーザーが復旧できない。
- 影響: 権限不足時の自己復旧性低下、誤サポート増加。
- 検証観点: エラー文言差分（ブラウザ差、将来改修）時のUI表示挙動。

#### 5) URLデデュープが単純一致で、資料取りこぼし/重複の温床

- 対象ファイル: `public/content.js`, `public/background.js`
- 関数: `dedupeByUrl()`, `queueDownloads()` 内 `seenUrls`
- リスク内容: `url` 文字列一致ベースで正規化が弱く、同一実体のURL差異（クエリ順・末尾差分）に弱い。
- 失敗シナリオ: 重複保存または逆に必要資料の除外が発生。
- 影響: 保存品質の不安定化。
- 検証観点: 同一ファイルのパラメータ違いURL群での dedupe 結果比較。

#### 6) パスサニタイズは最低限で、長大ファイル名/予約語に弱い

- 対象ファイル: `public/background.js`
- 関数: `sanitizePathSegment()`, `buildDownloadFilename()`
- リスク内容: 禁止文字置換はあるが、長さ制御・予約語（OS依存）・末尾規則の網羅が不足。
- 失敗シナリオ: 一部環境で `downloads.download()` が失敗/予期しない名前化。
- 影響: 保存失敗または期待パス不一致。
- 検証観点: 長名・予約語・末尾ドット/スペースを含む講義名での保存可否。

### P2

#### 7) 起動時の状態復旧処理が二重実行

- 対象ファイル: `public/background.js`
- 箇所: ファイル末尾の `loadState().catch(...)` と `storageGet(...).then(saveState(...))`
- リスク内容: 起動直後に類似復旧処理を2経路で実行。
- 失敗シナリオ: 無駄なI/Oと状態更新競合で初期表示が揺れる。
- 影響: 低~中（ただしデバッグ時のノイズ増）。
- 検証観点: 拡張リロード直後のstate更新回数。

#### 8) 本番コードにローカル向けPOSTログ送信が残留

- 対象ファイル: `public/background.js`, `public/content.js`, `public/slides-export.js`
- 関数: `postAgentLog()`
- リスク内容: `http://127.0.0.1:7443/...` へ常時送信を試行（catchで握りつぶし）。
- 失敗シナリオ: 不要通信が常時発生し、障害調査ノイズ/性能劣化要因になる。
- 影響: 低~中（機能停止までは通常至らない）。
- 検証観点: 通常利用時の不要リクエスト発生数、本番ビルドでの無効化有無。

#### 9) ドキュメントと実装のプロトコル不一致が大きい

- 対象ファイル: `AGENTS.md`, `HANDOFF.md`
- リスク内容: `slides-ready/slides-progress/slides-failed` や `fetch-pdf/start-slides-export` など、現行コードにないメッセージ記述が残存。
- 失敗シナリオ: 次担当が誤プロトコル前提で調査し、障害切り分けを誤る。
- 影響: 運用/保守の遅延、誤修正リスク。
- 検証観点: 記載シンボルと実コードの突合（存在確認）。

## Open Questions

- `OffscreenCanvas` 依存箇所は対象ブラウザ運用範囲で十分検証されているか（Firefox ESR 含む）。
- 大規模Slides（100ページ超）を想定した性能上限をどこに置くか。
- 文字列依存の権限導線判定を、エラーコード等の構造化に置き換える設計方針があるか。

## RecommendedGuards

- Slides画像インライン化に同時実行上限（キュー）を導入し、1ページ内並列数を制限。
- PDF生成は全ページ保持を避ける設計（分割処理/ストリーム化）を検討。
- 権限導線は `lastError` 文言一致ではなく、明示フラグやエラー種別で判定。
- URL正規化ルール（query整列・不要param除去）を dedupe 前に統一。
- ドキュメント（`AGENTS.md`, `HANDOFF.md`）を現行実装に同期し、存在しないメッセージ記載を削除。
