// Local Windows runner for the standalone Command auth gateway.
// server.mjs calls process.umask(0o077), which is unsupported on Windows,
// so we stub it before importing the real entrypoint. We also point
// argv[1] at server.mjs so its main-module guard fires. No source changes.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
process.umask = () => 0o022;
process.argv[1] = resolve(join(dir, '..', 'standalone', 'command-auth', 'server.mjs'));
await import('../standalone/command-auth/server.mjs');
