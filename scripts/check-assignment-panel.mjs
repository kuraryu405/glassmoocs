import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const content = readFileSync(
  new URL('../public/content.js', import.meta.url),
  'utf8',
);
const boot = readFileSync(
  new URL('../public/content/assignment-reminder-boot.js', import.meta.url),
  'utf8',
);
// Exercise the actual injection function without starting unrelated extension APIs.
function sourceFunction(name) {
  const start = content.indexOf(`  function ${name}(`);
  assert.ok(start >= 0, name);
  const end = content.indexOf('\n  }', start) + 4;
  return content.slice(start, end);
}

for (const path of [
  '/courses',
  '/courses/',
  '/courses?year=2026',
  '/courses/2026',
  '/courses/2026/',
  '/courses/2026/CS101',
  '/courses/2026/CS101/',
  '/courses/2026/CS101/1',
  '/courses/2026/CS101/1/2',
]) {
  const location = new URL(path, 'https://moocs.iniad.org');
  const expected = location.pathname.includes('/CS101');
  let panel = null;
  let created = 0;
  let mounted = 0;
  let rendered = 0;
  const document = {
    documentElement: { dataset: {} },
    body: {
      prepend(node) {
        panel = node;
        mounted += 1;
      },
    },
    querySelector(selector) {
      return selector === '.glassmoocs-assignment-reminder-panel'
        ? panel
        : null;
    },
    createElement() {
      created += 1;
      return {
        dataset: {},
        remove() {
          panel = null;
        },
      };
    },
  };
  const context = {
    document,
    window: {
      location,
      setInterval(callback) {
        for (let i = 0; i < 19; i += 1) callback();
        return 1;
      },
    },
    URL,
    assignmentScanCache: new Map(),
    getCurrentPageContext(_document, url) {
      return context.parseMoocsUrl(url);
    },
    createAssignmentReminderPanel() {
      return document.createElement('section');
    },
    attachAssignmentReminderPanelListeners() {},
    mountAssignmentReminderPanel(node) {
      document.body.prepend(node);
    },
    renderAssignmentReminderPanel() {
      rendered += 1;
    },
  };
  runInNewContext(boot, context);
  assert.equal(created, expected ? 1 : 0, `boot: ${path}`);
  runInNewContext(
    [
      'parseMoocsUrl',
      'getCurrentAssignmentScope',
      'getAssignmentScanCacheKey',
      'injectAssignmentReminderPanel',
    ]
      .map(sourceFunction)
      .join('\n'),
    context,
  );
  context.injectAssignmentReminderPanel();
  context.injectAssignmentReminderPanel();
  assert.equal(Boolean(panel), expected, `content: ${path}`);
  assert.equal(rendered, expected ? 2 : 0, `render: ${path}`);
  if (!expected) {
    assert.equal(mounted, 0, `no transient panel: ${path}`);
    panel = document.createElement('section');
    context.injectAssignmentReminderPanel();
    assert.equal(panel, null, `remove stale results: ${path}`);
  }
}
console.log(
  'Assignment panel checks passed (list hidden; course/lecture/page retained).',
);
