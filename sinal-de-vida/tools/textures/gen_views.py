"""Generates extra views of the Jonas concept art with DeepInfra's image-edit endpoint (FLUX.1 Kontext), from the existing concept
images, so the whole body can be painted in one hand. The key is read from ~/.config/deepinfra/key and never printed.
usage: python3 gen_views.py <concept-dir> <name> <reference.png> "<prompt>" [n]
Writes <concept-dir>/<name>-<k>.png and appends the prompt to prompts.md's log (kept by hand)."""
import base64, json, os, subprocess, sys, tempfile

d, name, ref, prompt = sys.argv[1:5]
n = int(sys.argv[5]) if len(sys.argv) > 5 else 1
key = open(os.path.expanduser('~/.config/deepinfra/key')).read().strip()
model = os.environ.get('MODEL', 'black-forest-labs/FLUX.1-Kontext-dev')
with tempfile.NamedTemporaryFile('w', suffix='.hdr', delete=False) as h:
    h.write('Authorization: Bearer ' + key + '\n')
    hdr = h.name
try:
    out = subprocess.run(['curl', '-s', '-m', '300', 'https://api.deepinfra.com/v1/openai/images/edits', '-H', '@' + hdr,
                          '-F', 'model=' + model, '-F', 'prompt=' + prompt, '-F', 'image=@' + os.path.join(d, ref),
                          '-F', 'n=%d' % n, '-F', 'size=1024x1024', '-F', 'response_format=b64_json'], capture_output=True, text=True).stdout
finally:
    os.unlink(hdr)
try:
    r = json.loads(out)
except Exception:
    print('erro', out[:300]); sys.exit(1)
if 'data' not in r:
    print('erro', json.dumps(r)[:400]); sys.exit(1)
for k, item in enumerate(r['data']):
    b = item.get('b64_json')
    if b:
        open(os.path.join(d, f'{name}-{k}.png'), 'wb').write(base64.b64decode(b))
        print('ok', f'{name}-{k}.png')
