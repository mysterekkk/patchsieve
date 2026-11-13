import { build } from 'esbuild';
import { chmodSync } from 'node:fs';

const common = {
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  minify: true,
  legalComments: 'none',
  logLevel: 'info',
  banner: { js: "import { createRequire as __cr } from 'node:module'; import { fileURLToPath as __fu } from 'node:url'; import { dirname as __dn } from 'node:path'; const require = __cr(import.meta.url); const __filename = __fu(import.meta.url); const __dirname = __dn(__filename);" },
};

await build({ ...common, entryPoints: ['src/action/index.ts'], outfile: 'dist/action.js' });
await build({ ...common, entryPoints: ['src/cli/index.ts'], outfile: 'dist/cli.js', banner: { js: "#!/usr/bin/env node\n" + common.banner.js } });
try { chmodSync('dist/cli.js', 0o755); } catch { /* not supported on this platform */ }
