# Imagens geradas por IA para a textura do Jonas

As imagens abaixo vêm do DeepInfra (endpoint `images/edits`, modelo `black-forest-labs/FLUX.1-Kontext-dev`), cada uma partindo de uma
imagem da arte de conceito do Jonas (`jonas-frente.png`, `jonas-lado.png`, e as vistas novas, que viram referência das seguintes).
Ficam fora do repositório, em `conceito-jonas/` e `conceito-jonas/partes/` da pasta de assets externos; `jonas.py` só as lê.
Gerar de novo: `python3 tools/textures/gen_views.py <pasta> <nome> <referência.png> "<prompt>"` (a chave lê-se de
`~/.config/deepinfra/key` dentro do script e nunca é impressa). Nenhum prompt tem texto, logotipo, nome de personagem ou de jogo.

Sufixo comum dos prompts das partes (`STY`): "Painted in exactly the same hand-painted style, ink line work and colours as the
reference. Plain flat white background, nothing else in the picture, painted light from above and from the left, no text, no logo."

## Vistas do corpo inteiro (referência de silhueta e de cor)

| Arquivo | Referência | Prompt |
|---|---|---|
| `costas-a-0.png` | `jonas-frente.png` | Same man, same olive work jacket, grey t-shirt, tool belt and head lamp band, same painting style, line work and colours. Show him from directly behind, full body from head to boots, standing in a neutral pose with arms relaxed at his sides, camera at chest height, plain dark background. |
| `frente-inteira-0.png` | `jonas-frente.png` | Same man, same clothes, same painting style, line work and colours. Same front view but zoomed out so the whole body is visible from the head lamp to the boots, standing in a neutral pose with arms relaxed at his sides, plain dark background. |
| `lado-inteiro-0.png` | `jonas-lado.png` | Same man, same clothes, same painting style, line work and colours. Same side profile view facing left but zoomed out so the whole body is visible from the head to the boots, arms relaxed at his sides, no light beam, plain dark background. |

## Partes (uma peça por imagem, sozinha, sem nada na frente) em `partes/`

| Arquivo | Referência | Pedido (antes do sufixo comum) |
|---|---|---|
| `jaqueta-frente-0.png` | `jonas-frente.png` | Extract only the olive work jacket from this image and show it by itself, with no person inside it, as a ghost-mannequin garment seen from the front, symmetrical, jacket open at the front, both sleeves hanging straight down at the sides with the cuffs rolled up, pockets with flaps and buttons, seams, folds and wear drawn with ink lines. |
| `jaqueta-costas-0.png` | `costas-a-0.png` | ... seen from the back, symmetrical, both sleeves hanging straight down at the sides with the cuffs rolled up, back yoke seam, seams, folds and wear drawn with ink lines. |
| `camiseta-frente-0.png` | `jonas-frente.png` | Extract only the faded grey t-shirt ... ghost-mannequin garment seen from the front, symmetrical, short sleeves hanging down, crew neck, rust stains and folds drawn with ink lines. |
| `camiseta-costas-0.png` | `costas-a-0.png` | Show only a faded grey t-shirt ... seen from the back ... same grey as the t-shirt of the man in the reference. |
| `calca-frente-0.png` | `frente-inteira-0.png` | Extract only the dark grey work trousers ... ghost-mannequin garment seen from the front, both legs straight and parallel, hems at the bottom, creases, seams and wear drawn with ink lines. |
| `calca-costas-0.png` | `costas-a-0.png` | ... seen from the back ... |
| `cinto-frente-0.png` | `frente-inteira-0.png` | Extract only the leather tool belt ... laid out as a flat ring seen from the front, with its brown strap, the metal buckle in the middle, the two tan leather pouches at the sides with the wrenches, pliers and screwdrivers sticking out, stitching drawn with ink lines. |
| `botas-lado-0.png` | `lado-inteiro-0.png` | Extract only the brown leather work boots ... a pair side by side, seen from the side facing left, scuffed leather, laces, thick dark soles, stitching and wear drawn with ink lines. |
| `botas-frente-0.png` | `frente-inteira-0.png` | ... a pair side by side, seen from the front, laced up ... |
| `maos-costas-0.png` | `jonas-frente.png` | Show only the two hands of the man in this image, by themselves, seen from the back of the hands, fingers relaxed and pointing down, left hand and right hand side by side, same skin tone, hair on the hands and the same ink line work as his face. |
| `maos-palma-0.png` | `jonas-frente.png` | ... seen from the palms ... creases of the palm drawn with the same ink line work as his face. |

## Rosto, bolso e botas (4ª passada)

| Arquivo | Referência | Pedido |
|---|---|---|
| `rosto-frente-0.png` | `ref-rosto.png` (recorte da cabeça de `jonas-frente.png`, ampliado para 1024 px) | Close-up portrait of the same man's head and neck, seen exactly from the front, perfectly symmetrical, neutral tired expression, mouth closed, eyes open looking straight at the viewer. Remove the head lamp and the headband: his whole forehead and his hairline of short messy dark hair are visible, grey hair at the temples. Bare neck and bare shoulders, no clothes. Even soft light from the front and slightly from above, no hard cast shadows. Same hand-painted style, ink line work, wrinkles, stubble and medium skin tone as the reference. Plain flat grey background, no text, no logo. |
| `rosto-lado-0.png` | `ref-rosto.png` | Head and neck of the same man seen exactly in side profile facing left, close-up. Remove the head lamp and the headband: his forehead, his ear, his short messy dark hair with grey at the temple and the nape are visible. Neutral tired expression, mouth closed. Bare neck and bare shoulder, no clothes. Even soft light, no hard cast shadows. Same hand-painted style (...). Plain flat grey background, no text, no logo. |
| `partes/bolso-frente-0.png` | `partes/cinto-frente-0.png` | Extract only one tan leather tool pouch from this image and show it by itself, empty, with no tools in it, seen flat from the front: a large pouch with a smaller pocket sewn on its front, a leather loop at the top for the belt, rivets, visible stitching drawn with ink lines, matte yellowish tan leather, worn. + `STY` |
| `partes/bota-lado-0.png` | `partes/botas-lado-0.png` | Show only one brown leather work boot from this picture, by itself, seen exactly from the side in flat profile, the toe pointing to the left, laced up, scuffed leather, thick dark sole, stitching and wear drawn with ink lines. + `STY` (com "no shadow on the ground") |
| `partes/bota-frente-0.png` | `partes/botas-frente-0.png` | Show only one brown leather work boot from this picture, by itself, standing upright and seen exactly from the front, the toe cap toward the viewer, symmetrical, laced up to the top (...). + `STY` |

O rosto de perto, sem lanterna e de frente, dá a `paint.py` uma imagem de 1024 px para a cabeça (antes eram os ~130 px do rosto na vista de
corpo inteiro) e o pescoço nu para a pele abaixo do queixo. Uma bota só, em perfil e de frente, substitui o par em perspectiva, que não
servia para ajustar por contorno. `cinto-frente-0.png`, `botas-*-0.png` e as vistas de corpo inteiro ficam como referência e não entram
mais na textura.

## Repintura por vistas do próprio modelo (3ª passada, abandonada na 4ª)

Na 3ª passada o modelo já texturizado era renderizado de 8 câmeras, cada vista repintada pelo Kontext e projetada de volta. As vistas
repintadas ficam bonitas sozinhas, mas o modelo de imagem muda a silhueta (encurta a bota, mexe o bolso), e as 8 projeções misturadas
borravam a jaqueta e deixavam emendas. A 4ª passada tirou esse passo: cada peça vem da sua imagem, ajustada por marcos ou por contorno,
e a unidade vem da correção de cor para o conceito e da luz pintada por script. O pedido usado era:

> Repaint this 3D character render as a hand-painted illustration in the same style, ink line work and colours as a graphic adventure game concept
> art. (...) Keep exactly the same silhouette, camera, pose, proportions, seams and position of every piece, change only the painting.

Total da 3ª passada: 31 imagens (3 vistas + 11 partes + 1 teste + 16 de repintura), estimativa de US$ 0,3 a US$ 0,9.
Total da 4ª passada: 5 imagens (rosto de frente, rosto de perfil, bolso, bota de lado, bota de frente), estimativa de US$ 0,05 a US$ 0,15,
abaixo do teto de US$ 2,00.
