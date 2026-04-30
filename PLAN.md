# PLAN

## Goal

MOOCs の現在科目を収集し、`Downloads/glassmoocs/{courseName}/{lectureName}/{assetName}` に階層整理して保存できるブラウザ拡張機能を実装する。

## Current Phase

Task 6: Firefox 実機で SVG 経路は完走確認済み。次は `waitForSlideReady` / `inlineSlideImages` / `serializeCurrentSlideSvg` の所要時間を可視化して、最長区間を最適化する段階。

## Todo

- MOOCs 側の資料候補に `kind / sourceUrl / viewerUrl` を付け、`direct_file` と `google_slides` を分離する
- background に Slides 専用ジョブ処理を追加し、Chrome では `printToPDF`、Firefox では非対応エラーに分岐する
- `docs.google.com` 用 content script で表示済みスライドを印刷用 DOM に組み直す
- Chrome 実ブラウザで単一 Slides 資料の end-to-end を確認する
- 科目全体クロールに Slides queue をつなぎ、`corepack pnpm run ci` を通す

## Done

- 専用ブランチ `codecode/course-archive-download` を作成した
- 共通ルールは `AGENTS.md` に分離し、進捗記録は `PLAN.md` で持つ方針に固定した
- `downloads` / `tabs` / `host_permissions` を manifest に追加し、MV3 background を導入した
- popup を設定ランチャーから資料収集 UI に切り替え、background と進捗表示の土台を追加した
- content script に科目 URL 解析、講義巡回、ページ抽出、資料候補抽出、background へのダウンロード要求を追加した
- ページ内 UI に「この科目を収集」「このページの資料を保存」を追加した
- popup / background / content の連携を実装し、`corepack pnpm run ci` を通した
- 講義グループ付きの保存パスに変更し、MOOCs 内部ページ URL を資料候補から除外した
- `downloads.download()` の受付時点ではなく、実ダウンロード完了まで待ってから成功扱いするようにした
- `docs.google.com` と `debugger` を manifest に追加し、Slides ジョブを表現できる state と `slides-export.js` の入口を追加した
- `public/content.js` の候補抽出に `kind / sourceUrl / viewerUrl` を追加し、private Google Slides を `google_slides` ジョブとして queue に残すようにした
- `public/background.js` に direct file / Google Slides の分岐を追加し、Slides は専用タブを開いて exporter と handshake する流れを実装した
- `public/slides-export.js` を追加し、Google Slides viewer の SVG を収集して印刷用 DOM に組み替え、background に `slides-ready` を返す exporter を実装した
- `corepack pnpm run ci` を再度通した
- `debugger` 権限を manifest から削除し、Firefox で warning が出ない状態に戻した
- Google Slides の元 iframe URL の query を保持するように戻し、Slides exporter 用タブは Firefox で前面表示して描画を進めるようにした
- `slides-exporter-ready` で止まった時の観測性を上げるため、background に `slides-progress` を追加し、`slides-exporter-running` や `collect-slide-x/y` を state に出すようにした
- Slides exporter の起動を URL パラメータ依存から background の `tabs.sendMessage()` 依存へ切り替え、Google 側で query が落ちても exporter を開始できるようにした
- 拡張再読み込み後に `rendering/downloading` が残って UI が塞がる問題に対して、background 起動時に stale state を自動で `failed/partial_failed` に復旧するようにした
- Google Slides の SVG を Firefox 上で JPEG 化し、拡張内で PDF バイナリを自前生成して `downloads.download()` に渡す処理を接続した
- 大きい PDF を runtime message で返して詰まるのを避けるため、Slides 生成結果の受け渡しを `storage.local` 経由に切り替えた
- Firefox で `createImageBitmap(svg blob)` が毎ページ `InvalidStateError` を返して HTML image fallback に落ちていた問題を特定した
- `public/background.js` の `renderSerializedSlidePage()` で Firefox は最初から `Image` 経由に寄せるよう変更し、修正後 session で `createImageBitmap failed: 0` と `status: done` を確認した
- `7443` structured log が Firefox で取り切れない場合に備え、`glassmoocs_debug_log_buffer` と `glassmoocs_debug_log_text` を storage fallback として追加した
- `public/slides-export.js` の `getSlideSnapshot()` に `getCurrentPage()` を含め、別ページでも previous snapshot 同一扱いされる揺れを軽減した

## Next Action

Firefox 実機で session ごとに `waitForSlideReady` / `inlineSlideImages` / `serializeCurrentSlideSvg` の `durationMs` を抜けるようにし、最長区間を特定する。並行して `glassmoocs_debug_log_text` を message 経由または options / popup から読み出しやすくする。

## Open Risks

- リポジトリ内に MOOCs の保存 HTML や fixture がなく、実 DOM に対する抽出確認は実装後の手動確認に依存する
- Google Slides の viewer DOM は公開 `/d/e/` と private `/d/{id}/embed` で差異がある可能性があり、実ブラウザ確認が必要
- Firefox では `7443` structured log が `load_success:false` のままになることがあり、storage fallback なしでは計測結果を安定回収できない
- `strings` による IndexedDB 抽出は壊れやすく、ログ閲覧導線を拡張側に追加しないと次の最適化が進めにくい
