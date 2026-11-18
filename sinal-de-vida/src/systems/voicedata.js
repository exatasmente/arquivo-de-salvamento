// What the recordings say about the story: the lengths of the voice lines (assets/audio/n1/durations.json, measured by tools/voice/durations.mjs)
// and the two points the game cuts at (data/story/marcas.json). Nothing about a length is written in the conversations: a node with a `voice`
// gets its `dur` from here, and an answer with `markFrom` gets its `mark`, so a line that is recorded again changes no code. Pure.
export const GUESS = 0.07;   // seconds per character, when a recording is missing (being recorded again): the game still runs

/** The length of a voice line in seconds. `text` is only for the guess. */
export function durOf(id, durations, text = '') {
  const d = durations?.[id];
  return d > 0 ? d : Math.max(1, text.length * GUESS);
}

/** A copy of the conversations with every `dur` and `mark` filled from the recordings. */
export function resolveStory(conversations, durations = {}, marcas = {}) {
  const out = JSON.parse(JSON.stringify(conversations));
  for (const conv of Object.values(out)) {
    for (const n of Object.values(conv.nodes)) {
      if (n.kind === 'line' && n.voice && n.dur === undefined) n.dur = durOf(n.voice, durations, n.text);
      for (const r of n.responses ?? []) {
        if (r.voice && r.dur === undefined) r.dur = durOf(r.voice, durations, r.text);
        if (r.markFrom) { const m = marcas[r.markFrom]?.mark; r.mark = Math.min(m ?? r.dur * 0.5, r.dur); }
      }
    }
  }
  return out;
}
