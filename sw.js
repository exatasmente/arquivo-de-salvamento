// The site's service worker: after the first visit the home screen and both games open without a network.
// Online, every file comes from the network (so a new version is never mixed with an old one); offline, the
// copy answers. A new version (a new list below) refreshes the copy, downloading only the files that changed. The list below is every file the games need, written by
// `node tools/precache.mjs` (run it after `git add`, before the commit; `--check` only says if it is stale).
// The opening video of the Rinha is not kept: offline the game falls back to its real-time cutscenes.

// precache:start
const VERSION = '8e6daa353372';
const PRECACHE = [
  ["assets/o-dia-que-sobra.jpg", '17931a2396ad'],
  ["assets/og.jpg", '77776032a238'],
  ["assets/rinha.jpg", '660ba873a285'],
  ["console/games.js", 'a66f98abc35f'],
  ["console/main.js", '61e929b22c56'],
  ["console/style.css", '70cf4634ba29'],
  ["console/vendor/engine/components.js", 'a07030ae9252'],
  ["console/vendor/engine/entities.js", '64872c86d641'],
  ["console/vendor/engine/input.js", 'bf50bbb29080'],
  ["console/vendor/engine/layout.js", '9f49568a6c48'],
  ["console/vendor/engine/library.js", 'd5e8f5c6f35c'],
  ["console/vendor/engine/looks.js", 'acd25d617d14'],
  ["console/vendor/engine/render.js", 'f2d7df47898b'],
  ["console/vendor/engine/rng.js", '7ecbad13ab00'],
  ["console/vendor/engine/save.js", '4e75408374ae'],
  ["console/vendor/engine/sound.js", 'e8b792661dc0'],
  ["console/vendor/engine/VERSION.json", 'a159baa991b1'],
  ["console/vendor/three/three.core.js", '0ee9b6d58834'],
  ["console/vendor/three/three.module.js", '4dc5bcedc5dc'],
  ["icons/apple-touch-icon.png", '7d64f72fc958'],
  ["icons/icon-192.png", '4b7db5303b53'],
  ["icons/icon-512.png", '9c6d7fc3255f'],
  ["icons/icon-maskable-512.png", '0f347c2b0017'],
  ["icons/icon.svg", '5ecedb823bd1'],
  ["./", '7605d1a0f181'],
  ["index.html", '7605d1a0f181'],
  ["manifest.webmanifest", '9d52ec584d6c'],
  ["o-dia-que-sobra/data/cast.json", 'cd7b578aef25'],
  ["o-dia-que-sobra/data/customers.json", '645310903ca7'],
  ["o-dia-que-sobra/data/dayoff.pt-BR.json", '25bdfaa325ef'],
  ["o-dia-que-sobra/data/dialogue.pt-BR.json", '2bd41d6d2a94'],
  ["o-dia-que-sobra/data/events.json", 'bdc8d9bf8ce2'],
  ["o-dia-que-sobra/data/items.json", 'bfde0d3204e8'],
  ["o-dia-que-sobra/data/medication.json", '3d54b926a137'],
  ["o-dia-que-sobra/data/progression.json", 'dc5bccfbe86f'],
  ["o-dia-que-sobra/data/recurring.pt-BR.json", '739073d84d7c'],
  ["o-dia-que-sobra/data/scenes/posto.json", '48f98eeefb1a'],
  ["o-dia-que-sobra/data/tasks.json", 'fa819c908997'],
  ["o-dia-que-sobra/", '2e76fef45877'],
  ["o-dia-que-sobra/index.html", '2e76fef45877'],
  ["o-dia-que-sobra/mobile.css", '284ada923105'],
  ["o-dia-que-sobra/src/audio/babble.js", '1388f75aad6f'],
  ["o-dia-que-sobra/src/audio/chain.js", 'bc67d66762fb'],
  ["o-dia-que-sobra/src/audio/extra.js", '382d5cb0f04a'],
  ["o-dia-que-sobra/src/audio/fase6.js", 'd76f673416dc'],
  ["o-dia-que-sobra/src/audio/index.js", '560760735f97'],
  ["o-dia-que-sobra/src/audio/kit.js", 'acbd51d82ce0'],
  ["o-dia-que-sobra/src/audio/loops.js", '4541c6c79bbf'],
  ["o-dia-que-sobra/src/audio/oneshots.js", 'f7cbbd5cfc5e'],
  ["o-dia-que-sobra/src/audio/sol.js", 'b798422526c5'],
  ["o-dia-que-sobra/src/audio/susto.js", 'c693b4a32bff'],
  ["o-dia-que-sobra/src/audio/util.js", '2431a4b34a48'],
  ["o-dia-que-sobra/src/bus.js", '95248b147900'],
  ["o-dia-que-sobra/src/cutscenes/abertura.js", '9a888dc35136'],
  ["o-dia-que-sobra/src/cutscenes/bomba4.js", '9282e501a799'],
  ["o-dia-que-sobra/src/cutscenes/cartao.js", '2bc40f8876bd'],
  ["o-dia-que-sobra/src/cutscenes/chegada.js", '00180d62607a'],
  ["o-dia-que-sobra/src/cutscenes/common.js", 'fd67ab4e6e7b'],
  ["o-dia-que-sobra/src/cutscenes/corte.js", '9891f380b839'],
  ["o-dia-que-sobra/src/cutscenes/finais-kit.js", 'cfc2fb35d807'],
  ["o-dia-que-sobra/src/cutscenes/final1.js", 'b01293ba7445'],
  ["o-dia-que-sobra/src/cutscenes/final2.js", '8de7c08f3989'],
  ["o-dia-que-sobra/src/cutscenes/final3.js", '48c9464fb348'],
  ["o-dia-que-sobra/src/cutscenes/final4.js", '9bd6ac72108a'],
  ["o-dia-que-sobra/src/cutscenes/final5.js", '798dce4f2bb2'],
  ["o-dia-que-sobra/src/cutscenes/gerente.js", 'c4d8399d4de2'],
  ["o-dia-que-sobra/src/cutscenes/noites.js", '31012b953cd7'],
  ["o-dia-que-sobra/src/cutscenes/player.js", 'fedfb49228ca'],
  ["o-dia-que-sobra/src/cutscenes/rotina.js", 'a32130acd70d'],
  ["o-dia-que-sobra/src/cutscenes/serie.js", 'd2d8f7a67636'],
  ["o-dia-que-sobra/src/cutscenes/stagecraft.js", '02900e0c1996'],
  ["o-dia-que-sobra/src/cutscenes/telefone.js", '6d7c9ead1b37'],
  ["o-dia-que-sobra/src/entities.js", '62562c77310c'],
  ["o-dia-que-sobra/src/film-manifest.json", 'e1600ee10114'],
  ["o-dia-que-sobra/src/film.js", '3abc6c5539d5'],
  ["o-dia-que-sobra/src/game.js", '62dd050bd273'],
  ["o-dia-que-sobra/src/input.js", '8c4f6f7f6bdf'],
  ["o-dia-que-sobra/src/look.js", 'a25babe004bd'],
  ["o-dia-que-sobra/src/main.js", '4afdc21a8a29'],
  ["o-dia-que-sobra/src/models/car.js", 'ed5a373cb4db'],
  ["o-dia-que-sobra/src/models/customer.js", '28ec6651c0b1'],
  ["o-dia-que-sobra/src/models/entity.js", 'ce8f64e9e132'],
  ["o-dia-que-sobra/src/models/faces.js", '999b9392f861'],
  ["o-dia-que-sobra/src/models/hose.js", '9981393d9035'],
  ["o-dia-que-sobra/src/models/human.js", 'e8aed1ac7b64'],
  ["o-dia-que-sobra/src/models/moto.js", '68118332f425'],
  ["o-dia-que-sobra/src/models/props.js", '0ee6811cd8df'],
  ["o-dia-que-sobra/src/props.js", '12f9d8cf0785'],
  ["o-dia-que-sobra/src/render.js", 'c80e5c4ebbc3'],
  ["o-dia-que-sobra/src/rng.js", '19766ca62ba0'],
  ["o-dia-que-sobra/src/save.js", '6ec9708bcc3c'],
  ["o-dia-que-sobra/src/scenes/casa.js", '839ff7205dad'],
  ["o-dia-que-sobra/src/scenes/paint.js", '4d85275ebc50'],
  ["o-dia-que-sobra/src/scenes/posto.js", '3026c2c02601'],
  ["o-dia-que-sobra/src/secrets.js", '9046ce3f36f8'],
  ["o-dia-que-sobra/src/stubs/audio.js", '63f37177a19e'],
  ["o-dia-que-sobra/src/systems/audio.js", 'cb6171be67c7'],
  ["o-dia-que-sobra/src/systems/cameras.js", '419b60cd4f52'],
  ["o-dia-que-sobra/src/systems/campaign.js", '47693f780c32'],
  ["o-dia-que-sobra/src/systems/cash.js", '8a91c3c68719'],
  ["o-dia-que-sobra/src/systems/chores.js", 'f46e86ccdfeb'],
  ["o-dia-que-sobra/src/systems/coffee.js", 'f323d31f6053'],
  ["o-dia-que-sobra/src/systems/customers.js", '154dd59af4de'],
  ["o-dia-que-sobra/src/systems/dayoff.js", '35258f959a6d'],
  ["o-dia-que-sobra/src/systems/dropspot.js", 'a7701bb65efe'],
  ["o-dia-que-sobra/src/systems/entity.js", 'fdab832e5ff5'],
  ["o-dia-que-sobra/src/systems/events.js", '464d2b26bfb5'],
  ["o-dia-que-sobra/src/systems/events/a-placa.js", 'b91b078f8669'],
  ["o-dia-que-sobra/src/systems/events/adesivo-estoque.js", '32eccc587111'],
  ["o-dia-que-sobra/src/systems/events/apagao-cobertura.js", 'd22b8a29421d'],
  ["o-dia-que-sobra/src/systems/events/aparicao.js", '3b5e94d1c8a3'],
  ["o-dia-que-sobra/src/systems/events/bomba-4.js", '120e4146ace1'],
  ["o-dia-que-sobra/src/systems/events/cafe-pronto.js", 'f33fd5a45217'],
  ["o-dia-que-sobra/src/systems/events/carro-vazio.js", 'f80ad2409cc5'],
  ["o-dia-que-sobra/src/systems/events/cliente-some.js", '616078a51793'],
  ["o-dia-que-sobra/src/systems/events/deposito-aberto.js", '95f5b0893555'],
  ["o-dia-que-sobra/src/systems/events/espelho.js", 'acc86261da47'],
  ["o-dia-que-sobra/src/systems/events/figura-camera.js", '6047a3b48c9f'],
  ["o-dia-que-sobra/src/systems/events/figura-vaga.js", '97c944d1ca04'],
  ["o-dia-que-sobra/src/systems/events/figura-vidro.js", '262b15cdc9e4'],
  ["o-dia-que-sobra/src/systems/events/kit.js", 'ee3670f3f23d'],
  ["o-dia-que-sobra/src/systems/events/luz-oscila.js", '50613618eb2f'],
  ["o-dia-que-sobra/src/systems/events/morador-de-rua.js", '4c0f52f04b35'],
  ["o-dia-que-sobra/src/systems/events/objeto-muda.js", 'c4cb024e62cf'],
  ["o-dia-que-sobra/src/systems/events/passante-canto.js", 'ab000fea2d9e'],
  ["o-dia-que-sobra/src/systems/events/passos-fora.js", '9b657a19e219'],
  ["o-dia-que-sobra/src/systems/events/porta-aberta.js", '6ace56c598b5'],
  ["o-dia-que-sobra/src/systems/events/prateleira-arrumada.js", '4e8b81965d10'],
  ["o-dia-que-sobra/src/systems/events/rafael-volta.js", 'e0d5f5bac6d0'],
  ["o-dia-que-sobra/src/systems/events/silhueta-vitrine.js", '951b7b97dabd'],
  ["o-dia-que-sobra/src/systems/events/sino-sem-ninguem.js", '99b28d75b2cb'],
  ["o-dia-que-sobra/src/systems/events/sol-por-dentro.js", '1a57437ae7ea'],
  ["o-dia-que-sobra/src/systems/events/sombra-errada.js", '350fd034985b'],
  ["o-dia-que-sobra/src/systems/events/telefone-fantasma.js", 'def4b1a2c8b2'],
  ["o-dia-que-sobra/src/systems/events/telefone.js", '0fed1948673e'],
  ["o-dia-que-sobra/src/systems/events/turno-dobrado.js", '51db4a52b69a'],
  ["o-dia-que-sobra/src/systems/events/voce-na-camera.js", 'fcd161ccc72d'],
  ["o-dia-que-sobra/src/systems/events/vulto-colado.js", 'c9344e367a31'],
  ["o-dia-que-sobra/src/systems/events/vulto-corredor.js", '48896e4a2ba0'],
  ["o-dia-que-sobra/src/systems/events/vulto.js", '56771d93ade8'],
  ["o-dia-que-sobra/src/systems/goals.js", '63323acb947e'],
  ["o-dia-que-sobra/src/systems/hoses.js", '9b1571ae3ca2'],
  ["o-dia-que-sobra/src/systems/interaction.js", 'b1598b2123bc'],
  ["o-dia-que-sobra/src/systems/inventory.js", 'e8ef43ffe32a'],
  ["o-dia-que-sobra/src/systems/lighting.js", 'c61995e47c14'],
  ["o-dia-que-sobra/src/systems/medication.js", '9d8ac8ce043d'],
  ["o-dia-que-sobra/src/systems/mirror.js", '0742da6e39b3'],
  ["o-dia-que-sobra/src/systems/narrative.js", 'c33be1063dde'],
  ["o-dia-que-sobra/src/systems/nav.js", '0fd7adb40fae'],
  ["o-dia-que-sobra/src/systems/office.js", '24a73e92efcd'],
  ["o-dia-que-sobra/src/systems/player.js", '4b30b2cd23d0'],
  ["o-dia-que-sobra/src/systems/prep.js", 'a6fb2fb411a5'],
  ["o-dia-que-sobra/src/systems/progression.js", 'ef4802501357'],
  ["o-dia-que-sobra/src/systems/sanity.js", 'c51c0b13a52d'],
  ["o-dia-que-sobra/src/systems/save.js", '60b139eef28b'],
  ["o-dia-que-sobra/src/systems/secrets.js", 'b6afde6acb40'],
  ["o-dia-que-sobra/src/systems/shift.js", 'b8672886c90c'],
  ["o-dia-que-sobra/src/systems/standins.js", '5799e3270190'],
  ["o-dia-que-sobra/src/systems/tasks.js", '131cefd85f65'],
  ["o-dia-que-sobra/src/systems/time.js", '74ed1e927e12'],
  ["o-dia-que-sobra/src/systems/traffic.js", '7dec5276ab6b'],
  ["o-dia-que-sobra/src/systems/vault.js", '18e1101c0292'],
  ["o-dia-que-sobra/src/systems/world.js", 'd7205e6af0b2'],
  ["o-dia-que-sobra/src/title.js", 'ea8c7254bc19'],
  ["o-dia-que-sobra/src/touch/mobile.js", 'cdc281f6439a'],
  ["o-dia-que-sobra/src/touch/tilt.js", '005060cb8c47'],
  ["o-dia-que-sobra/src/ui.js", '04368fb6113f'],
  ["o-dia-que-sobra/src/util.js", '3c3f2732d7c5'],
  ["o-dia-que-sobra/style.css", '3fcd2035bb8e'],
  ["o-dia-que-sobra/vendor/engine/components.js", 'a07030ae9252'],
  ["o-dia-que-sobra/vendor/engine/entities.js", '64872c86d641'],
  ["o-dia-que-sobra/vendor/engine/input.js", 'bf50bbb29080'],
  ["o-dia-que-sobra/vendor/engine/layout.js", '9f49568a6c48'],
  ["o-dia-que-sobra/vendor/engine/library.js", 'd5e8f5c6f35c'],
  ["o-dia-que-sobra/vendor/engine/looks.js", 'acd25d617d14'],
  ["o-dia-que-sobra/vendor/engine/render.js", 'f2d7df47898b'],
  ["o-dia-que-sobra/vendor/engine/rng.js", '7ecbad13ab00'],
  ["o-dia-que-sobra/vendor/engine/save.js", '4e75408374ae'],
  ["o-dia-que-sobra/vendor/engine/sound.js", 'e8b792661dc0'],
  ["o-dia-que-sobra/vendor/engine/VERSION.json", 'a159baa991b1'],
  ["o-dia-que-sobra/vendor/three/three.core.js", '0ee9b6d58834'],
  ["o-dia-que-sobra/vendor/three/three.module.js", '4dc5bcedc5dc'],
  ["rinha/data/scenes/casa.json", '41933aaa9491'],
  ["rinha/data/scenes/cela.json", '63fade925fb8'],
  ["rinha/data/scenes/galpao.json", 'a6873595e86a'],
  ["rinha/data/scenes/pomar.json", 'd0f07d93ba38'],
  ["rinha/data/scenes/treino.json", '313e8465c31c'],
  ["rinha/", 'fe089c31fb83'],
  ["rinha/index.html", 'fe089c31fb83'],
  ["rinha/src/ai.js", 'b3d34b54f0b9'],
  ["rinha/src/audio/music.js", '7c21ad4dfc55'],
  ["rinha/src/audio/sfx.js", 'fff553ed2b3d'],
  ["rinha/src/combat.js", '9fcf36127ab5'],
  ["rinha/src/cutscene.js", 'cc374be47bea'],
  ["rinha/src/cutscenes/abducao.js", '4cfcdaa05d81'],
  ["rinha/src/cutscenes/casa-fome.js", '7d7d1d3af1e7'],
  ["rinha/src/cutscenes/casa.js", '3ecfe506b04d'],
  ["rinha/src/cutscenes/cela-acordar.js", 'ba3532425c29'],
  ["rinha/src/cutscenes/cela-tempo.js", '3a22eaac30f1'],
  ["rinha/src/cutscenes/cela-volta.js", '3c8de0410f33'],
  ["rinha/src/cutscenes/common.js", '96e1cbf9e09c'],
  ["rinha/src/cutscenes/crowd.js", '57cf2c3f7b7d'],
  ["rinha/src/cutscenes/drone.js", '5e27f39614b7'],
  ["rinha/src/cutscenes/entrada-ringue.js", '181aa7019a5f'],
  ["rinha/src/cutscenes/familia.js", '8bbe413e33de'],
  ["rinha/src/cutscenes/fim-campanha.js", '8592aa827034'],
  ["rinha/src/cutscenes/flashes.js", 'e215d0364933'],
  ["rinha/src/cutscenes/night.js", 'c33748fb4cf5'],
  ["rinha/src/cutscenes/player.js", '05ca60e80374'],
  ["rinha/src/cutscenes/pomar-cerco.js", '826ad26d3538'],
  ["rinha/src/cutscenes/pomar.js", 'efb5d7bf27e7'],
  ["rinha/src/cutscenes/ringue-abducao.js", '1dd0f9f7ee03'],
  ["rinha/src/cutscenes/ringue-plateia.js", 'add00b2cb675'],
  ["rinha/src/cutscenes/treino-aula.js", 'c66d9a2dc1e9'],
  ["rinha/src/cutscenes/treino-fim.js", '1b50c1d215cf'],
  ["rinha/src/fighter.js", '1856e70e335f'],
  ["rinha/src/film-manifest.json", 'c3ad15982ce9'],
  ["rinha/src/film.js", '22e4bc811e9f'],
  ["rinha/src/game.js", '0dae106e9311'],
  ["rinha/src/hud.js", '9cb7c5763691'],
  ["rinha/src/input.js", '0edff8468348'],
  ["rinha/src/intro-video.js", 'ffff776bb1c7'],
  ["rinha/src/items.js", '18c8c82a8fc1'],
  ["rinha/src/look.js", '2d6c4cb96c34'],
  ["rinha/src/main.js", '697c4b9d7724'],
  ["rinha/src/models/animals.js", '88f508fec1e2'],
  ["rinha/src/models/creatures.js", 'c07b07a1b6c3'],
  ["rinha/src/models/faces.js", '999b9392f861'],
  ["rinha/src/models/human.js", 'ed7b4e5c6bfa'],
  ["rinha/src/props.js", 'c4b376b81e06'],
  ["rinha/src/render.js", '7247dd3203ad'],
  ["rinha/src/ring.js", '63f69c61c573'],
  ["rinha/src/rng.js", '7ecbad13ab00'],
  ["rinha/src/save.js", '29d6496a610c'],
  ["rinha/src/scene-entities.js", 'f26a6c942b10'],
  ["rinha/src/scene-view.js", 'd7e5073be395'],
  ["rinha/src/scenes/casa.js", '8ffc64260933'],
  ["rinha/src/scenes/cela.js", '2f67273799a2'],
  ["rinha/src/scenes/galpao.js", '67b47dd3d7f1'],
  ["rinha/src/scenes/pomar.js", '6766c31885ae'],
  ["rinha/src/scenes/treino.js", 'c545828a91c2'],
  ["rinha/src/secrets.js", '1de5ccc8005c'],
  ["rinha/src/sound.js", 'ae69c9bb7040'],
  ["rinha/src/synth-cues.js", '3b206dbef7eb'],
  ["rinha/src/textures/paint.js", '4da8e2168af2'],
  ["rinha/src/title.js", '6aa18eb2eda1'],
  ["rinha/src/tutorial.js", '29c7b59cd53a'],
  ["rinha/src/ui.js", 'bf4d85b5cbc5'],
  ["rinha/style.css", 'a14845964a33'],
  ["rinha/vendor/engine/components.js", 'a07030ae9252'],
  ["rinha/vendor/engine/entities.js", '64872c86d641'],
  ["rinha/vendor/engine/input.js", 'bf50bbb29080'],
  ["rinha/vendor/engine/layout.js", '9f49568a6c48'],
  ["rinha/vendor/engine/library.js", 'd5e8f5c6f35c'],
  ["rinha/vendor/engine/looks.js", 'acd25d617d14'],
  ["rinha/vendor/engine/render.js", 'f2d7df47898b'],
  ["rinha/vendor/engine/rng.js", '7ecbad13ab00'],
  ["rinha/vendor/engine/save.js", '4e75408374ae'],
  ["rinha/vendor/engine/sound.js", 'e8b792661dc0'],
  ["rinha/vendor/engine/VERSION.json", 'a159baa991b1'],
  ["rinha/vendor/three/three.core.js", '0ee9b6d58834'],
  ["rinha/vendor/three/three.module.js", '4dc5bcedc5dc'],
];
// precache:end

const CACHE = `arquivo-${VERSION}`;
const FONTS = 'arquivo-fonts';
const SCOPE = new URL('./', self.location).href;
const TIMEOUT = 5000;
const STAMP = 'x-arquivo-hash';
const LISTED = new Set(PRECACHE.map(([p]) => new URL(p, SCOPE).href));
/** The response with the hash of its contents written on it, so the next version knows it unchanged. */
async function stamped(res, hash) {
  const headers = new Headers(res.headers);
  headers.set(STAMP, hash);
  return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers });
}
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap';

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // A file whose contents did not change since the copy kept by the version before comes from that copy:
    // an update downloads only what changed. A few at a time; one that fails (a 404 while a game is being
    // changed) does not stop the others.
    const before = (await caches.keys()).filter((k) => k.startsWith('arquivo-') && k !== CACHE && k !== FONTS);
    const queue = [...PRECACHE];
    const worker = async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        const [p, hash] = item, url = new URL(p, SCOPE).href;
        try {
          let kept = null;
          for (const k of before) { const hit = await (await caches.open(k)).match(url); if (hit && hit.headers.get(STAMP) === hash) { kept = hit; break; } }
          if (kept) { await cache.put(url, kept); continue; }
          const res = await fetch(new Request(url, { cache: 'reload' }));
          if (res.ok) await cache.put(url, await stamped(res, hash));
        } catch { /* the next visit online tries again */ }
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    // The two fonts of the home screen (they come from Google Fonts): kept now, so a later visit without a
    // network has them too, though the first page loaded them before this worker existed.
    try {
      const fonts = await caches.open(FONTS);
      const res = await fetch(FONT_CSS);
      if (res.ok) {
        const css = await res.clone().text();
        await fonts.put(FONT_CSS, res);
        await Promise.allSettled([...css.matchAll(/url\((https:[^)]+)\)/g)].map(async ([, u]) => {
          if (await fonts.match(u)) return;
          const f = await fetch(u, { mode: 'cors' });
          if (f.ok) await fonts.put(u, f);
        }));
      }
    } catch { /* offline install: the fonts fall back */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('arquivo-') && k !== CACHE && k !== FONTS) await caches.delete(k);
    await self.clients.claim();
  })());
});

const kept = (url) => !/\.(mp4|webm|wav)$/i.test(url.pathname);

function fromNetwork(req) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), TIMEOUT);
    fetch(req).then((res) => { clearTimeout(t); resolve(res); }, (err) => { clearTimeout(t); reject(err); });
  });
}

async function fromCopy(req, url) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return hit;
  // a page asked as folder/ or folder/index.html
  if (req.mode === 'navigate') {
    const alt = url.pathname.endsWith('/') ? url.href.split('?')[0] + 'index.html' : url.href.split('?')[0].replace(/index\.html$/, '');
    const other = await cache.match(alt, { ignoreSearch: true });
    if (other) return other;
  }
  return null;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);
  // The fonts: the copy first, refreshed in the background.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith((async () => {
      const cache = await caches.open(FONTS);
      const hit = await cache.match(req);
      const fresh = fetch(req).then((res) => { if (res.ok || res.type === 'opaque') cache.put(req, res.clone()); return res; }).catch(() => null);
      return hit || (await fresh) || Response.error();
    })());
    return;
  }
  if (!url.href.startsWith(SCOPE) || !kept(url)) return;
  e.respondWith((async () => {
    try {
      const res = await fromNetwork(req);
      // A listed file keeps the copy made at install (the offline set stays one version); anything else
      // the site asks for is kept as it comes.
      const bare = url.href.split('?')[0];
      if (res.ok && res.type === 'basic' && !LISTED.has(bare)) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(bare, copy)).catch(() => {});
      }
      return res;
    } catch {
      return (await fromCopy(req, url)) || Response.error();
    }
  })());
});

// The home screen asks whether the games are kept for offline play.
self.addEventListener('message', (e) => {
  if (e.data?.type !== 'status' || !e.ports[0]) return;
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const keys = new Set((await cache.keys()).map((r) => r.url));
    const have = PRECACHE.filter(([p]) => keys.has(new URL(p, SCOPE).href)).length;
    e.ports[0].postMessage({ ready: have === PRECACHE.length && have > 0, have, total: PRECACHE.length, version: VERSION });
  })());
});
