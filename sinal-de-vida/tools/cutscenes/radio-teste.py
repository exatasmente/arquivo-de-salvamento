"""The data of the cutscene "radio-teste" (src/cutscenes/radio-teste.js) from the recorded scene. Run it again whenever the audio changes:

    python3 tools/cutscenes/radio-teste.py <folder of the audio>

The folder has `linha-do-tempo.json` ({ total, falas: [{ id, who: 'jonas' | 'voz', face, text, start, dur, file }] }), the loose take
of each line (`file`) and the mixed scene (`cena-radio.wav`). It writes, inside the game:

  data/cutscenes/radio-teste.json   the lines (id, who, face, text, start, dur), the total, and per frame at 30 fps of the whole scene:
                                    `mouth` (0..1, how open Jonas's mouth is, from the loudness of his own take), `narrow` (0..1, the lips
                                    coming together on the hissed and stopped consonants) and `radio` (0..1, the loudness of the other voice)
  assets/audio/cena-radio.mp3       the mixed scene, mono, small, for the game to play

Nothing of the cutscene's timing lives in its code: it all comes from this file. Needs ffmpeg; no other dependency."""
import array, json, math, os, re, subprocess, sys

FPS, SR = 30, 16000
HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, '..', '..'))


def pcm(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(SR), '-f', 's16le', '-'], check=True, capture_output=True).stdout
    a = array.array('h'); a.frombytes(raw[:len(raw) // 2 * 2])
    return a


def smooth(a, b, x):
    x = max(0.0, min(1.0, (x - a) / (b - a))) if b > a else 0.0
    return x * x * (3 - 2 * x)


def frames(samples, n):
    """Per video frame: the loudness (rms) and how much of it is hiss (the energy of the sample-to-sample difference over the energy)."""
    half = int(SR * 0.022)
    rms, hiss = [], []
    for f in range(n):
        c = int(f / FPS * SR)
        s = samples[max(0, c - half):c + half]
        if len(s) < 8: rms.append(0.0); hiss.append(0.0); continue
        e = sum(v * v for v in s) / len(s)
        d = sum((s[i] - s[i - 1]) ** 2 for i in range(1, len(s))) / (len(s) - 1)
        rms.append(math.sqrt(e)); hiss.append(d / e if e > 1 else 0.0)
    return rms, hiss


def envelope(samples, n):
    """The mouth of one take: (open, narrow) per frame."""
    rms, hiss = frames(samples, n)
    loud = sorted(v for v in rms if v > 0) or [1.0]
    top = loud[int(len(loud) * 0.92)] or 1.0
    voiced = [h for v, h in zip(rms, hiss) if v > top * 0.25] or [1.0]
    mid = sorted(voiced)[len(voiced) // 2] or 1.0
    op, na = [], []
    for v, h in zip(rms, hiss):
        # the loudness in decibels under the loud syllables of the take (a whisper and a shout both open the mouth)
        db = 20 * math.log10(max(v, 1e-6) / top)
        level = max(0.0, min(1.0, (db + 26) / 26))
        speaking = smooth(0.08, 0.3, level)
        s = 0.8 * smooth(mid * 2.0, mid * 5.0, h) * speaking    # a hissed consonant: teeth together, lips forward
        o = (level ** 1.25) * speaking * (1 - 0.75 * s)
        op.append(o); na.append(s)
    # a little smoothing so no frame jumps, keeping the syllables: the mouth opens at once and closes a bit slower
    out = []
    for i, o in enumerate(op):
        prev = out[-1] if out else 0.0
        nxt = op[i + 1] if i + 1 < len(op) else 0.0
        o = 0.6 * o + 0.2 * (op[i - 1] if i else 0.0) + 0.2 * nxt
        out.append(max(o, prev * 0.55))
    # the lips come together where the voice stops for an instant between two syllables (p, b, m, t ...)
    for i in range(1, len(out) - 1):
        if out[i] < out[i - 1] * 0.6 and out[i] < out[i + 1] * 0.6 and max(out[i - 1], out[i + 1]) > 0.25: na[i] = max(na[i], 0.6)
    na = [max(na[i], 0.5 * (na[i - 1] if i else 0), 0.5 * (na[i + 1] if i + 1 < len(na) else 0)) for i in range(len(na))]
    return out, na


def main():
    if len(sys.argv) != 2: sys.exit(__doc__)
    src = sys.argv[1]
    tl = json.load(open(os.path.join(src, 'linha-do-tempo.json'), encoding='utf-8'))
    total = float(tl['total'])
    n = int(math.ceil(total * FPS)) + 1
    mouth, narrow, radio = [0.0] * n, [0.0] * n, [0.0] * n
    lines = []
    for f in tl['falas']:
        start, dur = float(f['start']), float(f['dur'])
        lines.append({'id': f['id'], 'who': f['who'], 'face': f['face'], 'text': re.sub(r'\[[^\]]*\]\s*', '', f['text']).strip(), 'start': round(start, 3), 'dur': round(dur, 3)})
        take = pcm(os.path.join(src, f['file']))
        k = int(math.ceil(len(take) / SR * FPS)) + 1
        f0 = int(round(start * FPS))
        if f['who'] == 'jonas':
            op, na = envelope(take, k)
            for i in range(k):
                if f0 + i < n: mouth[f0 + i] = max(mouth[f0 + i], op[i]); narrow[f0 + i] = max(narrow[f0 + i], na[i])
        else:
            rms, _ = frames(take, k)
            top = max(rms) or 1.0
            for i in range(k):
                if f0 + i < n: radio[f0 + i] = max(radio[f0 + i], min(1.0, rms[i] / top) ** 0.7)
    r2 = lambda a: [round(v, 2) for v in a]
    out = {'fps': FPS, 'total': round(total, 3), 'audio': 'assets/audio/cena-radio.mp3', 'lines': lines, 'mouth': r2(mouth), 'narrow': r2(narrow), 'radio': r2(radio)}
    os.makedirs(os.path.join(GAME, 'data', 'cutscenes'), exist_ok=True)
    with open(os.path.join(GAME, 'data', 'cutscenes', 'radio-teste.json'), 'w', encoding='utf-8') as fh:
        fh.write('{\n' + ',\n'.join(f' {json.dumps(k)}: {json.dumps(v, ensure_ascii=False, separators=(",", ":") if isinstance(v, list) and k != "lines" else (", ", ": "))}' for k, v in out.items()) + '\n}\n')
    os.makedirs(os.path.join(GAME, 'assets', 'audio'), exist_ok=True)
    mp3 = os.path.join(GAME, 'assets', 'audio', 'cena-radio.mp3')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', os.path.join(src, 'cena-radio.wav'), '-map_metadata', '-1', '-ac', '1', '-ar', '44100', '-b:a', '64k', mp3], check=True)
    print(f'{len(lines)} lines, {total:.2f} s, {n} frames; {os.path.getsize(mp3) / 1024:.0f} KB of audio')


main()
