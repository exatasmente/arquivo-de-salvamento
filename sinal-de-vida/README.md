# Sinal de Vida

Um jogo do canal, feito sobre a engine comum dos jogos (`vendor/engine/`, uma cópia fixa: não se edita aqui). Uma aventura narrativa em capítulos, com um só personagem, o Jonas: o mundo chega pelo rádio e **falar no rádio é ser ouvido**. Esta é a **versão 2, fase B: a noite 1 ("Chiado") jogável do começo ao fim**, sobre o núcleo narrativo da fase A (o sistema de cenas, o rádio da estação na bancada, as conversas, a Escuta e a confiança, a reação rápida, as opções, os comandos nos três meios e o cartão de memória). As noites 2 e 3 ainda são marcadores ("continua"); a demonstração (`?demo=1`) segue como estava.

**A noite 1, cena por cena** (Nova partida → o cartão no fim da noite, uns 20 a 25 min):

1. **A cidade pela grade**: uma cutscene da cidade vista de dentro do poço, de baixo para cima, pela grade fixa na calçada (os cães da frota passam por cima dela; a mesma grade aparece de cima na rua, de onde o Jonas sai), com a dica "segure Esc por 1 s para pular" (ou Start; o botão Pular no toque).
2. **A bomba**: Dona Neide, no rádio de mão, guia o conserto e o jogo ensina pela tela, em frases curtas com a tecla do meio que se usa (teclado, controle ou toque): olhar, andar, encostar no cano (examinar/usar), acender a lanterna, girar a tampa **segurando**, pegar o pano e a lata (pegar), abrir o bolso, montar o filtro e encaixar. Errar não trava (Neide diz "Não é aí, menino. Embaixo da bomba."). Na primeira vez que se abre o menu de pausa, uma dica diz o que são o menu e as Opções.
3. **A chamada das 22h** no rádio da estação (canal 21): Neide e Tânia, duas perguntas, a **decisão 1** (sair agora, ou esperar o cão passar: a Escuta sobe 18 e ele segue o cabo até a grade), "Escutamos. Respondemos." no fim (e também quando a chamada cai por dois calares: é a rede se despedindo de todos). Depois, Jonas pega a isca na bancada e sobe pelo poço.
4. **A saída 1 (a avenida)**, na rua que já existe (`data/scenes/rua.json`, semente 7): a calçada com marquise, carros e a caçamba. Um cão de frota patrulha a pista (mais perto se a decisão foi "sair agora"; ele ouve os passos, sente o calor de perto, e quem o ouve ou é alcançado volta ao começo da cena); o **cão quebrado** junto à caçamba pisca oito cores por 6 s, três vezes, e a bateria acaba; a **isca** (botão direito segura e mira, esquerdo lança; no controle LT e RT; no toque, o botão Item); esconder-se na caçamba; o rádio de mão (R) liga a voz da Tânia, que avisa, mas **a voz dela é barulho**; **emendar o cabo segurando**, o que dispara a **cinemática do cão chegando** e a **sequência de reação** (abaixo); voltar pelo poço. **Esta cena, e só ela, é o protótipo de "câmera e ação variadas"**: a câmera é a de **terceira pessoa por cima do ombro direito** do Jonas (as outras cenas seguem com os planos fixos, para comparar).
5. **O rádio da estação**: o último recado de Lia, o canal 47 (da represa) anotado no caderno, a gravação da represa (o campo "SENHA DA REDE:" pisca no visor), a chamada ("Alguém escutando?"), a conversa de três turnos com a operadora (decisão 2: contar ou não; a marca da fala 05; calar).
6. **O corte no auge**: Escuta 50 ou mais com a chamada no ar (a fala 08 inteira no ramo "contar", só a segunda frase no outro, também quando se cala no último turno); 50 ou mais com a chamada encerrada (sem voz, passos de metal e a luz de um sensor pela grade); menos de 50 ("Escutamos. Respondemos." da operadora e a câmera sobe até a grade vazia, com um cão passando longe). Em todos, a tela do cartão salva a noite no bloco 2 e mostra o **bloco 13 quebrado**, e "Continua".

A colônia da versão 1 (base como simulação, pessoas, postos, expedições geradas por semente, mapa da operação, câmera isométrica, roda de ordens) saiu do código: o gerador de setor, a vista isométrica e o recorte de paredes e telhados não existem mais. **O que ficou da versão 1, e por quê:** a cidade montada de peças (`src/models/city/`, `src/scenes/rua.js`, `data/scenes/rua.json`), porque os percursos das saídas à rua (fase B) serão trechos fixos dessa mesma rua, sem semente por expedição; o cão, a isca e o barulho (`machines.js`, `stealth.js`, `gear.js`), que a noite 1 e as saídas usam; e a galeria (a estação), o cenário da maior parte do jogo. A rua ainda tem o gerador de layout com semente (`src/scenes/rua-layout.js`), mas só a rua da semente 7 (o arquivo de dados que o editor de cenas edita) é usada.

## Como abrir

- `index.html`: o título (Nova partida, Continuar, Cartão, Opções, Comandos). A nova partida entra na noite 1, na cutscene da cidade.
- **Sangue e violência gráfica** (Opções e pausa; **ligado** de saída, e perguntado uma vez no primeiro início, com um aviso de conteúdo; o cartão guarda a escolha). Só o ataque do cão mostra sangue (jato, poça no chão e manchas no Jonas, num vermelho escuro, sem clarão branco). Desligado, nada de sangue existe e o ataque corta para o preto um instante antes do impacto, com o som abafado; a morte, o fim de jogo e a volta ao ponto salvo são os mesmos. Todo elemento desse tipo passa por uma verificação só (`gore()` em `src/game.js`). O jogo é para adultos.
- **Para a revisão, pular a uma cena** (nada disso grava no cartão): `?cena=n1-cidade`, `n1-bomba`, `n1-chamada`, `n1-saida`, `n1-radio` ou `n1-corte`; `?noite=1` começa a noite do começo (como `?novo=1`). Com `?cena=` valem: `sair=agora|esperar` (a decisão 1; a de `n1-saida` é "agora" se não se disser), `escuta=N`, `contou=0|1` (a decisão 2), `acabou=1` (a chamada com a operadora acabou, de dois calares) e `mao=1` (o rádio de mão ligado), `emenda=cheia|curta` (força a versão da sequência da emenda, sem depender de onde o cão está). Exemplos: `?cena=n1-saida&sair=esperar&mao=1`; `?cena=n1-corte&escuta=70&contou=1` (a fala 08 inteira), `&contou=0` (só a segunda frase), `&acabou=1` (sem voz), `?cena=n1-corte&escuta=30` (a câmera sobe à grade vazia).
- `index.html?demo=1`: a **cena de demonstração**. Anda até a bancada, senta e abre o rádio da estação, tem uma conversa com dois turnos (com uma marca e a chance de calar), tem uma reação rápida e salva. Dá para jogá-la do começo ao fim com o teclado, com o controle e com o toque.
- `?semente=N` repete a partida (a semente fica no cartão e no menu de pausa), `?novo=1` começa a noite 1 direto, `?continuar=1` carrega o bloco 1.
- `?film` é o modo filmagem (as vistas das cutscenes, para o vídeo); `?editor` abre o cenário para o editor de cenas; `?cena=radio-teste` toca sozinha a cena de teste do rosto do Jonas (um clique começa; qualquer outro nome de cutscene, como `?cena=a-galeria`, toca essa).
- `?look=ps2` troca o visual (o padrão é o `pintado`).

## As vozes e os números que dependem delas

As falas da noite 1 são gravações (`assets/audio/n1/<id>.mp3`; o roteiro é `data/story/falas-noite1.json`: `text` é a legenda, `say` a versão falada, `tag` o jeito de dizer). **Nada do código nem das conversas fixa o tamanho de uma fala**: `assets/audio/n1/durations.json` (id → segundos) é gerado por `node tools/voice/durations.mjs` (ffprobe; saltam as que não abrem) e o jogo o lê ao abrir. Uma conversa só diz qual `voice` cada fala tem; `src/systems/voicedata.js` põe o `dur` de cada uma. Quando uma fala é regravada, roda-se o script e nada mais muda. Se uma gravação faltar, o jogo estima o tempo pelo texto e segue.

Os dois pontos em que o jogo corta uma gravação ficam **num lugar só**, `data/story/marcas.json`: a marca da fala 05 do Jonas (o fim da palavra "represa", abaixo dela soltar vale como calar) e o começo da segunda frase da fala 08 da operadora (`cutFrom`). Foram medidos com `ffmpeg -af silencedetect` e conferidos com a proporção do texto; para medir de novo, veja o comentário do arquivo. A gravação da represa (a mensagem que repete no canal 47) tem duas versões, a de Lia (`r-represa`) e a da operadora (`r-represa-alt`): a troca é a constante `REPRESA_VOICE` no começo de `src/game.js`.

Quem fala pelo rádio passa por um filtro de rádio (passa-banda, um pouco de distorção e chiado, em `src/audio/voices.js`); a gravação da represa passa por um mais pesado, de fita; as falas do Jonas tocam enquanto ele segura o botão de falar (soltar corta o som) e sem filtro. Tudo sai por um nó de destino próprio, e o volume das Opções vale para as vozes também.

**Segredos.** Nenhuma resposta está em texto claro. A sequência de cores que o cão quebrado pisca (S3) sai de um gerador com semente (`src/systems/cores.js`: um número e o PBKDF2 da resposta em `data/story/secrets.json`), então o repositório não tem as cores em palavras nem em índices; um teste confere que o que o cão pisca é o que o teclado de cores do rádio aceita.

## A emenda como sequência de ação (protótipo da cena 4)

Jonas chega à ponta do cabo e emenda **segurando** (E, A ou segurar Usar). No meio da emenda o cão chega, em duas partes:

1. **A cinemática** (5,6 s, pulável segurando Esc ou Start por 1 s, ou o botão Pular no toque): o cão virando a esquina da avenida entre os carros parados, o close do sensor mudando de âmbar fraco para âmbar, e Jonas olhando por cima do ombro.
2. **A sequência de reação**, com o comando **no cenário** (uma tecla pequena do meio que se usa, uma palavra e uma barra fina que se esgota com a janela, junto da mão, do cabo ou do cão; sem círculo): **segurar** (a emenda, 4,4 s: o primeiro passo tem o dobro do tempo) → **direção** (esquivar ← ou → quando o cão salta; **o tempo cai para 0,28x e a câmera se aproxima** nessa janela, e a seta está no cão e diz para que lado ir: hoje sempre para a esquerda, para longe da caçamba onde o cão vai bater, e a semente só decide de que lado da pista ele salta) → **a escolha** (o cão bate na caçamba e fica atordoado uns 2 s: **← desorientar**, em silêncio, ou **→ desativar**, com barulho; cada uma tem o seu comando) → **martelar** (puxar o cabo preso na grade) → **apertar** (fechar a emenda). O lado de onde o cão salta sai da semente da partida (`?semente=N`, que está no menu de pausa e no cartão).

**Depois da esquiva.** *Desorientar:* Jonas encosta a segunda isca sonora (a de reserva, que o bolso traz) no sensor do cão, **segurando**; a rajada de estalos ensurdece o cão por cerca de 8 s, ele gira e tropeça procurando. Jonas fecha a emenda e se esconde na caçamba; o cão volta a ouvir, fareja e segue a rota sem achá-lo. Gasta a isca. *Desativar:* **apertar** para enfiar a ponta desencapada do cabo no encaixe das costas do cão; a bateria entra em curto, ele solta faíscas e cai desligado, como o cão quebrado da caçamba. **Escuta +10**, e a emenda fecha mais curta e mais lenta (mais toques, menos cabo).

**Errar.** Na esquiva, na escolha (ou deixar o tempo acabar) e no primeiro comando de cada caminho, o cão **ataca Jonas e o jogo acaba**: a cena do ataque, o preto, o *fim de jogo* e a volta ao **ponto salvo no começo da emenda** (não ao começo da saída; a isca e a de reserva voltam ao bolso). No segurar do começo, no martelar e no apertar, faz barulho: **Escuta +8** cada (o número do design para uma reação errada na rua), o ícone "foi ouvido", e o jogo segue (a emenda se fecha do mesmo jeito). Com **mais tempo** todas as janelas dobram; com a reação **desligada** todos os passos acertam sozinhos (a palavra no cenário passa a ser "automático") e o resultado é o mesmo de uma sequência perfeita, sem a Escuta mexer.

**A isca.** Quando o cão foi afastado pela isca (está a mais de 14 m da ponta quando a emenda chega ao meio), a sequência é a **curta**: uma cinemática de 4 s (o cão passa longe, o sensor muda, Jonas olha), só **segurar** (3 s) e **apertar**, sem salto e sem cabo preso, uns 10 s no total. Sem isca, ou com o efeito dela acabado, é a **cheia** (uns 15 a 25 s com a cinemática). `?emenda=cheia` ou `?emenda=curta` força uma ou outra para quem quer ver as duas.

## Como se joga

| | Teclado e mouse | Controle | Toque |
|---|---|---|---|
| Andar | WASD | analógico esquerdo | direcional virtual |
| Olhar ao redor | mouse ou setas | analógico direito | arrastar à direita |
| Correr, agachar | Shift (segurar), C | L3, B | Correr, Agachar |
| Examinar, pegar, usar, abrir o rádio (Jonas senta e pega o microfone) | E | A | toque no objeto |
| Segurar para manipular | E (segurar) | A (segurar) | tocar e segurar no objeto |
| **Reagir** (as outras cenas) | Espaço | X | botão Reagir (canto inferior direito) |
| Na rua (saída 1): olhar | mouse (um clique prende o ponteiro; Esc solta e abre o menu) ou setas | analógico direito | arrastar à direita |
| Sequência da emenda: **segurar** | E (segurar) | A (segurar) | Usar (segurar) |
| Sequência da emenda: **direção** (esquivar) | ← ou → (também A, D) | direcional ou analógico esquerdo ← → | botões ◀ ▶ ao lado de Usar (ou o direcional virtual) |
| Sequência da emenda: **martelar** | E (martelar) ou alternar ← → | A (martelar) | Usar (martelar) |
| Sequência da emenda: **apertar** | E ou Espaço | A ou X | Usar ou Reagir |
| Mirar e lançar a isca | botão direito (segurar), esquerdo | LT, RT | botão Item: segurar, arrastar e soltar |
| Lanterna, rádio de mão | F, R | Y, ↑ | Lanterna, Rádio |
| Bolso (as mãos dele, com o que há nelas), menu | I, Esc | ↓, Start | Bolso, ☰ |
| Guardar o caderno ou o bolso, sair do rádio | Esc ou E (o rádio: Esc) | A ou B | ✗ Voltar |

**O rádio da estação não é uma janela: é um objeto na bancada.** E na bancada: Jonas senta, tira o microfone de mão do gancho e a câmera vai para o painel (por cima do ombro dele); tudo o que se faz é uma ação dele, com animação, e o estado se lê no próprio rádio.

| O que se faz | Teclado e mouse | Controle | Toque (no próprio rádio) | O que se vê |
|---|---|---|---|---|
| Trocar de canal | ← → ou roda do mouse; clique no seletor | LB, RB | tocar o seletor, à esquerda ou à direita do centro | Jonas gira o seletor, o ponteiro anda na escala, o chiado entre um canal e outro, o número aparece no visor |
| Escolher a resposta | ↑ ↓, 1 a 3, ou clique na linha | direcional ↑ ↓ | tocar a linha | as respostas são linhas de texto embaixo, sem caixa; Jonas espera com o microfone na mão |
| Falar (só fala enquanto segura) | T (segurar) | RT (segurar) | botão Falar (fixo na tela, para o polegar) | Jonas aperta o botão do microfone junto da boca, a luz TX acende, a agulha acompanha a voz, a linha escolhida se enche (com um tique na marca) |
| Senha | Enter abre; as letras entram direto; Enter envia, Esc fecha | Y abre; direcional move, A aperta, X apaga, Start envia | tocar as teclas do rádio (várias vezes troca a letra, como num celular antigo); `*` apaga, `#` envia | o visor mostra `SENHA:` e as letras; Jonas digita em close, a tecla afunda |
| Teclado de cores (canal 88) | ← → escolhem, E põe, Backspace apaga, T segura 2 s para enviar; ↑ ↓ trocam de canal | direcional ← →, A, X, RT; LB RB trocam de canal | tocar o botão de cor; `*` apaga; botão Enviar (segurar) | os cinco botões acendem, Jonas aperta em close, a fileira de oito luzes mostra a sequência |
| Avançar uma fala sem escolha | E ou clique na fala | A | tocar a fala | |
| Sair do rádio | Esc | B | ✗ Voltar | Jonas pendura o microfone e levanta |

A paciência da outra voz é a luz RX que vai apagando junto com o chiado. A lista completa também está em Menu → Comandos. **No caderno e no bolso** (primeira pessoa, nas mãos dele): ← → viram a página ou trocam o item (LB RB; tocar a metade esquerda ou direita), E ou Esc guarda (A ou B; ✗ Voltar). Na cena filmada, segurar Esc ou Start por 1 s pula.

O que fica por cima da imagem, e só isto: as legendas, as linhas de resposta, a dica pequena do botão ("E Sintonizar"), o Reagir, o "foi ouvido", a barra da Escuta e, no toque, o botão Falar (ou Enviar) e o ✗ Voltar. O menu, as Opções e o cartão são telas cheias.

Escolher uma resposta **não** transmite: Jonas só fala enquanto o botão de falar está apertado, e a linha escolhida se enche enquanto ele fala (soltar antes corta). Uma fala pode ter uma **marca** (um tique na linha): soltar antes dela vale como calar para a conversa, mas os segundos transmitidos contam na Escuta. A paciência da outra voz é o chiado que some; se some sem Jonas falar, ele calou (a Escuta desce 3 e a confiança de Neide ou Tânia cai 1). Sair do rádio no meio de uma pergunta da outra voz (uma que tem paciência) vale como calar e encerra a chamada; numa espera sem paciência (a chamada que ninguém atendeu ainda) sair não é calar, e o dial só trava a partir da primeira fala da outra voz; durante uma fala, sair só pausa.

## O código

Tudo o que é regra é puro (sem three.js, sem relógio, sem `Math.random`) e tem teste:

- `src/systems/escuta.js`: a Escuta, de 0 a 100, que passa de uma noite para a outra; +2 por segundo de botão apertado (arredondado por transmissão), −10 no começo de cada noite (a noite 1 começa em 10), `read(nome)` guarda o valor lido antes de transmitir (os limiares de 50 e 70); o diretor lê esse valor guardado com a condição `{ escutaRead: 'nome', gte: 70 }`.
- `src/systems/trust.js`: a confiança de Neide e Tânia (0 a 3, começa em 2; +1 para resposta em até 3 s, −1 para calar, mentir ou passar de 6 s).
- `src/systems/radio.js` (só emite eventos e dá `view()`; `src/desk.js` o mostra no objeto): os canais de número fixo, a conversa como grafo de nós em dados (`line`, `ask`, `end`), o falar, a marca, a paciência, o calar (o segundo calar encerra a chamada), o campo da senha e o teclado de cores (teto de três erros por noite). As respostas são conferidas por PBKDF2-SHA-256 de 200 mil iterações, com sal fixo por tipo (`src/systems/secrets.js`, o mesmo esquema dos jogos irmãos); **o repositório só tem os hashes**.
- `src/systems/director.js`: uma noite é uma lista de cenas declarada em dados; uma cena é uma lista de passos (`goal`, `say`, `wait`, `reach`, `use`, `radio`, `tune`, `know`, `quick`, `escuta`, `flag`, `end`). No começo de cada cena pede o salvamento: é para lá que a morte volta.
- `src/systems/quick.js`: a reação rápida (anel de 1,2 s; 2,4 s com "mais tempo"; "desligada" acerta sempre). Ela continua nas outras cenas e na demonstração.
- `src/systems/sequence.js` (o protótipo da cena 4): a **sequência de reação**, passos com um tipo de comando e uma janela cada (`hold`, `dir`, `mash`, `press`), `pick` (a escolha, com dois ramos de passos), `first` com o dobro do tempo, "mais tempo" dobra todas e "desligada" faz todas sozinhas (mais curtas, dizendo `auto`; a escolha automática é a silenciosa); errar na esquiva é o cão derrubar (`knocked`), errar a escolha ou o primeiro comando de um ramo (`fatal`) é o cão recuperar e atacar (`bitten`), errar o resto é barulho. Puro e com teste (`test/sequence.test.mjs`).
- `src/systems/emenda.js`: o que a imagem faz na emenda, como funções puras do tempo: `cinePose` (a cinemática do cão chegando, três planos cortados), `actionPose` (a reação, a partir do que a sequência registrou), as duas versões (`cheia`, `curta`) e os passos de cada uma, a câmera lenta (`SLOW`), o sangue (`bloodAt`, de uma semente) e a encenação da caçamba (`DUMP`). O jogo e o modo filmagem (`src/cutscenes/emenda.js`, vistas `emenda.*` no manifesto) usam as mesmas funções.
- `src/systems/shoulder.js`: a câmera por cima do ombro da rua (limite do olhar, colisão com prédios, caçamba e carros, perto e baixa ao esconder-se).
- `src/systems/street.js` (a fase B): as regras da saída à rua que não são do cão: o barulho do Jonas que faz um cão calmo desconfiar (+5), correr a menos de 15 m de um cão (+3 por corrida), a emenda do cabo segurada com a reação rápida no meio, e a voz da Tânia no rádio de mão (só com ele ligado e a confiança dela em 2 ou 3). `src/systems/cores.js`: as cores do cão quebrado. `src/systems/voicedata.js`: os tamanhos e as marcas vindos das gravações.
- `src/systems/shots.js` e `camera.js`: planos de câmera fixos por trecho (cada um com a zona do chão em que vale), com cortes; o direcional lê contra o plano que está ligado, e um corte no meio de um passo mantém o sentido até soltar. Examinar leva a câmera para os olhos, com o olhar limitado.
- `src/systems/run.js`, `src/save.js`: o estado da partida e o cartão (bloco 1 a partida; 2 a 4 as noites, com o resumo das decisões e o estado em que começaram, para recomeçar de uma; 11 e 12 Rinha e O Dia que Sobra, lidos; 13 o do canal; 15 segredos e finais).
- `src/game.js` junta tudo; `src/ui.js` é o HUD; `src/desk.js` é o rádio na bancada (Jonas senta e manuseia o objeto de `src/models/props/radio.js`: o seletor, o visor, as luzes, as teclas, os botões de cor, o microfone; só deixa por cima da imagem as linhas de texto e o botão Falar; os planos de câmera do painel e do close; o toque é um raio sobre o próprio modelo); `src/hands.js` é o caderno e o bolso em primeira pessoa (o canal anotado é desenhado numa textura da página); `src/screens.js` o título, a pausa, as opções, os comandos, o cartão e o fim; `src/systems/input.js` lê teclado, controle e toque **por contexto** (andar, examinar, mãos, rádio, botões de cor, senha, tela, cena), um dono por botão; `src/systems/touch.js` são os controles de toque (no rádio, um toque vai para o modelo).
- `data/story/`: `nights.json` (as noites), `scenes.json` (as cenas: zona de cada plano, pontos, passos), `conversations.json` (as conversas; a noite 1, cena 5, é o caso de teste), `radio.json` (os canais), `secrets.json` (só hashes).
- Do que ficou da versão 1: `src/systems/machines.js`, `stealth.js`, `gear.js` (o cão, o barulho, a isca), `player.js`, `interact.js`, `body.js`; `src/scenes/` (a estação e a rua), `src/models/` (o Jonas, os props, a cidade de peças), `src/cutscenes/` (as vistas do modo filmagem) e `src/looks/`.
- `src/audio/index.js` é o som (sintetizado ao vivo; o chiado do rádio, o aviso de "foi ouvido", os tons das cores); `data/scenes/<cenário>.json` é o layout de cada cenário e `src/entities.js` declara os tipos.
- `tools/` tem os scripts que fazem os modelos, a cidade e a cena `radio-teste` (`python3 tools/cutscenes/radio-teste.py <pasta do áudio>`; `node tools/cutscenes/film.mjs` filma a cena).

## Captura de rosto e voz

Para animar o rosto do Jonas e dar a voz dele a partir de uma atuação: a pessoa fala as falas na frente da câmera e do microfone. Da mesma gravação saem a animação do rosto e da cabeça e a voz (convertida pelo Voice Changer do ElevenLabs). Os dois ficam sincronizados, porque a conversão mantém o tempo da fala.

**Fluxo inteiro**

1. Gravar: `node tools/capture/server.mjs --out <pasta da captura> --script tools/capture/example-script.json` e abrir `http://localhost:8765` (a pasta fica fora do repositório; o roteiro é um JSON `{ "lines": [{ "id", "who", "text" }] }`). Ligar a câmera, gravar o **Neutro**, depois cada fala: Gravar (contagem de 3 s), falar, Gravar de novo para parar. Uma fala pode ser regravada. Sai `<id>.wav` (mono, 48 kHz) e `<id>.face.json` (por quadro: o tempo do áudio, os 51 pesos do MediaPipe e o giro da cabeça).
2. Dados da cena: `node tools/capture/to-cutscene.mjs <pasta da captura> [--id 01]` escreve `data/cutscenes/radio-teste.face.json` (30 fps: morphs, `gaze` e `head`, no contrato de `src/models/jonas.js`). Os ganhos de cada canal estão em `tools/capture/mapping.json`, um conjunto por fonte (`webcam`, `livelink`).
3. A voz: `node tools/voice/sts.mjs <pasta da captura>` imprime a duração e o custo estimado e **não envia nada** sem `--yes` (`--dry-run` só imprime). Gera `<id>.jonas.mp3` e avisa se a duração da saída difere da entrada em mais de 50 ms.
4. A cena: `?cena=radio-teste` usa o rosto capturado das falas que o tiverem (no lugar da boca vinda do volume); as falas sem rosto capturado continuam como antes. O modo filmagem (`node tools/cutscenes/film.mjs`) funciona igual. O áudio da cena é o `cena-radio.mp3`: trocar a voz do Jonas nele (com os `.jonas.mp3`) é a montagem do vídeo.

**Jonas ao vivo.** A página tem um painel com o Jonas do jogo (o modelo e o visual do jogo, lidos do próprio jogo por `/game/`, só leitura) mexendo o rosto e a cabeça em tempo real, enquanto você atua, tanto com a webcam quanto com o iPhone. Cada quadro passa pela mesma função que o `to-cutscene` usa (neutro, ganhos de `mapping.json` pela fonte, limites), então o que se vê é o que a cena vai mostrar; só a suavização é outra (ao vivo só olha o passado, 2 a 4 quadros; a cena usa a centrada). Ele se desenha a no máximo 30 quadros por segundo e para com a aba escondida (a caixa "desenhar" liga e desliga). O bloco "Ajustes ao vivo dos ganhos" tem um controle por grupo (boca, piscar e olhos, sobrancelhas, sorriso e bochechas, olhar, giro da cabeça) e as caixas de inverter o olhar e o giro; "Salvar ajustes" grava em `tools/capture/mapping.json`, só na fonte que está na tela. O servidor só serve `src/`, `vendor/` e `assets/models/` do jogo, e só aceita salvar um `mapping.json` no formato esperado.

**Visão do diretor.** O botão "Visão do diretor" abre uma janela à parte (`/director.html`) com a cena `radio-teste` inteira, montada pelo código do próprio jogo (a oficina da galeria de noite, a lâmpada de obra, o rádio, o banco e o poço com a grade), filmada pelas câmeras da cena (médio de abertura, close, de lado, sobre o ombro, reação, o poço) e com o Jonas sentado atuando ao vivo. O seletor de plano tem os planos fixos e o "Automático", que segue os cortes da fala escolhida (pelos tempos de `data/cutscenes/radio-teste.json`; enquanto não grava, a fala toca em ciclo, e quando a gravação começa o tempo passa a ser o dela). A janela é 16:9, mostra a fala em legenda, tem tela cheia e moldura de segurança, desenha a no máximo 30 quadros por segundo e pausa escondida. Recebe só os números do rosto, já mapeados, por `BroadcastChannel` (mesma origem); nenhuma imagem sai da página. Se a página principal for recarregada, a janela reconecta sozinha. A caixa "só no diretor" desliga o painel do Jonas da página principal enquanto a janela está aberta, para máquinas fracas.

**O que se grava e o que nunca se grava.** Grava-se o áudio do microfone e números (pesos do rosto e rotação da cabeça). **A imagem da câmera nunca é gravada nem enviada**: o vídeo só aparece na tela, e o detector o lê sem guardar. O servidor escuta só em 127.0.0.1. A página carrega a biblioteca `@mediapipe/tasks-vision` (versão fixa) e o modelo do Face Landmarker de CDNs (jsdelivr e Google): precisa de internet na primeira abertura; nada disso fica no repositório.

**Calibração do neutro.** O botão "Neutro" grava 2 s de rosto parado e guarda a média (`neutral.json`). Ela é descontada de todas as falas, então a webcam não precisa de um rosto "zerado". Refaça se a luz ou a posição mudar. A webcam lê mais fraco que o sensor do iPhone: ajuste os ganhos de `webcam` em `mapping.json`. O giro para a esquerda e o olhar também têm um sinal (`yawSign`, `xSign` ...): se o Jonas virar para o lado errado, troque-o. O `lag` (segundos) atrasa ou adianta o rosto em relação à voz.

**Custo do STS.** O Voice Changer cobra por minuto de áudio de entrada. A estimativa que o script usa é de cerca de 1.000 créditos por minuto, perto de US$ 0,12 (informação de terceiros: confira na sua conta; as constantes estão no topo de `tools/voice/sts.mjs`). A chave é lida de `~/.config/elevenlabs/key` e nunca é impressa. O script usa `POST https://api.elevenlabs.io/v1/voice-changer/{voice_id}` com `model_id` `eleven_multilingual_sts_v2` (parâmetros e modelo conferidos em https://elevenlabs.io/docs/api-reference/speech-to-speech/convert; o caminho antigo era `/v1/speech-to-speech/`). A voz do Jonas é `uNRH6oYhKWLYyXKl4HVH` (`--voice` troca).

### Pelo iPhone (Live Link Face)

Segunda fonte do rosto: o app **Live Link Face**, da Epic (gratuito), lê o rosto com o sensor de profundidade do iPhone, mais fiel que a webcam. Precisa de um iPhone (ou iPad) com Face ID (câmera TrueDepth). Segundo a documentação da Epic (https://dev.epicgames.com/documentation/en-us/unreal-engine/recording-face-animation-on-ios-device-in-unreal-engine), cada tomada gravada tem um `.mov` (vídeo de referência, com áudio e timecode) e um `.csv` (os dados do rosto do ARKit). Para tirar a tomada do telefone: no app, abra o navegador de tomadas (canto inferior esquerdo), toque em Selecionar, escolha a tomada e toque em Compartilhar; a Epic diz que o AirDrop é a opção mais confiável. (A pasta `Live Link Face` do app de Arquivos também guarda as tomadas.)

```bash
node tools/capture/import-livelink.mjs <pasta da tomada ou o .csv> --out <pasta da captura> --id 01 [--neutral <tomada do neutro>] [--fps 30|60] [--head-degrees]
```

Escreve o mesmo `01.face.json` da webcam (com `source: livelink`) e, se a pasta da tomada tiver um `.mov` ou `.mp4`, o áudio em `01.wav` (mono, 48 kHz) para o `sts.mjs`. Depois o fluxo é o mesmo (`to-cutscene`, `sts`, a cena). Colunas faltando e células vazias não param a importação: o relatório conta os quadros vazios de cada canal. Grave uma tomada curta de rosto parado e passe como `--neutral`. Os ganhos de `livelink` em `mapping.json` começam em 1.

O que **não** se sabe pelos arquivos nem pela documentação da Epic (confira na primeira tomada): a documentação não descreve as colunas do CSV nem como o timecode do CSV casa com o do vídeo. O importador lê o timecode como `HH:MM:SS:QQ.fff` (quadros, com fração), `HH:MM:SS.fff` ou segundos, e **assume que a primeira linha do CSV é o começo do vídeo**; se a voz e o rosto saírem defasados, acerte `livelink.lag` em `mapping.json`. As colunas `HeadYaw`, `HeadPitch` e `HeadRoll` são lidas se existirem, em radianos (`--head-degrees` se vierem em graus).

#### Ao vivo, pela rede (sem passar arquivo)

Sem AirDrop (no Linux, por exemplo), o app manda o rosto ao vivo por UDP e a página o grava junto com o **microfone do computador**.

1. Suba o servidor com a porta do Live Link: `node tools/capture/server.mjs --out <pasta da captura> --script tools/capture/example-script.json --livelink-port 11111`. Ele escuta UDP nessa porta em todas as interfaces (o HTTP continua só em 127.0.0.1), repassa os quadros à página e não grava nada sozinho. No log aparece o endereço do primeiro pacote.
2. Ache o IP do computador na rede local: `ip -4 addr` (o endereço da placa ligada à mesma rede do celular, em geral `192.168.x.x` ou `10.x.x.x`).
3. No app: ajustes (ícone no canto superior esquerdo), **LiveLink**, **Add Target**, e coloque `<ip do computador>` (e a porta 11111, se o app pedir uma). Use o modo Live Link (ARKit). Ligue o "Stream Head Rotation" para a cabeça girar, e o botão de envio da tela inicial (verde) para mandar. Os dois aparelhos precisam estar na mesma rede.
4. Na página, escolha a fonte **iPhone (Live Link)** antes de Ligar. Ela não pede a câmera: mostra "recebendo de <ip>, N quadros/s", as barras e a cabeça. O Neutro e o Gravar funcionam igual; o `face.json` sai com `source: livelink` (o neutro vai para `neutral-livelink.json`) e o tempo de cada quadro é o da chegada, relativo ao começo do áudio.

Se nada chegar: confira o IP e que os dois aparelhos estão na mesma rede (rede de visitantes costuma isolar os aparelhos), e se o firewall do computador deixa passar UDP 11111 (por exemplo, `sudo ufw allow 11111/udp`; feche de novo depois). O log do servidor conta os pacotes que não entendeu (`/api/state` mostra `ignored`).

De onde vem o formato do pacote: a Epic não o documenta. O decodificador de `tools/capture/livelink.mjs` segue o do projeto público PyLiveLinkFace (https://github.com/JimWest/PyLiveLinkFace): versão (1 byte), id do aparelho e nome do sujeito (tamanho em `int32` big-endian e UTF-8), o tempo do quadro, a contagem (1 byte, 61) e 61 `float32` big-endian (os 52 do ARKit, `HeadYaw`, `HeadPitch`, `HeadRoll` e os olhos). Versão ou contagem diferentes são registradas no log e o pacote é lido pelos tamanhos. A documentação da Epic de configuração do app: https://dev.epicgames.com/documentation/en-us/unreal-engine/recording-face-animation-on-ios-device-in-unreal-engine. Ela só fala do IP do alvo; a **porta 11111 não está nessa página** (é a porta usual do Live Link; se o app usar outra, passe-a em `--livelink-port`). Não confirmei se `HeadYaw/Pitch/Roll` vêm em radianos nem o sinal do giro: se a cabeça girar demais ou de menos, ajuste `livelink.head.gain` e `yawSign` em `mapping.json`.

## Desempenho

Não há régua de triângulos nem de tamanho por modelo: o que vale é o **tempo de quadro medido no jogo**. A meta é 60 quadros por segundo no computador e 30 no celular.

**Como medir** (qualquer revisão repete):

```bash
PLAYWRIGHT_CORE=<pasta do playwright-core> node tools/city/perf.mjs            # computador, 1280×720
PLAYWRIGHT_CORE=<pasta do playwright-core> node tools/city/perf.mjs --mobile   # 390×844, DPR 3, toque, CPU 4× mais lenta
```

O script serve o jogo, abre o Chrome sem janela com o ANGLE na **GPU de verdade** (`--use-angle=gl`; ele confere o `WEBGL_debug_renderer_info` e recusa SwiftShader e llvmpipe, que é o que os testes usam), deixa o jogo rodar sozinho e lê o intervalo entre chamadas de `requestAnimationFrame`: média e percentil 95 de 240 quadros, depois de 60 de aquecimento. O limite de quadros e o vsync ficam desligados (`--disable-frame-rate-limit --disable-gpu-vsync`), então o número é o custo do quadro, não os 16,7 ms da tela; `--capped` deixa ligados. No celular emulado a CPU é freada pelo CDP (`Emulation.setCPUThrottlingRate`, 4): a GPU continua a do computador, então a emulação mede o custo de CPU do quadro (chamadas de desenho, lógica), não a GPU de um aparelho. `GAME_ROOT=<outra cópia do jogo>` mede uma versão guardada, para comparar. As vistas: a saída 1 (`n1-saida`) nos três planos de câmera do jogo e na calçada a oeste, três câmeras postas à mão (a avenida de ponta a ponta, uma fachada de perto, o viaduto) e os planos da cutscene da grade (`n1-cidade`). Draw calls e triângulos são os de um quadro inteiro (o visual desenha em mais de um passe).

**Números de 2026-11-17** (Intel Iris Xe, Mesa, OpenGL 4.6; média de duas medições intercaladas antes/depois, com a máquina ocupada por outros processos; tempo médio / percentil 95, em ms):

| Vista | Computador, antes | Computador, depois | Celular emulado, antes | Celular emulado, depois |
|---|---|---|---|---|
| Saída 1, plano da boca | 8,5 / 11,1 (484 chamadas, 212 mil tri) | 7,1 / 10,0 (326 chamadas, 247 mil tri) | 37,2 / 53,2 | 32,0 / 49,0 |
| Saída 1, plano da estação | 8,5 / 11,3 | 6,8 / 9,2 | 38,0 / 52,7 | 31,3 / 47,4 |
| Saída 1, plano da caçamba | 8,7 / 11,2 | 6,6 / 9,4 | 36,4 / 52,8 | 29,6 / 38,5 |
| Saída 1, calçada a oeste | 8,0 / 10,4 | 6,7 / 8,9 | 38,3 / 53,6 | 29,0 / 34,0 |
| Avenida de ponta a ponta (câmera à mão) | 11,0 / 14,1 (840 chamadas) | 8,5 / 10,9 (556 chamadas) | 50,3 / 67,9 | 39,5 / 52,8 |
| Fachada de perto (câmera à mão) | 7,3 / 9,8 | 5,9 / 9,2 | 33,0 / 50,2 | 26,3 / 30,9 |
| Viaduto (câmera à mão) | 14,5 / 28,3 | 7,7 / 10,0 | 45,4 / 61,3 | 35,0 / 52,9 |
| Cutscene da grade (os quatro planos) | 6,9 a 8,0 / 9,3 a 12,9 | 5,0 a 5,3 / 6,8 a 7,4 | 28,0 a 29,9 / 33,6 a 40,2 | 20,7 a 23,2 / 29,5 a 40,5 |

"Antes" é a rua da segunda passada; "depois", a da terceira (a cidade modelada e pintada). No computador sobra folga para os 60 (16,7 ms) em toda vista. No celular emulado os planos do jogo e a cutscene ficam na média acima de 30 (33,3 ms), mas o percentil 95 ainda passa de 33 ms em três dos quatro planos da saída, e a avenida vista de ponta a ponta (câmera que o jogo não usa) fica em 25. O que pesa ali já não é a cidade: são as chamadas de desenho dos personagens, dos carros (quatro materiais por carro, um por cor) e das peças que ainda são do kit.

**O que segura o quadro** na rua: uma malha e um material por prédio (a pintura é um atlas), a versão de longe com o mesmo material, o chão em dois materiais, o mobiliário num atlas só, os contornos todos num material, a junção por trecho e por material (`createCityLod`, 24 m; perto até 40 m) e as pinturas feitas em memória no carregamento. O preço é o carregamento: a rua fica pronta em 6,9 s no computador (4,8 s antes) e, na emulação de celular, levou 30 s contra 14,5 s antes de as pinturas ficarem mais baratas (não foi medido de novo depois disso); as pinturas custam esse tempo uma vez por carregamento.

## Testes

```bash
node --test
# ou: npm test
```

`node --test` (sem argumento) roda os arquivos de `test/`; `npm test` faz o mesmo (`package.json`). No Node 26, `node --test test/` com a pasta como argumento falha (ele a trata como um arquivo), por isso o comando é sem argumento. Um arquivo só: `node --test test/core.test.mjs`. Os testes de navegador (`test/browser.test.mjs`) só rodam com `PLAYWRIGHT_CORE=<pasta do playwright-core>` (e `CHROME`, o executável); com `CAPTURES_DIR=<pasta>` salvam as imagens das cenas (`faseB-*.png`).

`test/core.test.mjs` refaz, com o sistema de verdade (a conversa, a Escuta, a confiança, o diretor), as contas do design com as **conversas reais** e os tamanhos das gravações (a chamada das 22h é a `n1-chamada`, não uma fixture): o cuidadoso que sai agora fecha a noite 1 em **33** (14 depois da chamada; o design contava 37, com uns 4 da rua que o cuidadoso ainda paga), o cuidadoso que **espera** (+18) fecha em **52** (50 ou mais: o cão aparece na grade no corte), o descuidado dá 19, 35, 42, 46, 70 e **76** (a noite 2 abre em 66), e as de calar dão 19, **34**, 56 e **73**; a marca, sair do rádio, o teclado de cores, a senha, a reação rápida, os planos, e na fase B: que **nenhum tamanho de fala está escrito nos dados** (vêm de `durations.json` e `marcas.json`), que toda voz que a história cita existe e tem tamanho, que as seis cenas da noite 1 estão em dados e só usam beats e pontos que existem, as regras da rua (`street.js`), a emenda, as cores do cão quebrado contra o hash do teclado de cores, e uma varredura que garante que nem a sequência de S3 nem a frase de S1 aparecem no repositório (a varredura confere por hash: 12 bits de um hash com sal de cada resposta filtram as janelas de palavras, e só as que passam são conferidas pelo PBKDF2 de verdade; nada legível), a despedida da chamada derrubada, o ramo "não contar" calando no último turno e o cão passando longe no corte de menos de 50. `test/browser.test.mjs` joga a **noite 1 inteira**, da Nova partida ao cartão com o bloco 13 quebrado (teclado e mouse), as quatro saídas da cena 6, a caçamba, a morte e o recomeço, a demonstração, que **cada fala toca uma vez** na noite inteira (espiando `voices.play`), o visor com o campo da senha piscando, uma linha de texto por vez e a grade da primeira cutscene como geometria, também no modo filmagem; `test/capture.test.mjs` cobre a captura do rosto.
