---
name: video-motion
description: Cria vídeos animados curtos (Reels, TikTok, Shorts, Stories) sem gravar nada — texto animado, janelas de sistema simuladas, listas, números e chamada para seguir — e entrega um MP4 pronto para postar, mais a capa. Use quando a pessoa pedir um vídeo, reel, post em vídeo, vídeo animado, motion, conteúdo diário em vídeo ou "um vídeo por dia" sobre qualquer tema.
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

Veja `exemplos/fechamento-do-mes.json` para um roteiro completo.

## Regras de roteiro (o que faz o vídeo reter)

- **Total de 15 a 30 s.** 4 a 7 cenas.
- **Comece com `hook`**: promessa concreta ou pergunta, até 9 palavras, com 1–3 palavras em `*destaque*`.
- **Termine com `cta`.**
- Textos curtos: `hook` ≤ 9 palavras, `item` da janela ≤ 24 caracteres (é monoespaçado e corta com "…"), itens de lista ≤ 32 caracteres, no máximo 4 itens.
- Números em `stat` devem ser reais ou claramente ilustrativos — não invente dados apresentados como fatos sobre terceiros.
- Escreva no idioma e no tom do perfil da pessoa; português do Brasil por padrão.

## Um vídeo por dia

Para produção recorrente, mantenha um arquivo `pautas.md` com a lista de temas e marque os já usados. A cada execução: pegue o próximo tema, escreva o roteiro, renderize, salve em `videos/AAAA-MM-DD/` (mp4, capa, legenda.txt) e marque a pauta. Postar automaticamente exige uma conta Instagram Profissional conectada à API do Meta (Graph API, com token); sem isso, entregue os arquivos prontos para upload manual.
