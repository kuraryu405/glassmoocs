# HANDOFF

## これは何か

`glassmoocs` の「MOOCs 授業資料を科目・講義ごとに整理してダウンロードする機能」について、
**コンテキスト 0 から再開するための引き継ぎ**。
このファイルだけ読めば今どこまで進んでいて、何が壊れていて、次に何をすべきか分かるようにしてある。

---

## ブランチ

```
codecode/course-archive-download
```

---

## 作業の目的

MOOCs の授業資料を以下の構造で `Downloads/glassmoocs/` に保存する。

```text
glassmoocs/
  2026/
    ICT社会応用論E/
      Webアプリに関する基礎的な技術 - Webアプリに関する基礎的な技術/
        01 - はじめに.pdf
        02_ 静的なwebサイト・動的なwebサイト.pdf
```

- 年度ごとに分かれる
- 科目ごとに分かれる
- 講義グループ + 講義名ごとに分かれる
- 実体 PDF が保存される
- MOOCs ホームではダウンロード UI を出さない

---

## 現在の確認済みダウンロード先

```
/Users/tsutsumin/Downloads/glassmoocs/
```

直近（2026-04-27 00:11 時点）の実際の内容:

```
2026/ICT社会応用論E/Webアプリに関する基礎的な技術 - Webアプリに関する基礎的な技術/
  02_ 静的なwebサイト・動的なwebサイト.pdf   ← 1件のみ成功
```

---

## 実装状態まとめ

### 動いているもの

| 機能 | 状態 |
|------|------|
| manifest: `downloads` / `tabs` / `host_permissions` | ✅ |
| `background.js` ダウンロードキュー | ✅ |
| popup → ダウンロード UI | ✅ |
| content.js: MOOCs URL 解析 | ✅ |
| content.js: 科目ページ巡回 | ✅ |
| content.js: 講義一覧抽出 | ✅ |
| content.js: 資料候補抽出 | ⚠️ 一部のみ（後述）|
| ディレクトリ構造の生成 | ✅ `year/course/lectureGroup - lectureName/` |
| 動画・viewer を除外するフィルタ | ✅ |
| 重複エントリのデデュープ（URL 単位） | ✅ |
| Google Slides: `manifest.json` に `optional_permissions` で `docs.google.com` 追加 | ✅ |
| Google Slides: popup に権限要求ボタン追加 | ✅ |
| Google Slides: SVG 抽出 → Canvas → JPEG → PDF のパイプライン | ✅ `slides-export.js` |
| Google Slides: `/embed` → `/pub` URL 変換 (`buildSlidesViewerUrl`) | ✅ |
| Google Slides: `waitForTabLoad` 60 秒タイムアウト | ✅ |
| `recoverStaleState`: リロード時に前回失敗履歴を引き継がない | ✅ |

### 壊れているもの / 不安定なもの

| 症状 | 推定原因 |
|------|---------|
| ダウンロード実行時に失敗が大量に積み上がる（87 件など） | `about:blank` タブ問題（後述）が繰り返される。5 回リトライしてもすべて `about:blank` になるケースがある |
| Google Slides タブが `about:blank` になる | Firefox が `docs.google.com` をインライン展開できないか、tab create のタイミング問題 |
| 科目によっては PDF がまったく落ちない | `extractAssetCandidates` が viewer HTML を PDF 候補と誤認している可能性 |
| CI は通る（ESLint / build ともパス） | ただし runtime はまだ不安定 |

---

## 直近の主な変更（このセッションで入れたもの）

### `public/background.js`

1. **`recoverStaleState` の過去失敗リセット**
   - 拡張リロード時に前回の `failed` / `completed` を持ち越さず、リロード直前に進行中だった 1 件だけを記録するように変更。
   - → 「87 件失敗」のような蓄積はこれで防げるはずだが、`about:blank` 問題が根本的に解消されない限りリトライのたびに 1 件ずつ失敗として積まれる。

2. **`buildSlidesViewerUrl`（新関数）**
   - `iframe` の `/embed` や `/pubembed` URL を `/pub`（公開スライドショー）に変換。
   - これにより `waitForTabLoad` が安定しやすくなった。

3. **`about:blank` タブのリトライロジック**
   - タブ生成を最大 5 回リトライ（2 秒待ち）。全部 `about:blank` なら例外を投げる。

4. **URL デデュープ（`queueDownloads`）**
   - 同じ viewer URL を複数エントリで重複ダウンロードしていた問題を解消。

### `public/manifest.json`

- `https://docs.google.com/*` を `host_permissions` から `optional_permissions` に移動。
- これにより Firefox でも動的に権限を付与できる。

### `public/popup.html` / `public/popup.js`

- 「Google スライドを許可」ボタンと権限チェックロジックを追加。

### `public/slides-export.js`

- SVG 抽出 → rasterize → PDF 生成パイプラインを復活（以前一時的に fetchPdf ハンドラで置き換えていたが差し戻し）。

---

## 現在の最重要バグ: `about:blank` タブ問題

### 症状

1. `processSlidesDownload` が `docs.google.com/presentation/.../pub` URL でタブを生成する
2. `waitForTabLoad` が完了を待つ
3. 完了後の URL が `about:blank`
4. 5 回リトライしてもすべて `about:blank`
5. 例外が投げられ、失敗カウントが +1 される

### 仮説

| ID | 内容 | 証拠 |
|----|------|------|
| H-A | Firefox が `docs.google.com` のナビゲーションを `about:blank` にリダイレクトしている（権限が未付与） | `optional_permissions` を付与していないとコンテンツスクリプトが注入できない。ただしタブ自体は開けるはず |
| H-B | `tabsCreate` の直後に `waitForTabLoad` を始めるが、タブがまだ作成中で URL が確定していない | Firefox では `tabs.create` の Promise 解決時点で URL が `about:blank` のことがある |
| H-C | `buildSlidesViewerUrl` の URL が何らかの理由で空文字になっており、`about:blank` タブが作られる | ログで `viewerUrl` を確認していない |

### 次に試すこと

1. `processSlidesDownload` の入口で `viewerUrl` をログに出す
2. `tabsCreate` 直後の `slidesTab.url` をログに出す
3. `waitForTabLoad` の各ポーリングで URL 変化をログに出す（すでに一部あるが H-C 対応で viewerUrl も追加）
4. `about:blank` が H-A 起因なら → 事前に権限付与を必須化するか、`about:debugging` で付与状態を確認してもらう
5. H-B 起因なら → `tabsCreate` 後に 500ms 待ってから `waitForTabLoad` を呼ぶ

---

## いまのコードで特に怪しい箇所

### `public/content.js`

- `extractAssetCandidates` — 何を「資料」として拾うかを決めている。PDF 以外を掴んでいる可能性
- `deriveGoogleSlidesDownloadUrl` — Slides URL → PDF URL 変換
- `deriveGoogleDriveDownloadUrl` — Drive preview → ダウンロード URL 変換
- `extractCourseName` — 年度と科目名の切り分け（以前は `2026` を科目名と誤認していた）

### `public/background.js`

- `buildDownloadFilename` — `year/course/lecture/file` パス生成
- `queueDownloads` — 失敗時に `SERVER_BAD_CONTENT` しか見えない。失敗した URL を state に残していない
- `processSlidesDownload` — `about:blank` タブ問題の本体

---

## 次セッションの推奨作業順

1. **`about:blank` 問題の根本解決**
   - `viewerUrl` が空でないか確認（H-C 検証）
   - Firefox で `docs.google.com` の optional_permissions が付与済みか確認（H-A 検証）
   - タブ URL がいつ確定するか計測（H-B 検証）

2. **失敗 URL を必ず state に残す**
   - `queueDownloads` の catch ブロックで `entry.url` / `entry.filename` / `error.message` を `failed` 配列に積む
   - 今は `SERVER_BAD_CONTENT` しか見えないのでデバッグにならない

3. **`extractAssetCandidates` を PDF 中心に絞る**
   - `.pdf` 拡張子 / `application/pdf` を指す embed/object / Google Slides のみ対象にする
   - viewer HTML や動画の誤爆を排除

4. **1 講義限定で再現させる**
   - 科目全体クロールは後回し。1 講義 1 ファイルで確実に通す

5. **CI を通してリリース**
   - `corepack pnpm run ci`

---

## 既知のコマンド

```bash
# CI
corepack pnpm run ci

# ダウンロード先確認
python3 - <<'PY'
from pathlib import Path
p = Path('/Users/tsutsumin/Downloads/glassmoocs')
print('exists', p.exists())
if p.exists():
    for path in sorted(p.rglob('*')):
        print(path)
PY

# ダウンロード先を完全にクリアして再テスト（注意: 全データ削除）
# rm -rf /Users/tsutsumin/Downloads/glassmoocs
```

---

## 重要ファイル

| ファイル | 役割 |
|---------|------|
| `public/manifest.json` | 権限・popup・background 定義 |
| `public/background.js` | ダウンロードキュー・保存パス・完了待ち |
| `public/content.js` | MOOCs DOM 解析・講義巡回・資料候補抽出・ページ内 UI |
| `public/slides-export.js` | Google Slides ページ内で SVG 抽出 → PDF 生成 |
| `public/popup.js` | popup 起動・権限要求 |
| `public/popup.html` | popup UI |
| `AGENTS.md` | 実装・デバッグルール（必読） |

---

## 過去チャット

- [スライドDL失敗・Firefox対応・SVG抽出](67d4be18-099f-409b-be71-fdff9f36c5f9) — about:blank タブ問題・stale state・URL 変換の経緯が詳しい

---

## このタスクのフェーズ

> **URL 抽出 + ダウンロード経路のデバッグ**フェーズ。UI 追加は終わり。

次の担当者は、機能追加より先に:

- `about:blank` タブ問題の根本解消
- 失敗 URL の可視化
- 1 講義限定での安定動作確認

から始めること。
