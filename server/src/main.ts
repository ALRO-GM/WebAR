import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { createApi } from './api.ts';
import { resolveToken } from './auth.ts';
import { CastHub, createCastHandler } from './cast.ts';
import { openDatabase } from './db.ts';

/**
 * El servidor de la imagen: la PWA (ficheros de Vite), la API de clases y
 * /health. Cumple el contrato del despliegue: puerto 8080 y
 * `GET /health` → {"ok":true,"version":"<GIT_SHA>"}. HTTPS y compresión los
 * pone el Caddy de delante.
 */
const PORT = Number(process.env.PORT ?? 8080);
const ROOT = (process.env.STATIC_DIR ?? new URL('../../apps/web/dist/', import.meta.url).pathname).replace(/\/?$/, '/');
const VERSION = process.env.GIT_SHA ?? '';
const MAX_BODY = 512 * 1024;

const db = openDatabase();
const api = createApi(db);
// Emisión al proyector: en memoria, solo con token de profesor (ver cast.ts).
const castHub = new CastHub();
const cast = createCastHandler(castHub, (token) => {
  const who = resolveToken(db, token);
  return who?.kind === 'teacher' ? who.ownerId : null;
});
setInterval(() => castHub.sweep(), 10_000).unref();

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  const data = typeof body === 'string' || body instanceof Buffer ? body : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers });
  res.end(data);
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  if (req.method === 'GET' || req.method === 'DELETE') return undefined;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new Error('demasiado grande');
    chunks.push(chunk as Buffer);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

async function serveStatic(path: string, res: ServerResponse): Promise<void> {
  // Sin «..»: nunca fuera de ROOT.
  const safe = normalize(decodeURIComponent(path)).replace(/^(\.\.[/\\])+/, '');
  let file = join(ROOT, safe);
  if (!file.startsWith(ROOT)) return send(res, 403, { error: 'No' });
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
  } catch {
    // Rutas de la app sin fichero (p. ej. /clase): la página principal.
    if (extname(file)) return send(res, 404, 'No existe', { 'Content-Type': 'text/plain; charset=utf-8' });
    file = join(ROOT, 'index.html');
  }
  try {
    const data = await readFile(file);
    const name = file.slice(ROOT.length);
    // Lo de Vite lleva hash: para siempre. El service worker, el manifiesto y el HTML: siempre frescos.
    const cache = name.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
    send(res, 200, data, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': cache });
  } catch {
    send(res, 404, 'No existe', { 'Content-Type': 'text/plain; charset=utf-8' });
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  try {
    if (url.pathname === '/health') return send(res, 200, { ok: true, version: VERSION });
    // Va antes que el resto de la API: tiene esperas largas e imágenes, no solo JSON.
    if (url.pathname === '/api/emision' || url.pathname.startsWith('/api/emision/')) return await cast(req, res, url);
    if (url.pathname.startsWith('/api/')) {
      let body: unknown;
      try {
        body = await readBody(req);
      } catch {
        return send(res, 400, { error: 'Petición no válida' });
      }
      const auth = req.headers.authorization;
      const out = api({ method: req.method ?? 'GET', path: url.pathname, token: auth?.startsWith('Bearer ') ? auth.slice(7) : undefined, body });
      return send(res, out.status, out.body);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Método no permitido' });
    await serveStatic(url.pathname, res);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) send(res, 500, { error: 'Error del servidor' });
  }
});

server.listen(PORT, () => console.log(`WebAR ${VERSION || '(sin versión)'} en :${PORT}, estáticos en ${ROOT}`));
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => {
    server.close(() => (db.close(), process.exit(0)));
    // Las esperas largas de la emisión (hasta 25 s) no deben retrasar el apagado.
    server.closeIdleConnections();
    setTimeout(() => server.closeAllConnections(), 2000).unref();
  });
