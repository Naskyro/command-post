// Local dev bootstrap: run operator.mjs bootstrap for a roster person with
// the passphrase supplied once on the command line of THIS script (dev only —
// real operator flow uses a TTY/fd). Passes the passphrase via fd 3.
// Usage: node dev/bootstrap-owner.mjs <person> <username> <actor> <reason> <passphrase>
import { spawnSync } from 'node:child_process';
import { writeFileSync, openSync, unlinkSync, closeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const dir = dirname(fileURLToPath(import.meta.url));
const [person, username, actor, reason, passphrase] = process.argv.slice(2);
if (!person || !username || !actor || !reason || !passphrase || passphrase.length < 15) {
  console.error('Usage: node dev/bootstrap-owner.mjs <person> <username> <actor> <reason> <passphrase(15+)>');
  process.exit(2);
}
const tmp = join(tmpdir(), 'cmd-pw-' + randomBytes(6).toString('hex'));
writeFileSync(tmp, passphrase + '\n' + passphrase + '\n', { mode: 0o600 });
const fd = openSync(tmp, 'r');
try {
  const res = spawnSync(process.execPath, [
    resolve(join(dir, 'operator-shim.mjs')),
    'bootstrap',
    '--person=' + person,
    '--verified-roster=' + person,
    '--username=' + username,
    '--actor=' + actor,
    '--reason=' + reason,
    '--password-fd=3',
  ], { stdio: ['inherit', 'inherit', 'inherit', fd], env: process.env });
  process.exitCode = res.status ?? 1;
} finally {
  closeSync(fd);
  try { unlinkSync(tmp); } catch {}
}
