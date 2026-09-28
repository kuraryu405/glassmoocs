import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(
  new URL('../public/content/download-panel.js', import.meta.url),
  'utf8',
);
const start = source.indexOf('    function mountDownloadPanel(');
const end = source.indexOf('    async function refreshDownloadPanels(', start);
assert.ok(start >= 0 && end > start);
class Element {}
const context = {
  Element,
  document: {},
  debugPanelLog() {},
  getElementSummary() {},
  getPanelDebugSnapshot() {},
};
runInNewContext(source.slice(start, end), context);
for (const placement of ['afterend', 'beforebegin', 'prepend']) {
  const panel = {};
  let mutations = 0;
  const anchor = Object.assign(new Element(), {
    parentElement: {},
    insertAdjacentElement(position, node) {
      assert.equal(position, placement);
      this[
        position === 'afterend'
          ? 'nextElementSibling'
          : 'previousElementSibling'
      ] = node;
      mutations += 1;
    },
    prepend(node) {
      this.firstElementChild = node;
      mutations += 1;
    },
  });
  context.mountDownloadPanel(panel, { node: anchor, placement });
  context.mountDownloadPanel(panel, { node: anchor, placement });
  assert.equal(mutations, 1, `${placement}: mount once without mutation loop`);
}
console.log('Download panel placement and repeated mounting passed.');
