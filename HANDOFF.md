# HANDOFF

## これは何か

`glassmoocs` の「MOOCs 授業資料を科目・講義ごとに整理してダウンロードする機能」について、
**次の担当者がすぐ再開するための最新引き継ぎ**。
2026-04-27 時点での Firefox 実機デバッグ結果を反映済み。

---

## ブランチ

```text
main
```

---

## 作業の目的

MOOCs の授業資料を以下の構造で `Downloads/glassmoocs/` に保存する。

```text
glassmoocs/
  2026/
    科目名/
      講義グループ - 講義名/
        01 - 資料.pdf
        02 - 資料.pdf
```

- 年度ごとに分かれる
- 科目ごとに分かれる
- 講義グループ + 講義名ごとに分かれる
- 実体 PDF が保存される
- MOOCs ホームではダウンロード UI を出さない

---

## 現在の実装状態

### すでに入っているもの

| 項目                                                     | 状態 |
| -------------------------------------------------------- | ---- |
| MOOCs ページ内ダウンロード UI                            | ✅   |
| popup からの「この科目を収集 / このページの資料を保存」  | ✅   |
| 保存先 `year/course/lectureGroup - lectureName/filename` | ✅   |
| Slides を `google_slides` として queue に載せる          | ✅   |
| Slides viewer を別タブで開く                             | ✅   |
| SVG 直列化 → rasterize → PDF 生成の高速経路              | ✅   |
| `captureVisibleTab` ベースのフォールバック経路           | ✅   |
| ページ内から開ける Slides キャプチャ権限ウィンドウ       | ✅   |
| popup 側の Slides キャプチャ権限 UI                      | ✅   |
| 構造化ログの仕込み                                       | ✅   |

### いま壊れている / 未解決のもの

| 症状                                                                       | 状況                                                                |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Slides が高速経路で安定完走しない                                          | ❌                                                                  |
| 途中で capture fallback に落ちる                                           | ❌ ほぼ確実                                                         |
| 2 ページ目以降、特に最後のページで `描画待機がタイムアウトしました` が出る | ❌                                                                  |
| 一時アドオンの `Reload` を Computer Use から安定して踏めない               | ❌                                                                  |
| 構造化ログの本番回収                                                       | ❌ 古い一時アドオンが走っている可能性が高く、まだ十分に取れていない |

---

## 直近で確認した実機症状

Firefox 上で popup から保存を実行したとき、以下のエラーを確認した。

### 症状 A

```text
1 ページのキャプチャ範囲が取得できませんでした。
```

- これは **capture fallback に落ちている** 証拠
- 以前は fallback 側で `waitForSlideReady` より前にタブを前面化しておらず、非アクティブタブの `getBoundingClientRect()` が 0 になっていた
- その順序は修正済み

### 症状 B

```text
2 ページの描画待機がタイムアウトしました。
```

- 2 枚目以降で `previousSnapshot === snapshot` 扱いのまま待ち続けるパターンがある
- `waitForSlideReady` は緩めたが、まだ消えていない

### 症状 C

```text
最後のページでタイムアウトしているように見える
```

- ユーザー観測としてこれが濃厚
- 最終ページだけ DOM 差分が出にくい / ページ番号だけ進むパターンを疑って調整済み
- それでも未解消

---

## いまの見立て

### 第一仮説

**高速 SVG 経路そのものではなく、Slides viewer 上のページ遷移待ちが不安定。**

特に `public/slides-export.js` の以下が怪しい。

- `getCurrentPage()`
- `goToSlide(page)`
- `waitForSlideReady(page, previousSnapshot)`
- `getSlideSnapshot(svg)`

ページ番号表示は変わっていても、SVG の中身が完全に差し替わる前に同一 snapshot と誤判定している可能性が高い。

### 第二仮説

**高速 SVG 経路が途中失敗し、capture fallback に落ちている。**

ユーザーの体感として「遅い」「他拡張より遅い」が続いているので、
実際には `processSlidesDownloadBySvg()` が完走せず、
`processSlidesDownloadByCapture()` に落ちている可能性が高い。

### 第三仮説

**今 Firefox で動いているのが古い temporary addon。**

- Computer Use で popup を開くと保存実行自体はできる
- ただし structured log が 0 行のまま
- 一時アドオンの `Reload` をこちらから確実に踏めていない

このため、**修正済みコードが実機に反映されていない** 可能性が常に残っている。

---

## このセッションで入れた主な変更

### `public/content.js`

- ページ内のダウンロードパネルを追加済み
- Slides キャプチャ権限セクションを in-page で表示できるようにした
- `glassmoocs_debug_auto_download=1` クエリが付いていると current-page download を自動発火するデバッグ経路を追加
- 構造化ログ送信を追加

### `public/popup.js` / `public/popup.html`

- popup に Slides キャプチャ権限 UI を追加
- 権限案内は「常時必要」ではなく「高速経路失敗時だけ必要」に寄せた

### `public/slides-permission.html`

### `public/slides-permission.js`

### `public/slides-permission.css`

- ページ内から専用の小ウィンドウを開いて Slides キャプチャ権限を許可する導線を追加

### `public/background.js`

- Slides を **SVG 優先、capture は fallback** に変更
- `processSlidesDownloadBySvg()` を追加
- `processSlidesDownloadByCapture()` を明示的な fallback として分離
- `serialize-current-slide-svg` / `fetch-image-data-url` / `get-slides-capture-permission` / `open-slides-capture-permission-window` を追加
- capture fallback 側で、先に対象タブを前面化してから `waitForSlideReady()` を呼ぶよう修正
- 構造化ログ送信を追加

### `public/slides-export.js`

- SVG を clone して image を data URL にインライン化する経路を追加
- `serializeCurrentSlideSvg(page)` を追加
- `getSlideSnapshot()` を `innerHTML.length` だけでなく軽い hash 付きに変更
- `waitForSlideReady()` を緩め、snapshot が同じでも一定条件で通すように調整
- 最終ページでは DOM 差分を必須にしない緩和を追加
- それでもまだ timeout は残っている
- 構造化ログ送信を追加

---

## ログ周りの現状

### コード上の送信先

ローカル検証で `AGENT_LOG_ENABLED` を true にした場合、以下へ送る。

```text
http://127.0.0.1:7443/ingest/<sessionId>
```

### なぜ 7443 なのか

- もともと 7442 を使っていた
- このローカル環境では `Cursor` も 7442 を listen しており競合した
- `nc -lk 7442` では `curl` の確認ログすら安定して取れなかった
- そのため **有効化時の送信先を一時的に 7443 にしている**

### 今使える簡易受け口

`nc` だと HTTP 応答を返さず不便だったので、Python の最小サーバを使った。

```bash
python3 /tmp/glassmoocs_log_server.py
```

実際のログファイル:

```text
artifacts/slides-debug-7443.log
```

### 現在の注意

- 現コードでは `public/background.js` / `public/content.js` / `public/slides-export.js` の `AGENT_LOG_ENABLED` は **false**
- structured log を使うときは、ローカル検証ブランチで明示的に true にしてから temporary addon を reload する
- そのため「ログが流れない」場合は、古いアドオンだけでなく **ログ自体が無効化されたまま** でないかも確認する

---

## 現在の最重要 blocker

### 1. Firefox 実機がまだ最新コードで回せていない可能性

これが一番大きい。

- popup から保存は押せる
- 失敗内容も見える
- しかし structured log が取れない
- よって「修正が効いていない」のか「効いているが別箇所で死んでいる」のか切り分けが甘い

### 2. `waitForSlideReady()` がまだ不十分

特に最後のページで止まる可能性がある。

現状の問題は:

- `currentPage` は変わる
- しかし `snapshot` が前ページと十分に差分化されない
- そのまま timeout する

### 3. SVG 経路がどこで失敗して capture fallback に落ちるか未確定

いまのユーザー体感では fallback に落ちている公算が高いが、
ログ未回収のため「どのステップで落ちたか」はまだ確定していない。

---

## 次の担当者が最初にやるべきこと

### 優先度 1

**Firefox の temporary addon を確実に `Reload` する。**

ここが入らないと、それ以降のデバッグ精度が上がらない。

### 優先度 2

structured log を使う場合は `AGENT_LOG_ENABLED=true` にしたうえで `7443` のログ受け口を立て、以下のどちらかで再現する。

1. popup から `このページの資料を保存`
2. `?glassmoocs_debug_auto_download=1` 付き URL で current-page download 自動発火

見たい hypothesisId:

- `H-CT-A`
- `H-CT-B`
- `H-SVG-A`
- `H-SVG-B`
- `H-SVG-C`
- `H-SVG-D`
- `H-TAB-A`

### 優先度 3

`waitForSlideReady()` の判定をさらに見直す。

次に疑う順:

1. `getCurrentPage()` が Google Slides の UI 変更に弱い
2. `dispatchArrowKey()` だけでは最後の数ページで遷移が安定しない
3. `getSlideSnapshot()` が still too weak
4. 最終ページだけ別 DOM で来る

---

## すぐ見るべきファイル

| ファイル                  | 役割                                          |
| ------------------------- | --------------------------------------------- |
| `public/slides-export.js` | いま一番怪しい。ページ遷移待ちと SVG 抽出本体 |
| `public/background.js`    | SVG-first / capture fallback の分岐           |
| `public/content.js`       | in-page UI と debug auto download             |
| `public/popup.js`         | popup からの保存起動と権限案内                |
| `AGENTS.md`               | 実装・デバッグルール                          |

---

## 再現メモ

実機で認識できていたページ:

```text
科目: ICT社会応用論E
講義: Webアプリに関する基礎的な技術
ページ: 02: 静的なwebサイト・動的なwebサイト
このページの候補資料: 1 件
Slides: 1 件
```

ユーザー追加観測:

```text
科目: コンピュータ・サイエンス概論 III & 演習 III
区分: CS3講義
講義: CS3講義
ページ: cs3-04: データの様子の把握・可視化
最新エラー: 2 ページの描画待機がタイムアウトしました。
```

さらにユーザー所感として、

```text
多分最後のページでタイムアウトしてる
普通にキャプチャにフォールバックされてる気がする
```

これは現状の見立てと整合する。

---

## 備考

- `HANDOFF.md` の以前の内容にあった **`about:blank` タブ問題が主因** という整理は、現時点では古い
- 今は `about:blank` よりも **Slides ページ遷移待ち / SVG 経路失敗 / capture fallback** の方が主戦場
- CI はこの環境で `pnpm` 不足のため未実行
- 構文確認は `node --check public/background.js public/content.js public/slides-export.js` で通している
