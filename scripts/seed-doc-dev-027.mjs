import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const backendPath = path.resolve(
  process.cwd(),
  process.env.BACKEND_PATH ?? '../Repos/xbri-atual/XBRI-Store-Checkout-Laravel',
);
const backendEnv = process.env.BACKEND_ENV ?? 'local';

if (!existsSync(path.join(backendPath, 'artisan'))) {
  throw new Error(`Backend Laravel nao encontrado em ${backendPath}. Configure BACKEND_PATH.`);
}

execFileSync(
  'php',
  ['artisan', 'db:seed', '--class=Database\\Seeders\\DocDev027Seeder', `--env=${backendEnv}`, '--no-interaction'],
  { cwd: backendPath, stdio: 'inherit', env: process.env },
);
