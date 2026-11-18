// The entry: ?film is the film mode (the views of the cutscenes, for the video), ?editor the scene alone for the
// scene editor, ?cena=<name> one cutscene played alone with its sound (`?cena=radio-teste`); ?cena=n1-saida (a scene of the story) jumps the game to that scene;
// anything else the game.
const q = new URLSearchParams(location.search);
if (q.has('film')) await import('./film.js');
else if (q.has('editor')) { const { viewScene } = await import('./scene-view.js'); await viewScene(q.get('editor') || 'galeria'); }
else if (q.has('cena') && !/^(n\d-|demo-)/.test(q.get('cena'))) { const { playCutscene } = await import('./cutscenes/player.js'); await playCutscene(q.get('cena')); }
else { const { boot } = await import('./game.js'); await boot(); }
