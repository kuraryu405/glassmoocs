(function () {
  globalThis.__glassmoocsAssignmentReminderBooted = true;
  document.documentElement.dataset.glassmoocsAssignmentBoot = 'true';

  function mountPanel() {
    if (document.querySelector('.glassmoocs-assignment-reminder-panel')) {
      return;
    }

    const panel = document.createElement('section');
    panel.className = 'glassmoocs-assignment-reminder-panel';
    panel.dataset.glassmoocsAssignmentReminder = 'true';
    panel.innerHTML = `
      <div>
        <p class="glassmoocs-assignment-reminder-eyebrow">GlassMOOCs Assignments</p>
        <h2 class="glassmoocs-assignment-reminder-title">課題の出し忘れ</h2>
        <p class="glassmoocs-assignment-reminder-summary">まだ確認していません。</p>
      </div>
      <div class="glassmoocs-assignment-reminder-actions">
        <button type="button" class="glassmoocs-assignment-reminder-button" data-glassmoocs-assignment-action="scan" disabled>課題を確認</button>
      </div>
      <div class="glassmoocs-assignment-reminder-body"></div>
    `;

    const contentHeader = document.querySelector('.content-header');
    if (contentHeader?.parentElement) {
      contentHeader.insertAdjacentElement('afterend', panel);
      return;
    }

    const contentWrapper = document.querySelector('.content-wrapper');
    if (contentWrapper) {
      contentWrapper.prepend(panel);
      return;
    }

    document.body?.prepend(panel);
  }

  // content.js の injectAssignmentReminderPanel() がライフサイクル(表示/除去)を
  // 所有するため、ここでは早期ペイント用の骨組みだけ出して常駐監視はしない。
  // 常駐 MutationObserver を置くと、対象外ページで content.js が除去した
  // パネルを復活させて付け外し churn を起こす。
  function scheduleMountRetries() {
    let remaining = 20;
    const timer = window.setInterval(() => {
      remaining -= 1;
      mountPanel();
      if (remaining <= 0) {
        window.clearInterval(timer);
      }
    }, 250);
  }

  if (document.body) {
    mountPanel();
    scheduleMountRetries();
  } else {
    document.addEventListener(
      'DOMContentLoaded',
      () => {
        mountPanel();
        scheduleMountRetries();
      },
      { once: true },
    );
  }
})();
