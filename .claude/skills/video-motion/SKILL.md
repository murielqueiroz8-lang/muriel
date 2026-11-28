---
name: video-motion
description: Cria vídeos animados curtos (Reels, TikTok, Shorts, Stories) sem gravar nada — texto animado, janelas de sistema simuladas, listas, números, e um modo notícia com manchete, fatos, citação, enquete e letreiro — e entrega um MP4 pronto para postar, mais a capa e a legenda. Use quando a pessoa pedir um vídeo, reel, vídeo de notícia, resumo de notícias (política, famosos, mundo, games, filmes, música, esportes), vídeo animado, motion ou "um vídeo por dia" sobre qualquer tema.
---

# video-motion

Transforma um roteiro em JSON num MP4 vertical animado (1080x1920, 30 fps, H.264), renderizado quadro a quadro com Playwright + ffmpeg. Nada é gravado: tudo é HTML/CSS animado.

## Fluxo

1. **Entenda o pedido**: tema, público, objetivo (ensinar, vender, engajar) e @ da pessoa. Se faltar o tema, sugira 3 ideias e siga com a melhor.
2. **Escreva o roteiro** (`roteiro.json`) seguindo as regras abaixo. Mostre o texto das cenas em uma lista curta antes de renderizar só se a pessoa pediu para revisar; caso contrário, renderize direto.
3. **Renderize**:
   ```bash
   node <pasta-da-skill>/scripts/render.cjs roteiro.json video.mp4
   # opcional: --musica trilha.mp3   --capa 2.5   --html-only (só gera o HTML para pré-visualizar)
   ```
   Gera `video.mp4` e `video-capa.jpg`. Leva ~2 s de render por segundo de vídeo.
4. **Confira** extraindo 4–6 quadros (`ffmpeg -ss <seg> -i video.mp4 -frames:v 1 q.png`) e olhando se algum texto estourou ou ficou cortado. Ajuste o roteiro e renderize de novo se preciso.
5. **Entregue** o MP4 e a capa, mais uma **legenda para o post** (2–4 linhas, gancho + valor + CTA) e 5–8 hashtags do nicho.

Requisitos: `node`, `ffmpeg` e o pacote `playwright` com Chromium. Se faltar, instale (`npm i playwright && npx playwright install chromium`, e ffmpeg pelo gerenciador do sistema).

## Formato do roteiro

```json
{
  "formato": "9:16",                     // "9:16" (padrão), "4:5" ou "1:1"
  "marca": { "handle": "@perfil", "nome": "Nome", "logo": "logo.png" },
  "tema": { "fundo": "#0f2e28", "destaque": "#f2c46d", "botao": "#e0522d" },
  "cenas": [ ... ]
}
```

`tema` é opcional; as chaves aceitas são `fundo`, `fundo2`, `texto`, `suave`, `destaque`, `acento`, `cartao`, `cartaoTexto`, `botao`, `botaoTexto`, `fonte`. `logo` é um caminho relativo ao JSON. Em qualquer texto, `*palavra*` fica na cor de destaque. Toda cena aceita `duracao` (segundos) e `legenda` (faixa de legenda embaixo).

| type | campos | duração padrão | para quê |
|---|---|---|---|
| `hook` | `texto`, `etiqueta?`, `sub?` | 3 s | gancho de abertura, palavras surgem uma a uma |
| `texto` | `texto`, `sub?` | 3,2 s | frase de impacto / transição |
| `step` | `numero`, `titulo`, `janela{titulo, cabecalho, icone, item, sub, botao, concluido}` | 4,8 s | passo a passo com janela de sistema, cursor clicando e barra de progresso |
| `list` | `titulo`, `itens[]` | 1,6 + 0,7/item + 1 s | checklist com itens entrando em sequência |
| `stat` | `valor`, `prefixo?`, `sufixo?`, `de?`, `decimais?`, `antes?`, `texto` | 3,6 s | número grande com contagem animada |
| `cta` | `texto`, `botao?`, `sub?` | 3,8 s | encerramento com avatar, @ e botão "Seguir" pulsando |

### Modo notícia

Adicione `"estilo": "noticia"` (tema escuro de telejornal) e `"categoria"` (define a cor: `politica`, `famosos`, `mundo`, `games`, `filmes`, `series`, `musica`, `esportes`, `tecnologia`, `economia`, `brasil`, `entretenimento`). Opcional: `"ticker": ["outra notícia", "..."]` cria um letreiro passando no rodapé (`"tickerRotulo"` muda o rótulo "AGORA").

| type | campos | duração padrão | para quê |
|---|---|---|---|
| `manchete` | `texto`, `urgente?` (true ou texto do selo), `categoria?`, `icone?` (emoji), `imagem?`, `sub?`, `fonte`, `data` | ~4,6 s | abertura da notícia |
| `fatos` | `titulo?`, `itens[]` (texto ou `{icone, texto}`), `fonte?` | 1,4 + 0,9/item + 1,4 s | os pontos principais |
| `citacao` | `texto`, `autor`, `cargo?`, `imagem?`, `fonte`, `data?` | 5 s | declaração literal |
| `enquete` | `pergunta`, `opcoes[]` (até 3), `sub?` | 4,4 s | gerar comentários |

`fonte` e `data` aparecem na tela abaixo do conteúdo. Toda cena também aceita `categoria` própria (para resumos com várias editorias).

Exemplos completos: `exemplos/fechamento-do-mes.json` (educativo) e `exemplos/noticia-gta6.json` (notícia).

## Regras de roteiro (o que faz o vídeo reter)

- **Total de 15 a 30 s.** 4 a 7 cenas.
- **Comece com `hook`**: promessa concreta ou pergunta, até 9 palavras, com 1–3 palavras em `*destaque*`.
- **Termine com `cta`.**
- Textos curtos: `hook` ≤ 9 palavras, `item` da janela ≤ 24 caracteres (é monoespaçado e corta com "…"), itens de lista ≤ 32 caracteres, no máximo 4 itens.
- Números em `stat` devem ser reais ou claramente ilustrativos — não invente dados apresentados como fatos sobre terceiros.
- Escreva no idioma e no tom do perfil da pessoa; português do Brasil por padrão.

### Cenas criativas (use para deixar o vídeo vivo)

| type | campos | duração padrão | para quê |
|---|---|---|---|
| `vinheta` | `texto?`, `logo?` | 1,8 s | abertura com o logo da marca entrando sobre um globo girando + impacto sonoro |
| `capitulo` | `numero`, `total?`, `titulo?` | 1,4 s | divisória "1 de 3" gigante entre notícias |
| `local` | `lugar`, `bandeira` (emoji), `texto?` | 3,4 s | globo com pino caindo — onde a notícia aconteceu |
| `curiosidade` | `pergunta`, `texto`, `etiqueta?`, `fonte?` | 5,2 s | "Você sabia?" com o texto desfocado que se revela |

Recursos automáticos no modo notícia: transição com faixas coloridas cruzando a tela (com o logo), marca-texto animado nas `*palavras*`, emoji flutuando com onda, estrelas e globo girando no fundo, leve zoom contínuo. Controle com `"transicao": "wipe" | "fade"` e `"enfeites": false`.

### Narração (voz que explica as notícias)

No estilo `seres` a **música sintética sai e entra uma voz** (neural, pt-BR, "faber" do projeto Piper; dados CC0) lendo o essencial de cada cena. Efeitos sonoros continuam, mais baixos. `"voz": false` desliga; `"trilha": "funk"` (texto) traz a música de volta por baixo da voz.
- **O que a voz lê:** hook e texto (o texto), capitulo ("Notícia 1"), local ("Direto de X"), manchete (só o texto grande; `falaSub: true` lê a linha de apoio, `falaFonte: true` lê a fonte), fatos (os itens, um a um, e cada item **aparece quando é falado**), curiosidade (o texto), enquete (a pergunta + "Comente A, B ou C"), cta (o texto). Vinheta, meme e clipe ficam sem fala. Para mudar: `"fala": "texto"`, `"fala": ["trecho 1", "trecho 2"]` ou `"fala": false`.
- A cena **alarga sozinha** para caber na fala. Um Reels de 3 notícias fica em ~60 s e um Story em ~9 s; escreva textos curtos (manchete até ~18 palavras).
- Texto para fala: números, datas ("26/11/2026"), "R$" e "%" são lidos por extenso; evite siglas difíceis.
- Instalação automática na primeira vez: `scripts/narrar.py` baixa o modelo (67 MB, GitHub `k2-fsa/sherpa-onnx`) para `~/.cache/seres-voz` e instala o `sherpa-onnx==1.12.40` (a 2.x não funciona com as vozes Piper). Se falhar, o vídeo sai **sem voz** e o render avisa com "AVISO: não consegui gerar a voz".
- Limite honesto: é uma voz de computador de boa qualidade, não uma pessoa. Quem gerou não consegue ouvir; peça sempre a conferência da dona.

### Som

Todo vídeo sai com **trilha original sintetizada** (batida + acordes, sem direitos autorais) e **efeitos sincronizados** (swoosh nas transições, pop nas etiquetas, impacto nos capítulos, brilho nas revelações). A trilha abaixa sozinha quando entra um efeito.
- `"trilha": "funk" | "pop" | "trap"` → escolhe o estilo da música (padrão: `funk`, batida de baile leve com marimba; `pop` é animado em 4x4; `trap` tem 808 e sinos). O perfil @seres.hu usa o estilo definido em `marcas/seres-hu/marca.json` (`"trilha"`).
- `"trilha": false` → só os efeitos (ideal para a pessoa colocar um áudio em alta do Instagram por cima).
- `"som": false` → vídeo mudo.
- `--musica arquivo.mp3` → usa a música da pessoa no lugar da trilha, mantendo os efeitos.
- `"bpm": 104` → velocidade da trilha.

### Roteiro que prende (estrutura recomendada para notícias)

1. `vinheta` (marca) → 2. `hook` com promessa + motivo para ficar ("Fica até o fim: tem enquete 👀") → para cada notícia: `capitulo` → `local` (se for de outro lugar) ou direto `manchete` → `fatos` ou `citacao` → um `curiosidade` com um detalhe surpreendente **verificado** → (se o assunto for leve) um `meme` → `enquete` → `cta`.
- Ganchos em forma de pergunta ou contraste ("O que *todo mundo* está comentando hoje", "Isso *não* é o que parece") funcionam melhor que títulos neutros.
- Cada notícia: 10–15 s. Vídeo total: 30–60 s.
- A curiosidade precisa vir de fonte, como o resto — é o "momento uau", não invenção.

### Memes (humor)

Cena `clipe`: vídeo de meme da biblioteca, com o áudio original — `arquivo`, `inicio?` (s), `duracao?` (padrão 4), `credito`, `topo?`, `base?`, `audio?` (false para tirar o som), `volume?` (padrão 0.85). O catálogo dos clipes disponíveis, com tom e onde usar, está em `marcas/seres-hu/memes/memes.json`.

Cena `meme`: `imagem?` (arquivo do meme) ou `emoji` (meme original, sem imagem), `topo?`, `base?` (texto clássico branco com contorno preto), `som?` (`hit` impacto, `boing` mola, `fail` trombone triste, `tada` comemoração, `shine`), `credito?`, duração padrão 2,8 s.

Formatos de meme prontos (todos originais, feitos com emoji):
- `grafico` — "Coisas que mais falei essa semana": `titulo`, `itens[]` (`{texto, valor, cor?}`, o último costuma ter o maior `valor` e ser o assunto), `emoji?` (reação que aparece na pizza), `destaque?` (frase final), `som?`.
- `pov` — "POV: …": `texto`, `reacoes[]` (2–4 emojis que se sucedem, ex.: `["😴","😳","🤩"]`), `base?` (frase final).

**Como escolher o meme (siga sempre):**
- Use **1 ou 2 memes por vídeo**, curtos, só em momento leve: depois de um `fatos`/`curiosidade` ou logo antes da `enquete`. O meme **reage** à notícia ou ao assunto ("Eu quando…", "Todo mundo depois de…"); nunca zoa quem foi afetado.
- **Nunca** use meme em notícia de morte, crime, violência, desastre, doença, acidente, guerra, luto, abuso ou qualquer assunto com vítimas. Nesses vídeos, nenhum meme e nenhum som de humor.
- Em **política**: só humor sobre a situação ou o processo (prazo, burocracia, "ninguém entendeu"). Nada que ridicularize a aparência, a saúde ou a família de alguém, e nada que favoreça lado político.
- **Fonte dos memes**, em ordem de preferência: (1) a biblioteca da pessoa em `marcas/seres-hu/memes/` (leia `memes.json` e escolha pelo `tom` e `usar_em`; o caminho da imagem no roteiro é relativo ao JSON do roteiro, então aponte até a pasta `memes/`); (2) meme **original de emoji**, feito pela própria skill; (3) imagem de uso livre (ex.: Wikimedia Commons com licença que permita), com `credito` na tela.
- **Clipes de meme reais** (cena `clipe`): só use **os arquivos que a pessoa colocou na biblioteca** (`marcas/seres-hu/memes/`), sempre com `credito` do criador na tela, em trechos curtos de 3 a 6 s. O áudio original do clipe toca e a trilha some enquanto ele passa. Avise a pessoa, uma vez, que clipes com marca d'água do TikTok podem ter menos alcance no Instagram e que o áudio original pode ser silenciado se tiver direito autoral. **Não baixe nem copie memes da internet por conta própria**, nem use prints de redes sociais: têm dono, e muitos mostram pessoas comuns. Não use meme com foto de criança nem de pessoa comum identificável, nem com conteúdo discriminatório, sexual ou de ódio.
- O texto do meme tem no máximo ~6 palavras por linha, em português, e deve fazer sentido sem contexto.

### Plantão de Stories (1 notícia por card, de hora em hora)

Modelo: `exemplos/story-plantao.json` (uma única cena `manchete`, 6,5 s, sem barra de progresso e sem trilha). Regras:
- **1 notícia por Story**, confirmada em pelo menos 2 fontes, com `fonte` e `data` na tela e `"urgente": "PLANTÃO"`.
- Em tragédia, morte, crime ou desastre: **tire o selo** (`"urgente"` ausente), tom sóbrio, sem emoji de festa, sem meme.
- Sem legenda: Stories pela API não levam texto. Tudo precisa estar no card.
- Para não repetir sem precisar de histórico, **alterne a editoria pela hora** (hora mod 6): 0 política, 1 mundo, 2 famosos, 3 games/filmes/música, 4 curiosidades/coisas anormais, 5 esportes/economia.
- Publicação (testado até "FINISHED", sem publicar): `POST /17841466108447631/media` com `media_type=STORIES`, `upload_type=resumable` → enviar o mp4 ao `uri` → aguardar `status_code=FINISHED` → `media_publish`. Só depois da palavra "posta".

### Publicar no Instagram (o que aprendemos)

- **Preferido: `video_url`.** Faça commit e push do mp4 (repositório público), espere `https://raw.githubusercontent.com/murielqueiroz8-lang/muriel/<branch>/<caminho>.mp4` responder 200 e crie o contêiner com `video_url`. O Instagram baixa e processa sozinho (~1 min para 33 MB), sem limite de tempo da nossa parte. Testado até `FINISHED`.
- **Upload resumível (`rupload`)** trava no último pedaço enquanto o Instagram processa (18 a 32 s hoje) e aborta acima de ~32 s com `Request processing failed` (400). Arquivos até ~1 MB (Stories) costumam passar; Reels grandes falharam em todos os testes de 27/11. Use só como plano B, com até 3 tentativas (contêiner novo a cada uma) e consulte o status depois de uma falha.
- Os vídeos agora são codificados com `-crf 24 -maxrate 5M` (Reels de 51 s ≈ 13 MB; Story ≈ 1,4 MB).
- `user_tags` falha se o perfil marcado for privado ou o nome estiver errado; nesse caso publique sem a marcação.

### Marcas salvas

`marcas/<nome>/marca.json` guarda a identidade de um perfil (estilo, @, nome, logo, CTA e editorias). Ao fazer vídeo para um perfil salvo, copie desses campos para o roteiro; `marca.logo` é relativo ao JSON do roteiro, então use o caminho até `marcas/<nome>/logo.png`.

- **`seres-hu`** (@seres.hu, Muriel Queiroz, perfil de notícias, curiosidades, coisas anormais e política): use `"estilo": "seres"`. Ele usa fundo claro lilás, manchete dentro de bloco roxo com cantoneiras azuis, etiquetas retas em itálico e cabeçalho com logo + "MURIEL QUEIROZ". Todas as editorias ficam no roxo da marca. Use `"fake": true` na `manchete` para o selo ✕ vermelho de **Fake News** (desmentidos), e no `cta` o `rodape: "SE VOCÊ GOSTOU DO CONTEÚDO"` (mostra os ícones de curtir/comentar/enviar/salvar). A etiqueta do `hook` costuma ser "notícia do dia · DD/MM".

## Regras para vídeos de notícia (obrigatórias)

- **Pesquise antes de escrever**: use a busca na web para encontrar a notícia e confirme os fatos principais em **pelo menos 2 fontes** confiáveis. Nunca escreva notícia "de memória" — o conhecimento do modelo fica desatualizado.
- **Fonte e data na tela** em `manchete` e `fatos`. Se as fontes divergem (datas, números), use o dado confirmado ou diga "segundo X".
- **Nada inventado**: `citacao` só com frase literal publicada por um veículo, com autor correto. Não crie números, declarações ou detalhes para "completar" a história.
- **Boato não é fato**: fofoca de famosos sem confirmação não vira manchete; se for relevante, deixe explícito ("segundo o jornal X, sem confirmação de…").
- **Política com neutralidade**: relate o fato e as posições dos lados envolvidos, sem adjetivos opinativos nem chamadas enganosas; não faça vídeos sobre eleições que possam confundir sobre datas, locais ou regras de votação.
- **Sem imitar veículos reais**: não use nome, logo ou vinheta de emissoras e jornais como se o vídeo fosse deles. A marca é a do perfil da pessoa.
- **Imagens**: use `imagem` só com arquivos que a pessoa forneceu ou tem direito de usar. Sem foto, use `icone` (emoji). Não baixe fotos de famosos da internet.
- Tragédias, mortes e crimes: tom sóbrio, sem selo piscando nem emoji, sem detalhes gráficos, e com a legenda do post respeitosa.
- Entregue junto da legenda do post as URLs das fontes usadas.

## Um vídeo por dia

Para notícias diárias: a cada execução, busque as notícias do dia nas editorias pedidas, escolha 1 principal (ou monte um resumo "3 notícias de hoje" com uma `manchete` por notícia e categorias diferentes) e use as demais no `ticker`.

Para conteúdo educativo, mantenha um arquivo `pautas.md` com a lista de temas e marque os já usados. A cada execução: pegue o próximo tema, escreva o roteiro, renderize, salve em `videos/AAAA-MM-DD/` (mp4, capa, legenda.txt) e marque a pauta. Postar automaticamente exige uma conta Instagram Profissional conectada à API do Meta (Graph API, com token); sem isso, entregue os arquivos prontos para upload manual.
