# GlassMOOCs

INIAD MOOCs 向けのブラウザ拡張です。ページ全体をグラスモーフィズム風に調整しつつ、次の機能を追加します。

- 背景画像の差し替え
- textarea の文字数カウンターと自動リサイズ
- 上部番号タブの色分け
- 番号タブをショートカットで前後移動
- React 製の設定ページ

## 開発

```bash
pnpm install
pnpm lint
pnpm format:check
pnpm build
```

`pnpm run ci` で lint / format check / build をまとめて実行できます。

## Chrome に入れる

1. `pnpm build` を実行する
2. Chrome で `chrome://extensions` を開く
3. 右上の `デベロッパー モード` を有効にする
4. `パッケージ化されていない拡張機能を読み込む` を押す
5. このリポジトリの `dist/` を選ぶ
6. 拡張の `詳細` から `拡張機能のオプション` を開いてショートカットと色分けを設定する

## Firefox に入れる

1. `pnpm build` を実行する
2. Firefox で `about:debugging#/runtime/this-firefox` を開く
3. `一時的なアドオンを読み込む...` を押す
4. このリポジトリの `dist/manifest.json` を選ぶ
5. 読み込み後、アドオン一覧から `設定` を開いてショートカットと色分けを設定する

Firefox の一時アドオンはブラウザ再起動で消えるため、継続利用する場合は署名付きパッケージ化が別途必要です。

## Firefox Add-ons (AMO) で公開する

1. `pnpm run ci` を実行して lint / format / build を通す
2. 配布用 ZIP を作成する
   - `cd dist && zip -r ../artifacts/glassmoocs-dist.zip .`
3. レビュー用ソース ZIP を作成する
   - `git archive --format=zip --output artifacts/glassmoocs-source.zip HEAD`
4. [AMO Developer Hub](https://addons.mozilla.org/en-US/developers/) で `Submit a New Add-on` を開く
5. `On this site` を選択し、`artifacts/glassmoocs-dist.zip` をアップロードする
6. 必要に応じて source code 提出で `artifacts/glassmoocs-source.zip` をアップロードする
7. Name / Summary / Description / Category / License / Support 情報 / Notes for reviewers を入力して `Submit Version`

`public/manifest.json` には MV3 提出要件の `browser_specific_settings.gecko.id` を設定済みです。
