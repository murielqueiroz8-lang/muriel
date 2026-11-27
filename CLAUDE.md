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
- **Notícias:** pesquise na web (nunca de memória), confirme em pelo menos 2 fontes, mostre fonte e data na tela, não invente citações, política com tom neutro, sem meme em assunto com vítimas (ver `SKILL.md`).
- **Memes:** só os da biblioteca ou originais de emoji; clipes sempre com crédito do criador; não baixar memes por conta própria.
- **Honestidade:** se não conseguiu ouvir/ver/testar algo (áudio, Excel real, celular), diga isso. Não prometa resultado de vendas ou de alcance.
- Antes de entregar um vídeo, extraia 6–8 quadros e confira texto cortado e datas.

## Rotinas automáticas
- Tarefa agendada **"Vídeo diário Seres HU"**: todo dia 6h41 (Brasília) gera o vídeo das 3 notícias do dia e envia para aprovação.
- Tarefa agendada **"Plantão de Stories Seres HU"**: de hora em hora (7h11–21h11) gera 1 card de notícia (modelo `exemplos/story-plantao.json`) e envia para aprovação.
- Publicação: API do Instagram (token no ambiente, host `graph.facebook.com`; upload por `rupload.facebook.com`).

## Pendências conhecidas
- Trocar o token do Instagram (o antigo apareceu em chat).
- Escolher o estilo da trilha: funk (padrão), pop ou trap.
- Testar a planilha em Excel/Google Planilhas antes de vender.
- Mover produtos, memes e vídeos para um repositório **privado** (este é público).
