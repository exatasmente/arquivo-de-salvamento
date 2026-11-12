# Arquivo de Salvamento

**Arquivo de Salvamento** é um canal de ficção em primeira pessoa, com o visual 3D dos
consoles do fim dos anos 90: polígonos poucos, texturas pequenas, imagem tremida. Cada vídeo
do canal é filmado de dentro de um jogo que o próprio canal fez, e esse jogo fica aqui, aberto
para jogar. O que aparece no vídeo existe no jogo. Nem tudo que existe no jogo aparece no
vídeo.

| Pasta | Jogo | Jogar |
|---|---|---|
| `rinha/` | **Rinha**: as criaturas que a gente capturava para lutar agora capturam a gente | [exatasmente.github.io/arquivo-de-salvamento/rinha/](https://exatasmente.github.io/arquivo-de-salvamento/rinha/) |

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

## Licença

Código sob a licença MIT (arquivo `LICENSE`). O Three.js, em `rinha/vendor/three/`, tem a
própria licença MIT no arquivo `LICENSE` da mesma pasta.
