import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(path.join(rootDir, 'requirements', 'flow-cases.json'), 'utf8'));
const expected = new Set(manifest.map(({ id }) => id));
const output = execFileSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['playwright', 'test', '--list'],
  {
    cwd: rootDir,
    encoding: 'utf8',
    env: { ...process.env, E2E_SKIP_HEALTHCHECK: '1' },
  },
);
const projects = ['chromium', 'firefox', 'webkit'];
const matches = [...output.matchAll(/^\s+\[(chromium|firefox|webkit)\].*\[(MC-ET\d{3}-CT\d{3})\]/gm)];
const problems = [];

for (const project of projects) {
  const foundIds = matches.filter((match) => match[1] === project).map((match) => match[2]);
  const counts = new Map();
  for (const id of foundIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  const found = new Set(foundIds);
  const missing = [...expected].filter((id) => !found.has(id));
  const extra = [...found].filter((id) => !expected.has(id));
  const duplicates = [...counts].filter(([, count]) => count !== 1).map(([id, count]) => `${id} (${count}x)`);

  if (missing.length || extra.length || duplicates.length) {
    problems.push({ project, missing, extra, duplicates });
  }
}

if (problems.length || matches.length !== expected.size * projects.length) {
  console.error(JSON.stringify({ problems, total: matches.length, expectedTotal: expected.size * projects.length }, null, 2));
  process.exit(1);
}

console.log(`Rastreabilidade valida: ${expected.size} codigos unicos por projeto; ${matches.length} execucoes em Chromium, Firefox e WebKit.`);
