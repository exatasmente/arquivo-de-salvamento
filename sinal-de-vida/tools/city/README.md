# A cidade da rua (`tools/city/`)

A rua do jogo (a avenida em cima da estação, `data/scenes/rua.json`) deixou de ser caixas: prédios, casas, galpões, carros, postes, viaduto e entulho têm forma.

## Como é feita

| O quê | Onde | Como |
|---|---|---|
| Carros (sedã, van, furgão), poste (haste e braço), escada de incêndio, caixa d'água de telhado, ar-condicionado, ventilação, antena, parabólica, lixeira, banco, balizador | `assets/city/*.glb` | `tools/city/build_pieces.py` no Blender (`<blender> -b --factory-startup -P tools/city/build_pieces.py`; `CITY_OUT=<pasta>` grava em outro lugar). As formas são feitas por lofts e primitivas; cada peça ganha **um atlas pintado à mão por script** (`tools/city/painted.py`, com a pintura de `tools/props/paint.py`: borda gasta, tinta lascada, sujeira escorrida, linha escura nos encontros, luz de cima). Os materiais do glTF continuam sendo **nomes** (`body`, `glass`, `rubber` ...): `src/models/city/pieces.js` tinge `body` com a cor do carro, acende os faróis pelo nome e põe o **contorno** (`src/models/outline.js`) nas peças vistas de perto (carros, poste, lixeira, banco, balizador). |
| Prédios (térreo de loja, andares com janela recuada, cornijas, empenas), casas e galpões | `src/models/city/building.js` | Peças paramétricas montadas por código a partir da semente do prédio: pilares, faixas, peitoris, molduras, toldos, escadas de incêndio, telhados. Duas versões: `near` (tudo) e `far` (caixa com a fachada pintada). |
| Janelas e vitrines em que não se entra | `src/models/city/windows.js` | O shader `interior` da engine (cômodos com parallax, sem atlas: o shader pinta os cômodos). Um material por tipo (`dim`, `act`, `shop`, `hall`), compartilhado pela rua; a hora entra por `setWindowNight`. |
| Texturas pintadas novas (toldo, telha, chapa, tapume, empena com pichação apagada, reboco, persiana) | `src/models/city/paints.js` | Pintadas por script, com semente. Nenhum texto. Nenhuma imagem de IA foi gerada (custo 0). |
| Rua: meio-fio de pedras, grelhas de bueiro, tampas, remendos, árvores secas, bancos, lixeiras, viaduto, pilares, entulho, lixo, poço de ventilação | `src/models/city/street.js` | Substituem os construtores de caixa pelos mesmos tipos de entidade (`override` em `scenes/common.js`). |
| Nível de detalhe | `src/models/city/index.js` (`createCityLod`) | No jogo, cada prédio deixa as peças em `m.city`; a cena junta tudo por lado da avenida, trecho de 24 m e material, nas duas versões, e o olho escolhe (perto: `near`; longe: `far`). Os andares de cima das lojas e o interior delas seguem a mesma ideia. |

Prédios e casas **não** usam as peças da Quaternius: o kit delas é de outro estilo (low poly com textura própria) e a conversão para o pintado custaria mais que montar as peças aqui. Elas continuam baixadas em `assets-externos/`, sem uso (ver `CREDITOS.md`).

## Ferramentas

- `preview.html?cam=primeira2&day=0` desenha a rua (câmeras: `primeira`, `primeira2`, `terceira`, `rua`, `alto`, `norte`, `sul`, ou `ex,ey,ez/ax,ay,az`; `focus=<id>&off=x,y,z` olha uma entidade).
- `?velho` na URL (do jogo ou do preview) monta a rua com as caixas antigas, só para comparar nas capturas.
- `?fps` na URL do jogo mostra os quadros por segundo e os triângulos desenhados (em `scenes/rua.js`).

## Segunda passada (o que era montado no código)

- A **caçamba**, o que tem dentro dela, a **marquise** e o **tapume** da entrada da estação são props pintados de `tools/props/` (`cacamba`,
  `cacamba_entulho`, `marquise_modulo`, `marquise_coluna`, `tapume_painel`, `tapume_poste`), postos por `src/models/objects.js` e
  `src/models/city/street.js`; sem o arquivo, a caixa antiga continua valendo. Tamanho e colisor da caçamba são os de antes.
- As **fachadas** continuam montadas em `building.js`, agora com contorno (`outline: true` do kit) no térreo (rodapé, pilares entre as vitrines,
  soleiras, cornija da loja, barras do toldo) e nos pilares e peitoris dos três primeiros andares: a casca de um pilar desenha a linha da janela
  ao lado. Hidrante, cone, placa, semáforo, barreira e ponto de embarque também levam contorno.

## Terceira passada (a cidade no desenho do Jonas e da estação)

O pedido: a rua não tinha a geometria nem a textura do resto, e a régua de triângulos saiu; vale o tempo de quadro (ver "Desempenho" no README do jogo).

| O quê | Onde | Como |
|---|---|---|
| O pincel | `src/models/city/paintkit.js` | O vocabulário das pinturas, em canvas e por semente: massas de valor, escorrido, tinta caída com a espessura desenhada (sombra em cima, lábio claro embaixo), rachadura, linha marrom nos encontros, borda gasta, sombra projetada, cartaz rasgado e marca de spray **só com forma** (onda longa, esfregado, borrão, nuvem com hachura: nada que se leia como letra ou número), e o último passe de pincelada larga com os valores reforçados. |
| As formas | `src/models/city/geo.js` | `Shape`: caixa com as quinas chanfradas, perfil puxado ao longo de um comprimento (cornija, meio-fio), tubo, fio pendurado, tudo escrito numa malha só, com as caixas do contorno à parte. |
| Prédios (blocos e torres) | `src/models/city/block.js` e `facade.js` | **Uma malha e uma pintura por prédio.** A frente tem profundidade: janela recuada com as faces do vão, esquadria com espessura, peitoril e verga (ou moldura inteira, ou sobrancelha de concreto), pilastras, frisos, cornija moldurada, platibanda; varanda sobre mísulas com gradil de barras; ar-condicionado em mão-francesa, cano de descida com o desvio sobre a cornija da loja, caixa de luz com eletroduto; no térreo, rodapé de pedra, porta recuada com degrau, vitrine com esquadria, porta de aço de enrolar com as lâminas modeladas, guias e caixa do rolo, tapume, toldo com espessura, abas e franja recortada, placa só com pictograma. A pintura é a **elevação** do prédio (`facade.js` recebe a lista do que está onde): escorrido sob cada peitoril e cornija, ferrugem sob a máquina, reboco caído até o tijolo, rachadura no canto da janela, sujeira do térreo, spray e cartaz sem letra. Ao lado da elevação, no mesmo canvas, as amostras do que não está no plano da parede (toldo, ferro, telhado, pano) e a **empena** (a parede cega dos lados, com o fantasma de um mural). A versão de longe é a caixa com a mesma pintura (as aberturas estão pintadas nela): perto e longe são o mesmo material. |
| Chão | `src/models/city/ground.js` | Duas pinturas para a rua inteira. **Asfalto** (4096×448, os 120 m da avenida): trilhas das rodas, remendos com junta de piche, vala cortada, rachaduras, faixas e travessias gastas, poças, óleo onde os carros param, tampas de inspeção. **Calçadas** (4096×512, uma fileira por lado, deitada sobre a seção): sarjeta, face e chanfro do meio-fio de pedra, três fileiras de placas com junta, placa rachada, quebrada ou trocada por remendo, mato na junta, boca de lobo com grelha, piso tátil nas travessias, canteiro das árvores. Algumas placas estão levantadas (geometria). |
| Mobiliário | `src/models/city/furniture.js` | Um atlas (`rua:mob`, 512 px) para tudo: semáforo (poste cônico em flange, braço, caixa chanfrada com três lentes e pestanas), placa, hidrante, cone, barreira, painéis solares em estrutura (mesmo lugar e inclinação), árvore seca com canteiro, tufos de mato, sacos de lixo e papéis, armário de serviço, **fiação** de poste a poste com cruzeta e isoladores e a descida para as paredes. Os **muros** dos terrenos e dos becos têm pintura própria (`rua:muro`). |
| Viaduto e pilares | `src/models/city/viaduct.js` | Um atlas (`rua:viaduto`): a borda e o guarda-corpo em elevação (concreto de fôrma de tábua, junta que vaza, ferrugem sob a ancoragem, concreto estourado com o ferro à mostra), o fundo do tabuleiro, o pilar desenrolado, a base com a faixa de perigo gasta. |

As posições, os colisores e os nomes da cena não mudaram: `planDetails` (em `street.js`) percorre os mesmos números aleatórios do antigo `terrainDetails`, então árvores, bancos e lixeiras ficaram onde estavam. O que é novo e tem colisor (três semáforos mortos e três placas no meio-fio) fica fora do trecho da saída.

Ferramentas novas: `tools/city/perf.mjs` (mede o tempo de quadro no jogo, na GPU) e `tools/city/shots.mjs` (as fotos da rua para a revisão; `GAME_ROOT=<outra cópia>` fotografa ou mede uma versão guardada).
