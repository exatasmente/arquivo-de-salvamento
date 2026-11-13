// Validates data/cast.json and data/recurring.pt-BR.json: parse, nights, hours, weeks, line lengths.
// usage: node tools/validate-cast.mjs   (from o-dia-que-sobra/)
import fs from 'fs';
const cast = JSON.parse(fs.readFileSync('data/cast.json', 'utf8'));
const rec = JSON.parse(fs.readFileSync('data/recurring.pt-BR.json', 'utf8'));
const errs = []; const e = (m) => errs.push(m);
const mins = (h) => { const m = /^(\d\d):(\d\d)$/.exec(h); if (!m) { e('hora invalida ' + h); return -1; } return +m[1] * 60 + +m[2]; };
const scenes = new Map(rec.cenas.map((c) => [c.id, c]));
if (scenes.size !== rec.cenas.length) e('ids de cena repetidos');
const used = new Set(); let lines = 0, longest = 0;
const checkLine = (where, t) => { lines++; longest = Math.max(longest, t.length); if (t.length > rec.limite) e(`${where}: ${t.length} caracteres: ${t}`); };
for (const p of cast.recorrentes) {
  if (p.idade < 18) e(p.id + ' menor de idade');
  const h = mins(p.horario), [a, b] = p.janela.map(mins);
  if (h < a || h > b) e(p.id + ' horario fora da janela');
  if (h < 0 || b > 360) e(p.id + ' fora do expediente');
  const seen = new Set(); const mine = p.noites.map((n) => n.cena);
  if (mine.length < 6 || mine.length > 10) e(`${p.id}: ${mine.length} cenas (6 a 10)`);
  for (const n of p.noites) {
    if (n.semana < 1 || n.semana > 4 || n.dia < 1 || n.dia > 6) e(`${p.id}: noite invalida ${n.semana}/${n.dia}`);
    const k = n.semana * 10 + n.dia; if (seen.has(k)) e(`${p.id}: noite repetida ${k}`); seen.add(k);
    const c = scenes.get(n.cena); if (!c) { e('cena inexistente ' + n.cena); continue; }
    used.add(n.cena);
    if (c.quem !== p.id) e(`${n.cena}: quem ${c.quem} != ${p.id}`);
    if (c.noite.semana !== n.semana || c.noite.dia !== n.dia) e(`${n.cena}: noite difere do elenco`);
    const hh = mins(c.gatilho.hora), [ja, jb] = c.gatilho.janela.map(mins);
    if (hh < ja || hh > jb) e(`${n.cena}: hora fora da janela`);
    if (c.gatilho.hora !== p.horario) e(`${n.cena}: hora difere do recorrente`);
  }
}
for (const c of rec.cenas) {
  if (!used.has(c.id)) e('cena sem noite no elenco: ' + c.id);
  const sets = [['falas', c.falas], ...(c.variantes ?? []).map((v, i) => ['variante' + i, v.falas])];
  for (const [n, f] of sets) { if (f.length < 1 || f.length > 4) e(`${c.id}.${n}: ${f.length} falas`); f.forEach((x, i) => checkLine(`${c.id}.${n}[${i}]`, x.t)); }
  for (const k of ['gentileza', 'erro', 'demora']) { if (!c.reacoes?.[k]?.length) e(`${c.id}: sem reacao ${k}`); (c.reacoes?.[k] ?? []).forEach((t, i) => checkLine(`${c.id}.${k}[${i}]`, t)); }
}
for (const [id, pj] of Object.entries(rec.personagens)) for (const [k, arr] of Object.entries(pj.cafe ?? {})) arr.forEach((x, i) => checkLine(`${id}.cafe.${k}[${i}]`, x.t.replace('{s4.data}', 'XXXXXXXXXXXXXXXXXXXX').replace('{s4.carro}', 'XXXXXXXXXXXXXXXXXXXXXXXX')));
for (const t of cast.tipos) {
  if (!['comum', 'inconveniente', 'suspeito', 'sobrenatural'].includes(t.categoria)) e(t.id + ' categoria');
  for (const k of ['chegada', 'pedido', 'obrigado']) for (const x of t.falas?.[k] ?? []) checkLine(`${t.id}.${k}`, x);
  for (const [k, r] of Object.entries(t.reacoes ?? {})) for (const x of r.falas ?? []) checkLine(`${t.id}.${k}`, x);
  if (t.horas) t.horas.forEach(mins);
}
const nTipos = cast.tipos.filter((t) => ['comum', 'inconveniente', 'suspeito'].includes(t.categoria)).length;
if (nTipos < 6 || nTipos > 10) e('tipos comum/inconveniente/suspeito: ' + nTipos);
// the secret must not be in the clear: marker only
const raw = fs.readFileSync('data/recurring.pt-BR.json', 'utf8') + fs.readFileSync('data/cast.json', 'utf8');
if (!raw.includes('{s4.data}') || !raw.includes('{s4.carro}')) e('marcadores do S4 ausentes');
console.log(`recorrentes ${cast.recorrentes.map((p) => p.id + ':' + p.noites.length).join(' ')}; cenas ${rec.cenas.length}; falas ${lines}, a maior com ${longest}; tipos ${cast.tipos.length} (${nTipos} comum/inconveniente/suspeito)`);
console.log(errs.length ? 'ERROS:\n' + errs.join('\n') : 'validacao ok');
process.exit(errs.length ? 1 : 0);
