// The opponent's mind. Every parameter comes from the fight's seed and gets harder with the
// fight number. It warns before it punches (head down before the uppercut, shoulder turned
// before a hook), defends and dodges, and learns: the same punch three times in a row from the
// player starts being defended. Pure function of the seed and the simulation: no real clock,
// no unseeded randomness.
import { mulberry32 } from './rng.js';

const KINDS = ['jab', 'direct', 'hookL', 'hookR', 'upper'];
const SYL = ['GRO', 'KAN', 'VEL', 'DRU', 'MOR', 'TAS', 'BEK', 'ZUL', 'RAN', 'HOK', 'NOR', 'SIL', 'BRA', 'TUK', 'ORS', 'VAD'];
const lerp = (a, b, k) => a + (b - a) * k;

export function fightSeed(campaignSeed, n) { return (Math.imul(campaignSeed >>> 0, 2654435761) ^ Math.imul(n, 40503)) >>> 0 || 1; }
export function nameFor(seed) {
  const r = mulberry32(seed ^ 0x5bd1e995), k = 2 + (r() < 0.4 ? 1 : 0);
  let out = '';
  for (let i = 0; i < k; i++) out += r.pick(SYL);
  return out;
}

/** Difficulty and personality of fight number n (1 = easiest). */
export function brainParams(seed, n) {
  const r = mulberry32(seed ^ 0x9e3779b9);
  const d = Math.pow(Math.min(1, (n - 1) / 6), 0.5); // 0 .. 1 over the seven fights, steeper early
  const extra = Math.max(0, n - 7) * 0.05;   // the endless mode keeps climbing
  const aggression = Math.min(1, 0.25 + 0.5 * d + (r() - 0.5) * 0.3 + extra);
  return {
    n, d, aggression,
    preferred: r.pick(KINDS),
    guardiness: Math.min(0.9, 0.15 + r() * 0.35 + 0.35 * d),
    dodginess: 0.25 + r() * 0.4,
    attackRate: 0.45 + 2.0 * aggression,     // attack decisions per second when in range
    tell: Math.max(0.12, lerp(0.55, 0.22, d) + (r() - 0.5) * 0.08 - extra * 0.5), // seconds of warning
    reactChance: Math.min(0.9, lerp(0.08, 0.62, d) + extra),
    reactDelay: lerp(0.38, 0.17, d),
    speed: lerp(0.85, 1.12, d) * (1 + (r() - 0.5) * 0.1) + extra * 0.2, // how fast its punches go
    power: lerp(0.8, 1.7, d) + extra,       // damage multiplier on what it lands
    takes: lerp(1, 0.5, d),                 // damage multiplier on what it takes
    comboChance: 0.15 + 0.4 * d,
    counter: lerp(0.05, 0.9, d),             // chance to answer a punch of the player's while it recovers
    height: 0.95 + r() * 0.12 + 0.05 * d,
  };
}

export class Brain {
  constructor(params, seed) {
    this.p = params; this.rng = mulberry32(seed ^ 0x7f4a7c15);
    this.t = 0; this.cool = 1.2; this.guardUntil = 0; this.tellState = null; this.react = null;
    this.strafe = 1; this.strafeUntil = 0; this.seen = null;
    this.history = []; this.learned = {}; this.log = [];
    this.lastKind = null;
  }

  /** What it does against this punch of the player's. */
  onFoePunch(kind, me) {
    const p = this.p;
    const h = this.history;
    // the same punch three times in a row: from the next one on it is defended
    if (h.length >= 3 && h.slice(-3).every((x) => x === kind) && !(this.learned[kind] > this.t)) {
      this.learned[kind] = this.t + 8;
      this.log.push({ t: this.t, ev: 'learned', kind });
    }
    h.push(kind); if (h.length > 6) h.shift();
    const learned = (this.learned[kind] ?? 0) > this.t;
    const chance = learned ? 0.95 : p.reactChance;
    if (this.react || this.tellState || me.action) return;
    if (this.rng() < chance) {
      const delay = learned ? Math.min(0.1, p.reactDelay) : p.reactDelay + this.rng() * 0.08;
      const dodge = !learned && this.rng() < p.dodginess;
      this.react = { at: this.t + delay, kind, how: dodge ? (kind === 'hookL' || kind === 'hookR' ? 'duck' : 'back') : 'guard', learned };
    }
  }

  think(dt, me, foe) {
    const p = this.p, rng = this.rng;
    this.t += dt;
    const intent = { moveX: 0, moveY: 0, guard: false, press: [] };
    if (me.knockdown || foe.knockdown) return intent;
    if (me.stunT > 0) { this.tellState = null; this.react = null; me.tell = null; return intent; }
    for (const k of Object.keys(this.learned)) if (this.learned[k] <= this.t) delete this.learned[k];

    // the player started a punch: react to it
    const fa = foe.action;
    if (fa && fa.def && fa !== this.seen) { this.seen = fa; this.onFoePunch(fa.kind, me); }
    if (!fa) this.seen = null;
    if (this.react && this.t >= this.react.at) {
      const r = this.react; this.react = null;
      if (r.how === 'guard') this.guardUntil = this.t + 0.65;
      else if (r.how === 'duck') intent.press.push({ k: 'duck' });
      else intent.press.push({ k: 'dodge', mx: 0, my: -1 });
      this.log.push({ t: this.t, ev: 'defend', how: r.how, vs: r.kind, learned: r.learned });
    }

    const dx = foe.x - me.x, dz = foe.z - me.z, dist = Math.hypot(dx, dz);

    // winding up the warning
    if (this.tellState) {
      const ts = this.tellState, el = this.t - ts.t0;
      me.tell = { kind: ts.kind, t: el, dur: ts.dur };
      intent.moveY = dist > 1.25 ? 0.4 : 0;
      if (el >= ts.dur) {
        intent.press.push({ k: ts.kind });
        this.log.push({ t: this.t, ev: 'punch', kind: ts.kind, warned: ts.dur });
        me.tell = null; this.tellState = null; this.lastKind = ts.kind;
        // a combo: another soon, from the same seed
        this.cool = this.t + (rng() < p.comboChance ? 0.12 : 0.5 + rng() * 1.3 / (0.5 + p.aggression));
      }
      return intent;
    }
    me.tell = null;

    if (this.t < this.guardUntil) intent.guard = true;

    // spacing and circling
    if (this.t > this.strafeUntil) { this.strafe = rng() < 0.5 ? -1 : 1; this.strafeUntil = this.t + 0.7 + rng() * 1.3; }
    if (dist > 1.25) intent.moveY = 0.8;
    else if (dist < 0.95) intent.moveY = -0.7;
    else intent.moveY = 0.05;
    if (!intent.guard) intent.moveX = this.strafe * (0.35 + 0.35 * p.aggression);
    if (me.balance < 35) intent.moveY = Math.min(intent.moveY, -0.3);

    // a player who punches and stays in reach is open while the punch recovers: answer it
    if (fa && fa.def && foe.phase() === 'rec' && !me.action && this.t >= this.cool && me.stamina >= 1 && dist > 0.8 && dist < 1.3 && !this.react && rng() < p.counter * dt * 5 * (me.blindT > 0 ? 0.3 : 1)) {
      const kind = rng() < 0.5 ? 'jab' : rng() < 0.5 ? 'direct' : p.preferred;
      this.tellState = { kind, t0: this.t, dur: p.tell * 0.45 };
      this.log.push({ t: this.t, ev: 'counter', kind });
      return intent;
    }
    // decide to attack
    const inRange = dist > 0.95 && dist < 1.28;
    if (!me.action && inRange && this.t >= this.cool && me.stamina >= 1 && !this.react && !intent.guard) {
      if (rng() < p.attackRate * dt) {
        let kind;
        const roll = rng();
        if (p.forceKind) kind = p.forceKind;
        else if (roll < 0.45) kind = p.preferred;
        else kind = KINDS[Math.floor(rng() * KINDS.length)];
        // the tell is the player's chance to read it; later fights give less time
        this.tellState = { kind, t0: this.t, dur: p.tell * (kind === 'upper' || kind.startsWith('hook') ? 1 : 0.7) };
        this.log.push({ t: this.t, ev: 'tell', kind, dur: this.tellState.dur });
      }
    }
    // idle guard
    if (!intent.guard && !me.action && rng() < p.guardiness * 0.9 * dt) this.guardUntil = this.t + 0.5 + rng() * 0.7;
    return intent;
  }
}
