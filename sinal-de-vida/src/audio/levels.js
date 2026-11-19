// Small level helpers of the game's sound.
/** Decibels to a linear gain. */
export const dbGain = (db) => 10 ** (db / 20);
/** A linear gain to decibels. */
export const gainDb = (g) => 20 * Math.log10(Math.max(g, 1e-9));
