# Memória do projeto

> Este repositório é **público**. Nunca coloque aqui dados pessoais, de estágio/empresa, tokens, senhas ou IDs de conta.

## O que existe aqui
- `index.html` + `assets/`: site de portfólio da Muriel Queiroz (não mexer sem ser pedido).
- `.claude/skills/video-motion/`: skill que gera vídeos animados (MP4 vertical, com som) a partir de um roteiro JSON. **Leia o `SKILL.md` dela antes de fazer qualquer vídeo.**
- `.claude/skills/video-motion/marcas/seres-hu/`: identidade do perfil de notícias @seres.hu (logo, cores, trilha, biblioteca de memes em `memes/memes.json`).
- `videos/AAAA-MM-DD/`: vídeo, capa, roteiro e legenda de cada dia.
- `produtos/fluxo-de-caixa-mei/`: planilha Fluxo de Caixa MEI. `gerar.py` recria os .xlsx; rode o `recalc.py` da skill xlsx e confira 0 erros de fórmula.
- Branch de desenvolvimento desta frente: `claude/new-session-qvgt8w`.

## Regras de trabalho
- Responda em **português do Brasil**. Trate por "você", sem presumir gênero.
- **Nunca** escreva token, senha ou chave em arquivo, commit ou chat. Credenciais só via `request_credential`.
- **Instagram @seres.hu:** só publique depois que a Muriel responder **"posta"**. Nunca apague nem edite posts já publicados.
- **Foco editorial: Brasil.** Pelo menos 2 das 3 notícias de cada Reels e a maioria dos Stories são do Brasil (ou com impacto direto nele).
- **Notícias:** pesquise na web (nunca de memória), confirme em pelo menos 2 fontes, mostre fonte e data na tela, não invente citações, política com tom neutro, sem meme em assunto com vítimas (ver `SKILL.md`).
- **Memes:** só os da biblioteca ou originais de emoji; clipes sempre com crédito do criador; não baixar memes por conta própria.
- **Honestidade:** se não conseguiu ouvir/ver/testar algo (áudio, Excel real, celular), diga isso. Não prometa resultado de vendas ou de alcance.
- Antes de entregar um vídeo, extraia 6–8 quadros e confira texto cortado e datas.
- **Narração:** os vídeos do Seres HU saem com voz (sem música). Se o render mostrar "AVISO: não consegui gerar a voz", diga isso à Muriel ao entregar.

## Rotinas automáticas
- Tarefa agendada **"Vídeos diários Seres HU"**: 4 Reels por dia, entregues por volta de 7h, 12h, 18h e 21h (rodam às 6h41, 11h41, 17h41 e 20h41, Brasília), cada um com 3 notícias, enviados para aprovação.
- Tarefa agendada **"Plantão de Stories Seres HU"**: de hora em hora (7h11–21h11) gera 1 card de notícia (modelo `exemplos/story-plantao.json`) e envia para aprovação.
- Publicação: API do Instagram (token no ambiente, host `graph.facebook.com`; upload por `rupload.facebook.com`).

## Pendências conhecidas
- Trocar o token do Instagram (o antigo apareceu em chat).
- Escolher o estilo da trilha: funk (padrão), pop ou trap.
- Testar a planilha em Excel/Google Planilhas antes de vender.
- Mover produtos, memes e vídeos para um repositório **privado** (este é público).
