# Google Slides 保存パフォーマンス記録

2026-04-30 時点の Firefox 実機ログと実装変更をもとにした速度変化のメモ。

## 結論

- Firefox の `createImageBitmap(svg blob)` 失敗回避により、毎ページ HTML image fallback に落ちる問題は解消した。
- その後の実測では、SVG 経路の支配要因は `waitForSlideReady` で、1 ページあたり約 2 秒かかっている。
- `waitForSlideReady` / `inlineSlideImages` / `serializeCurrentSlideSvg` の計測対象区間だけを見ると、後続の調整で明確な高速化はまだ出ていない。
- 2 並列化は「複数 Slides 資料」を同時処理するための対策であり、1 つの Slides 内のページ処理は並列化していない。したがって、1 deck だけの保存時間はほぼ変わらない。

## 速度変化

| 段階                     | session / 条件                         | 対象                     | 計測値                                                                                              | 変化率            | 解釈                                                                                                                              |
| ------------------------ | -------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 旧実装                   | `glassmoocs-flow-1777514742058-b57rhr` | Firefox SVG rasterize    | `createImageBitmap failed` が大量発生                                                               | 定量不可          | 毎ページ HTML image fallback に落ちていたため遅い。duration 集計導入前なので総時間の比較値はない。                                |
| Firefox rasterize 修正後 | `glassmoocs-flow-1777522397563-mk3mkd` | SVG 経路                 | `createImageBitmap failed: 0`, `falling back to html image rasterization: 0`, `status: done`        | 定量不可          | 主因だった fallback は解消。ここも duration 集計前なので速度比は出せない。                                                        |
| duration 可視化後        | `glassmoocs-flow-1777526275009-tninxx` | 44 pages                 | `waitForSlideReady` avg 1967ms, `inlineSlideImages` avg 38ms, `serializeCurrentSlideSvg` avg 41ms   | baseline          | 計測対象 3 区間の合計は約 90.0 秒。ほぼ `waitForSlideReady` が支配的。                                                            |
| 後続調整後               | `glassmoocs-flow-1777527587677-tjpbsd` | 44 pages                 | `waitForSlideReady` avg 2018ms, `inlineSlideImages` avg 113ms, `serializeCurrentSlideSvg` avg 116ms | 約 9.8% 遅い      | 計測対象 3 区間の合計は約 98.9 秒。体感速度が変わらないという観測と一致する。                                                     |
| 2 並列化                 | `DOWNLOAD_PARALLEL_LIMIT = 2`          | 複数 Slides 資料のキュー | 実測ログ未取得                                                                                      | 理論上 0-50% 短縮 | 1 deck の 44 pages は速くならない。2 deck なら理想値で約 50% 短縮、5 deck なら同じ重さなら約 40% 短縮。実測は次回ログで確認する。 |

### 計算メモ

- `1777526275009-tninxx`: `(1967 + 38 + 41)ms * 44 pages = 90024ms`
- `1777527587677-tjpbsd`: `(2018 + 113 + 116)ms * 44 pages = 98868ms`
- 変化率: `(98868 - 90024) / 90024 = 9.82%`

## 対処ごとの評価

### 1. Firefox で `createImageBitmap` を避ける

効果あり。Firefox で毎ページ `InvalidStateError` が発生し、HTML image fallback に落ちる挙動は消えた。

ただし、この修正前の duration 集計がないため、速度改善率は出せない。比較可能なのは「fallback 発生件数が大量から 0 件になった」こと。

### 2. duration 可視化と popup Debug Log

効果あり。速度そのものの改善ではないが、`waitForSlideReady` が平均約 2 秒で支配的だと切り分けられた。

次の最適化対象は `inlineSlideImages` や `serializeCurrentSlideSvg` ではなく、まず `waitForSlideReady`。

### 3. `waitForSlideReady` の snapshot 判定調整

現時点では明確な速度改善なし。44 pages の比較では約 9.8% 遅い。

ただし、`previousSnapshot` 誤判定による別ページ同一扱いのリスクは下げているため、速度より正確性寄りの修正として扱う。

### 4. Slides 資料単位の 2 並列化

複数 Slides 資料がある場合だけ効く。1 つの Slides deck のページ処理は直列のままなので、単体 deck の保存時間は変わらない。

理論値は次の通り。

| Slides 資料数 | 1 並列の所要時間 | 2 並列の理想所要時間 | 理想短縮率 | 理想速度比 |
| ------------- | ---------------- | -------------------- | ---------- | ---------- |
| 1             | `1T`             | `1T`                 | 0%         | 1.00x      |
| 2             | `2T`             | `1T`                 | 50%        | 2.00x      |
| 3             | `3T`             | `2T`                 | 33%        | 1.50x      |
| 4             | `4T`             | `2T`                 | 50%        | 2.00x      |
| 5             | `5T`             | `3T`                 | 40%        | 1.67x      |

実際には Firefox の描画負荷、Google Slides の読み込み、PDF rasterize、downloads API の待ちで理想値より下がる可能性がある。

## プログレスバーが戻って見えた原因

2 並列化後、`state.stage` に入る `open-slides-viewer (1/2)` や `serialize-slide-svg-9/44` を UI が全体進捗の部分値として読んでいた。

並列 worker が交互に state を更新すると、表示対象の `stage` が `2/2` から `1/2`、または `9/44` から別 worker の `2/10` のように切り替わる。そのため、全体の `completed + failed` は増えていなくても、バーだけが戻って見えた。

対策として、popup とページ内 UI のプログレスバーは `completed + failed` / `total` だけで計算し、`stage` の `x/y` は進捗率に使わない。これでバーは単調増加する。

## 次に見ること

1. 2 並列後の実機ログで、キュー全体の `startedAt` / `finishedAt` と Slides 資料数を記録する。
2. `waitForSlideReady` の平均 2 秒を、ページ表示完了条件のどれが支配しているかに分解する。
3. 1 deck 内ページ並列化は viewer DOM 共有で壊れやすいので、やるなら別タブ複製方式でコスト比較してから判断する。
