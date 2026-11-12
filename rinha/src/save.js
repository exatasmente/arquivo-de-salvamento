// The memory card: 15 blocks in localStorage. The campaign (block 1) and each won fight (blocks
// 2 to 8, with its seed) are wiped by a game over; the record and the list of found secrets
// (block 9) stay. Block 13 is "corrupted": it shows a broken icon and has no readable content yet.
export const KEY = 'rinha.card.v1';
export const BLOCKS = 15;
export const CORRUPT_BLOCK = 13;

const empty = () => ({ v: 1, campaign: null, fights: {}, record: { best: 0, wins: 0 }, secrets: [], meta: { intro: false } });

export function createCard(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  let data = empty();
  function read() {
    try {
      const raw = storage && storage.getItem(KEY);
      if (!raw) return (data = empty());
      const d = JSON.parse(raw);
      data = d && d.v === 1 ? { ...empty(), ...d } : empty();
    } catch { data = empty(); }
    return data;
  }
  function write() { try { storage && storage.setItem(KEY, JSON.stringify(data)); return true; } catch { return false; } }
  read();

  return {
    get data() { return data; },
    reload: read,
    hasCampaign() { return Boolean(data.campaign); },
    /** Saves the campaign state and, when a fight is given, its record. */
    save(campaign, fight) {
      data.campaign = { ...campaign };
      if (fight) data.fights[fight.n] = { n: fight.n, seed: fight.seed, name: fight.name, secs: Math.round(fight.secs), reward: fight.reward };
      data.record.best = Math.max(data.record.best, campaign.fightNo - 1);
      data.record.wins = Math.max(data.record.wins, Object.keys(data.fights).length);
      return write();
    },
    /** Game over: the campaign goes, the record and the secrets stay. */
    wipeCampaign(reachedFight = 0) {
      data.record.best = Math.max(data.record.best, reachedFight);
      data.campaign = null; data.fights = {};
      return write();
    },
    get introSeen() { return Boolean(data.meta && data.meta.intro); },
    setIntroSeen() { data.meta = { ...(data.meta || {}), intro: true }; write(); },
    hasSecret(id) { return data.secrets.includes(id); },
    addSecret(id) { if (!data.secrets.includes(id)) { data.secrets.push(id); write(); return true; } return false; },
    /** What each of the 15 blocks holds, for the card screen. */
    blocks() {
      const out = Array.from({ length: BLOCKS }, (_, i) => ({ n: i + 1, kind: 'empty' }));
      if (data.campaign) out[0] = { n: 1, kind: 'campaign', ...data.campaign };
      for (let f = 1; f <= 7; f++) if (data.fights[f]) out[f] = { n: f + 1, kind: 'fight', ...data.fights[f] };
      if (data.record.best > 0 || data.secrets.length) out[8] = { n: 9, kind: 'record', best: data.record.best, wins: data.record.wins, secrets: data.secrets.length };
      out[CORRUPT_BLOCK - 1] = { n: CORRUPT_BLOCK, kind: 'corrupt' };
      return out;
    },
  };
}
