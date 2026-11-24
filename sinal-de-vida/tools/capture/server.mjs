// The local server of the face and voice capture. It serves the page and writes the takes; nothing leaves this machine, and the
// camera image is never sent: the page sends only the audio (WAV) and the numbers of the face.
//
//   node tools/capture/server.mjs --out <folder> --script <script.json> [--port 8765] [--livelink-port 11111]
//
// With --livelink-port it also listens (UDP, all interfaces, that port only) for the Live Link Face app on an iPhone and passes each frame
// on to the page by Server-Sent Events (/livelink/stream). It saves nothing by itself. The HTTP side stays on 127.0.0.1.
//
// Also serves, read-only, src/ vendor/ assets/models/ assets/props/ data/scenes/ data/cutscenes/ of the game under /game/ (for the 'Jonas ao vivo' panel) and reads/saves mapping.json (/api/mapping, checked).
// The body ("Movimento do corpo"): PUT/GET /api/body/<name> keeps <folder>/<name>.pose.json, the world landmarks of each frame of a video the person picked
// (or of the webcam, live). Numbers only: the image is read in the page and never leaves it.
// Writes <folder>/<id>.wav, <folder>/<id>.face.json and the neutral (neutral.json for the webcam, neutral-livelink.json for the iPhone). HTTP on 127.0.0.1 only.
import http from 'node:http';
import dgram from 'node:dgram';
import { parsePacket } from './livelink.mjs';
import { validateMapping } from './lib.mjs';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const arg = (name, d = null) => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const STATIC = { '/': ['index.html', 'text/html; charset=utf-8'], '/index.html': ['index.html', 'text/html; charset=utf-8'], '/capture.js': ['capture.js', 'text/javascript; charset=utf-8'], '/lib.mjs': ['lib.mjs', 'text/javascript; charset=utf-8'], '/jonas-live.js': ['jonas-live.js', 'text/javascript; charset=utf-8'], '/director.html': ['director.html', 'text/html; charset=utf-8'], '/director.js': ['director.js', 'text/javascript; charset=utf-8'], '/body.js': ['body.js', 'text/javascript; charset=utf-8'] };
// The game, read-only, for the "Jonas ao vivo" panel: only these folders of the game and only these kinds of file (never tools/, never anything outside the game).
const GAME = path.resolve(HERE, '..', '..');
const GAME_DIRS = ['src/', 'vendor/', 'assets/models/', 'assets/props/', 'data/scenes/', 'data/cutscenes/'];
const GAME_TYPES = { '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.glb': 'model/gltf-binary', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg' };
const MAPPING_FILE = path.join(HERE, 'mapping.json');
const MAX_BODY = 200 * 1024 * 1024;

export function createCaptureServer({ out, script, port = 8765, livelinkPort = null, log = console.log, mappingFile = MAPPING_FILE }) {
  const lines = JSON.parse(readFileSync(script, 'utf8')).lines ?? [];
  const ids = new Set(lines.map((l) => l.id));
  mkdirSync(out, { recursive: true });
  const send = (res, code, body, type = 'application/json') => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)); };
  const body = (req) => new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', (c) => { n += c.length; if (n > MAX_BODY) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks))); req.on('error', reject);
  });
  const NEUTRAL = { webcam: 'neutral.json', livelink: 'neutral-livelink.json' };
  const state = () => ({ neutral: { webcam: existsSync(path.join(out, NEUTRAL.webcam)), livelink: existsSync(path.join(out, NEUTRAL.livelink)) }, livelink: { port: udp ? udp.address().port : null, ...ll }, takes: lines.map((l) => ({ id: l.id, audio: existsSync(path.join(out, `${l.id}.wav`)), face: existsSync(path.join(out, `${l.id}.face.json`)) })) });
  // ---- the Live Link Face receiver ----------------------------------------------------------------------------------------------
  const clients = new Set(), ll = { received: 0, ignored: 0, from: null };
  let udp = null; const warned = new Set();
  const broadcast = (obj) => { const line = `data: ${JSON.stringify(obj)}\n\n`; for (const c of clients) c.write(line); };
  const startUdp = () => new Promise((resolve, reject) => {
    udp = dgram.createSocket('udp4');
    udp.on('error', reject);
    udp.on('message', (msg, rinfo) => {
      const at = Date.now(), p = parsePacket(msg);
      if (!p) { ll.ignored++; return; }
      if (!ll.from) { ll.from = rinfo.address; log(`live link: first packet from ${rinfo.address}:${rinfo.port} (subject "${p.subject}", ${p.count} values, ${p.fps || '?'} fps)`); }
      for (const n of p.notes) if (!warned.has(n)) { warned.add(n); log(`live link: ${n}`); }
      ll.received++;
      broadcast({ at, b: p.b.map((v) => +v.toFixed(4)), h: p.h.map((v) => +v.toFixed(4)), ip: rinfo.address, n: ll.received });
    });
    udp.bind(livelinkPort, '0.0.0.0', () => { udp.off('error', reject); resolve(udp.address().port); });
  });
  const server = http.createServer(async (req, res) => {
    try {
      // only this machine, by the name it is reached with (a page from elsewhere cannot make the browser talk to it by a rebinding name)
      const host = String(req.headers.host ?? '');
      if (!(host === `127.0.0.1:${server.address().port}` || host === `localhost:${server.address().port}`)) return send(res, 403, { error: 'host' });
      if (req.method === 'POST' || req.method === 'PUT') { const o = req.headers.origin; if (o && !o.startsWith('http://127.0.0.1:') && !o.startsWith('http://localhost:')) return send(res, 403, { error: 'origin' }); }
      const url = new URL(req.url, 'http://x'), p = url.pathname;
      if (req.method === 'GET' && STATIC[p]) return send(res, 200, readFileSync(path.join(HERE, STATIC[p][0])), STATIC[p][1]);
      if (req.method === 'GET' && p === '/api/script') return send(res, 200, { lines });
      if (req.method === 'GET' && p.startsWith('/game/')) {
        let rel; try { rel = decodeURIComponent(p.slice(6)); } catch { return send(res, 400, { error: 'path' }); }
        const abs = path.resolve(GAME, rel), type = GAME_TYPES[path.extname(abs).toLowerCase()];
        if (!abs.startsWith(GAME + path.sep) || !GAME_DIRS.some((d) => abs.startsWith(path.join(GAME, d))) || !type || !existsSync(abs)) return send(res, 404, { error: 'not found' });
        return send(res, 200, readFileSync(abs), type);
      }
      if (req.method === 'GET' && p === '/api/mapping') return send(res, 200, readFileSync(mappingFile));
      if (req.method === 'PUT' && p === '/api/mapping') {
        let j; try { j = validateMapping(JSON.parse((await body(req)).toString())); } catch (e) { return send(res, 400, { error: String(e.message) }); }
        writeFileSync(mappingFile, JSON.stringify(j, null, 2) + '\n'); return send(res, 200, { ok: true });
      }
      if (req.method === 'GET' && p === '/livelink/stream') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' }); res.write(': ok\n\n');
        clients.add(res); req.on('close', () => clients.delete(res)); return;
      }
      if (req.method === 'GET' && p === '/api/state') return send(res, 200, state());
      if (req.method === 'GET' && p === '/api/neutral') { const f = path.join(out, NEUTRAL[url.searchParams.get('source')] ?? NEUTRAL.webcam); return existsSync(f) ? send(res, 200, readFileSync(f)) : send(res, 404, { error: 'none' }); }
      if (req.method === 'PUT' && p === '/api/neutral') { const j = JSON.parse((await body(req)).toString()); if (!Array.isArray(j.b) || j.b.length !== 51 || !Array.isArray(j.h)) return send(res, 400, { error: 'bad neutral' }); const src = NEUTRAL[url.searchParams.get('source')] ? url.searchParams.get('source') : 'webcam'; writeFileSync(path.join(out, NEUTRAL[src]), JSON.stringify({ ...j, source: src })); return send(res, 200, { ok: true }); }
      const mb = /^\/api\/body\/([A-Za-z0-9_-]{1,40})$/.exec(p);
      if (mb) {
        const file = path.join(out, `${mb[1]}.pose.json`);
        if (req.method === 'PUT') {
          const data = await body(req); let j;
          try { j = JSON.parse(data.toString()); } catch { return send(res, 400, { error: 'not json' }); }
          if (j.kind !== 'pose' || !Array.isArray(j.frames) || !(j.fps > 0)) return send(res, 400, { error: 'bad pose' });
          writeFileSync(file, data); return send(res, 200, { ok: true, bytes: data.length, frames: j.frames.length });
        }
        if (req.method === 'GET') return existsSync(file) ? send(res, 200, readFileSync(file)) : send(res, 404, { error: 'none' });
      }
      const m = /^\/api\/take\/([A-Za-z0-9_-]{1,40})\/(audio|face)$/.exec(p);
      if (m) {
        const [, id, kind] = m;
        if (!ids.has(id)) return send(res, 404, { error: 'unknown line' });
        const file = path.join(out, kind === 'audio' ? `${id}.wav` : `${id}.face.json`);
        if (req.method === 'PUT') {
          const data = await body(req);
          if (kind === 'audio' && !(data.length > 44 && data.toString('latin1', 0, 4) === 'RIFF')) return send(res, 400, { error: 'not a wav' });
          if (kind === 'face') { const j = JSON.parse(data.toString()); if (!Array.isArray(j.frames)) return send(res, 400, { error: 'bad face' }); }
          writeFileSync(file, data); return send(res, 200, { ok: true, bytes: data.length });
        }
        if (req.method === 'GET') return existsSync(file) ? send(res, 200, readFileSync(file), kind === 'audio' ? 'audio/wav' : 'application/json') : send(res, 404, { error: 'none' });
      }
      send(res, 404, { error: 'not found' });
    } catch (e) { send(res, 500, { error: String(e.message ?? e) }); }
  });
  const listen = async () => { if (livelinkPort !== null) await startUdp(); return new Promise((r) => server.listen(port, '127.0.0.1', () => r(server.address().port))); };
  const close = () => new Promise((r) => { for (const c of clients) c.end(); clients.clear(); udp?.close(); server.close(() => r()); server.closeAllConnections?.(); });
  return { server, listen, close, stats: ll, udpPort: () => udp?.address().port ?? null };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = arg('out'), script = arg('script');
  if (!out || !script) { console.error('usage: node tools/capture/server.mjs --out <folder> --script <script.json> [--port 8765]'); process.exit(2); }
  const llp = arg('livelink-port');
  const s = createCaptureServer({ out: path.resolve(String(out)), script: path.resolve(String(script)), port: Number(arg('port', 8765)), livelinkPort: llp === null ? null : Number(llp === true ? 11111 : llp) });
  s.listen().then((p) => { console.log(`capture: http://localhost:${p}  (saves in the folder given in --out)`); if (s.udpPort()) console.log(`live link: listening for the iPhone on UDP ${s.udpPort()} (all interfaces)`); }).catch((e) => { console.error(`error: ${e.message}`); process.exit(1); });
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => s.close().then(() => process.exit(0)));
}
