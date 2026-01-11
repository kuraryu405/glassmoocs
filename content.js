/* =========================================
   1. 背景画像設定 (前回と同じ)
   ========================================= */
   const STORAGE_KEY = 'iniad_bg_image';
   const BG_STYLE_ID = 'iniad-bg-style';

   function ensureBgStyleElement() {
       let styleEl = document.getElementById(BG_STYLE_ID);
       if (!styleEl) {
           styleEl = document.createElement('style');
           styleEl.id = BG_STYLE_ID;
           // headが無いケースはまず無いが、念のためbodyにもfallback
           (document.head || document.body || document.documentElement).appendChild(styleEl);
       }
       return styleEl;
   }

   // 背景を確実に上書きする（サイト側の!importantにも勝たせる）
   function setBackground(explicitUrl) {
       const savedImage = explicitUrl ?? localStorage.getItem(STORAGE_KEY);
       if (!savedImage || !document.body) return;

       // スタイルタグに書き込んで、後から上書きされても維持する
       const styleEl = ensureBgStyleElement();
       styleEl.textContent = `
           body, html {
               background-image: url('${savedImage}') !important;
               background-size: cover !important;
               background-attachment: fixed !important;
               background-position: center !important;
           }
       `;

       // 念のため直接も指定（即時反映）
       document.body.style.setProperty('background-image', `url('${savedImage}')`, 'important');
       document.body.style.setProperty('background-size', 'cover', 'important');
       document.body.style.setProperty('background-attachment', 'fixed', 'important');
       document.body.style.setProperty('background-position', 'center', 'important');
   }
   
   // ショートカット (Shift + Alt + B)
   document.addEventListener('keydown', (e) => {
       if (e.shiftKey && e.altKey && e.code === 'KeyB') {
           const url = prompt("背景画像のURLを入力:", localStorage.getItem(STORAGE_KEY) || "");
           if (url) {
               localStorage.setItem(STORAGE_KEY, url);
               setBackground(url);
           }
       }
   });
   
   // DOMが準備できてから適用
   if (document.readyState === 'complete' || document.readyState === 'interactive') {
       setBackground();
   } else {
       window.addEventListener('DOMContentLoaded', () => setBackground());
   }
   
   /* =========================================
      2. 爆速文字数カウンター & 自動リサイズ
      ========================================= */
   
   // 人間の感覚に近い文字数カウント (Intl.Segmenter使用)
   const segmenter = new Intl.Segmenter('ja', { granularity: 'grapheme' });
   
   function countGraphemes(text) {
       // イテレータを配列に展開して長さを取る（これが一番正確で速い）
       return [...segmenter.segment(text)].length;
   }
   
   function attachEnhancements() {
       // ページ内のすべてのテキストエリアを探す
       const textareas = document.querySelectorAll('textarea');
   
       textareas.forEach(textarea => {
           // すでにカウンターが付いてたらスキップ（二重防止）
           if (textarea.dataset.enhanced) return;
           textarea.dataset.enhanced = "true";
   
           // 1. カウンター表示用の要素を作成
           const counterDiv = document.createElement('div');
           counterDiv.style.cssText = `
               position: absolute;
               bottom: 10px;
               right: 10px;
               background: rgba(0, 0, 0, 0.6);
               backdrop-filter: blur(4px);
               color: rgba(255, 255, 255, 0.8);
               padding: 4px 8px;
               border-radius: 6px;
               font-size: 12px;
               pointer-events: none; /* クリックの邪魔をしない */
               transition: opacity 0.3s;
               opacity: 0; /* 最初は隠す */
               font-family: monospace;
           `;
           
           // テキストエリアの親要素を基準にする
           // (親が relative じゃないと位置がズレるので強制設定)
           if (getComputedStyle(textarea.parentElement).position === 'static') {
               textarea.parentElement.style.position = 'relative';
           }
           
           textarea.parentElement.appendChild(counterDiv);
   
           // 入力イベント
           const update = () => {
               const text = textarea.value;
               const count = countGraphemes(text);
               
               counterDiv.textContent = `${count} chars`;
               
               // 文字がある時だけ表示
               counterDiv.style.opacity = count > 0 ? '1' : '0';
   
               // 2. 自動リサイズ（高さ調整）
               textarea.style.height = 'auto'; // 一旦縮める
               textarea.style.height = (textarea.scrollHeight + 5) + 'px'; // 中身に合わせて伸ばす
           };
   
           textarea.addEventListener('input', update);
           
           // 初期実行
           update();
       });
   }
   
   // ページ読み込み完了時
   window.addEventListener('load', () => {
       attachEnhancements();
       setBackground();
   });
   
   // AdminLTEやReact等が後からDOMを書き換える場合に対応 (MutationObserver)
   const observer = new MutationObserver((mutations) => {
       attachEnhancements();
       setBackground(); // 背景が後から上書きされても元に戻す
   });
   
   observer.observe(document.body, {
       childList: true,
       subtree: true
   });