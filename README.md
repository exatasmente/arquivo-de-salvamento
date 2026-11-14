# Arquivo de Salvamento

**Arquivo de Salvamento** é um canal de ficção em primeira pessoa, com o visual 3D dos
consoles do fim dos anos 90: polígonos poucos, texturas pequenas, imagem tremida. Cada vídeo
do canal é filmado de dentro de um jogo que o próprio canal fez, e esse jogo fica aqui, aberto
para jogar. O que aparece no vídeo existe no jogo. Nem tudo que existe no jogo aparece no
vídeo.

| Pasta | Jogo | Jogar |
|---|---|---|
| `rinha/` | **Rinha**: as criaturas que a gente capturava para lutar agora capturam a gente | [exatasmente.github.io/arquivo-de-salvamento/rinha/](https://exatasmente.github.io/arquivo-de-salvamento/rinha/) |
| `o-dia-que-sobra/` | **O Dia que Sobra**: quatro semanas de turno da madrugada num posto de gasolina, e algo no posto que não quer que a folga chegue | [exatasmente.github.io/arquivo-de-salvamento/o-dia-que-sobra/](https://exatasmente.github.io/arquivo-de-salvamento/o-dia-que-sobra/) |

## O menu e o app

A página de entrada é o menu do arquivo, como a tela inicial de um console: os jogos lado a lado, o
que cada um tem salvo neste navegador, os vídeos de cada jogo e as redes do canal. Escolha com as
setas e `Enter`, com o controle (`A` joga, `B` volta, `Y` abre os vídeos) ou deslizando e tocando.
Dentro de um jogo, a pausa tem a volta para ele.

O site se instala como app (no celular, "Adicionar à tela inicial"; no computador, "Instalar app"
no navegador). Depois da primeira visita, o menu e os jogos abrem sem internet. Só o vídeo de
abertura do Rinha precisa de rede; sem ela, o jogo conta a mesma história com as cenas do jogo.

## O Dia que Sobra

Você é o frentista da madrugada do Posto Bom Dia, na saída de uma cidade pequena. Faltam quatro
semanas para acabar a escala seis por um. Abasteça, atenda, reponha, feche o caixa às seis. E
não olhe muito tempo para a placa.

O jogo roda no navegador, no computador ou no celular, sem instalar nada. Teclado e mouse
(`W` `A` `S` `D`, mouse para olhar, `E` para usar e segurar `E` para manipular, `F` lanterna,
`Q` prancheta, `Esc` pausa), controle ou toque. O progresso fica salvo no cartão de memória do
próprio navegador. Completo: quatro semanas de turno com as folgas entre elas, cinco finais e
segredos para quem presta atenção.

## Rinha

Você saiu de casa com fome, atrás de maçãs, e acordou numa cela. Quem manda agora são as
criaturas, e o que elas querem de você é que lute. Sete lutas até o Campeão da Rinha, e um
cartão de memória para salvar o caminho.

O jogo roda no navegador, no computador ou no celular, sem instalar nada. O progresso fica
salvo no próprio navegador.

### Como jogar

**Teclado e mouse**

| Ação | Tecla |
|---|---|
| Andar | `W` `A` `S` `D` |
| Olhar (fora da luta) | mouse ou setas |
| Interagir | `E` |
| Jab / direto | `J` / `K` |
| Gancho esquerdo / direito | `U` / `I` |
| Uppercut | `L` |
| Guarda | `Shift` (segurar) |
| Esquiva | `Espaço` com uma direção |
| Abaixar | `C` |
| Usar item / trocar item | `Q` / `Tab` |
| Confirmar nos menus | `Enter` ou `Espaço` |
| Pausar / pular cena | `Esc` (toque pausa, segurar 1 s pula) |

**Controle** (posições do layout padrão)

| Ação | Botão |
|---|---|
| Andar | analógico esquerdo |
| Olhar (fora da luta) | analógico direito |
| Interagir / confirmar | botão de baixo |
| Jab / direto | botão da esquerda / botão de cima |
| Gancho esquerdo / direito | gatilho esquerdo / gatilho direito |
| Uppercut (na luta) | botão de baixo |
| Esquiva para trás / voltar | botão da direita |
| Esquiva para o lado, passo à frente, abaixar | analógico direito (na luta) |
| Guarda | ombro esquerdo (segurar) |
| Usar item / trocar item | ombro direito / direcional para os lados |
| Pausar / pular cena | Start (toque pausa, segurar 1 s pula) |

**Toque**

Um analógico na tela anda, arrastar o resto da tela olha em volta e um toque curto num
objeto interage. Na luta, os botões da tela dão os golpes, a guarda, a esquiva, o abaixar e o
item (deslize o botão de item para o lado para trocar). O botão de pausa no canto pausa com um
toque e pula a cena se você segurar.

### Para quem assistiu ao vídeo

Preste atenção. No vídeo, nas legendas e nas postagens do canal.

## Rodar localmente

Site estático, sem etapa de build: o GitHub Pages serve a raiz do repositório. Os módulos ES
não abrem por `file://`, então sirva a pasta com qualquer servidor estático, por exemplo:

```bash
python3 -m http.server 8000
```

e abra `http://localhost:8000/rinha/`.

O que o app guarda para jogar sem internet é a lista em `sw.js`, feita a partir do que está no git.
Depois de mudar um jogo, rode `node tools/precache.mjs` (depois do `git add`) e commite o `sw.js`
junto. `node tools/precache.mjs --check` só diz se a lista está velha.

## Licença

Código sob a licença MIT (arquivo `LICENSE`). O Three.js, em `rinha/vendor/three/`, tem a
própria licença MIT no arquivo `LICENSE` da mesma pasta.
