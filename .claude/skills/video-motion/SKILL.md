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
