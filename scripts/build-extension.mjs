import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { transformWithEsbuild } from 'vite';

const ROOT_DIR = resolve(import.meta.dirname, '..');
const mode = process.argv.includes('--dev') ? 'development' : 'production';
const debugLogsEnabled = mode !== 'production';

const SCRIPT_FILES = [
  'background.js',
  'content.js',
  'content/download-panel.js',
  'popup.js',
  'popup/slides-permission-card.js',
  'slides-export.js',
  'slides-export/svg-export.js',
];

function run(command, args, env = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT_DIR,
      env: {
        ...process.env,
        ...env,
      },
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      reject(
        new Error(`${command} ${args.join(' ')} exited with code ${code}`),
      );
    });

    child.on('error', reject);
  });
}

function stripDebugOnlyHtml(html) {
  if (debugLogsEnabled) {
    return html;
  }

  return html.replace(
    /\s*<!-- GLASSMOOCS_DEBUG_ONLY_START -->[\s\S]*?<!-- GLASSMOOCS_DEBUG_ONLY_END -->/g,
    '',
  );
}

function replaceDebugStringMacros(source) {
  return source.replace(
    /__GLASSMOOCS_DEBUG_STRING__\(\s*(['"])([^'"\n]*)\1\s*,?\s*\)/g,
    (_match, quote, value) =>
      debugLogsEnabled ? `${quote}${value}${quote}` : "''",
  );
}

async function transformScript(relativePath) {
  const filePath = resolve(ROOT_DIR, 'dist', relativePath);
  const source = replaceDebugStringMacros(await readFile(filePath, 'utf8'));
  const result = await transformWithEsbuild(source, filePath, {
    define: {
      __GLASSMOOCS_ENABLE_DEBUG_LOGS__: JSON.stringify(debugLogsEnabled),
    },
    legalComments: 'none',
    minify: !debugLogsEnabled,
    target: 'es2020',
  });

  await writeFile(filePath, result.code);
}

async function postprocessDist() {
  await Promise.all(SCRIPT_FILES.map(transformScript));

  const popupPath = resolve(ROOT_DIR, 'dist', 'popup.html');
  const popupHtml = await readFile(popupPath, 'utf8');
  await writeFile(popupPath, stripDebugOnlyHtml(popupHtml));
}

await run('pnpm', ['exec', 'vite', 'build', '--mode', mode], {
  GLASSMOOCS_DEBUG_LOGS: debugLogsEnabled ? 'true' : 'false',
});
await postprocessDist();
