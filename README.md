# INIAD Glassmorphism

MOOCSをグラスモーフィズム化してカッコよくする拡張機能

## ビルド手順

### 必要な環境

- Unix系OS (Linux, macOS) または Windows (WSL推奨)
- `zip` コマンド (通常はOSに標準インストール済み)

### ビルド方法

1. リポジトリをクローンまたはダウンロード
2. プロジェクトディレクトリに移動
3. ビルドスクリプトを実行:

```bash
./build.sh
```

または手動で:

```bash
zip -r iniad-glassmorphism.xpi manifest.json content.js styles.css
```

### 出力

`iniad-glassmorphism.xpi` が生成されます。このファイルがFirefox拡張機能のパッケージです。

## ファイル構成

- `manifest.json` - 拡張機能のマニフェストファイル
- `content.js` - コンテンツスクリプト（背景画像設定、文字数カウンター等）
- `styles.css` - グラスモーフィズムスタイル
- `build.sh` - ビルドスクリプト

## 技術仕様

- Manifest V3
- ソースコードは未圧縮・未変換のまま
- 依存ライブラリなし（純粋なJavaScript/CSS）
