# Créditos

O corpo, o esqueleto e as animações do Jonas vêm de pacotes livres. Nada deles foi executado: só foram lidos e convertidos
por `tools/models/jonas.py`.

- **Universal Base Characters** (corpo masculino e esqueleto de 65 ossos), **Universal Animation Library** e **Universal
  Animation Library 2** (os clipes de andar, correr, agachar, interagir, arremessar, subir, cair e levantar): Quaternius,
  CC0 (domínio público; o crédito não é exigido, é dado por cortesia). https://quaternius.com
- A textura do Jonas: cada peça (rosto de frente e de perfil, mãos, jaqueta, camiseta, calça, botas, bolso de couro) vem de uma imagem gerada por IA a partir da arte de conceito do próprio projeto (abaixo), levada às cores do conceito; o cabelo, a correia do cinto, as ferramentas, o colarinho, a boca por dentro e a lanterna são pintados por script.
- **Captura de movimento da CMU (conversão da RancidMilk):** os clipes `mancar` (CMU 77_19, "limping, hurt right leg") e
  `esconder` (CMU 69_70, "walk up to object, squat...") do Jonas são retargets de dois clipes da captura, feitos por
  `tools/models/retarget.py`. Crédito exigido pela CMU: "The data used in this project was obtained from mocap.cs.cmu.edu.
  The database was created with funding from NSF EIA-0196217." Uso livre e redistribuição permitidos, sem vender os clipes soltos.
- **Cabelo do Jonas:** mechas modeladas por script (`tools/models/jonas.py`), sem asset de fora.
- **Imagens por IA da textura do Jonas:** o rosto (frente e perfil) e as partes (jaqueta, camiseta, calça, bolso, botas, mãos) geradas no DeepInfra
  (FLUX.1 Kontext) a partir da arte de conceito do próprio projeto; prompts em `tools/textures/prompts.md`.
- **Props da galeria:** todos (bomba, filtro, baterias, bancada, mesas, colchões, divisórias, andaime, pilares, betoneira, trilho, fogareiro,
  gerador, quadro de força, galão, carrinho, pneu, cama improvisada, caixa de ferramentas ...) são modelados e pintados por script
  (`tools/props/`), e o rádio da bancada também (`tools/models/radio.py`): sem asset de fora. Versões anteriores usavam a forma de modelos CC0 do
  Poly Haven (https://polyhaven.com) em nove deles; isso saiu.
- **O cão-robô:** modelado, animado e pintado por script (`tools/models/dog.py`): sem asset de fora.

- **Vozes da noite 1** (`assets/audio/n1/`): síntese de voz (ElevenLabs), a partir do roteiro do próprio projeto (`data/story/falas-noite1.json`).
- **Vozes da cena de teste do rádio** (`assets/audio/cena-radio.mp3`): as duas vozes são de síntese de voz (ElevenLabs), a partir de um texto do próprio projeto; o filtro de rádio e o chiado foram feitos na mistura.

## A cidade (a rua)

- Os carros, o poste, a escada de incêndio, a caixa d'água de telhado, o ar-condicionado, a ventilação, a antena, a parabólica, a lixeira, o banco e o
  balizador foram modelados por script no Blender (`tools/city/build_pieces.py`): sem asset de fora. Os prédios, as casas, os galpões, o viaduto, as árvores
  secas, o tapume e o entulho são montados por código (`src/models/city/`), e as texturas, pintadas por script. Nenhuma imagem de IA.
- **Quaternius, "Downtown City"** (CC0, https://quaternius.com) e **Poly Haven** (CC0, https://polyhaven.com) foram baixados e estudados como referência de
  proporção das peças modulares de cidade (janelas recuadas, cornijas, mobiliário urbano); **nenhuma peça deles está no jogo**. O crédito não é exigido, é dado por cortesia.
