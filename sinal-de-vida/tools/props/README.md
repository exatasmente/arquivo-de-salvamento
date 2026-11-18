# Props da galeria (estação inacabada)

Os objetos do esconderijo (`assets/props/*.glb`) são **feitos e pintados por script**, no jeito do Jonas e do cão-robô: textura pintada à mão
(sombra pintada onde duas peças se encontram, borda gasta mais clara, sujeira escorrida, luz de cima), quinas chanfradas e contorno. Nenhum
modelo ou foto de fora, nenhum modelo de imagem, nenhum render: a luz é pintada.

## Como rodar

```
<blender> --background --factory-startup --python tools/props/bake.py -- --out assets/props [--only nome,nome] [--size 512] [--keep]
```

`--keep` deixa o `.png` da textura ao lado do `.glb`. Os 52 props levam cerca de 8 minutos. Tudo é determinístico.

Para ver o resultado com o render do próprio jogo (visual, tom da noite, contorno) e o Jonas ao lado, sirva a raiz do jogo e abra
`tools/props/preview.html?w=1920&h=1080` (`&only=a,b` escolhe os props, `&row=9` a largura das fileiras, `&outline=0` tira o contorno,
`&jonas=0` tira o Jonas).

## Os arquivos

- `specs.py`: a lista. Para cada prop, o construtor, o tamanho da textura e quanto de sujeira e ferrugem.
- `procedural.py`: a **forma**. Cada construtor monta o prop com `box`, `cyl`, `bar`, `sph`, `torus` e `planks`, em metros, com a frente para
  -y (o +z do jogo). Cada chamada vira uma **peça** no kit de `tools/models/metal.py` (o mesmo do cão) e guarda o quadro da peça (centro,
  eixos, meias medidas) e o material. A forma já sai do tamanho do jogo, sem redução: caixa grossa o bastante ganha **chanfro de verdade**
  nas doze arestas (44 triângulos, uma normal por canto); caixa fina são seis faces; cilindro tem a borda chanfrada e os lados que o raio pede.
  O material diz só a primeira cor e o tipo: `wood`, `steel`, `coat` (metal pintado), `rust`, `rubber`, `conc`, `cloth`, `plain`.
- `paint.py`: a **pintura**, texel a texel. Cada texel sabe o ponto no prop, a normal, a peça, a distância à aresta viva mais próxima (convexa:
  onde a tinta gasta; côncava: onde a sujeira junta), a distância à peça vizinha e quanto de céu enxerga. Na ordem: tom de cada peça e
  desbotado geral; a superfície do tipo (veio da madeira ao longo da tábua, juntas e pregos; tinta lascada com fundo e metal; aço escovado;
  ferrugem; concreto; pano com dobras); o desenho do prop; bordas gastas e vincos escuros; sujeira; a **linha escura** onde duas peças se
  encontram (a cor do contorno, `#21140d`); a luz de cima com a sombra de cada peça na vizinha; a pincelada.
- `details.py`: o que cada prop tem desenhado (costuras, parafusos, faixas, um pictograma). Nunca letra nem número.
- `bake.py`: junta tudo e exporta. Cada `.glb` tem a malha do prop com uma textura (JPEG, só cor-base) e a malha `<nome>_hull`: a parte do
  prop que leva contorno (sem miudezas e sem varetas finas, em que a linha ficaria mais larga que a peça).

Nome, tamanho, pivô (em pé no chão, centrado) e frente de cada prop são os de antes: o jogo posiciona pelo nome. Os que eram forma baixada
(fogareiro, gerador, quadro, galão, carrinho, pneu, cama, caixa de ferramentas) agora são construídos aqui, do mesmo tamanho. A caixa de
ferramentas passou a ficar apoiada no chão (o arquivo antigo flutuava 16 cm).

## No jogo

- `src/models/props/loader.js` carrega os `.glb` antes das cenas; um que falte vira uma caixa lisa e o jogo segue.
- `src/models/props/place.js` põe o prop num lote do kit, com o tom da noite e uma parte da pintura mostrada como é (`PAINTED`, como as
  roupas do Jonas), e junto vai o **contorno**: a casca de `src/models/outline.js` (o mesmo casco invertido do Jonas, mesma cor e mesma
  espessura na tela). Todas as cascas são um material só, então o lote e o `flatten` as juntam numa malha por trecho: uma draw call a mais.
- `src/models/props/gallery.js` tem o construtor de cada tipo de entidade da galeria; `src/scenes/galeria-shell.js` + `src/models/props/station.js`
  fazem a casca (piso, paredes, abóbada) com **luz assada**: cada superfície tem uma pintura própria, no mesmo vocabulário (valores fortes,
  pincelada larga, toda junta uma linha escura com um filete de luz ao lado), com ilhas quentes sob as lâmpadas e sombra ao pé das paredes
  e sob cada objeto. A casca não tem contorno de geometria (é vista por dentro): o contorno dela é **pintado** ao pé e no alto de cada parede,
  em volta do piso e ao lado de cada nervura da abóbada.
- `src/scenes/galeria-tunel.js` faz o interior do túnel que se abre na parede sul (`paintTunnel`, em `station.js`).

## A segunda passada: o que era caixa e cilindro no código

Depois dos 39 props da estação, o que ainda destoava era o que as cenas montavam direto no código, com a textura repetida do kit e sem contorno.
Duas saídas, conforme a peça:

- **Vira prop pintado** o que a câmera vê de perto e tem forma própria: `caixa_papelao` e `lata` (prateleiras), `cano`, `cano_flange`, `cano_parede`
  e `cano_descida` (os canos das paredes e da casa de máquinas, em módulos que o jogo estica), `escada_poco` (a escada do poço), e na rua `cacamba`
  e `cacamba_entulho` (mesmo tamanho e mesmo colisor da caixa que substituem), `marquise_modulo` e `marquise_coluna`, `tapume_painel` e
  `tapume_poste`. Em `specs.py`, `center=False` mantém x e y do construtor e `z0` mantém a altura da origem (um cano pendurado gira em torno do
  próprio eixo). `frustum` (em `procedural.py`) faz a caixa que abre para cima, a cuba da caçamba.
- **Fica no código, com contorno e pincelada**, o que é miúdo ou paramétrico demais: `src/models/kit.js` aceita `outline: true` em `box`, `cyl` e
  `geo` (e `b.outline(geo, matriz)` para o resto), e junta todas as cascas de um lote numa malha só, do mesmo material das cascas dos props
  (`side: 'outline'`, respondido pelo próprio kit; `side: 'back'` dá as faces de trás). As texturas do kit ganharam o mesmo acabamento
  (`finish`: pincelada larga, valores fortes, junta em marrom escuro), o dobro do tamanho e filtro linear; os pictogramas ganharam `weather`
  (borda em linha escura, tinta lascada na beirada, sujeira escorrida).
- **A casca da estação** ganhou uma pintura própria para as nervuras da abóbada (`paintRib`, em `station.js`) e a parede deixou de ter as linhas
  retas que a faziam ler como azulejo (juntas de tábua interrompidas, massas grandes de umidade, o pé molhado em linha irregular).
