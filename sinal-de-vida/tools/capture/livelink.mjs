// The packet of the Live Link Face app (the app sends it by UDP). Epic does not document it; the layout below is the one decoded by the
// public project PyLiveLinkFace (https://github.com/JimWest/PyLiveLinkFace, `decode`), all numbers big-endian:
//   uint8   version (6)
//   int32   length of the device id, then the id (UTF-8)
//   int32   length of the subject name, then the name (UTF-8)
//   int32   frame number, float32 sub-frame, int32 fps numerator, int32 fps denominator
//   uint8   count of values (61)
//   count x float32: the 52 ARKit blendshapes (in the order of LIVELINK_NAMES), then HeadYaw, HeadPitch, HeadRoll and the
//           yaw, pitch and roll of each eye.
// A version or a count that is not the expected one is reported (`notes`) and the packet is followed by its sizes.
import { BLENDSHAPES, normalizeName } from './lib.mjs';

export const LIVELINK_NAMES = [
  'EyeBlinkLeft', 'EyeLookDownLeft', 'EyeLookInLeft', 'EyeLookOutLeft', 'EyeLookUpLeft', 'EyeSquintLeft', 'EyeWideLeft',
  'EyeBlinkRight', 'EyeLookDownRight', 'EyeLookInRight', 'EyeLookOutRight', 'EyeLookUpRight', 'EyeSquintRight', 'EyeWideRight',
  'JawForward', 'JawLeft', 'JawRight', 'JawOpen', 'MouthClose', 'MouthFunnel', 'MouthPucker', 'MouthLeft', 'MouthRight',
  'MouthSmileLeft', 'MouthSmileRight', 'MouthFrownLeft', 'MouthFrownRight', 'MouthDimpleLeft', 'MouthDimpleRight',
  'MouthStretchLeft', 'MouthStretchRight', 'MouthRollLower', 'MouthRollUpper', 'MouthShrugLower', 'MouthShrugUpper',
  'MouthPressLeft', 'MouthPressRight', 'MouthLowerDownLeft', 'MouthLowerDownRight', 'MouthUpperUpLeft', 'MouthUpperUpRight',
  'BrowDownLeft', 'BrowDownRight', 'BrowInnerUp', 'BrowOuterUpLeft', 'BrowOuterUpRight', 'CheekPuff', 'CheekSquintLeft', 'CheekSquintRight',
  'NoseSneerLeft', 'NoseSneerRight', 'TongueOut', 'HeadYaw', 'HeadPitch', 'HeadRoll', 'LeftEyeYaw', 'LeftEyePitch', 'LeftEyeRoll', 'RightEyeYaw', 'RightEyePitch', 'RightEyeRoll',
];
const EXPECTED = { version: 6, count: 61 };
// index in the packet -> index in BLENDSHAPES (null for what the page does not keep, e.g. TongueOut)
const SLOT = LIVELINK_NAMES.map((n) => { const m = normalizeName(n); return m ? BLENDSHAPES.indexOf(m) : null; });
const HEAD = [LIVELINK_NAMES.indexOf('HeadYaw'), LIVELINK_NAMES.indexOf('HeadPitch'), LIVELINK_NAMES.indexOf('HeadRoll')];

/** Decodes a packet. Returns { b: number[51] (the BLENDSHAPES order), h: [yaw, pitch, roll], subject, device, frame, fps, count, notes: [] } or null if malformed. */
export function parsePacket(buf) {
  try {
    const notes = []; let o = 0;
    const version = buf.readUInt8(o); o += 1;
    if (version !== EXPECTED.version) notes.push(`version ${version} (expected ${EXPECTED.version})`);
    const str = () => { const n = buf.readInt32BE(o); o += 4; if (n < 0 || n > 256 || o + n > buf.length) throw new Error('bad length'); const s = buf.toString('utf8', o, o + n); o += n; return s; };
    const device = str(), subject = str();
    const frame = buf.readInt32BE(o), sub = buf.readFloatBE(o + 4), num = buf.readInt32BE(o + 8), den = buf.readInt32BE(o + 12); o += 16;
    const declared = buf.readUInt8(o); o += 1;
    if (declared !== EXPECTED.count) notes.push(`count ${declared} (expected ${EXPECTED.count})`);
    const room = Math.floor((buf.length - o) / 4), count = Math.min(declared, room) || room;   // follow the sizes if the count does not fit
    if (count < HEAD[2] + 1) return null;
    const b = new Array(BLENDSHAPES.length).fill(0);
    for (let i = 0; i < count; i++) { const v = buf.readFloatBE(o + i * 4); if (!Number.isFinite(v)) return null; if (SLOT[i] != null && i < LIVELINK_NAMES.length) b[SLOT[i]] = Math.max(0, Math.min(1, v)); }
    const h = HEAD.map((i) => buf.readFloatBE(o + i * 4));
    return { b, h, subject, device, frame: frame + sub, fps: den ? num / den : 0, count, notes };
  } catch { return null; }
}

/** Builds a packet (for the tests and for a simulated phone): `values` by name (PascalCase), missing ones are 0. */
export function buildPacket({ values = {}, device = '00000000-0000-0000-0000-000000000000', subject = 'iPhone', frame = 0, sub = 0, num = 60, den = 1, version = 6, count = 61 } = {}) {
  const d = Buffer.from(device), s = Buffer.from(subject), b = Buffer.alloc(1 + 4 + d.length + 4 + s.length + 16 + 1 + count * 4);
  let o = 0; b.writeUInt8(version, o); o += 1;
  b.writeInt32BE(d.length, o); o += 4; d.copy(b, o); o += d.length;
  b.writeInt32BE(s.length, o); o += 4; s.copy(b, o); o += s.length;
  b.writeInt32BE(frame, o); b.writeFloatBE(sub, o + 4); b.writeInt32BE(num, o + 8); b.writeInt32BE(den, o + 12); o += 16;
  b.writeUInt8(count, o); o += 1;
  for (let i = 0; i < count; i++) b.writeFloatBE(values[LIVELINK_NAMES[i]] ?? 0, o + i * 4);
  return b;
}
