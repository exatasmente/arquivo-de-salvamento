// The feet stay on the floor (the person's decision of 2026-11-19: three cuts for the networks were turned down because "o personagem está
// deslizando"), the body moves like a body, and the trunk stays over the hips over the feet (three repairs were turned down: the legs bent
// after the feet, a jog slowed to walking speed, and then "o tronco ao contrário": a turn of the trunk that added up frame after frame).
// Jonas and the dog are driven as the game drives them (tools/anim/feet.js) and four things are measured: the drift of every stance (a foot
// that is down must stay where it came down), the pace of each gait (one clip per gait, made for the speed it is played at), how much the
// legs are bent away from the clips (nothing at all in a steady gait) and which way the hips, the chest and the head face against the feet.
// The limits: 3 cm in a steady gait, 9 cm where he starts or stops, 16 cm round a square corner and along the short ways of scene 4. Walking,
// running and crouching at the game's speeds, starting, stopping, turning on the spot and as he goes, scene 4 (the look over the shoulder on
// his knees, the dive and the roll, the way to the dog, back to the cable, to the skip), the dog's walk, trot, route with corners, its lunge
// and skid into the skip and its fall, and the film mode (src/cutscenes/stage.js), whose actors once stepped by the clock.
// Needs a Chrome and playwright-core: PLAYWRIGHT_CORE=<folder> node --test test/pes.test.mjs (skipped otherwise).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const CORE = process.env.PLAYWRIGHT_CORE, skip = CORE ? false : 'set PLAYWRIGHT_CORE to run the browser tests';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.glb': 'model/gltf-binary', '.jpg': 'image/jpeg' };
// metres a foot that is down may drift over the floor: in a steady gait; starting or stopping; and round a square corner or along the ways
// of scene 4 (a turn, a start, a corner and a stop in two metres)
const MAX = 0.03, MAX_TURN = 0.09, MAX_WAY = 0.16;
const DEG = Math.PI / 180;

async function withLab(fn) {
  const { chromium } = createRequire(import.meta.url)(CORE);
  const srv = http.createServer((req, res) => {
    let p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0])); if (p.endsWith('/')) p += 'index.html';
    if (!p.startsWith(ROOT) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': MIME[path.extname(p)] ?? 'application/octet-stream' }); res.end(readFileSync(p));
  });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome', args: ['--mute-audio', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 320, height: 180 } }), errors = [];
    page.on('pageerror', (e) => errors.push(String(e))); page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    // the film mode waits for the models; the lab builds its own render beside it
    await page.goto(`http://127.0.0.1:${srv.address().port}/index.html?film`);
    await page.waitForFunction(() => typeof window.setup === 'function', null, { timeout: 120000 });
    await page.evaluate(async () => {
      const [{ createRender }, F] = await Promise.all([import('/src/render.js'), import('/tools/anim/feet.js')]);
      const c = document.createElement('canvas'); c.width = 320; c.height = 180; document.body.append(c);
      window.__feet = { r: createRender(c), F };
    });
    await fn(page);
    assert.deepEqual(errors, [], 'no console error');
  } finally { await browser.close(); srv.close(); }
}
const cm = (x) => `${(x * 100).toFixed(1)} cm`;
const A = 4.6, W = 0.6;
// (the choice comes 3.8 s after the dodge is pressed: he is walking the last of his way back to the dog)
const QUIET = { variant: 'cheia', from: -1, film: true, dodge: { side: 'left', at: A + 0.5 }, starts: [0, A, 8.9, 10.1, 12.4, 14.9], wins: [4.4, W, 2.0, 1.6, 3.6, 1.2], choice: { id: 'quiet', at: 10.1 }, b1End: 11.7, deafAt: 11.7, freedAt: 14.4, closedAt: 15.3 };
const LOUD = { variant: 'cheia', from: -1, film: true, dodge: { side: 'left', at: A + 0.5 }, starts: [0, A, 8.9, 10.1, 12.0, 16.0], wins: [4.4, W, 2.0, 0.9, 5.0, 1.4], choice: { id: 'loud', at: 10.1 }, jabAt: 10.5, b1End: 10.5, spent: true, freedAt: 15.5, closedAt: 16.5 };

test('Jonas walks, runs and crouches with his feet on the floor: one clip for each gait, made for the speed it is played at, and no leg bent after a foot', { skip, timeout: 300000 }, async () => {
  await withLab(async (page) => {
    const r = await page.evaluate(() => {
      const { r, F } = window.__feet, out = {};
      for (const [k, extra, T] of [['stroll', { k: 0.71 }, 3], ['walk', {}, 3], ['run', { run: true }, 3], ['crouch', { crouch: true }, 4]]) {
        const p = F.player(r, (t) => ({ mz: t < T ? -1 : 0, ...extra }), T + 1.6), st = F.carried(p.samples, { from: 1.4, to: T - 0.05 });
        out[k] = { steady: F.worst(st), start: F.worst(F.carried(p.samples, { from: 0, to: 1.4 })), stop: F.worst(F.carried(p.samples, { from: T - 0.05 })), n: st.length, cycle: F.cycle(st),
          ik: Math.max(...p.samples.filter((s) => s.t > 1.4 && s.t < T - 0.05).map((s) => s.ik)), speed: p.samples[Math.round((T - 0.3) * 60)].speed,
          clips: [...new Set(p.samples.filter((s) => s.t > 1.4 && s.t < T - 0.05).flatMap((s) => Object.entries(s.shares ?? {}).filter(([, w]) => w > 0.02).map(([n]) => n)))],
          began: p.samples.some((s) => (s.shares?.walk_start ?? 0) + (s.shares?.crouch_start ?? 0) > 0.9), ended: p.samples.some((s) => Object.entries(s.shares ?? {}).some(([n, w]) => /_stop_\d$/.test(n) && w > 0.9)),
          trunk: F.trunk(p.samples, { from: 1.4, to: T - 0.05 }) };
        out.gait = p.gait;
      }
      return out;
    });
    // the game's speeds, and a clip made for each: the stick all the way is a brisk walk (the person's decision of 2026-11-19), the run and
    // the crouched walk are the library's at the speed of their own root motion. No clip is played under 0.85 or over 1.2 of its speed.
    assert.ok(Math.abs(r.walk.speed - 1.55) < 0.01 && Math.abs(r.run.speed - 4.8) < 0.01 && Math.abs(r.crouch.speed - 1.0) < 0.01 && Math.abs(r.stroll.speed - 1.1) < 0.01, `speeds ${r.stroll.speed} ${r.walk.speed} ${r.run.speed} ${r.crouch.speed}`);
    for (const [clip, k] of [['walk', 'stroll'], ['brisk', 'walk'], ['run', 'run'], ['crouch_walk', 'crouch']]) {
      const rate = r[k].speed / r.gait[clip].speed;
      assert.ok(rate > 0.85 && rate < 1.2, `${clip} is played at ${rate.toFixed(2)} of its speed (${r.gait[clip].speed.toFixed(2)} m/s, ${r.gait[clip].len.toFixed(2)} m a cycle)`);
      assert.deepEqual(r[k].clips, [clip], `${k}: one clip, not a mix`);
    }
    // a cadence a person has: a cycle (two steps) of the brisk walk in 0.8 to 1 s, of the run in 0.85 to 1 s, of the crouched walk in 1.2 to 1.6 s
    const pace = { walk: [0.8, 1.0], run: [0.85, 1.0], crouch: [1.2, 1.6] };
    for (const k of ['stroll', 'walk', 'run', 'crouch']) {
      assert.ok(r[k].n >= 3, `${k}: steps were measured (${r[k].n})`);
      if (pace[k]) assert.ok(r[k].cycle > pace[k][0] && r[k].cycle < pace[k][1], `${k}: a cycle every ${r[k].cycle.toFixed(2)} s`);
      assert.equal(r[k].ik, 0, `${k}: the legs are the clip's, no foot is held`);
      assert.ok(r[k].steady < MAX, `${k}: a foot down drifted ${cm(r[k].steady)}`);
      for (const part of ['start', 'stop']) assert.ok(r[k][part] < MAX_TURN, `${k}, ${part}: a foot down drifted ${cm(r[k][part])}`);
      // the trunk over the hips: a walk turns the chest a little against the hips; the library's run more (its own swing), never past a third of a turn
      assert.ok(r[k].trunk.chest < (k === 'run' ? 50 : 20) * DEG && r[k].trunk.hips < 15 * DEG, `${k}: chest ${(r[k].trunk.chest / DEG).toFixed(0)} deg off the hips, hips ${(r[k].trunk.hips / DEG).toFixed(0)} deg off the way he goes`);
    }
    // he sets off and stops through clips of their own (walking and crouched)
    for (const k of ['walk', 'crouch']) assert.ok(r[k].began && r[k].ended, `${k}: the start's clip ${r[k].began}, the stop's ${r[k].ended}`);
  });
});

test('turning on the spot is a clip of steps of the angle asked; turning as he goes keeps his feet; and his trunk never turns away from his hips', { skip, timeout: 300000 }, async () => {
  await withLab(async (page) => {
    const r = await page.evaluate(() => {
      const { r, F } = window.__feet, PI = Math.PI, out = { turns: {} };
      // the stick tapped to a side from standing: he turns to it on the spot and stays
      for (const [name, a] of [['45', PI / 4], ['90', PI / 2], ['-135', -PI * 0.75], ['180', PI * 0.999]]) {
        const p = F.player(r, (t) => (t > 0.5 && t < 0.56 ? { mx: -Math.sin(a), mz: -Math.cos(a) } : {}), 2.6), st = F.carried(p.samples, { from: 0.3 });
        out.turns[name] = { worst: F.worst(st), n: st.length, yaw: p.samples.at(-1).yaw, asked: a, clip: p.samples.some((s) => Object.entries(s.shares ?? {}).some(([n, w]) => /^turn_[lr]\d+$/.test(n) && w > 0.5)), trunk: F.trunk(p.samples, { from: 0.3 }) };
      }
      const corner = (extra) => { const p = F.player(r, (t) => (t < 2.0 ? { mz: -1, ...extra } : t < 4 ? { mx: 1, ...extra } : { ...extra }), 5.4); return { worst: F.worst(F.carried(p.samples, { from: 1.4, to: 3.9 })), trunk: F.trunk(p.samples, { from: 1.4, to: 3.9 }) }; };
      out.walk = corner({}); out.crouch = corner({ crouch: true }); out.run = corner({ run: true });
      // about face as he walks, with no stop
      const about = F.player(r, (t) => (t < 2.0 ? { mz: -1 } : t < 4 ? { mz: 1 } : {}), 5.4); out.about = { trunk: F.trunk(about.samples, { from: 1.4, to: 5.3 }) };
      out.twice = F.twice(r);
      return out;
    });
    for (const [name, t] of Object.entries(r.turns)) {
      assert.ok(t.worst < MAX, `${name} on the spot: a foot down drifted ${cm(t.worst)}`); assert.ok(t.n >= 4 && t.clip, `${name}: it took steps (${t.n} stances), by the turn's clip`);
      assert.ok(Math.abs(Math.atan2(Math.sin(t.yaw - t.asked), Math.cos(t.yaw - t.asked))) < 0.02, `${name}: he faces where he was asked`);
      // the hips stay with the root (they are where the feet are taken), the chest with the hips, the head a little ahead
      assert.ok(t.trunk.chest < 20 * DEG && t.trunk.head < 35 * DEG && t.trunk.hips < 20 * DEG, `${name}: chest ${(t.trunk.chest / DEG).toFixed(0)}, head ${(t.trunk.head / DEG).toFixed(0)} deg off the hips; hips ${(t.trunk.hips / DEG).toFixed(0)} off the root`);
    }
    assert.ok(r.walk.worst < MAX_WAY, `walking round a corner: ${cm(r.walk.worst)}`); assert.ok(r.crouch.worst < MAX_WAY, `crouched round a corner: ${cm(r.crouch.worst)}`); assert.ok(r.run.worst < MAX_TURN, `running round a corner: ${cm(r.run.worst)}`);
    for (const k of ['walk', 'crouch', 'about']) assert.ok(r[k].trunk.chest < 25 * DEG && r[k].trunk.hips < 20 * DEG, `${k}, turning as he goes: chest ${(r[k].trunk.chest / DEG).toFixed(0)} deg off the hips, hips ${(r[k].trunk.hips / DEG).toFixed(0)} off the root`);
    // a pose asked twice is the same pose, and a twist asked back to nothing leaves nothing (it once added up: "o tronco ao contrário")
    for (const [k, t] of Object.entries(r.twice)) {
      assert.ok(t.again < 1e-4 && t.back < 1e-4, `${k}: asked again ${(t.again / DEG).toFixed(2)} deg, asked back ${(t.back / DEG).toFixed(2)} deg`);
      assert.ok(t.turned > 20 * DEG && t.turned < 60 * DEG && t.hips < 15 * DEG && t.hips < t.turned && t.turned < t.head && t.head < 75 * DEG, `${k}: the twist goes up the chain: hips ${(t.hips / DEG).toFixed(0)}, chest ${(t.turned / DEG).toFixed(0)}, head ${(t.head / DEG).toFixed(0)} deg`);
    }
  });
});

test('scene 4: kneeling he looks back with his shoulders; the dodge is a dive and a roll up onto his feet; every way he goes keeps his feet, and his trunk stays over his hips', { skip, timeout: 300000 }, async () => {
  await withLab(async (page) => {
    const r = await page.evaluate(async ([Q, L]) => {
      const { r, F } = window.__feet, out = {}, E = await import('/src/systems/emenda.js');
      const cine = F.scene4(r, Q, -1.4, 0); out.look = F.worst(F.carried(cine, { h: 0.09 })); out.lookTrunk = F.trunk(cine, { from: -0.4 });
      const all = F.scene4(r, Q, 4.3, 21), ready = Q.dodge.at + E.DODGE_END;
      out.lookAct = F.worst(F.carried(all, { from: 4.6, to: 5.05, h: 0.09 }));
      out.actions = [...new Set(all.filter((s) => s.t > 5 && s.t < 10).map((s) => s.action))];
      out.roll = F.worst(F.carried(all, { from: 5.15, to: 5.9 }));
      out.up = F.worst(F.carried(all, { from: 5.9, to: 10.1 }));
      out.way = F.worst(F.carried(all, { from: 10.1, to: 14.8 }));
      out.cable = F.worst(F.carried(all, { from: 14.8, to: 15.8 }));
      out.hide = F.worst(F.carried(all, { from: 15.8 }));
      out.loud = F.worst(F.carried(F.scene4(r, L, 9.2, 18.1), { from: 10.05 }));
      // after the roll, on his feet: the trunk is over the hips again (the look over the shoulder left nothing behind), all the way
      out.after = F.trunk(all, { from: 6.0, to: 14.8 }); out.kneel = F.trunk(all, { from: 4.95, to: 5.08 });
      // with no choice made he is at READY, crouched and facing the dog, when the dodge is over
      const free = F.scene4(r, { ...Q, choice: null, starts: Q.starts.slice(0, 3), wins: Q.wins.slice(0, 3) }, ready - 0.05, ready + 0.1), at = free.at(-1);
      out.ready = Math.hypot(at.pos[0] + 12.6, at.pos[1] - 7.7); out.readyAt = E.DODGE_END;
      return out;
    }, [QUIET, LOUD]);
    assert.ok(r.look < MAX && r.lookAct < MAX_TURN, `the look over the shoulder: ${cm(r.look)}, ${cm(r.lookAct)}`);
    // the look back: a little in the hips, most of it up the spine, the head furthest; never the trunk turned away from the legs
    for (const t of [r.lookTrunk, r.kneel]) assert.ok(t.chest > 25 * DEG && t.chest < 50 * DEG && t.head < 75 * DEG && t.hips < 20 * DEG, `kneeling, looking back: chest ${(t.chest / DEG).toFixed(0)}, head ${(t.head / DEG).toFixed(0)} deg off the hips; hips ${(t.hips / DEG).toFixed(0)} off the root`);
    assert.ok(r.after.chest < 25 * DEG && r.after.hips < 25 * DEG, `after the roll: chest ${(r.after.chest / DEG).toFixed(0)} deg off the hips, hips ${(r.after.hips / DEG).toFixed(0)} off the root`);
    assert.ok(r.actions.includes('esquivar') && !r.actions.includes('derrubado'), `the dive and the roll, never flat on his back (${r.actions})`);
    assert.ok(r.ready < 0.01 && r.readyAt < 4.5, `he is where he can reach the dog ${r.readyAt.toFixed(2)} s after the dodge (${cm(r.ready)} away)`);
    for (const k of ['roll', 'up', 'way', 'cable', 'hide', 'loud']) assert.ok(r[k] < MAX_WAY, `${k}: a foot down drifted ${cm(r[k])}`);
  });
});

// ---- stairs, steps and slopes; the states of his legs and the changes between them (2026-11-23) ---------------------------------------------
// "a animação do Jonas subindo a escada ele está deslizando e andando, precisa subir os degraus correndo": on a stair each foot comes down on
// the middle of a tread and stays there (the stair's loop is stepped by the treads covered), at the height of that tread (the ground under each
// foot), the hips going up steadily; standing on the edge of a step or on a slope each foot is on its own ground and the hips come down to the
// lower one. He takes a tread at every step, running too (the person's choice of 2026-11-23, "um por degrau"). A stance on a tread may drift 3 cm, stand 3 cm off the tread's top and 6 cm off its middle (the first and the last step of a
// flight, where the gait changes, are held to MAX_WAY and half a tread: the first two steps and the last).
test('on a stair he runs and walks up and down with a foot on a tread at every step: on its middle, at its height, and it stays there', { skip, timeout: 300000 }, async () => {
  await withLab(async (page) => {
    const r = await page.evaluate(() => {
      const { r, F } = window.__feet, out = {};
      // (the building's treads: 0.28 m deep in the first flights, 0.35 m above; running, 4.4 steps a second, a foot on every tread: 1.23 and 1.54 m/s)
      const cases = { upRun: [{ run: 0.28, rise: 0.2, n: 10 }, { pace: 1.23, dir: 1, T: 7 }], upRunDeep: [{ run: 0.35, rise: 0.2, n: 8 }, { pace: 1.54, dir: 1, T: 7 }], upWalk: [{ run: 0.3, rise: 0.2, n: 10 }, { pace: 0.75, dir: 1, T: 9 }],
        downRun: [{ run: 0.3, rise: 0.2, n: 10 }, { pace: 1.32, dir: -1, T: 7 }], downWalk: [{ run: 0.3, rise: 0.2, n: 10 }, { pace: 0.75, dir: -1, T: 10 }] };
      for (const [name, [g, o]] of Object.entries(cases)) {
        const S = F.stair(g), s = F.stairRun(r, S, o), on = s.filter((x) => x.on), t0 = on[0].t, t1 = on.at(-1).t;
        const tr = F.treads(s, S, F.carried(s, { from: t0 - 0.2, to: t1 + 0.2, h: 0.035 })).sort((a, b) => a.t0 - b.t0), inner = tr.slice(2, -1);       // (the first two steps of a flight and the last are where the gait changes)
        const mid = on.filter((x) => x.t > t0 + 0.3 && x.t < t1 - 0.2);
        out[name] = { n: tr.length, run: S.run, treads: tr.map((c) => c.tread), feet: tr.map((c) => c.foot), drift: F.worst(inner), high: Math.max(0, ...inner.map((c) => Math.abs(c.high))), off: Math.max(0, ...inner.map((c) => Math.abs(c.off))),
          edge: { drift: F.worst(tr), off: Math.max(0, ...tr.map((c) => Math.abs(c.off))) }, cycle: F.cycle(inner.length > 3 ? inner : tr),
          clips: [...new Set(mid.flatMap((x) => Object.entries(x.shares ?? {}).filter(([, w]) => w > 0.05).map(([n]) => n)))], lean: Math.max(...mid.map((x) => Math.atan2(-(x.chest[2] - x.pelvis[2]) * o.dir, x.chest[1] - x.pelvis[1]))),
          climb: (on.at(-1).hips - on[0].hips), total: S.n * S.rise, treadsN: S.n, jolt: F.jolt(s, { from: t0 + 0.3, to: t1 - 0.2 }), unlisted: s.log.filter((l) => !l.listed).map((l) => `${l.from}>${l.to}`), states: s.log.map((l) => l.to) };
      }
      return out;
    });
    for (const [name, c] of Object.entries(r)) {
      const dir = name.startsWith('up') ? 'up' : 'down', gait = /Run/.test(name) ? 'run' : 'walk', per = 1;
      assert.deepEqual(c.clips, [`stairs_${dir}_${gait}`], `${name}: the stair's own loop, alone`);
      assert.ok(c.n >= c.treadsN - 1, `${name}: a step was measured on every tread, or all but one (${c.n} of ${c.treadsN}: ${c.treads})`);
      // a step takes `per` treads, the feet take turns, and no tread is stepped on twice
      // (between the first and the last step of the flight, where the gait changes)
      for (let i = 3; i < c.n - 1; i++) { assert.equal(Math.abs(c.treads[i] - c.treads[i - 1]), per, `${name}: a step of ${per} tread(s) (${c.treads})`); assert.notEqual(c.feet[i], c.feet[i - 1], `${name}: the feet take turns (${c.feet})`); }
      assert.ok(c.drift < MAX, `${name}: a foot on a tread drifted ${cm(c.drift)}`); assert.ok(c.high < 0.03, `${name}: a foot stood ${cm(c.high)} off its tread's top`); assert.ok(c.off < 0.06, `${name}: a foot stood ${cm(c.off)} off its tread's middle`);
      assert.ok(c.edge.drift < MAX_WAY && c.edge.off < c.run / 2, `${name}, the first and the last step of the flight: ${cm(c.edge.drift)} of drift, ${cm(c.edge.off)} off the middle (never on an edge)`);
      assert.ok(Math.abs(Math.abs(c.climb) - c.total) < 0.25, `${name}: his hips went ${c.climb.toFixed(2)} m with the flight of ${c.total.toFixed(1)} m`);
      assert.ok(c.jolt < (gait === 'run' ? 200 : 90), `${name}: his hips do not jump (${c.jolt.toFixed(0)} m/s2 at most)`);
      assert.deepEqual(c.unlisted, [], `${name}: every change of state is a listed one (${c.states})`); assert.ok(c.states.includes(`stairs_${dir}`), `${name}: ${c.states}`);
    }
    // running up, his trunk is into the climb; running, two steps take two treads in 0.45 s (4.4 steps a second): a run's cadence, not a walk's
    assert.ok(r.upRun.lean > 12 * DEG && r.upRun.lean < 35 * DEG && r.upRun.lean > r.upWalk.lean, `the trunk leans ${(r.upRun.lean / DEG).toFixed(0)} deg running up (${(r.upWalk.lean / DEG).toFixed(0)} walking)`);
    assert.ok(r.upRun.cycle > 0.38 && r.upRun.cycle < 0.52, `running up, a cycle every ${r.upRun.cycle.toFixed(2)} s`); assert.ok(r.upWalk.cycle > 0.7 && r.upWalk.cycle < 0.9, `walking up, every ${r.upWalk.cycle.toFixed(2)} s`);
  });
});

test('in the chase he runs up the stairs of the building on their treads (the hall\'s first flight, the well), and down the fire escape\'s', { skip, timeout: 300000 }, async () => {
  await withLab(async (page) => {
    const r = await page.evaluate(() => {
      const { r, F } = window.__feet, out = {};
      for (const id of ['hall', 'vao', 'janela']) {
        const s = F.chase(r, id), st = F.carried(s, { h: 0.04, min: 2 }), at = (t) => s.find((x) => x.t >= t) ?? s.at(-1), on = st.filter((c) => at(c.t0).stairs && at(c.t1).stairs);
        out[id] = { n: on.length, drift: F.worst(on), high: Math.max(0, ...on.map((c) => { const x = at((c.t0 + c.t1) / 2); return Math.abs(x.feet[c.foot][1] - x.g[c.foot]); })),
          clips: [...new Set(s.filter((x) => x.stairs && !x.off).flatMap((x) => Object.entries(x.shares ?? {}).filter(([, w]) => w > 0.6).map(([n]) => n)))], unlisted: s.log.filter((l) => !l.listed).map((l) => `${l.from}>${l.to}`) };
      }
      return out;
    });
    assert.ok(r.hall.n >= 8 && r.vao.n >= 40, `steps were measured on the treads (${r.hall.n} in the hall, ${r.vao.n} in the well)`);
    for (const id of ['hall', 'vao', 'janela']) {
      assert.ok(r[id].drift < MAX, `${id}: a foot on a tread drifted ${cm(r[id].drift)}`); assert.ok(r[id].high < 0.03, `${id}: a foot stood ${cm(r[id].high)} off its tread`);
      assert.deepEqual(r[id].unlisted, [], `${id}: every change of state is a listed one`);
    }
    assert.ok(r.hall.clips.includes('stairs_up_run') && r.vao.clips.includes('stairs_up_run') && !r.vao.clips.some((n) => n === 'walk' || n === 'brisk'), `he runs up them, he does not walk (${r.vao.clips})`);
    assert.ok(r.janela.clips.includes('stairs_down_run'), `and goes down the fire escape's first treads by its own loop (${r.janela.clips})`);
  });
});

test('standing where the floor is not flat (the edge of a step, a slope), each foot is on its own ground and his hips come down to the lower one; turning there too', { skip, timeout: 300000 }, async () => {
  await withLab(async (page) => {
    const r = await page.evaluate(() => {
      const { r, F } = window.__feet, out = {};
      const edge = (h) => (x, z) => (z < -0.05 ? h : 0), slope = (a) => (x, z) => -z * Math.tan(a);
      for (const [name, g, o] of [['below', edge(0.2), {}], ['above', edge(0.2), { at: [0, -0.12] }], ['high', edge(0.45), {}], ['across', slope(0.21), { yaw: Math.PI / 2 }], ['uphill', slope(0.21), {}], ['turning', edge(0.2), { at: [0, -0.12], turnAt: 1.0, T: 3 }], ['flat', () => 0, {}]]) {
        const s = F.standOn(r, g, o), e = s.at(-1), late = s.filter((x) => x.t > (o.turnAt ? o.turnAt + 1.2 : 0.8));
        out[name] = { over: e.feet.map((p, i) => p[1] - e.g[i]), ground: e.g.map((x) => x - e.base), hips: e.terrain?.hips ?? 0, drift: F.worst(F.carried(late, { h: 0.06 })), jolt: F.jolt(s, { from: 0.4 }), move: e.move?.state, wobble: Math.max(...late.map((x) => x.hips)) - Math.min(...late.map((x) => x.hips)),
          states: [...new Set(s.map((x) => x.move?.state))] };
      }
      return out;
    });
    for (const [name, c] of Object.entries(r)) {
      // the ball of each foot at its rest height over its own ground (1.4 cm; a little more where the sole is tilted on a slope)
      for (const h of c.over) assert.ok(h > 0.005 && h < 0.05, `${name}: a foot ${cm(h)} over its ground (${c.over.map(cm)})`);
      assert.ok(c.drift < MAX, `${name}: a foot on the floor drifted ${cm(c.drift)}`); assert.equal(c.move, 'idle', `${name}: standing`);
      assert.ok(c.wobble < 0.02, `${name}: his hips stay where they settled (${cm(c.wobble)})`);
    }
    assert.ok(Math.abs(r.below.ground[0] - r.below.ground[1]) > 0.15 && Math.abs(r.below.hips) < 0.02, `a foot on the step in front of him, the other on the floor: ${r.below.ground.map(cm)}, hips ${cm(r.below.hips)}`);
    assert.ok(r.above.hips < -0.12 && r.above.hips > -0.22, `on the step with a foot on the floor below: his hips come down ${cm(-r.above.hips)} to it`);
    assert.ok(Math.abs(r.high.ground[0] - r.high.ground[1]) > 0.4, `the dormitory's step (45 cm): a foot up on it (${r.high.ground.map(cm)})`);
    assert.ok(r.across.hips < -0.005 && r.uphill.hips < -0.02 && Math.abs(r.flat.hips) < 1e-3, `on a slope the hips come down to the lower foot (${cm(r.across.hips)} across, ${cm(r.uphill.hips)} uphill), on the flat not at all`);
    assert.ok(r.turning.states.includes('turn') && r.turning.jolt < 120, `turning on the edge of a step: by the turn's clip (${r.turning.states}), the hips easing (${r.turning.jolt.toFixed(0)} m/s2)`);
  });
});

test('his legs are in one state at a time, and one gives place to another by a listed rule: start, gait, stop, turn, the stairs, a run pulled up on a step', { skip, timeout: 300000 }, async () => {
  const { RULES, ruleOf, stateOf, STATES } = await import('../src/models/moves.js');
  // the rules themselves: every state can be left for standing, a gait for a gait in phase, a gait for the stairs by the treads
  for (const s of STATES) if (s !== 'idle') assert.ok(ruleOf(s, 'idle').listed, `${s} > idle is listed`);
  assert.equal(ruleOf('walk', 'run').sync, 'phase'); assert.equal(ruleOf('run', 'stairs_up').sync, 'tread'); assert.equal(ruleOf('idle', 'start').sync, 'pose'); assert.equal(ruleOf('walk', 'stop').sync, 'quarter'); assert.equal(ruleOf('start', 'walk').sync, 'ground');
  assert.equal(stateOf('brisk'), 'walk'); assert.equal(stateOf('jog'), 'run'); assert.equal(stateOf('crouch_turn_l90'), 'turn'); assert.equal(stateOf('walk_stop_2'), 'stop'); assert.equal(stateOf('stairs_down_walk'), 'stairs_down'); assert.equal(stateOf('esquivar'), 'act');
  for (const r of Object.values(RULES)) assert.ok(r.blend >= 0.05 && r.blend <= 0.25, 'a change takes between a twentieth and a quarter of a second');
  await withLab(async (page) => {
    const r = await page.evaluate(() => {
      const { r, F } = window.__feet, out = {};
      const seq = (p) => p.log.map((l) => `${l.from}>${l.to}`), bad = (p) => p.log.filter((l) => !l.listed).map((l) => `${l.from}>${l.to}`);
      const walk = F.player(r, (t) => (t > 0.3 && t < 2.6 ? { mz: -1 } : {}), 4.2); out.walk = { seq: seq(walk), bad: bad(walk) };
      const run = F.player(r, (t) => (t > 0.3 && t < 2.2 ? { mz: -1, run: true } : t < 3.4 ? { mz: -1 } : {}), 5.0); out.run = { seq: seq(run), bad: bad(run) };
      const turn = F.player(r, (t) => (t > 0.5 && t < 2.2 ? { mx: 1 } : {}), 4.0); out.turn = { seq: seq(turn), bad: bad(turn) };
      const crouch = F.player(r, (t) => ({ crouch: t > 0.5 && t < 4.2, mz: t > 1.2 && t < 2.6 ? -1 : 0 }), 5.2); out.crouch = { seq: seq(crouch), bad: bad(crouch) };
      // a run pulled up on a step: he stands there, each foot on a tread, and then goes on up
      const S = F.stair({ run: 0.3, rise: 0.2, n: 10 }), stop = F.stairRun(r, S, { pace: 1.3, dir: 1, stopAt: 3.1, T: 5.5 }), e = stop.at(-1);
      out.stop = { seq: stop.log.map((l) => `${l.from}>${l.to}`), bad: stop.log.filter((l) => !l.listed).map((l) => `${l.from}>${l.to}`), over: e.feet.map((p, i) => p[1] - e.g[i]), tread: e.tread, move: e.move.state, still: F.worst(F.carried(stop.filter((x) => x.t > 4.5), { h: 0.05 })) };
      return out;
    });
    for (const [k, c] of Object.entries(r)) assert.deepEqual(c.bad, [], `${k}: no change that is not listed (${c.seq})`);
    assert.deepEqual(r.walk.seq, ['idle>start', 'start>walk', 'walk>stop', 'stop>idle'], `walking and stopping: ${r.walk.seq}`);
    assert.ok(r.run.seq.includes('walk>run') || r.run.seq.includes('start>run') || r.run.seq.includes('idle>run'), `into the run (${r.run.seq})`); assert.ok(r.run.seq.includes('run>walk'), `and out of it into the walk, in phase (${r.run.seq})`);
    assert.deepEqual(r.turn.seq.slice(0, 3), ['idle>turn', 'turn>idle', 'idle>start'].slice(0, r.turn.seq[1] === 'turn>start' ? 0 : 3), `a turn on the spot, then he sets off (${r.turn.seq})`); assert.equal(r.turn.seq[0], 'idle>turn');
    assert.ok(r.crouch.seq.includes('idle>crouch_idle') && r.crouch.seq.some((x) => x.endsWith('>crouch')) && r.crouch.seq.at(-1) === 'crouch_idle>idle', `crouching, going crouched, standing up (${r.crouch.seq})`);
    assert.ok(r.stop.seq.some((x) => x.endsWith('>stairs_up')) && r.stop.tread.some((i) => i >= 0 && i < 10) && r.stop.move === 'idle', `the run pulled up on a step: ${r.stop.seq}, he stands (${r.stop.move})`);
    for (const h of r.stop.over) assert.ok(h > 0.005 && h < 0.04, `there each foot is on its tread (${r.stop.over.map(cm)} over treads ${r.stop.tread})`);
    assert.ok(r.stop.still < MAX, `and stays (${cm(r.stop.still)})`);
  });
});

test('the dog: its walk, its trot, a route with corners, the stalk to the leap, the lunge and the skid into the skip, its fall', { skip, timeout: 300000 }, async () => {
  await withLab(async (page) => {
    const r = await page.evaluate(([Q, L]) => {
      const { r, F } = window.__feet, out = {}, tol = { tol: 0.006, lowest: false };
      const line = (v, state = 'calma') => (t) => ({ pos: [0, -v * Math.min(t, 4)], yaw: 0, speed: t < 4 ? v : 0, state });
      out.walk = F.worst(F.stances(F.dogRun(r, line(1.1), 0, 4.6), { from: 0.5, ...tol }));
      out.trot = F.worst(F.stances(F.dogRun(r, line(2.4), 0, 4.6), { from: 0.5, ...tol }));
      const a = { from: [10, 9.95], via: [[-1.5, 9.95], [-1.5, 6], [-7, 2.6]], to: [-30, 2.6], t0: 0, t1: 18.72, speed: 2.4, state: 'calma' };
      out.route = F.worst(F.stances(F.dogRun(r, F.route(a), 3.5, 9.5), { from: 3.6, ...tol }));
      out.stalk = F.worst(F.stances(F.dogRun(r, F.scene4Dog(Q), 0.5, 4.6), { from: 0.6, ...tol }));
      out.lunge = F.worst(F.stances(F.dogRun(r, F.scene4Dog(Q), 4.6, 7.0), { from: 4.6, ...tol }));
      out.fall = F.worst(F.stances(F.dogRun(r, F.scene4Dog(L), 9.8, 11.6), { from: 9.85, ...tol }));
      out.deaf = F.worst(F.stances(F.dogRun(r, F.scene4Dog(Q), 10.1, 20), { from: 10.2, ...tol }));
      return out;
    }, [QUIET, LOUD]);
    for (const [k, v] of Object.entries(r)) assert.ok(v < MAX, `${k}: a foot down drifted ${cm(v)}`);
  });
});

test('the film mode steps its people and dogs by the ground they cover, not by the clock', { skip, timeout: 300000 }, async () => {
  await withLab(async (page) => {
    const r = await page.evaluate(async () => {
      const film = window.__film.build({ width: 640, height: 360 }), T = film.render.THREE;
      // the actors of a view: every visible skinned body's feet, found by their bones
      const feet = (names) => { const out = []; film.render.scene.traverse((o) => { if (o.isBone && names.includes(o.name)) { let v = true; for (let p = o; p; p = p.parent) if (!p.visible) v = false; if (v) out.push(o); } }); return out; };
      const run = (cn, t0, t1, names) => {
        const samples = [];
        for (let t = t0; t < t1; t += 1 / 30) {
          film.stage.frame(cn, t); film.render.scene.updateMatrixWorld(true);
          const p = feet(names).map((x) => x.getWorldPosition(new T.Vector3()).toArray()), hip = feet(['pelvis']).map((x) => x.getWorldPosition(new T.Vector3()))[0];
          samples.push({ t, feet: p, body: hip ? [hip.x, hip.z] : [0, 0] });
        }
        return samples.filter((s) => s.feet.length === samples.at(-1).feet.length);
      };
      const views = film.views, { F } = window.__feet;
      // Jonas crouched to the skip and into it (emenda.esconde); the dog's walk of the first night (noite1: the dog across the street)
      const v1 = views['emenda.fecha'], s1 = run('emenda', v1.t0, v1.t1, ['ball_l', 'ball_r']);
      const dogView = Object.entries(views).find(([k]) => k.startsWith('noite1.'))?.[1];
      const s2 = dogView ? run('noite1', dogView.t0, Math.min(dogView.t1, dogView.t0 + 4), ['wheel_FL', 'wheel_FR', 'wheel_BL', 'wheel_BR']) : null;
      const ground = Math.min(...s1.map((x) => Math.min(x.feet[0][1], x.feet[1][1]))) - 0.014;           // (the pavement is a step above the road)
      return { jonas: F.worst(F.carried(s1, { from: v1.t0 + 0.2, ground })), n: F.carried(s1, { from: v1.t0 + 0.2, ground }).length, dog: s2 ? F.worst(F.stances(s2, { from: dogView.t0 + 0.3, tol: 0.006, lowest: false })) : 0 };
    });
    assert.ok(r.n >= 2, `steps were measured in the film (${r.n})`);
    assert.ok(r.jonas < MAX_WAY, `Jonas in the film: ${cm(r.jonas)}`); assert.ok(r.dog < MAX, `the dog in the film: ${cm(r.dog)}`);
  });
});
