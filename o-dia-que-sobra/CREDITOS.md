# Créditos

## Fontes da interface

Os arquivos estão em `assets/fonts/`, cada um com a sua licença ao lado. Origem de todos: `github.com/google/fonts`. Licença: SIL Open Font License 1.1.
São carregadas por `@font-face` a partir do próprio repositório (nenhuma vem de uma rede). Cada papel é uma variável de `style.css`
(`--f-marca`, `--f-texto`, `--f-mono`) com fontes do sistema como reserva.

- **Baloo 2** (`Baloo2.ttf`, variável, pesos 400 a 800), papel `--f-marca`: o logotipo, os títulos e as linhas dos menus.
  Copyright 2019 The Baloo 2 Project Authors (https://github.com/EkType/Baloo2). Licença em `OFL-Baloo2.txt`.
- **Nunito** (`Nunito.ttf` e `Nunito-Italic.ttf`, variáveis, pesos 200 a 1000), papel `--f-texto`: o texto corrido, as dicas e as falas.
  Copyright 2014 The Nunito Project Authors (https://github.com/googlefonts/nunito). Licença em `OFL-Nunito.txt`.
- **VT323** (`VT323-Regular.ttf`), papel `--f-mono`: a fita da caixa, o relógio, o monitor e toda a interface do modo 1998.
  Copyright 2011, The VT323 Project Authors (peter.hull@oikoi.com). Licença em `OFL-VT323.txt`.

## O resto da interface

O logotipo, o Sol, os ícones de pixel do cartão de memória, as teclas e os botões da legenda, a placa do carregamento, o cartão de ponto, a fita e o
painel de disjuntores são desenhados em código (SVG e CSS), sem imagem de fora.
