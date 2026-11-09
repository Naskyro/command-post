// Local development TLS front for the standalone Command auth gateway.
// The gateway requires an https COMMAND_PUBLIC_ORIGIN but itself binds
// loopback HTTP. This proxy terminates TLS on https://localhost:8443 and
// forwards to the gateway's public listener at 127.0.0.1:4100, including
// WebSocket upgrades so Vite HMR keeps working through the proxy.
import https from 'node:https';
import http from 'node:http';
import net from 'node:net';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const options = {
  key: readFileSync(join(dir, 'certs', 'key.pem')),
  cert: readFileSync(join(dir, 'certs', 'cert.pem')),
};
const TARGET_PORT = Number(process.env.LOCAL_TLS_TARGET_PORT || 4100);
const LISTEN_PORT = Number(process.env.LOCAL_TLS_PORT || 8443);
const HOST = '127.0.0.1';

const server = https.createServer(options, (req, res) => {
  const headers = { ...req.headers, host: `localhost:${LISTEN_PORT}` };
  const proxy = http.request(
    { hostname: HOST, port: TARGET_PORT, path: req.url, method: req.method, headers },
    (up) => {
      res.writeHead(up.statusCode || 502, up.headers);
      up.pipe(res);
    }
  );
  proxy.on('error', (e) => {
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('gateway proxy error: ' + e.message);
  });
  req.pipe(proxy);
});

server.on('upgrade', (req, socket, head) => {
  const up = net.connect(TARGET_PORT, HOST, () => {
    const headers = { ...req.headers, host: `localhost:${LISTEN_PORT}` };
    const lines = [`${req.method} ${req.url} HTTP/1.1`];
    for (const [k, v] of Object.entries(headers)) lines.push(`${k}: ${v}`);
    up.write(lines.join('\r\n') + '\r\n\r\n');
    if (head?.length) up.write(head);
    socket.pipe(up).pipe(socket);
  });
  up.on('error', () => socket.destroy());
});

server.listen(LISTEN_PORT, () => {
  console.log(`Command local TLS proxy: https://localhost:${LISTEN_PORT} -> http://${HOST}:${TARGET_PORT}`);
});
