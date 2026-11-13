// Small helpers shared by the systems.
/** Money is kept in cents. */
export const money = (c) => 'R$ ' + (Math.round(c) / 100).toFixed(2).replace('.', ',');
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
