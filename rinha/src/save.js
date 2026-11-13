// The memory card is the engine's (vendor/engine/save.js); what this game keeps in it and where it shows.
// The campaign (block 1) and each won fight (blocks 2 to 8, with its seed) are wiped by a game over; the
// record and the list of found secrets (block 9) stay. Block 13 is "corrupted": a broken icon, nothing readable yet.
import { openCard, BLOCKS, CORRUPT_BLOCK } from '../vendor/engine/save.js';

export const KEY = 'rinha.card.v1';
export { BLOCKS, CORRUPT_BLOCK };

const empty = () => ({ v: 1, campaign: null, fights: {}, record: { best: 0, wins: 0 }, secrets: [], meta: { intro: false } });

export function createCard(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  const card = openCard({ key: KEY, empty, storage });
  return {
    get data() { return card.data; },
    reload: card.read,
    hasCampaign() { return Boolean(card.data.campaign); },
    /** Saves the campaign state and, when a fight is given, its record. */
    save(campaign, fight) {
      const data = card.data;
      data.campaign = { ...campaign };
      if (fight) data.fights[fight.n] = { n: fight.n, seed: fight.seed, name: fight.name, secs: Math.round(fight.secs), reward: fight.reward };
      data.record.best = Math.max(data.record.best, campaign.fightNo - 1);
      data.record.wins = Math.max(data.record.wins, Object.keys(data.fights).length);
      return card.write();
    },
    /** Game over: the campaign goes, the record and the secrets stay. */
    wipeCampaign(reachedFight = 0) {
      const data = card.data;
      data.record.best = Math.max(data.record.best, reachedFight);
      data.campaign = null; data.fights = {};
      return card.write();
    },
    get introSeen() { return card.introSeen; },
    setIntroSeen: card.setIntroSeen,
    hasSecret: card.hasSecret,
    addSecret: card.addSecret,
    /** What each of the 15 blocks holds, for the card screen. */
    blocks() {
      const data = card.data;
      const out = card.emptyBlocks();
      if (data.campaign) out[0] = { n: 1, kind: 'campaign', ...data.campaign };
      for (let f = 1; f <= 7; f++) if (data.fights[f]) out[f] = { n: f + 1, kind: 'fight', ...data.fights[f] };
      if (data.record.best > 0 || data.secrets.length) out[8] = { n: 9, kind: 'record', best: data.record.best, wins: data.record.wins, secrets: data.secrets.length };
      out[CORRUPT_BLOCK - 1] = { n: CORRUPT_BLOCK, kind: 'corrupt' };
      return out;
    },
  };
}
