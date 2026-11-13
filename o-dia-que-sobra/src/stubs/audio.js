// Stand-in for audio/index.js while it is missing (or with ?stubs): silent, but it keeps a log of
// what the game asked for, so a test can see that the right sounds were requested.
export function createAudioContext() { return null; }
export function createAudio() {
  const log = [];
  const handle = () => ({ stop() {}, setGain() {}, setPos() {} });
  return {
    log,
    play(name, o) { log.push(name); return handle(o); },
    loop(name) { log.push('loop:' + name); return handle(); },
    listener() {},
    babble(seed, text) { log.push('babble'); return Math.max(0.6, text.length * 0.045); },
    setSanity(v) { this.sanity = v; },
    resume() {},
  };
}
