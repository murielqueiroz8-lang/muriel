#!/usr/bin/env node
/*
 * video-motion — transforma um roteiro JSON em vídeo MP4 animado (sem gravar nada).
 *
 * Uso:
 *   node render.cjs roteiro.json [saida.mp4] [--musica trilha.mp3] [--html-only] [--capa 2.5]
 *
 * Como funciona: monta uma página HTML com animações CSS, pausa todas elas e
 * avança quadro a quadro (30 fps) com o Playwright, tirando uma captura de cada
 * quadro e enviando para o ffmpeg, que gera o MP4 (H.264, pronto para Reels/TikTok).
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// ---------- argumentos ----------
const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const bool = (n) => { const i = args.indexOf(n); if (i < 0) return false; args.splice(i, 1); return true; };
const musica = flag('--musica');
const capaSeg = flag('--capa');
const htmlOnly = bool('--html-only');
const [entrada, saidaArg] = args;
if (!entrada) {
  console.error('Uso: node render.cjs roteiro.json [saida.mp4] [--musica trilha.mp3] [--html-only] [--capa SEG]');
  process.exit(1);
}
const roteiro = JSON.parse(fs.readFileSync(entrada, 'utf8'));
const saida = path.resolve(saidaArg || entrada.replace(/\.json$/i, '') + '.mp4');
const baseDir = path.dirname(path.resolve(entrada));

// ---------- configuração ----------
const FORMATOS = { '9:16': [1080, 1920], '4:5': [1080, 1350], '1:1': [1080, 1080] };
const [W, H] = FORMATOS[roteiro.formato || '9:16'] || FORMATOS['9:16'];
const FPS = roteiro.fps || 30;
const CATEGORIAS = {
  politica: '#e53935', famosos: '#ff4fa3', celebridades: '#ff4fa3', mundo: '#2f80ed', internacional: '#2f80ed',
  games: '#8b5cf6', jogos: '#8b5cf6', filmes: '#f59e0b', cinema: '#f59e0b', series: '#f97316', musica: '#10b981',
  esportes: '#22c55e', tecnologia: '#06b6d4', economia: '#eab308', brasil: '#16a34a', entretenimento: '#ec4899',
};
const normal = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
const corCategoria = (cat) => CATEGORIAS[normal(cat)] || null;
const noticia = roteiro.estilo === 'noticia';
const TEMA_NOTICIA = {
  fundo: '#0b0e14', fundo2: '#1d2a48', texto: '#ffffff', suave: '#a9b4c7', destaque: '#ffd23f',
  acento: corCategoria(roteiro.categoria) || '#ff3b3b', botao: corCategoria(roteiro.categoria) || '#ff3b3b',
};
const tema = Object.assign({
  fundo: '#0f2e28',        // fundo do vídeo
  fundo2: '#1b5e4c',       // cor das manchas de luz no fundo
  texto: '#eef4f0',        // texto principal
  suave: '#b6cbc3',        // texto secundário
  destaque: '#f2c46d',     // palavras entre *asteriscos*
  acento: '#8fd9bd',       // ícones, barras, checks
  cartao: '#f6f4ee',       // fundo das janelas/cartões
  cartaoTexto: '#14231f',
  botao: '#e0522d',        // botão das janelas
  botaoTexto: '#ffffff',
  fonte: 'Inter',
}, noticia ? TEMA_NOTICIA : {}, roteiro.tema || {});
const catCor = (c) => corCategoria(c.categoria || roteiro.categoria) || tema.acento;
const marca = roteiro.marca || {};

const DUR_PADRAO = { hook: 3, texto: 3.2, step: 4.8, stat: 3.6, cta: 3.8, manchete: 4.6, citacao: 5, enquete: 4.4 };
const durDe = (c) => {
  if (c.duracao) return c.duracao;
  const n = (c.itens || []).length;
  if (c.type === 'list') return 1.6 + 0.7 * n + 1;
  if (c.type === 'fatos') return 1.4 + 0.9 * n + 1.4;
  if (c.type === 'manchete') return Math.max(4.6, 2.4 + 0.12 * String(c.texto || '').split(/\s+/).length + (c.sub ? 1 : 0));
  return DUR_PADRAO[c.type] || 3;
};
const fonteHtml = (c, t) => (c.fonte || c.data)
  ? `<div class="fonte" style="${anim('vm-up', t, 0.5)}">${c.fonte ? 'Fonte: ' + esc(c.fonte) : ''}${c.fonte && c.data ? ' · ' : ''}${esc(c.data || '')}</div>` : '';

// ---------- utilitários ----------
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const anim = (nome, t, dur, extra = '') => `animation:${nome} ${dur}s ${extra || 'cubic-bezier(.2,.8,.2,1)'} ${t.toFixed(3)}s both;`;
// *texto* vira destaque
const rich = (s) => esc(s).replace(/\*([^*]+)\*/g, '<em>$1</em>');
// palavras surgindo uma a uma, respeitando *destaques*
function palavras(texto, t0, passo = 0.12) {
  let dentro = false, i = 0;
  return String(texto).split(/\s+/).filter(Boolean).map((w) => {
    const abre = w.startsWith('*'), fecha = w.endsWith('*') && (w.length > 1 || !abre);
    if (abre) dentro = true;
    const limpo = esc(w.replace(/\*/g, ''));
    const html = `<span class="w${dentro ? ' hl' : ''}" style="${anim('vm-word', t0 + i++ * passo, 0.5)}">${limpo}</span>`;
    if (fecha) dentro = false;
    return html;
  }).join(' ');
}
function imagemDataURI(p) {
  if (!p) return null;
  const abs = path.resolve(baseDir, p);
  if (!fs.existsSync(abs)) { console.warn('Imagem não encontrada:', abs); return null; }
  const ext = path.extname(abs).slice(1).toLowerCase().replace('jpg', 'jpeg').replace('svg', 'svg+xml');
  return `data:image/${ext};base64,${fs.readFileSync(abs).toString('base64')}`;
}

// ---------- cenas ----------
const CENAS = {
  hook(c, t) {
    return `${c.etiqueta ? `<div class="pill" style="${anim('vm-pop', t + 0.1, 0.5)}">${esc(c.etiqueta)}</div>` : ''}
      <h1 class="big">${palavras(c.texto, t + 0.25, 0.14)}</h1>
      ${c.sub ? `<p class="sub" style="${anim('vm-up', t + 1.2, 0.6)}">${rich(c.sub)}</p>` : ''}`;
  },
  texto(c, t) {
    return `<h2 class="mid">${palavras(c.texto, t + 0.2, 0.1)}</h2>
      ${c.sub ? `<p class="sub" style="${anim('vm-up', t + 1, 0.6)}">${rich(c.sub)}</p>` : ''}`;
  },
  step(c, t, d) {
    const j = c.janela || {};
    const fimBarra = Math.max(1, d - 2.9);
    return `<div class="pill num" style="${anim('vm-pop', t + 0.1, 0.55)}"><b>${esc(c.numero ?? '')}</b>${esc(c.titulo || '')}</div>
      <div class="win" style="${anim('vm-up', t + 0.45, 0.7)}">
        <div class="win-bar"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i><span>${esc(j.titulo || '')}</span></div>
        <div class="win-body">
          ${j.cabecalho ? `<h3>${esc(j.cabecalho)}</h3>` : ''}
          <div class="win-item" style="${anim('vm-up', t + 0.9, 0.6)}">
            <div class="ico">${esc(j.icone || '✨')}</div>
            <div class="txt"><b>${esc(j.item || '')}</b>${j.sub ? `<small>${esc(j.sub)}</small>` : ''}</div>
            ${j.botao ? `<span class="press" style="animation:vm-press .35s ease ${(t + 1.95).toFixed(3)}s both"><button>${esc(j.botao)}</button></span>
            <svg class="cursor" viewBox="0 0 24 24" style="animation:vm-cursor .9s cubic-bezier(.3,.7,.2,1) ${(t + 1.1).toFixed(3)}s both, vm-fade .3s ease ${(t + 3.2).toFixed(3)}s forwards"><path d="M4 2l16 9-7 2-3 7z" fill="#111" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>` : ''}
          </div>
          <div class="bar"><div class="fill" style="animation:vm-fill ${fimBarra.toFixed(2)}s cubic-bezier(.4,0,.2,1) ${(t + 2.1).toFixed(3)}s both"></div></div>
          ${j.concluido !== false ? `<div class="done" style="${anim('vm-pop', t + 2.1 + fimBarra, 0.5)}">✓ ${esc(j.concluido || 'pronto')}</div>` : ''}
        </div>
      </div>`;
  },
  list(c, t) {
    return `<h2 class="mid left" style="${anim('vm-up', t + 0.15, 0.6)}">${rich(c.titulo || '')}</h2>
      <ul class="list">${(c.itens || []).map((it, i) => `<li style="${anim('vm-left', t + 0.8 + i * 0.7, 0.55)}"><span class="chk" style="${anim('vm-pop', t + 1.05 + i * 0.7, 0.45)}">✓</span><span>${rich(it)}</span></li>`).join('')}</ul>`;
  },
  stat(c, t) {
    const dec = c.decimais ?? (String(c.valor).includes('.') ? 1 : 0);
    return `${c.antes ? `<p class="sub" style="${anim('vm-up', t + 0.1, 0.5)}">${rich(c.antes)}</p>` : ''}
      <div class="stat" style="${anim('vm-pop', t + 0.25, 0.6)}"><span data-count data-from="${+c.de || 0}" data-to="${+c.valor || 0}" data-start="${(t + 0.35) * 1000}" data-dur="1600" data-dec="${dec}" data-pre="${esc(c.prefixo || '')}" data-suf="${esc(c.sufixo || '')}"></span></div>
      <p class="mid small" style="${anim('vm-up', t + 1.1, 0.6)}">${rich(c.texto || '')}</p>`;
  },
  cta(c, t) {
    const logo = imagemDataURI(marca.logo);
    const inicial = esc((marca.nome || marca.handle || '?').replace('@', '').charAt(0).toUpperCase());
    return `<div class="avatar" style="${anim('vm-pop', t + 0.1, 0.6)}">${logo ? `<img src="${logo}">` : inicial}</div>
      ${marca.handle ? `<div class="handle" style="${anim('vm-up', t + 0.45, 0.5)}">${esc(marca.handle)}</div>` : ''}
      <h2 class="mid">${palavras(c.texto || 'Me segue para mais', t + 0.7, 0.1)}</h2>
      <span style="${anim('vm-pop', t + 1.5, 0.5)}"><button class="follow" style="animation:vm-pulse 1.3s ease-in-out ${(t + 2).toFixed(3)}s infinite">${esc(c.botao || 'Seguir')}</button></span>
      ${c.sub ? `<p class="sub" style="${anim('vm-up', t + 1.9, 0.5)}">${rich(c.sub)}</p>` : ''}`;
  },

  // ---------- modo notícia ----------
  manchete(c, t, d) {
    const cor = catCor(c), img = imagemDataURI(c.imagem);
    const visual = img
      ? `<div class="foto" style="${anim('vm-up', t + 0.05, 0.6)}"><img src="${img}" style="animation:vm-zoom ${d.toFixed(2)}s linear ${t.toFixed(3)}s both"></div>`
      : c.icone ? `<div class="emoji" style="${anim('vm-pop', t + 0.05, 0.6)}">${esc(c.icone)}</div>` : '';
    const tags = (c.urgente ? `<span class="tag urg"><i style="animation:vm-blink .9s steps(2,jump-none) ${t.toFixed(3)}s infinite"></i>${esc(c.urgente === true ? 'URGENTE' : c.urgente)}</span>` : '')
      + (c.categoria || roteiro.categoria ? `<span class="tag" style="background:${cor}">${esc(c.categoria || roteiro.categoria)}</span>` : '');
    const nPal = String(c.texto || '').split(/\s+/).length;
    return `${visual}
      ${tags ? `<div class="tags" style="${anim('vm-pop', t + 0.25, 0.5)}">${tags}</div>` : ''}
      <h1 class="news">${palavras(c.texto, t + 0.45, 0.09)}</h1>
      ${c.sub ? `<p class="sub" style="${anim('vm-up', t + 0.7 + nPal * 0.09, 0.6)}">${rich(c.sub)}</p>` : ''}
      ${fonteHtml(c, t + 1 + nPal * 0.09)}`;
  },
  fatos(c, t) {
    const cor = catCor(c), itens = c.itens || [];
    return `${c.titulo ? `<h2 class="mid" style="${anim('vm-up', t + 0.15, 0.6)}">${rich(c.titulo)}</h2>` : ''}
      <div class="fatos-list">${itens.map((it, i) => {
        const o = typeof it === 'string' ? { texto: it } : it;
        return `<div class="fato" style="${anim('vm-left', t + 0.7 + i * 0.9, 0.55)}border-left-color:${cor}"><span class="fi">${esc(o.icone || '▸')}</span><span>${rich(o.texto)}</span></div>`;
      }).join('')}</div>
      ${fonteHtml(c, t + 0.9 + itens.length * 0.9)}`;
  },
  citacao(c, t) {
    const cor = catCor(c), img = imagemDataURI(c.imagem);
    return `<div class="aspas" style="${anim('vm-pop', t + 0.1, 0.5)}color:${cor}">“</div>
      <blockquote class="quote">${palavras(c.texto, t + 0.3, 0.07)}</blockquote>
      <div class="autor" style="${anim('vm-up', t + 1.3, 0.5)}">${img ? `<img src="${img}">` : `<span class="barra" style="background:${cor}"></span>`}<div><b>${esc(c.autor || '')}</b>${c.cargo ? `<small>${esc(c.cargo)}</small>` : ''}</div></div>
      ${fonteHtml(c, t + 1.6)}`;
  },
  enquete(c, t) {
    const cor = catCor(c);
    return `<h2 class="mid">${palavras(c.pergunta || 'E você, o que acha?', t + 0.2, 0.09)}</h2>
      <div class="opcoes">${(c.opcoes || []).slice(0, 3).map((o, i) => `<div class="opcao" style="${anim('vm-pop', t + 1.1 + i * 0.35, 0.5)}"><b style="background:${cor}">${String.fromCharCode(65 + i)}</b><span>${rich(o)}</span></div>`).join('')}</div>
      <p class="sub" style="${anim('vm-up', t + 2.2, 0.5)}">${rich(c.sub || 'Comenta aqui embaixo 👇')}</p>`;
  },
};

// ---------- linha do tempo ----------
let t = 0;
const cenas = (roteiro.cenas || []).map((c, i, arr) => {
  const d = durDe(c);
  const gerar = CENAS[c.type];
  if (!gerar) throw new Error(`Tipo de cena desconhecido: "${c.type}" (use: ${Object.keys(CENAS).join(', ')})`);
  const ultima = i === arr.length - 1;
  const html = `<section class="scene" style="animation:vm-in .45s cubic-bezier(.2,.8,.2,1) ${t.toFixed(3)}s both${ultima ? '' : `, vm-out .4s ease-in ${(t + d - 0.4).toFixed(3)}s forwards`}">
    <div class="content ${c.type}">${gerar(c, t, d)}</div>
    ${c.legenda ? `<div class="caption" style="${anim('vm-up', t + 0.3, 0.4)}">${rich(c.legenda)}</div>` : ''}
  </section>`;
  const inicio = t; t += d;
  return { html, inicio, d };
});
const TOTAL = t;
const quadros = Math.round(TOTAL * FPS);
const seguro = H >= 1900 ? [220, 380] : H >= 1300 ? [120, 160] : [80, 100];
const tickerTxt = roteiro.ticker ? (Array.isArray(roteiro.ticker) ? roteiro.ticker : [roteiro.ticker]) : null;
const TK_H = 76, tkBottom = Math.round(seguro[1] * 0.78);
const padBaixo = tickerTxt ? tkBottom + TK_H + 40 : seguro[1];
const legBaixo = tickerTxt ? tkBottom + TK_H + 16 : Math.round(seguro[1] * 0.55);
const tickerHtml = tickerTxt ? (() => {
  const seg = tickerTxt.map((x) => `<span>${esc(x)}</span><span class="dot">•</span>`).join('');
  const chars = tickerTxt.join(' ').length;
  return `<div class="ticker"><span class="tk-label">${esc(roteiro.tickerRotulo || 'AGORA')}</span><div class="tk-track"><div class="tk-move" style="animation:vm-ticker ${Math.max(10, chars * 0.16 * 2).toFixed(1)}s linear 0s infinite">${seg.repeat(2)}${seg.repeat(2)}</div></div></div>`;
})() : '';

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
:root{--fundo:${tema.fundo};--fundo2:${tema.fundo2};--texto:${tema.texto};--suave:${tema.suave};--destaque:${tema.destaque};--acento:${tema.acento};--cartao:${tema.cartao};--cartaoTexto:${tema.cartaoTexto};--botao:${tema.botao};--botaoTexto:${tema.botaoTexto}}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:var(--fundo);color:var(--texto);font-family:'${tema.fonte}','Inter','Noto Color Emoji',sans-serif;-webkit-font-smoothing:antialiased}
.bg{position:absolute;inset:0;overflow:hidden}
.blob{position:absolute;width:900px;height:900px;border-radius:50%;background:radial-gradient(circle,var(--fundo2) 0%,transparent 65%);opacity:.55}
.b1{left:-300px;top:-200px;animation:vm-drift1 ${TOTAL}s ease-in-out 0s both}
.b2{right:-350px;bottom:-250px;animation:vm-drift2 ${TOTAL}s ease-in-out 0s both}
.grain{position:absolute;inset:0;background-image:radial-gradient(rgba(255,255,255,.05) 1px,transparent 1px);background-size:6px 6px}
.progress{position:absolute;left:40px;right:40px;top:${Math.round(seguro[0] * 0.35)}px;height:8px;border-radius:8px;background:rgba(255,255,255,.15);overflow:hidden;z-index:5}
.progress>div{height:100%;background:var(--acento);animation:vm-fill ${TOTAL}s linear 0s both}
.brand{position:absolute;top:${Math.round(seguro[0] * 0.35) + 30}px;left:40px;font-weight:700;font-size:30px;color:var(--suave);z-index:5;letter-spacing:.02em}
.scene{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:${seguro[0]}px 72px ${padBaixo}px}
.content{width:100%;display:flex;flex-direction:column;align-items:center;gap:44px;text-align:center}
.big{font-size:${H >= 1900 ? 112 : 96}px;line-height:1.05;font-weight:900;letter-spacing:-.03em}
.mid{font-size:76px;line-height:1.1;font-weight:800;letter-spacing:-.02em}
.mid.small{font-size:58px;font-weight:700}
.mid.left{text-align:left;align-self:stretch}
.sub{font-size:42px;line-height:1.3;color:var(--suave);font-weight:500}
em,.hl{font-style:normal;color:var(--destaque)}
.w{display:inline-block}
.pill{display:inline-flex;align-items:center;gap:20px;background:#fff;color:#14231f;font-weight:800;font-size:44px;padding:16px 36px 16px 16px;border-radius:999px;box-shadow:0 10px 30px rgba(0,0,0,.3)}
.pill:not(.num){padding:16px 36px}
.pill b{display:grid;place-items:center;width:70px;height:70px;border-radius:50%;background:var(--botao);color:#fff;font-size:38px}
.win{width:100%;background:var(--cartao);color:var(--cartaoTexto);border-radius:28px;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.45);text-align:left}
.win-bar{display:flex;align-items:center;gap:12px;padding:22px 28px;border-bottom:2px solid rgba(0,0,0,.08);font-size:28px;font-weight:600;color:#6b6b6b}
.win-bar i{width:20px;height:20px;border-radius:50%;display:block}
.win-bar span{margin-left:14px}
.win-body{padding:40px 40px 48px;display:flex;flex-direction:column;gap:32px}
.win-body h3{font-size:50px;font-weight:800}
.win-item{position:relative;display:flex;align-items:center;gap:26px;border:3px solid var(--botao);border-radius:22px;padding:26px}
.ico{width:88px;height:88px;flex:none;border-radius:20px;background:var(--botao);display:grid;place-items:center;font-size:46px}
.txt{flex:1;min-width:0;display:flex;flex-direction:column;gap:8px}
.txt b{font-family:'JetBrains Mono',monospace;font-size:36px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.txt small{font-size:28px;color:#666}
.press{display:inline-block;flex:none}
button{font:inherit;border:0;background:var(--botao);color:var(--botaoTexto);font-weight:800;font-size:32px;padding:16px 28px;border-radius:14px}
.cursor{position:absolute;right:40px;bottom:-14px;width:64px;height:64px;z-index:3}
.bar{height:16px;border-radius:16px;background:rgba(0,0,0,.08);overflow:hidden}
.fill{height:100%;background:#22a94f;border-radius:16px}
.done{align-self:flex-start;font-size:34px;font-weight:800;color:#1b7a3e;background:#dcf3e3;padding:10px 24px;border-radius:999px}
.list{list-style:none;align-self:stretch;display:flex;flex-direction:column;gap:30px;text-align:left}
.list li{display:flex;align-items:center;gap:28px;font-size:50px;font-weight:700;line-height:1.15;background:rgba(255,255,255,.07);border:2px solid rgba(255,255,255,.1);padding:28px 32px;border-radius:24px}
.chk{flex:none;width:64px;height:64px;border-radius:50%;background:var(--acento);color:var(--fundo);display:grid;place-items:center;font-size:38px;font-weight:900}
.stat{font-size:250px;font-weight:900;letter-spacing:-.05em;line-height:1;color:var(--destaque);font-variant-numeric:tabular-nums}
.avatar{width:240px;height:240px;border-radius:50%;border:8px solid var(--acento);background:var(--fundo2);display:grid;place-items:center;font-size:110px;font-weight:900;overflow:hidden}
.avatar img{width:100%;height:100%;object-fit:cover}
.handle{font-size:46px;font-weight:700;color:var(--suave)}
.follow{font-size:46px;padding:24px 72px;border-radius:999px;background:var(--acento);color:var(--fundo)}
.caption{position:absolute;left:60px;right:60px;bottom:${legBaixo}px;text-align:center;font-size:40px;font-weight:700;line-height:1.3}
.caption{background:rgba(0,0,0,.55);padding:18px 28px;border-radius:18px}
.content.manchete,.content.fatos,.content.citacao{align-items:flex-start;text-align:left;gap:36px}
.content.fatos .mid,.content.citacao .mid{text-align:left}
.foto{width:100%;aspect-ratio:16/10;border-radius:28px;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.5)}
.foto img{width:100%;height:100%;object-fit:cover;transform-origin:50% 40%}
.emoji{font-size:180px;line-height:1}
.tags{display:flex;gap:16px;flex-wrap:wrap}
.tag{display:inline-flex;align-items:center;gap:14px;font-size:34px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;padding:12px 26px;border-radius:12px;color:#fff;background:var(--acento)}
.tag.urg{background:#d50000}
.tag.urg i{width:18px;height:18px;border-radius:50%;background:#fff;display:block}
.news{font-size:${H >= 1900 ? 88 : 76}px;line-height:1.08;font-weight:900;letter-spacing:-.025em}
.fonte{font-size:30px;font-weight:600;color:var(--suave);padding-top:6px;border-top:2px solid rgba(255,255,255,.15)}
.fatos-list{align-self:stretch;display:flex;flex-direction:column;gap:26px}
.fato{display:flex;align-items:flex-start;gap:24px;font-size:46px;font-weight:700;line-height:1.2;background:rgba(255,255,255,.07);border-left:12px solid var(--acento);padding:28px 30px;border-radius:10px 22px 22px 10px}
.fi{flex:none;font-size:46px;line-height:1.2}
.aspas{font-size:260px;line-height:.6;font-weight:900;height:130px;font-family:Georgia,serif}
.quote{font-size:68px;line-height:1.18;font-weight:800;letter-spacing:-.015em}
.autor{display:flex;align-items:center;gap:24px}
.autor img{width:110px;height:110px;border-radius:50%;object-fit:cover}
.autor .barra{width:12px;height:90px;border-radius:6px}
.autor b{display:block;font-size:42px}
.autor small{display:block;font-size:32px;color:var(--suave);margin-top:4px}
.opcoes{align-self:stretch;display:flex;flex-direction:column;gap:24px}
.opcao{display:flex;align-items:center;gap:26px;font-size:48px;font-weight:700;text-align:left;background:rgba(255,255,255,.08);border:2px solid rgba(255,255,255,.14);padding:22px 28px;border-radius:24px}
.opcao b{flex:none;width:76px;height:76px;border-radius:18px;display:grid;place-items:center;color:#fff;font-size:42px}
.ticker{position:absolute;left:0;right:0;bottom:${tkBottom}px;height:${TK_H}px;display:flex;align-items:stretch;background:rgba(255,255,255,.96);color:#0b0e14;z-index:6;font-size:34px;font-weight:700}
.tk-label{flex:none;display:flex;align-items:center;padding:0 28px;background:var(--botao);color:#fff;font-weight:900;letter-spacing:.08em}
.tk-track{flex:1;overflow:hidden;display:flex;align-items:center}
.tk-move{display:flex;white-space:nowrap;gap:28px;padding-left:28px}
.tk-move .dot{color:var(--botao)}
@keyframes vm-zoom{from{transform:scale(1.18)}to{transform:scale(1)}}
@keyframes vm-blink{0%{opacity:1}100%{opacity:.15}}
@keyframes vm-ticker{from{transform:translateX(0)}to{transform:translateX(-50%)}}
@keyframes vm-in{from{opacity:0;transform:translateY(40px) scale(.98)}to{opacity:1;transform:none}}
@keyframes vm-out{to{opacity:0;transform:translateY(-40px) scale(.98)}}
@keyframes vm-fade{to{opacity:0}}
@keyframes vm-pop{0%{opacity:0;transform:scale(.6)}70%{opacity:1;transform:scale(1.06)}100%{opacity:1;transform:scale(1)}}
@keyframes vm-up{from{opacity:0;transform:translateY(60px)}to{opacity:1;transform:none}}
@keyframes vm-left{from{opacity:0;transform:translateX(-80px)}to{opacity:1;transform:none}}
@keyframes vm-word{from{opacity:0;transform:translateY(34px);filter:blur(10px)}to{opacity:1;transform:none;filter:none}}
@keyframes vm-fill{from{width:0}to{width:100%}}
@keyframes vm-press{0%,100%{transform:scale(1)}50%{transform:scale(.88)}}
@keyframes vm-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.07)}}
@keyframes vm-cursor{from{opacity:0;transform:translate(260px,320px)}25%{opacity:1}to{opacity:1;transform:translate(0,0)}}
@keyframes vm-drift1{from{transform:translate(0,0)}to{transform:translate(380px,${Math.round(H * 0.35)}px)}}
@keyframes vm-drift2{from{transform:translate(0,0)}to{transform:translate(-320px,-${Math.round(H * 0.3)}px)}}
</style></head><body>
<div class="bg"><div class="blob b1"></div><div class="blob b2"></div><div class="grain"></div></div>
${roteiro.barraProgresso === false ? '' : '<div class="progress"><div></div></div>'}
${tickerHtml}
${marca.handle && roteiro.mostrarMarca !== false ? `<div class="brand">${esc(marca.handle)}</div>` : ''}
${cenas.map((c) => c.html).join('\n')}
<script>
const ease = (x) => 1 - Math.pow(1 - x, 3);
window.__seek = (ms) => {
  for (const a of document.getAnimations()) { a.pause(); a.currentTime = ms; }
  for (const el of document.querySelectorAll('[data-count]')) {
    const p = Math.min(1, Math.max(0, (ms - +el.dataset.start) / +el.dataset.dur));
    const v = +el.dataset.from + (+el.dataset.to - +el.dataset.from) * ease(p);
    const dec = +el.dataset.dec;
    el.textContent = el.dataset.pre + v.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + el.dataset.suf;
  }
};
</script></body></html>`;

// ---------- renderização ----------
(async () => {
  const htmlPath = saida.replace(/\.mp4$/i, '') + '.html';
  fs.writeFileSync(htmlPath, html);
  console.log(`Roteiro: ${cenas.length} cenas, ${TOTAL.toFixed(1)}s, ${W}x${H} @ ${FPS}fps`);
  if (htmlOnly) { console.log('HTML gerado:', htmlPath); return; }

  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.goto('file://' + htmlPath);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.__seek(0));

  const ffArgs = ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-'];
  if (musica) ffArgs.push('-i', path.resolve(musica));
  ffArgs.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS));
  if (musica) ffArgs.push('-c:a', 'aac', '-b:a', '192k', '-af', `afade=t=out:st=${Math.max(0, TOTAL - 1.5).toFixed(2)}:d=1.5`, '-shortest');
  ffArgs.push('-movflags', '+faststart', saida);
  const ff = spawn('ffmpeg', ffArgs, { stdio: ['pipe', 'inherit', 'inherit'] });
  const fim = new Promise((ok, erro) => ff.on('close', (code) => (code === 0 ? ok() : erro(new Error('ffmpeg saiu com código ' + code)))));

  for (let f = 0; f < quadros; f++) {
    await page.evaluate((ms) => window.__seek(ms), (f / FPS) * 1000);
    const buf = await page.screenshot({ type: 'jpeg', quality: 94 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (f % FPS === 0) process.stdout.write(`\rRenderizando ${Math.round((f / quadros) * 100)}%`);
  }
  ff.stdin.end();

  // capa (thumbnail): por padrão, o fim da primeira cena
  const tCapa = capaSeg != null ? +capaSeg : Math.max(0.5, (cenas[0]?.d || 1) - 0.6);
  await page.evaluate((ms) => window.__seek(ms), tCapa * 1000);
  const capa = saida.replace(/\.mp4$/i, '') + '-capa.jpg';
  await page.screenshot({ path: capa, type: 'jpeg', quality: 92 });

  await browser.close();
  await fim;
  process.stdout.write('\rRenderizando 100%\n');
  console.log('Vídeo:', saida);
  console.log('Capa: ', capa);
})().catch((e) => { console.error(e); process.exit(1); });
