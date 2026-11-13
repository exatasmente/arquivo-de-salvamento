// Ending 3, "final3" (Colapso): the shift does not end. Behind the counter, the same customer asks for the same
// thing; Heitor turns to the wall clock, which runs up to six and then runs back, and the customer is there again.
// Each round is shorter than the last. In the end the clock stops one minute short and Heitor goes on serving.
// First person, 38 s. Only the customer's line (the same three times) and one thought.
import { ramp, smooth, lerp, dialogue, BABBLE_SEEDS } from './common.js';
import { aimTrack, aimAt, buildDriver, EYE, PI } from './finais-kit.js';

const D = 38;
// the rounds: [start, length]; the last one is not closed by a dip
const ROUNDS = [[0, 11], [11, 8.5], [19.5, 7], [26.5, 11.5]];
const views = {
  ciclo1: [0, 11, 'Atrás do balcão: o cliente pede, paga; Heitor olha o relógio da parede, que corre até as seis e volta'],
  ciclo2: [11, 19.5, 'O mesmo cliente, o mesmo pedido, o mesmo relógio; a rodada é mais curta'],
  ciclo3: [19.5, 26.5, 'De novo: o cliente, a nota, o relógio que volta; mais curta ainda'],
  'sem-fim': [26.5, 38, 'O relógio para um minuto antes das seis e Heitor continua atendendo'],
};

const CL = [1.1 + 0, 11 + 1.1, 19.5 + 1.1];
const SAY = dialogue([
  ...ROUNDS.slice(0, 3).map(([s]) => ({ t: s + 1.1, who: 'Cliente', text: 'Completa, por favor.', seed: BABBLE_SEEDS.cliente, hold: 0.5 })),
  { t: 31.4, who: '', text: 'Falta um minuto.', seed: BABBLE_SEEDS.heitor, hold: 2.6 },
]);

const E = [13.0, EYE, 9.5], CLOCK = [9.6, 2.4, 11.87], CUST = [13.0, 7.35];
const toCust = { yaw: PI, pitch: -0.1 };
const toClock = aimAt(E, CLOCK);
const clockYaw = toClock.yaw + 2 * PI;               // 5.3 rad: the turn from PI to it goes the short way (about 125 degrees)
const keys = [];
ROUNDS.forEach(([s, L], i) => {
  const last = i === ROUNDS.length - 1;
  const ta1 = last ? 3.0 : 0.4 * L, ta2 = ta1 + 1.1, tb1 = last ? 9.0 : L - 1.9, tb2 = tb1 + 0.9;
  keys.push({ t: s + 0, eye: E, yaw: PI, pitch: toCust.pitch });
  keys.push({ t: s + ta1, eye: E, yaw: PI, pitch: toCust.pitch });
  keys.push({ t: s + ta2, eye: E, yaw: clockYaw, pitch: toClock.pitch });
  keys.push({ t: s + tb1, eye: E, yaw: clockYaw, pitch: toClock.pitch });
  keys.push({ t: s + tb2, eye: E, yaw: PI, pitch: toCust.pitch });
});
const cam = aimTrack(keys);

/** The round of a time: { i, s, L, k }. */
const roundOf = (t) => { let i = ROUNDS.length - 1; for (let j = 0; j < ROUNDS.length; j++) if (t < ROUNDS[j][0] + ROUNDS[j][1]) { i = j; break; } const [s, L] = ROUNDS[i]; return { i, s, L, k: t - s }; };
const horaOf = (t) => {
  const { i, L, k } = roundOf(t);
  if (i === ROUNDS.length - 1) return 5.99 * Math.min(1, k / 7.5);
  return 6 * Math.min(1, k / (L - 0.7)) * (1 - smooth(ramp(k, L - 0.7, L - 0.1)));
};

export default {
  name: 'final3', duration: D, views,
  anchors: { relogio: 'O relógio de parede da loja', balcao: 'O balcão, com o cliente do outro lado', caixa: 'O caixa' },
  sfx: [
    { t: 0, name: 'fluorescente', opts: { dur: D, gain: 0.7 } },
    { t: 0, name: 'rodovia', opts: { dur: D, gain: 0.3 } },
    ...ROUNDS.flatMap(([s, L], i) => {
      const last = i === ROUNDS.length - 1, out = [
        { t: s + 0.15, name: 'porta_sino', opts: { gain: 0.6 } },
        { t: s + 2.1, name: 'caixa_bip', opts: { gain: 0.7 } }, { t: s + 2.6, name: 'moeda', opts: { gain: 0.7 } },
      ];
      const ta2 = last ? 4.1 : 0.4 * L + 1.1, tb1 = last ? 9.0 : L - 1.9;
      for (let n = 0; ta2 + n * 1.0 < tb1 - 0.2; n++) out.push({ t: +(s + ta2 + 0.3 + n * 1.0).toFixed(2), name: 'tecla', opts: { gain: 0.45 } });
      if (!last) for (let n = 0; n < 6; n++) out.push({ t: +(s + L - 0.7 + n * 0.09).toFixed(2), name: 'tecla', opts: { gain: 0.5 } });
      return out;
    }),
    { t: 29.0, name: 'respiracao', opts: { dur: 8, gain: 0.45 } },
    ...SAY.sfx,
  ],
  build(ctx) {
    const { r } = ctx;
    const hands = ctx.hands(), W = ctx.world();
    const g = new r.THREE.Group();
    const cust = buildDriver(r, ctx); g.add(cust.root);
    cust.root.position.set(CUST[0], 0, CUST[1]); cust.root.rotation.y = 0;
    return {
      group: g, hands: true, arms: hands.arms,
      anchors: { relogio: () => CLOCK, balcao: () => [13, 1.0, 8.4], caixa: () => W.p('caixa', 1.0) },
      pose(t) {
        const { rig } = hands;
        const c = cam(t), { i, L, k } = roundOf(t), last = i === ROUNDS.length - 1;
        // the customer: asks, pays, waits; the same animation every round
        cust.root.visible = true;
        cust.update(k, { pose: k < 1.5 ? 'parado' : k < (last ? 7 : L - 2.2) ? 'pagando' : 'parado', falando: SAY.at(t) !== null });
        // our hands: the right takes the note, the left works the till
        const take = smooth(ramp(k, 1.9, 2.5)) * (1 - smooth(ramp(k, 3.0, 3.6)));
        rig.hang(Math.sin(t * 1.1));
        if (take > 0) rig.reach('right', [lerp(0.22, 0.12, take), lerp(-0.4, -0.22, take), lerp(-0.34, -0.56, take)]);
        if (!last || k > 4) { const w = Math.sin(t * 5) * 0.02; rig.reach('left', [-0.2 + w, -0.38, -0.36]); }
        // the dip between the rounds (never full black for longer than a blink), and the long fade at the end
        const ta1 = last ? 3.0 : 0.4 * L, tb1 = last ? 9.0 : L - 1.9;
        const zoom = smooth(ramp(k, ta1 + 0.3, ta1 + 1.1)) * (1 - smooth(ramp(k, tb1, tb1 + 0.5))); // the clock is small: the picture closes on it
        const dip = last ? 0 : smooth(ramp(k, L - 0.7, L - 0.15)) * 0.92 * (1 - smooth(ramp(k, L - 0.05, L)));
        const fade = Math.max(i === 0 ? 1 - smooth(ramp(t, 0, 0.7)) : 0, dip, smooth(ramp(t, 36.8, 37.95)), (k < 0.5 && i > 0) ? 0.92 * (1 - smooth(ramp(k, 0.05, 0.5))) : 0);
        return {
          eye: c.eye, look: c.look, roll: 0, fade, dialog: SAY.at(t), fovK: 1 - 0.55 * zoom,
          dim: 0.04 + 0.075 * i, daze: 0.05 * i, noise: 0.02 * i,
          world: { ambient: 0x585d78, state: { hora: horaOf(t) } },
        };
      },
    };
  },
};
