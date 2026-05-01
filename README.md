# GlassMOOCs

INIAD MOOCs 向けのブラウザ拡張です。ページ全体をグラスモーフィズム風に調整しつつ、次の機能を追加します。

- 背景画像の差し替え
- textarea の文字数カウンターと自動リサイズ
- 上部番号タブの色分け
- 番号タブをショートカットで前後移動
- 設定ページ

## Build Requirements

- OS: macOS または Linux のシェル環境
- Verified build environment: macOS 26.3.1 (arm64)
- Node.js: `v24.14.0` で確認済み
- Minimum Node.js version: `^20.19.0 || >=22.12.0`
- Package manager: `pnpm@10.30.2`

Node.js に `corepack` が含まれている場合、`pnpm` は次のコマンドで有効化できます。

```bash
corepack enable
corepack prepare pnpm@10.30.2 --activate
```

## Build Instructions

このリポジトリは次の 2 軸でビルドします。

- browser: `firefox` / `chromium`
- variant: `release` / `dev`

出力先はブラウザごとに固定です。

- Firefox: `dist/firefox/`
- Chromium: `dist/chromium/`

`release` は公開向け、`dev` は構造化デバッグログを含む検証向けです。同じブラウザで `dev` と `release` を切り替えると、対応する `dist/<browser>/` は上書きされます。

```bash
pnpm install --frozen-lockfile
pnpm run ci
```

`pnpm run ci` は次の処理を順番に実行します。

- `eslint .`
- `prettier --check .`
- `pnpm run build:release`

主なコマンド:

- `pnpm run build:firefox`
- `pnpm run build:firefox:dev`
- `pnpm run build:chromium`
- `pnpm run build:chromium:dev`
- `pnpm run build:release`
- `pnpm run build:dev`
- `pnpm run build:amo`

`pnpm run build:amo` は Firefox 公開向けビルドの互換エイリアスです。AMO に提出する配布パッケージは `pnpm run build:firefox` か `pnpm run build:amo` で生成した `dist/firefox/` の内容を ZIP 化したものです。構造化デバッグログを含む検証用ビルドが必要な場合だけ `pnpm run build:*:dev` を使います。

例:

```bash
cd dist/firefox
zip -r ../../artifacts/glassmoocs-firefox.zip .
```

## Source Archive Notes

- ソースコード提出用 ZIP には、機械生成された成果物である `dist/` と `artifacts/` を含めません
- ソースコード提出用 ZIP には、元のソース、設定ファイル、ロックファイル、README を含めます
- このリポジトリではビルドに `Vite` と `@vitejs/plugin-react` を使用します
- `scripts/build-extension.mjs` が Vite ビルド後に classic script と manifest をブラウザ別に整形し、release ビルドではデバッグログ UI・localhost 送信先・ログ用 storage/message 文字列を `dist/<browser>/` から除去します

ソースコード提出用 ZIP の作成例:

```bash
pnpm run package:source
```

## 開発

```bash
pnpm install
pnpm lint
pnpm format:check
pnpm run build:release
```

`pnpm run ci` で lint / format check / build をまとめて実行できます。  
GitHub Actions ではこれに加えて、配布用 ZIP の作成と `addons-linter` による AMO 形式チェックも実行します。

## Chrome に入れる

1. `pnpm run build:chromium` を実行する
2. Chrome で `chrome://extensions` を開く
3. 右上の `デベロッパー モード` を有効にする
4. `パッケージ化されていない拡張機能を読み込む` を押す
5. このリポジトリの `dist/chromium/` を選ぶ
6. 拡張の `詳細` から `拡張機能のオプション` を開いてショートカットと色分けを設定する

## Firefox に入れる

1. `pnpm run build:firefox` を実行する
2. Firefox で `about:debugging#/runtime/this-firefox` を開く
3. `一時的なアドオンを読み込む...` を押す
4. このリポジトリの `dist/firefox/manifest.json` を選ぶ
5. 読み込み後、アドオン一覧から `設定` を開いてショートカットと色分けを設定する

Firefox の一時アドオンはブラウザ再起動で消えるため、継続利用する場合は署名付きパッケージ化が別途必要です。

## Firefox Add-ons (AMO) で公開する

1. `pnpm run ci` を実行して lint / format / build を通す
2. 配布用 ZIP を作成する
   - `cd dist/firefox && zip -r ../../artifacts/glassmoocs-firefox.zip .`
3. レビュー用ソース ZIP を作成する
   - `pnpm run package:source`
4. [AMO Developer Hub](https://addons.mozilla.org/en-US/developers/) で `Submit a New Add-on` を開く
5. `On this site` を選択し、`artifacts/glassmoocs-firefox.zip` をアップロードする
6. 必要に応じて source code 提出で `artifacts/glassmoocs-source.zip` をアップロードする
7. Name / Summary / Description / Category / License / Support 情報 / Notes for reviewers を入力して `Submit Version`

`public/manifest.json` には MV3 提出要件の `browser_specific_settings.gecko.id` を設定済みです。

Reviewer notes に記載する場合は、少なくとも次の内容を含めてください。

- Build environment: macOS または Linux、Node.js `v24.14.0` で確認、`pnpm@10.30.2` を使用
- Build steps: `corepack enable` → `corepack prepare pnpm@10.30.2 --activate` → `pnpm install --frozen-lockfile` → `pnpm run ci`
- Output: Firefox は `dist/firefox/`、Chromium は `dist/chromium/` に出力され、AMO 配布物は `dist/firefox/` を ZIP 化したもの
