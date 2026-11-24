# Modelos do Blender

As pessoas e o cão-robô são gerados por script (Blender 4.5 LTS, sem janela) e exportados em glTF binário para `assets/models/`.

```bash
export BLENDER=/caminho/do/blender            # o binário do Blender
"$BLENDER" --background --factory-startup --python tools/models/person.py -- --out assets/models
"$BLENDER" --background --factory-startup --python tools/models/dog.py    -- --out assets/models
```

- `common.py`: o que os dois dividem (malha por listas, esqueleto, pesos por distância, exportação e compactação do `.glb`).
- `person.py`, `person_face.py`, `person_shared.py`, `person_anim.py`: a pessoa (um esqueleto, dois corpos, peças que o jogo liga por nome: cabelos, barbas, óculos, lanterna de cabeça, mochila) e as animações.
- `dog.py`: o cão-robô (casco sem cabeça, quatro patas com joelho e sem roda, bloco de sensores baixo na frente com a faixa de luz, escudos ocre nos quadris, encaixe vazio nas costas com o pictograma), as animações (os pés são plantados por solução de dois ossos) e a textura pintada por script no estilo do Jonas. O glb leva dois conjuntos de UV: o 0 é o tom na rampa do jogo (contrato antigo), o 1 é o atlas pintado.
- `metal.py`: peças chanfradas com uma normal por vértice (para o contorno de casco invertido), o atlas e os dados de cada texel (ponto, normal, distância à quina, vizinhança, céu) para pintar metal à mão; quem pinta é o script do modelo.
- `dog-preview.html` e `dog-preview.js`: o cão no render do jogo, como o `dog.js` o desenha (pintura e contorno), para as folhas de prova.
- `preview.html` e `preview.js`: folha de contato feita com o render do próprio jogo (`window.sheet(spec)`).

O gradiente suave de cada vértice viaja como UV numa rampa de 128x16 px que o jogo cria (`src/models/glb.js`); o jogo pinta cada material pelo nome e pela semente. Tudo é determinístico: sem relógio, sem sorteio sem semente.

## Jonas (o piloto das pessoas novas)

`jonas.py` faz o Jonas sobre o corpo CC0 da Quaternius, em vez de montar o corpo do zero:

- **Forma.** Remodela o corpo (o músculo alisado, tronco largo, peito chato, um pouco de barriga, antebraços e mãos grossos) e, no fim, aumenta
  e alarga a cabeça (`head_scale`: a do conceito é maior e mais quadrada) e **encurta as pernas** (`short_legs`: ossos e pele abaixo do quadril
  a 90%; o resto desce junto). Os clipes continuam valendo porque os ossos mantêm a direção; o deslocamento do quadril nos clipes é escalado
  pelo mesmo fator (`scale_hips`), ou os pés afundariam ao agachar.
- **Roupa.** Jaqueta aberta, camiseta, calça e botas por cópia do próprio corpo, cortadas por planos (barra, gola, punho) e empurradas pela
  normal; a borda aberta é alisada de novo depois do empurrão. O colarinho é uma folha dobrada em volta do pescoço. O cinto, os dois bolsos
  de couro (caixa, bolso menor na frente, alça sobre o cinto) e as ferramentas em pé dentro deles são da bacia (não esticam com as pernas).
  Um disco escuro fecha por dentro a boca das mangas e das pernas da calça. Os bolsos do peito têm relevo de geometria (bolso, aba por cima,
  botão) exatamente onde a imagem da jaqueta os pinta (`paint.jacket_xz`), pintados pela mesma consulta; o punho arregaçado é um degrau; as
  ferramentas têm forma (boca da chave, alicate com pino, cabo de chave de fenda, martelo com unha); as botas têm vira e biqueira.
- **Cabelo.** O couro cabeludo incha acima da linha do cabelo (o volume é da própria cabeça, pintado de escuro: não aparece pele) e sobre ele
  vão cerca de 135 cachos modelados (`build_locks`): cada um curvo, afilado e enrolado em volta do próprio eixo (perto de uma volta, para
  um lado ou para o outro), ao longo do fluxo que sai da coroa, com semente; acima da faixa da lanterna sobem e se abrem, abaixo deitam, e
  duas fileiras de cachos grisalhos fazem o tufo de cada têmpora.
- **Olhos.** Dois globos de verdade sob pálpebras de geometria (`jonas_face.py`, "the eyes"). A órbita do corpo de base (um bolso de
  pele, 16 vértices por anel) é refeita em volta de um globo próprio (`fit_lids`): a abertura vira uma amêndoa do tamanho e no lugar
  que o conceito desenha, a borda fica numa esfera uma espessura de pálpebra acima do globo e nenhuma pele perto dela fica abaixo
  dessa esfera, então o branco não atravessa a pálpebra. Os morph targets das pálpebras (`blink`, `eye_wide`, `squint`, `look_down`,
  `look_up`) são o mesmo ajuste refeito com outras aberturas (`lid_state`): a pálpebra desliza sobre o globo. O cansaço é a malha em
  repouso (a pálpebra de cima cobre o alto da íris), não uma linha pintada. O build confere e escreve no log quanto de pele fica sob
  o globo em cada expressão (`check_lids`, tem de dar 0). Cada globo (`eyes`, esfera aberta atrás, córnea um pouco saliente, nunca
  decimado) pende de um osso próprio (`eye_l`, `eye_r`, filhos da cabeça), que o jogo gira para ele olhar. A pintura do globo é
  `paint.eye_image` (íris castanha com fibras, borda escura macia, branco creme que escurece para os cantos, sem brilho pintado).
  `lashes` são os cílios (fita escura na borda de cima, fina na de baixo) e o brilho pequeno, que fica parado enquanto o globo gira e
  some sob a pálpebra; `lidshade` é a sombra das pálpebras sobre o globo (fitas que o jogo desenha como vidro escuro). As duas
  seguem a borda pelos mesmos morph targets. Em volta do olho, `lid_paint` troca o olho que a imagem do rosto traz pintado por pele
  de pálpebra pintada conforme a geometria (vinco, sombra para a borda, olheira).
- **Lanterna de cabeça.** Um tambor de 60 triângulos (`lamp`) e todo o detalhe na pintura (`paint.lamp_images`): aro serrilhado,
  parafusos, facetas do refletor, desgaste; um mapa de altura pintado ao lado vira o mapa de normal. O vidro é pintado apagado;
  `lamp_glow` é o mesmo vidro aceso, um disco à parte que o jogo mostra quando a lanterna está ligada. A faixa é a peça `strap`.
- **Rosto e boca.** Expressões por morph targets no corpo (`jonas_face.py`). O bolso da boca da malha de base é cortado (a parede dele
  esticava numa folha rosada): ficam os lábios, e a boca abre em oval sobre o interior próprio (cavidade escura, arcada de cima presa à
  cabeça; arcada de baixo, língua e assoalho seguem o queixo pelo mesmo `jaw_open`).
- **Pintura** (`paint.py`, `projection.py`). Cada peça tem o seu atlas, com as ilhas de UV reempacotadas para enchê-lo, e a cor vem de uma
  imagem feita para a peça (`tools/textures/prompts.md`), consultada por **marcos lidos na imagem** (olhos, boca, ombro, punho) ou pelo
  **contorno** (a largura da peça em cada altura esticada sobre a largura da figura na linha correspondente), nunca por caixa envolvente.
  Toda imagem gerada é antes levada às cores da arte de conceito (uma reta por canal): a pele das mãos é a do rosto, a jaqueta é o verde do
  conceito. A luz é pintada: luz suave de cima e as sombras que uma peça faz na outra entram multiplicadas na textura.
- **Relevo fino.** Costuras, pespontos, bordas de bolso, dobras e rugas não são geometria: `paint.relief` tira um mapa de normal de cada
  atlas pintado (a tinta menos o próprio borrão é uma altura: linha escura é sulco) e ele viaja como `normalTexture` do glTF (pele, jaqueta,
  calça, botas, cinto). O jogo o repassa ao material (`normalMap`).
- **Animação.** As bibliotecas CC0 e dois clipes da CMU retargetados (`retarget.py`: `mancar` e `esconder`), mais poses aditivas:
  `hand_relax`, `tired` (cansado, mas de cabeça erguida), `stance` (parado, os pés vêm para baixo do corpo e os braços caem: o `idle` da
  biblioteca é de lutador), `sit_hands` e `radio_low` (sentado à mesa; a mão do rádio desce da orelha para a boca).
  `esquivar` é o `Roll` da UAL1 (a esquiva da cena 4: mergulho e rolamento sobre o ombro; o jogo corta quando ele está agachado). Os
  clipes que pisam no chão (`GROUNDED`) são assentados por `ground_clip`: o quadril desce ou sobe até o pé mais baixo do clipe tocar onde
  o pé fica em repouso (com as pernas encurtadas, o agachado da biblioteca ficava 4 cm acima do chão). A medida liga o slot da ação e
  desliga o NLA: no Blender 4.4+ uma ação sem slot não anima, e as faixas já postas preenchem os ossos que o clipe não tem.
- **Jeitos de andar** (`jonas_gait.py`, chamado pelo `jonas.py`). A biblioteca só tem um andar lento, um trote de passada longa e um
  agachado lento, e nenhum clipe de virar, começar ou parar. O script faz, a partir deles, os clipes que o jogo toca, cada um para a
  velocidade em que é tocado (as mesmas de `src/systems/player.js`):
  - os ciclos `walk` (1,1 m/s), `brisk` (o manche inteiro, 1,55 m/s: o andar da biblioteca com a passada 19% mais longa e o passo mais
    rápido, os braços balançando mais), `run` (o trote na duração original da biblioteca, 4,8 m/s) e `crouch_walk` (1,0 m/s). Todos
    começam onde o pé esquerdo pousa; o pé que carrega o corpo é preso (vai para trás em linha reta na velocidade do clipe) e as pernas
    são resolvidas de novo (IK de dois ossos), com o quadril descendo onde a perna não alcança. A passada vem do root motion da
    biblioteca (`UAL1_Standard_RM.glb`) vezes o encurtamento das pernas;
  - `walk_start`, `crouch_start` (de parado até o ciclo, na aceleração do controle), `walk_stop_0..3`, `crouch_stop_0..3` (do ciclo até
    parado, um para cada quarto do ciclo) e `turn_l45` ... `turn_r180`, `crouch_turn_...` (virar no lugar em passos, 45 a 180 graus para
    cada lado), com os pés presos no mundo quadro a quadro.
  - `jog` (3,2 m/s: a corrida com metade da passada, para a corrida ofegante dentro do prédio) e os ciclos de escada
    `stairs_up_run`, `stairs_up_walk`, `stairs_down_run`, `stairs_down_walk`: feitos no plano, a partir do andar (numa escada sempre há
    um pé no chão), com a passada de uma escada de degraus de 0,30 m (dois degraus por passo correndo, um andando), o tronco para dentro
    da subida. O jogo os anda pelos degraus percorridos e põe cada pé na altura do próprio degrau (`src/models/plant.js`, `terrain`).
    Os nomes dizem o que ele faz, não de onde veio o movimento: uma tomada de captura pode substituir qualquer um com o mesmo nome.
  Cada clipe leva no osso `root` o que o jogo lê e não toca: os metros andados (para a frente), a virada (em torno do vertical), a fase
  do ciclo (a altura do osso) e quais pés carregam o corpo (o deslocamento lateral: 1 esquerdo, 2 direito, 3 os dois). O log escreve,
  por clipe, quanto o pé foi corrigido, quanto o quadril desceu e quanto um pé no chão ainda se mexe.

Os pacotes e as imagens ficam fora do repositório:

```
"$BLENDER" --background --factory-startup --python tools/models/jonas.py -- --out assets/models \
    --assets /pasta/dos/assets-externos --concept /pasta/da/arte-de-conceito [--lod 1]
```
Variáveis de depuração: `JONAS_QUICK=<px>` (tamanho dos atlas, para testar mais rápido), `JONAS_DEBUG=1`, `JONAS_DUMP=<pasta>` (salva as
texturas), `JONAS_STOP=1` (para depois da malha, antes da pintura), `JONAS_SAVE=<arquivo.blend>` (salva a cena como foi exportada).
Sem `--lod`, gera `jonas.glb` (perto, com as animações; cerca de 18 mil triângulos e 1,45 MB); com `--lod 1`, `jonas_lod.glb` (longe, sem
animação: o jogo toca as do perto; 8 mil triângulos, 0,5 MB). Leva cerca de 4 minutos (a pintura é feita texel a texel em Python).

No jogo (`src/models/jonas.js`), os materiais dele mostram parte da textura como ela é, qualquer que seja a luz da cena (`PAINTED`: mais na
pele): a luz está pintada, a da cena só tinge. É ajuste dos materiais dele, não do visual do jogo.

## O rádio da estação, o caderno e as ações do Jonas neles

```
"$BLENDER" --background --factory-startup --python tools/models/radio.py   -- --out assets/props    # radio.glb
"$BLENDER" --background --factory-startup --python tools/models/caderno.py -- --out assets/props    # caderno.glb
```

- `radio_layout.py`: onde fica cada parte do rádio (uma tabela só, lida por quem modela e por quem anima as mãos). O painel é inclinado
  15°; um lugar nele é `(u, v, n)` (para a direita, para cima no painel, para fora).
- `radio.py`: o rádio de frota de mesa (0,48 × 0,205 × 0,24 m, cerca de 3.400 triângulos, 310 kB). A forma tem poucos polígonos; o detalhe
  (serrilha do seletor, fendas, parafusos, a escala, as letras das teclas, o desgaste) é pintado texel a texel com numpy num atlas de
  1024 px, e um mapa de altura pintado ao lado vira o mapa de normal (512 px). Cada parte que o jogo mexe é um nó com a origem no pivô e
  os eixos do painel: no arquivo exportado, x é `u`, y é `v`, z é `n` (um botão afunda no próprio −z, o seletor gira no próprio z). Cada
  luz tem um filho `<nome>_on`, a mesma lente acesa, que o jogo mostra. O visor é um quadrilátero com UV de 0 a 1 e material próprio. O
  cabo espiral é uma hélice ao longo do próprio y; o jogo a dobra entre a tomada e o microfone (`src/models/props/radio.js`).
- `caderno.py`: o caderno de bolso, feito para assentar no encaixe da palma esquerda como está. Nós `cover`, `cover_l`, `page_0..2`;
  clipes `open` e `page_turn_0..2`.
- `jonas_radio.py` (chamado pelo `jonas.py`): acerta os ossos dos braços com a pele (`fit_arms`: o alargamento do tronco levava a pele
  dos braços 8,5% para fora e os ossos não, e um dedo que dobrava vincava no lugar errado), põe os dois encaixes das palmas (`grip_l`,
  `grip_r`) e escreve os clipes: sentado ao rádio (`radio_pegar_mic`, `radio_esperar`, `radio_falar`, `radio_pendurar`), os gestos do
  braço esquerdo (`radio_seletor`, `radio_seletor_menos`, `radio_tecla_a..d`, `radio_cor_a..c`) e, do peito para cima,
  `caderno_pegar`, `caderno_folhear`, `bolso_abrir`. As mãos chegam por conta: a pose do esqueleto é calculada osso a osso, cada braço
  vai ao alvo por uma solução de dois ossos, e o ponto da mão que tem de chegar (a ponta do indicador, o encaixe da palma) é levado ao
  alvo exatamente. O log diz quanto faltou a cada mão (tem de dar 0) e quanto o dedo erra uma tecla quando o jogo mistura os clipes
  dos cantos (3 mm no pior caso).
- `radio-preview.html` e `radio-preview.js`: o rádio numa bancada e o Jonas sentado diante dele, com o render do jogo
  (`window.stage`): é de onde saem as provas.

### Pulso, manga e boca (sétima passada)

- **Pulso** (`jonas_radio.py`): cada pose-chave de mão é trazida para a linha do antebraço em torno do ponto pelo qual ela segura (o
  encaixe da palma, a ponta do indicador), até o pulso dobrar no máximo 27°; o log escreve, por clipe, o quanto cada pulso dobra. A
  torção da mão é repartida: 15% no cotovelo, 60% num osso novo ao longo da metade de baixo do antebraço (`lowerarm_twist_l/_r`, que
  recebe a pele aos poucos do cotovelo ao punho; os clipes das bibliotecas não o mexem) e o resto no pulso. Os dedos que seguram fecham
  lado a lado em vez de em leque.
- **Manga** (`jonas.py`, `paint.py`): a manga afina no antebraço e acaba, abaixo do cotovelo, num tubo limpo e rígido no osso do
  antebraço. As voltas da manga enrolada são pintura (três voltas, a da ponta com o forro mais claro, sombra entre elas), com o relevo
  num mapa de altura pintado à parte que entra no mapa de normal da jaqueta; de geometria só um anel de 4 mm na borda (peça `props`). A
  pintura do antebraço vai até debaixo da manga.
- **Boca** (`jonas_mouth.py`, `jonas_face.py`, `paint.py`): a borda dos lábios continua para dentro da boca por dois anéis de pele (o
  vermelhão e o molhado de dentro), que seguem a borda em todos os morph targets; os lábios têm cor própria na pintura; dentes um a um
  (os de cima mais compridos e à frente), gengiva, língua com ponta e sulco, cavidade que escurece para o fundo. Morph targets novos:
  `lips_close`, `lips_funnel`, `upper_lip_up`, `lower_lip_down`, `lips_press`, `mouth_left`, `mouth_right`.

### Roupas justas, cabeça e contorno (nona passada)

- **Roupas** (`jonas.py`): jaqueta, camiseta, calça e botas continuam cópias do corpo empurradas pela normal, mas agora justas (a
  jaqueta a cerca de 2 a 3 cm da pele em vez de 5 a 7; camiseta a 0,7 cm; calça a 1,1 a 2,4 cm; botas a 1,4 cm) e passadas a ferro
  depois do empurrão (`relax`: alisa o tecido sem mexer nas bordas abertas). Menos triângulos em cada peça.
- **Cabeça**: `HEAD_K = (1.03, 0.97, 0.90)` (era 1.17, 1.10, 1.02): cerca de 7,1 cabeças de altura (era 6,4), com tudo o que vai
  junto (cabelo, faixa, lanterna, olhos, boca).
- **Contorno**: é feito no jogo (`src/models/jonas.js`, uma casca invertida, ver o topo do arquivo). O glb só leva, na pele, na
  jaqueta e nas peças soltas, o atributo `_outline` (quanto do contorno cada vértice recebe: nada dentro da boca, em volta dos olhos,
  na gola e na borda da frente aberta da jaqueta).
- **Mãos e antebraços** (`paint.py`, `arm_skin`): pintados por script, não mais tirados de uma imagem: o tom do rosto em gradientes
  largos, a luz pintada (dorso e nós mais claros, palma e lados dos dedos mais escuros), unhas limpas, duas veias macias, sujeira
  leve nas pontas, poucos pelos finos no antebraço.
- **Orelha e têmpora** (`paint.py`, `head_c`): a imagem de perfil do conceito tem o cabelo grisalho da têmpora onde o modelo tem
  pele; projetado, pintava uma faixa clara na têmpora e o alto da orelha. Agora o que a imagem dá de grisalho ali volta a ser pele,
  a orelha é pintada como pele (a concha em sombra quente, a borda na luz) e a costeleta é pintada à parte, de borda macia. O
  grisalho das mechas e do couro cabeludo ficou mais escuro (as duas mechas atrás da orelha saíam brancas).
