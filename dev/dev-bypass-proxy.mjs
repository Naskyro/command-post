// LOCAL DEV ONLY — do not deploy, do not expose beyond loopback.
// Injects the same verified-identity headers the standalone gateway adds,
// so the app loads without sign-in for local browsing. Reads the gateway
// secret from .dev.vars (never hardcode it). Person defaults to jerson.
import http from 'node:http';
import net from 'node:net';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(join(dir, '..', '.dev.vars'), 'utf8')
    .split(/\r?\n/)
    .filter(l => l && !l.trim().startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const secret = env.COMMAND_AUTH_GATEWAY_SECRET;
const person = process.env.DEV_PERSON || 'jerson';
if (!secret) { console.error('COMMAND_AUTH_GATEWAY_SECRET missing from .dev.vars'); process.exit(1); }

const TARGET_PORT = Number(process.env.DEV_TARGET_PORT || 5173);
const LISTEN_PORT = Number(process.env.DEV_BYPASS_PORT || 5200);
const HOST = '127.0.0.1';

const server = http.createServer((req, res) => {
  const headers = { ...req.headers };
  headers['x-command-gateway-key'] = secret;
  headers['x-command-person-id'] = person;
  const proxy = http.request(
    { hostname: HOST, port: TARGET_PORT, path: req.url, method: req.method, headers },
    (up) => { res.writeHead(up.statusCode || 502, up.headers); up.pipe(res); }
  );
  proxy.on('error', (e) => {
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('dev bypass proxy error: ' + e.message);
  });
  req.pipe(proxy);
});

server.on('upgrade', (req, socket, head) => {
  const up = net.connect(TARGET_PORT, HOST, () => {
    const headers = { ...req.headers };
    headers['x-command-gateway-key'] = secret;
    headers['x-command-person-id'] = person;
    const lines = [`${req.method} ${req.url} HTTP/1.1`];
    for (const [k, v] of Object.entries(headers)) lines.push(`${k}: ${v}`);
    up.write(lines.join('\r\n') + '\r\n\r\n');
    if (head?.length) up.write(head);
    socket.pipe(up).pipe(socket);
  });
  up.on('error', () => socket.destroy());
});

server.listen(LISTEN_PORT, HOST, () => {
  console.log(`Dev bypass (DEV ONLY): http://localhost:${LISTEN_PORT} -> ${HOST}:${TARGET_PORT} as ${person}`);
});
