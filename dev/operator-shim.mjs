// Windows shim for standalone/command-auth/operator.mjs.
// Stubs process.umask (unsupported on Windows) and points argv[1] at the
// real entrypoint. No v107 source changes.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
process.umask = () => 0o022;
process.argv[1] = resolve(join(dir, '..', 'standalone', 'command-auth', 'operator.mjs'));
await import('../standalone/command-auth/operator.mjs');
