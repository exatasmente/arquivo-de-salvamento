// PrepSystem: the hour before the shift, every night. Heitor arrives at 23:00, punches the clock (a time clock on the wall of the office, with its sound)
// and prepares the shop with the tasks the night already has (the bathroom, a stain, a dead tube, rubbish, a shelf), marked as "preparação". The clock runs from
// 23:00 to 00:00 in 3 real minutes (a game minute is 3 s, half the rate of the shift), with no customers, no cars stopping and no scare events: only the place.
// At 00:00 the till has to be opened and the customers begin. What is left of the preparation counts once as a task not done (-6 each, right then), stays
// pending on the list and is not counted again at the closing; doing it late still gives the points of the task.
//
// The tutorial of the first night teaches in this order: the punch clock, the preparation with one task of each kind (guided, one at a time, with the marker on
// the clipboard's goal), and then the manager's call and the till. In the tutorial the clock waits at 23:55 until the guided tasks are done, so it cannot lock
// the lesson in any order, and nothing is penalised.
//
// Nothing here reads a real clock: the countdown of the HUD is the game's own clock.
export const PREP_FROM = -60;          // 23:00, in minutes from 00:00
export const PREP_RATE = 0.5;          // half the speed of the shift: 60 game minutes in 180 real seconds
const GUIDE = [
  ['ponto', 'Bata o ponto: o relógio de ponto está na parede do escritório.'],
  ['mancha-', 'Limpe a mancha do chão: pegue o rodo e o balde no armário de limpeza e segure o botão sobre ela.'],
  ['lampada-', 'Troque a lâmpada queimada: pegue a escada ao lado do quadro de força, ponha-a sob a lâmpada e suba.'],
  ['repor-', 'Reponha a prateleira: busque no estoque a caixa do produto e segure o botão na prateleira.'],
  ['lixo-', 'Leve o saco de lixo ao contêiner dos fundos.'],
];

export function createPrep(bus, { world, render, interaction, time, tasks, chores, progression, ui, narrative, customers, goals }) {
  const THREE = render.THREE;
  const S = { on: false, tutorial: false, punched: false, seed: 1, t: 0 };
  const sfx = (n, o = {}) => bus.emit('sfx', n, o);

  // ---------------------------------------------------------------- the punch clock, on the west wall of the office
  const W = { x: 2.2, y: 1.38, z: 14.7 };
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 40;
  const tex = new THREE.CanvasTexture(cv); tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
  const g = cv.getContext('2d');
  function paint() {
    g.fillStyle = '#10150c'; g.fillRect(0, 0, 64, 40);
    g.fillStyle = S.punched ? '#7a8a60' : '#9acd6a'; g.font = 'bold 9px monospace'; g.textAlign = 'center';
    g.fillText('PONTO', 32, 11);
    g.font = 'bold 15px monospace'; g.fillText(time.text(), 32, 28);
    g.font = 'bold 7px monospace'; g.fillStyle = '#6a7a50'; g.fillText(S.punched ? 'BATIDO' : 'BATA O CARTAO', 32, 37);
    tex.needsUpdate = true;
  }
  const group = new THREE.Group(); group.name = 'relogio-de-ponto';
  const mat = (c) => new THREE.MeshBasicMaterial({ color: c });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.52, 0.4), mat(0x6e6a5a)); group.add(body);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.19), new THREE.MeshBasicMaterial({ map: tex })); face.rotation.y = Math.PI / 2; face.position.set(0.075, 0.1, 0); group.add(face);
  const slot = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.14, 0.2), mat(0x16140f)); slot.position.set(0.075, -0.12, 0); group.add(slot);
  const rack = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.16), mat(0x4a3a24)); rack.position.set(0.05, -0.02, 0.33); group.add(rack);
  for (let i = 0; i < 4; i++) { const card = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.18, 0.025), mat(i === 1 ? 0xd8ceae : 0xb8b090)); card.position.set(0.085, 0.0, 0.28 + i * 0.035); group.add(card); }
  group.position.set(W.x, W.y, W.z); render.scene.add(group); paint();
  const pos = new THREE.Vector3(W.x + 0.1, W.y + 0.1, W.z);
  world.punch = { pos, group };
  const aimBox = new THREE.Box3(new THREE.Vector3(W.x - 0.1, W.y - 0.32, W.z - 0.3), new THREE.Vector3(W.x + 0.2, W.y + 0.32, W.z + 0.45));
  interaction.register({
    id: 'ponto', reach: 2.8, priority: 2,
    aim: () => ({ box: aimBox }),
    enabled: () => S.began && !S.punched,                 // (a late punch is still a punch: the task stays pending until then)
    label: () => ({ text: S.on ? 'Bater o ponto' : 'Bater o ponto (atrasado)' }),
    tap: () => {
      S.punched = true; paint();
      const t = time.text();
      S.on && paint(); sfx('tecla', { pos: pos.toArray() }); sfx('gaveta_abre', { pos: pos.toArray(), gain: 0.8 }); sfx('caixa_bip', { pos: pos.toArray(), gain: 0.7 });
      tasks.done('ponto'); progression.ok('tarefa');
      bus.emit('hint', `Ponto batido às ${t}. Bom turno, Heitor.`);
      bus.emit('prep:punched', t);
    },
  });
  bus.on('time:minute', (m) => {
    if (S.on) paint();
    if (S.on && m >= 0) end();
  });

  // ---------------------------------------------------------------- the preparation
  const tasksOf = () => tasks.prepList();
  function begin({ tutorial = false, seed = 1 } = {}) {
    S.on = true; S.began = true; S.tutorial = tutorial; S.punched = false; S.seed = seed; S.t = 0; S.guide = '';
    time.setRate(PREP_RATE);
    tasks.setPrep(true);
    tasks.add('ponto', 'Bater o ponto no relógio do escritório', 'preparacao');
    if (tutorial) { chores.spawn('mancha'); chores.spawn('lampada'); tasks.startRestock(1, seed); chores.spawn('lixo'); }
    else {
      tasks.addFixed(['banheiro']);
      chores.spawn('mancha'); chores.spawn('lampada'); chores.spawn('lixo');
      tasks.startRestock(progression.st.week >= 3 ? 2 : 1, seed);
    }
    tasks.setPrep(false);
    paint();
  }
  function end() {
    if (!S.on) return;
    S.on = false;
    const left = S.tutorial ? 0 : tasks.penalizePrep();
    if (S.tutorial) for (const t of tasksOf()) t.penalized = true;
    if (left) { progression.undone(left); bus.emit('hint', `Meia-noite. Preparação incompleta: ${left} ${left === 1 ? 'tarefa fica' : 'tarefas ficam'} pendente${left === 1 ? '' : 's'} (−6 cada).`); }
    else bus.emit('hint', 'Meia-noite. Posto pronto.');
    if (time.minutes < 0) { time.set(0); ui.setClock(time.text()); }      // (the lesson's clock waited at 23:55: it is midnight now)
    time.setRate(1);
    tasks.setTillEnabled(!S.tutorial);        // (the tutorial's till opens when the manager says so)
    if (!S.tutorial) { tasks.addFixed(['abrir-caixa']); customers.enable(true, progression.st.seed * 3 + progression.st.day); }
    narrative.endPrep();
    bus.emit('prep:end', { left });
  }
  function abort() { S.on = false; S.began = false; tasks.setPrep(false); }

  /** The lesson: the first pending guided task, in the order of the lesson; its text is the objective and its place the marked goal. */
  function guide() {
    for (const [prefix, text] of GUIDE) {
      const t = tasks.list.find((q) => q.prep && !q.done && (q.id === prefix || q.id.startsWith(prefix)));
      if (!t) continue;
      if (S.guide !== t.id) { S.guide = t.id; narrative.setObjective(text); goals.select('t:' + t.id); }
      return;
    }
  }
  function update(dt) {
    if (!S.on) return;
    S.t += dt;
    if (S.tutorial) {
      if (time.minutes > -5) time.set(-5);                  // the clock waits: no hurry in the lesson
      guide();
      if (tasksOf().every((t) => t.done) || S.t > 900) end();
    }
  }
  bus.on('shift:open', () => { if (S.on && !S.punched && !S.tutorial) goals.select('t:ponto'); if (S.on && S.tutorial) guide(); });

  /** For the HUD: "PREPARAÇÃO 2:31" (the real seconds left; in the lesson only the word). */
  function text() {
    if (!S.on) return null;
    if (S.tutorial) return 'PREPARAÇÃO';
    const sec = Math.max(0, Math.ceil(-time.minutes * (time.secondsPerHour / 60) / PREP_RATE));
    return `PREPARAÇÃO ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  }
  return { begin, end, abort, update, text, get on() { return S.on; }, get punched() { return S.punched; }, get tutorial() { return S.tutorial; } };
}
