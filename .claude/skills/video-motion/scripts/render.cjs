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
const { spawn, spawnSync } = require('child_process');

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
const seres = roteiro.estilo === 'seres';           // estilo do perfil @seres.hu (roxo + azul, fundo claro)
const noticia = roteiro.estilo === 'noticia' || seres;
const TEMA_SERES = {
  fundo: '#f3f0fb', fundo2: '#cfc2ff', texto: '#170f2e', suave: '#5d5675', destaque: '#6a2cf5',
  acento: '#6a2cf5', azul: '#4f6ef7', cartao: '#ffffff', cartaoTexto: '#170f2e', botao: '#6a2cf5', botaoTexto: '#ffffff',
};
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
}, noticia ? TEMA_NOTICIA : {}, seres ? TEMA_SERES : {}, roteiro.tema || {});
// no estilo seres todas as editorias usam o roxo da marca (como nos posts do perfil)
const catCor = (c) => c.cor || (seres ? tema.acento : corCategoria(c.categoria || roteiro.categoria) || tema.acento);
const marca = roteiro.marca || {};
// narração: voz neural pt-BR lendo o texto das cenas (padrão ligado no estilo "seres"; "voz": false desliga)
const comVoz = (roteiro.voz ?? (roteiro.estilo === 'seres')) && roteiro.som !== false;

const DUR_PADRAO = { hook: 3, texto: 3.2, step: 4.8, stat: 3.6, cta: 4.2, manchete: 4.6, citacao: 5, enquete: 4.4, vinheta: 1.8, meme: 2.8, clipe: 4, capitulo: 1.4, local: 3.4, curiosidade: 5.2 };
const durBase = (c) => {
  if (c.duracao) return c.duracao;
  const n = (c.itens || []).length;
  if (c.type === 'list') return 1.6 + 0.7 * n + 1;
  if (c.type === 'fatos') return 1.4 + 0.9 * n + 1.4;
  if (c.type === 'grafico') return 1.6 + 0.6 * (c.itens || []).length + 2.4;
  if (c.type === 'pov') return 1.4 + 0.9 * (c.reacoes || []).length + 0.9;
  if (c.type === 'manchete') return Math.max(4.6, 2.4 + 0.12 * String(c.texto || '').split(/\s+/).length + (c.sub ? 1 : 0));
  return DUR_PADRAO[c.type] || 3;
};
const durDe = (c) => { const b = durBase(c); return c._vtot ? Math.max(b, c._vtot + 0.8) : b; };
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
    const tw = t0 + i++ * passo;
    const html = `<span class="w${dentro ? ' hl' : ''}" style="${anim('vm-word', tw, 0.5)}${dentro ? `--d:${(tw + 0.35).toFixed(3)}s` : ''}">${limpo}</span>`;
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

// ---------- efeitos sonoros (marcados no tempo; o áudio é sintetizado no final) ----------
const SFX = [];
const som = (tipo, tt) => { SFX.push([tipo, tt]); return ''; };

// ---------- globo (identidade "mundo/notícias") ----------
const AZUL = tema.azul || tema.destaque;
function globoSVG(cls, cor, periodo = 8, estilo = '') {
  const lat = [-60, -30, 0, 30, 60].map((y) => { const r = Math.sqrt(90 * 90 - y * y); return `<ellipse cx="100" cy="${100 + y}" rx="${r.toFixed(1)}" ry="${(r * 0.14).toFixed(1)}"/>`; }).join('');
  const mer = [0, 1, 2, 3, 4, 5].map((k) => `<ellipse class="meri" cx="100" cy="100" rx="90" ry="90" style="animation:vm-meri ${periodo}s ease-in-out ${(-k * periodo / 6).toFixed(2)}s infinite"/>`).join('');
  return `<svg class="${cls}" style="${estilo}" viewBox="-20 -20 240 240" fill="none" stroke="${cor}" stroke-width="1.8"><circle cx="100" cy="100" r="90"/>${lat}${mer}<ellipse cx="100" cy="100" rx="118" ry="30" stroke-width="4" transform="rotate(-14 100 100)"/></svg>`;
}
let semente = 7;
const rnd = () => ((semente = (semente * 16807) % 2147483647) / 2147483647);
const ESTRELA = '<svg viewBox="0 0 24 24"><path d="M12 0c.8 6.4 5.6 11.2 12 12-6.4.8-11.2 5.6-12 12-.8-6.4-5.6-11.2-12-12C6.4 11.2 11.2 6.4 12 0z" fill="currentColor"/></svg>';

// ---------- cenas ----------
const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICONES = [
  svg('<path d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z" fill="currentColor"/>'),
  svg('<path d="M21 12a8.5 8.5 0 0 1-12.6 7.4L3 21l1.6-5.2A8.5 8.5 0 1 1 21 12z"/>'),
  svg('<path d="M22 3 11 13M22 3l-7 19-4-9-9-4z"/>'),
  svg('<path d="M6 3h12v18l-6-4.5L6 21z"/>'),
];
const KEYFRAMES_EXTRA = [];
const CLIPES = [];      // vídeos de meme usados (frames extraídos antes do render)
const MUDO = [];        // trechos em que a trilha some para o áudio do clipe tocar
let uidGraf = 0;
const CENAS = {
  hook(c, t) {
    som('pop', t + 0.1); if (c.sub) som('tick', t + 1.2);
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
    som('pop', t + 0.15); som('pop', t + 1.55);
    const logo = imagemDataURI(marca.logo);
    const inicial = esc((marca.nome || marca.handle || '?').replace('@', '').charAt(0).toUpperCase());
    return `<div class="avatar" style="${anim('vm-pop', t + 0.1, 0.6)}">${logo ? `<img src="${logo}">` : inicial}</div>
      ${marca.handle ? `<div class="handle" style="${anim('vm-up', t + 0.45, 0.5)}">${esc(marca.handle)}</div>` : ''}
      <h2 class="mid">${palavras(c.texto || 'Me segue para mais', t + 0.7, 0.1)}</h2>
      <span style="${anim('vm-pop', t + 1.5, 0.5)}"><button class="follow" style="animation:vm-pulse 1.3s ease-in-out ${(t + 2).toFixed(3)}s infinite">${esc(c.botao || 'Seguir')}</button></span>
      ${c.sub ? `<p class="sub" style="${anim('vm-up', t + 1.9, 0.5)}">${rich(c.sub)}</p>` : ''}
      ${c.rodape ? `<div class="rodape"><span style="${anim('vm-up', t + 2.1, 0.5)}">${esc(c.rodape)}</span><div class="icons">${ICONES.map((ic, i) => `<span style="${anim('vm-pop', t + 2.4 + i * 0.18, 0.45)}">${ic}</span>`).join('')}</div></div>` : ''}`;
  },

  // ---------- meme (humor) ----------
  meme(c, t) {
    const img = imagemDataURI(c.imagem);
    som('whoosh', t - 0.05); som(c.som || 'hit', t + 0.18);
    const txt = (v, cls) => v ? `<div class="m-txt ${cls}" style="${anim('vm-pop', t + 0.35 + (cls === 'base' ? 0.3 : 0), 0.4)}">${esc(v)}</div>` : '';
    return `<div class="meme-card" style="animation:vm-slam .5s cubic-bezier(.2,1.3,.3,1) ${(t + 0.03).toFixed(3)}s both, vm-shake .6s ease-in-out ${(t + 0.7).toFixed(3)}s 3">
      ${img ? `<img src="${img}">` : `<div class="m-emoji" style="animation:vm-bob 1.6s ease-in-out ${t.toFixed(3)}s infinite">${esc(c.emoji || '😂')}</div>`}
      ${txt(c.topo, 'top')}${txt(c.base, 'base')}
    </div>
    ${c.credito ? `<div class="fonte" style="${anim('vm-up', t + 0.8, 0.4)}">Imagem: ${esc(c.credito)}</div>` : ''}`;
  },

  // ---------- clipe de meme (vídeo do usuário, com o áudio original) ----------
  clipe(c, t, d) {
    const arq = path.resolve(baseDir, c.arquivo || '');
    if (!fs.existsSync(arq)) throw new Error('Clipe não encontrado: ' + arq);
    const k = CLIPES.length, ss = +c.inicio || 0;
    CLIPES.push({ k, arquivo: arq, ss, dur: d, ini: t, audio: c.audio !== false, vol: c.volume ?? 0.85 });
    if (c.audio !== false) MUDO.push([t - 0.05, t + d + 0.1]);
    som('whoosh', t - 0.05);
    const txt = (v, cls) => v ? `<div class="m-txt ${cls}" style="font-size:64px;${anim('vm-pop', t + 0.3, 0.4)}">${esc(v)}</div>` : '';
    return `<div class="clipe-card" style="animation:vm-slam .45s cubic-bezier(.2,1.3,.3,1) ${(t + 0.03).toFixed(3)}s both">
        <img class="clipe-bg" data-clipe="${k}"><img class="clipe-img" data-clipe="${k}">
        ${txt(c.topo, 'top')}${txt(c.base, 'base')}
      </div>
      ${c.credito ? `<div class="fonte" style="${anim('vm-up', t + 0.5, 0.4)}">🎥 ${esc(c.credito)}</div>` : ''}`;
  },

  // ---------- formatos de meme: gráfico de pizza e POV ----------
  grafico(c, t) {
    const itens = c.itens || [], id = uidGraf++;
    const cores = ['#22c55e', '#facc15', '#ef4444', AZUL, '#f97316'];
    const total = itens.reduce((a, x) => a + (+x.valor || 0), 0) || 1;
    let acc = 0;
    const fatias = itens.map((x, i) => {
      const v = ((+x.valor || 0) / total) * 100, ini = acc; acc += v;
      const nome = `vm-fatia-${id}-${i}`, ts = t + 0.7 + i * 0.6;
      KEYFRAMES_EXTRA.push(`@keyframes ${nome}{from{stroke-dasharray:0 100}to{stroke-dasharray:${v.toFixed(2)} 100}}`);
      som('pop', ts);
      return { cor: x.cor || cores[i % cores.length], v, ini, nome, ts, texto: x.texto };
    });
    const fim = t + 0.7 + itens.length * 0.6 + 0.3;
    if (c.emoji) som(c.som || 'boing', fim);
    return `<h2 class="mid left" style="${anim('vm-up', t + 0.1, 0.5)}">${rich(c.titulo || 'Coisas que mais falei essa semana')}</h2>
      <ul class="graf-leg">${fatias.map((f) => `<li style="${anim('vm-left', f.ts, 0.4)}"><i style="background:${f.cor}"></i>${esc(f.texto)}</li>`).join('')}</ul>
      <div class="graf-pizza" style="${anim('vm-pop', t + 0.4, 0.5)}"><svg viewBox="0 0 100 100">${fatias.map((f) => `<circle cx="50" cy="50" r="25" pathLength="100" fill="none" stroke="${f.cor}" stroke-width="50" stroke-dasharray="${f.v.toFixed(2)} 100" stroke-dashoffset="${(-f.ini).toFixed(2)}" transform="rotate(-90 50 50)" style="animation:${f.nome} .5s ease-out ${f.ts.toFixed(3)}s both"/>`).join('')}</svg>
        ${c.emoji ? `<div class="graf-emoji" style="animation:vm-slam .5s cubic-bezier(.2,1.3,.3,1) ${fim.toFixed(3)}s both">${esc(c.emoji)}</div>` : ''}</div>
      ${c.destaque ? `<div class="pill" style="${anim('vm-pop', fim + 0.4, 0.5)}">${esc(c.destaque)}</div>` : ''}`;
  },
  pov(c, t) {
    const r = c.reacoes || ['😳'], dt = 0.9, t0 = t + 0.7;
    r.forEach((_, i) => som(i === r.length - 1 ? 'hit' : 'pop', t0 + i * dt));
    const caras = r.map((e, i) => { const ini = t0 + i * dt, ultimo = i === r.length - 1;
      return `<div class="pov-emoji" style="animation:vm-slam .4s cubic-bezier(.2,1.3,.3,1) ${ini.toFixed(3)}s both${ultimo ? '' : `, vm-fade .12s ease ${(ini + dt - 0.12).toFixed(3)}s forwards`}">${esc(e)}</div>`; }).join('');
    return `<div class="meme-card" style="animation:vm-slam .5s cubic-bezier(.2,1.3,.3,1) ${(t + 0.03).toFixed(3)}s both">
      <div class="m-txt top" style="${anim('vm-pop', t + 0.2, 0.4)}">${esc(c.texto || 'POV:')}</div>
      ${caras}
      ${c.base ? `<div class="m-txt base" style="${anim('vm-pop', t0 + (r.length - 1) * dt + 0.2, 0.4)}">${esc(c.base)}</div>` : ''}
    </div>`;
  },

  // ---------- cenas criativas ----------
  vinheta(c, t) {
    const logo = imagemDataURI(c.logo || marca.logo);
    som('riser', t); som('hit', t + 0.5);
    return `<div class="vinheta">
        ${globoSVG('vg', AZUL, 3, anim('vm-pop', t, 0.7))}
        <span class="ring grande" style="animation:vm-ring 1s ease-out ${(t + 0.5).toFixed(3)}s both"></span>
        <div class="vlogo" style="animation:vm-slam .65s cubic-bezier(.2,1.3,.3,1) ${(t + 0.4).toFixed(3)}s both">${logo ? `<img src="${logo}">` : `<b>${esc(marca.nome || marca.handle || '')}</b>`}</div>
      </div>
      ${c.texto ? `<div class="vtexto" style="${anim('vm-up', t + 0.85, 0.5)}">${rich(c.texto)}</div>` : ''}`;
  },
  capitulo(c, t) {
    som('hit', t + 0.12);
    return `<div class="cap"><span class="cap-n" style="animation:vm-slam .55s cubic-bezier(.2,1.3,.3,1) ${(t + 0.08).toFixed(3)}s both">${esc(c.numero ?? '')}</span>${c.total ? `<span class="cap-de" style="${anim('vm-up', t + 0.4, 0.4)}">de ${esc(c.total)}</span>` : ''}</div>
      ${c.titulo ? `<div class="tags" style="${anim('vm-pop', t + 0.45, 0.45)}"><span class="tag" style="background:${catCor(c)}">${esc(c.titulo)}</span></div>` : ''}`;
  },
  local(c, t) {
    som('pop', t + 0.15); som('drop', t + 0.95);
    return `<div class="globo-local" style="${anim('vm-pop', t + 0.1, 0.6)}">${globoSVG('gl', catCor(c), 6)}
        <div class="pin" style="animation:vm-pin .7s cubic-bezier(.3,1.5,.5,1) ${(t + 0.7).toFixed(3)}s both"><svg viewBox="0 0 24 32"><path d="M12 0C5.4 0 0 5.2 0 11.7 0 20.4 12 32 12 32s12-11.6 12-20.3C24 5.2 18.6 0 12 0z" fill="#e11d2e"/><circle cx="12" cy="11.5" r="4.6" fill="#fff"/></svg></div>
        <span class="ring pinring" style="animation:vm-ring 1s ease-out ${(t + 1.05).toFixed(3)}s both"></span>
      </div>
      <div class="tags" style="${anim('vm-pop', t + 1.1, 0.45)}"><span class="tag lugar" style="background:${catCor(c)}">${esc(c.bandeira || '📍')} ${esc(c.lugar || '')}</span></div>
      ${c.texto ? `<h2 class="mid">${palavras(c.texto, t + 1.35, 0.08)}</h2>` : ''}`;
  },
  curiosidade(c, t) {
    som('pop', t + 0.15); som('shine', t + 1.7);
    return `<div class="tags" style="${anim('vm-pop', t + 0.1, 0.45)}"><span class="tag" style="background:${catCor(c)}">${esc(c.etiqueta || 'Curiosidade')}</span></div>
      <h2 class="big">${palavras(c.pergunta || 'Você *sabia?*', t + 0.3, 0.1)}</h2>
      <div class="revela" style="${anim('vm-up', t + 0.8, 0.5)}"><p style="animation:vm-unblur .9s ease ${(t + 1.7).toFixed(3)}s both">${rich(c.texto || '')}</p><span class="scan" style="animation:vm-scan .9s ease-in-out ${(t + 1.6).toFixed(3)}s both"></span></div>
      ${fonteHtml(c, t + 2.5)}`;
  },

  // ---------- modo notícia ----------
  manchete(c, t, d) {
    const cor = catCor(c), img = imagemDataURI(c.imagem);
    const visual = img
      ? `<div class="foto" style="${anim('vm-up', t + 0.05, 0.6)}"><img src="${img}" style="animation:vm-zoom ${d.toFixed(2)}s linear ${t.toFixed(3)}s both"></div>`
      : c.icone ? `<div class="emoji-wrap" style="${anim('vm-pop', t + 0.05, 0.6)}"><span class="ring" style="animation:vm-ring .9s ease-out ${(t + 0.2).toFixed(3)}s both"></span><span class="emoji" style="animation:vm-bob 2.6s ease-in-out ${t.toFixed(3)}s infinite">${esc(c.icone)}</span></div>` : '';
    const tags = (c.fake ? `<span class="tag fake">✕</span>` : '') + (c.urgente ? `<span class="tag urg"><i style="animation:vm-blink .9s steps(2,jump-none) ${t.toFixed(3)}s infinite"></i>${esc(c.urgente === true ? 'URGENTE' : c.urgente)}</span>` : '')
      + (c.categoria || roteiro.categoria ? `<span class="tag" style="background:${cor}">${esc(c.categoria || roteiro.categoria)}</span>` : '');
    const nPal = String(c.texto || '').split(/\s+/).length;
    som('pop', t + 0.25); if (c.fake) som('hit', t + 0.3);
    return `${visual}
      ${tags ? `<div class="tags" style="${anim('vm-pop', t + 0.25, 0.5)}">${tags}</div>` : ''}
      <h1 class="news">${palavras(c.texto, t + 0.45, 0.09)}</h1>
      ${c.sub ? `<p class="sub" style="${anim('vm-up', t + 0.7 + nPal * 0.09, 0.6)}">${rich(c.sub)}</p>` : ''}
      ${fonteHtml(c, t + 1 + nPal * 0.09)}`;
  },
  fatos(c, t) {
    const cor = catCor(c), itens = c.itens || [];
    const tI = (i) => (c._vi && c._vi[i] != null ? t + c._vi[i] - 0.05 : t + 0.7 + i * 0.9);
    itens.forEach((_, i) => som('tick', tI(i) + 0.05));
    return `${c.titulo ? `<h2 class="mid" style="${anim('vm-up', t + 0.15, 0.6)}">${rich(c.titulo)}</h2>` : ''}
      <div class="fatos-list">${itens.map((it, i) => {
        const o = typeof it === 'string' ? { texto: it } : it;
        return `<div class="fato" style="${anim('vm-left', tI(i), 0.55)}border-left-color:${cor}"><span class="fi">${esc(o.icone || '▸')}</span><span>${rich(o.texto)}</span></div>`;
      }).join('')}</div>
      ${fonteHtml(c, c._vtot ? t + c._vtot : t + 0.9 + itens.length * 0.9)}`;
  },
  citacao(c, t) {
    som('pop', t + 0.15);
    const cor = catCor(c), img = imagemDataURI(c.imagem);
    return `<div class="aspas" style="${anim('vm-pop', t + 0.1, 0.5)}color:${cor}">“</div>
      <blockquote class="quote">${palavras(c.texto, t + 0.3, 0.07)}</blockquote>
      <div class="autor" style="${anim('vm-up', t + 1.3, 0.5)}">${img ? `<img src="${img}">` : `<span class="barra" style="background:${cor}"></span>`}<div><b>${esc(c.autor || '')}</b>${c.cargo ? `<small>${esc(c.cargo)}</small>` : ''}</div></div>
      ${fonteHtml(c, t + 1.6)}`;
  },
  enquete(c, t) {
    const cor = catCor(c);
    const o0 = c._vo != null ? c._vo - 0.05 : 1.1;
    (c.opcoes || []).slice(0, 3).forEach((_, i) => som('pop', t + o0 + 0.05 + i * (c._vo != null ? 0.7 : 0.35)));
    return `<h2 class="mid">${palavras(c.pergunta || 'E você, o que acha?', t + 0.2, 0.09)}</h2>
      <div class="opcoes">${(c.opcoes || []).slice(0, 3).map((o, i) => `<div class="opcao" style="${anim('vm-pop', t + o0 + i * (c._vo != null ? 0.7 : 0.35), 0.5)}"><b style="background:${cor}">${String.fromCharCode(65 + i)}</b><span>${rich(o)}</span></div>`).join('')}</div>
      <p class="sub" style="${anim('vm-up', t + 2.2, 0.5)}">${rich(c.sub || 'Comenta aqui embaixo 👇')}</p>`;
  },
};

// ---------- narração ----------
const falaDe = (c) => {
  if (c.fala === false) return [];
  if (c.fala) return [].concat(c.fala);
  const j = (...p) => p.filter(Boolean).join('. ');
  // regra: a voz lê o essencial; legendas e detalhes que já estão na tela ficam só na tela
  switch (c.type) {
    case 'hook': return [c.texto];
    case 'texto': return [c.texto];
    case 'capitulo': return [c.numero ? `Notícia ${c.numero}` : (c.titulo || '')].filter(Boolean);
    case 'local': return [c.lugar ? `Direto de ${c.lugar}` : ''].filter(Boolean);
    case 'manchete': return [j(c.texto, c.falaSub ? c.sub : '', c.falaFonte && c.fonte ? 'Fonte: ' + c.fonte : '')];
    case 'fatos': case 'list': return [...(c.itens || []).map((x) => (typeof x === 'string' ? x : x.texto))].filter(Boolean);
    case 'stat': return [j(c.antes, `${c.prefixo || ''}${c.valor}${c.sufixo || ''}`, c.texto)];
    case 'citacao': return [j(c.texto, c.autor)];
    case 'curiosidade': return [c.texto].filter(Boolean);
    case 'enquete': return [c.pergunta, 'Comente A, B ou C.'].filter(Boolean);
    case 'grafico': return [c.titulo].filter(Boolean);
    case 'pov': return [c.texto].filter(Boolean);
    case 'cta': return [c.texto];
    default: return [];   // vinheta, meme e clipe ficam sem fala (efeitos ou áudio original)
  }
};
const VOZ_TRECHOS = [];
if (comVoz && !htmlOnly) {
  const itens = [];
  (roteiro.cenas || []).forEach((c, i) => { c._vtexto = falaDe(c); c._vtexto.forEach((tx, k) => itens.push({ id: `c${i}_${k}`, texto: tx })); });
  if (itens.length) {
    const dir = saida.replace(/\.mp4$/i, '') + '-voz';
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'entrada.json'), JSON.stringify(itens));
    const r = spawnSync('python3', [path.join(__dirname, 'narrar.py'), 'sintetizar', path.join(dir, 'entrada.json'), path.join(dir, 'wav')], { encoding: 'utf8', maxBuffer: 1e8 });
    if (r.status !== 0) {
      console.warn('AVISO: não consegui gerar a voz; o vídeo sai sem narração.\n' + String(r.stderr || '').slice(-400));
    } else {
      const res = JSON.parse(r.stdout.trim().split('\n').pop());
      (roteiro.cenas || []).forEach((c, i) => {
        const lead = 0.45, gap = 0.3; let cum = lead; const offs = [];
        c._vsegs = (c._vtexto || []).map((_, k) => res[`c${i}_${k}`]).filter(Boolean);
        c._vsegs.forEach((sg) => { offs.push(cum); sg.off = cum; cum += sg.duracao + gap; });
        if (c._vsegs.length) {
          c._vtot = cum - gap;
          if (c.type === 'fatos') c._vi = offs;
          if (c.type === 'enquete' && offs[1] != null) c._vo = offs[1];
        }
      });
    }
  }
}

// ---------- linha do tempo ----------
let t = 0;
const cenas = (roteiro.cenas || []).map((c, i, arr) => {
  const d = durDe(c);
  (c._vsegs || []).forEach((sg) => VOZ_TRECHOS.push({ arquivo: sg.arquivo, inicio: t + sg.off }));
  const gerar = CENAS[c.type];
  if (!gerar) throw new Error(`Tipo de cena desconhecido: "${c.type}" (use: ${Object.keys(CENAS).join(', ')})`);
  const ultima = i === arr.length - 1;
  const html = `<section class="scene" style="animation:vm-in .45s cubic-bezier(.2,.8,.2,1) ${t.toFixed(3)}s both${ultima ? '' : `, vm-out .4s ease-in ${(t + d - 0.4).toFixed(3)}s forwards`}">
    <div class="content ${c.type}" style="animation:vm-push ${d.toFixed(2)}s linear ${t.toFixed(3)}s both">${gerar(c, t, d)}</div>
    ${c.legenda ? `<div class="caption" style="${anim('vm-up', t + 0.3, 0.4)}">${rich(c.legenda)}</div>` : ''}
  </section>`;
  const inicio = t; t += d;
  return { html, inicio, d, semWipe: c.transicao === false };
});
const TOTAL = t;
const transicao = roteiro.transicao || (noticia ? 'wipe' : 'fade');
const logoMarca = imagemDataURI(marca.logo);
const wipesHtml = transicao === 'wipe' ? cenas.slice(1).filter((c) => !c.semWipe).map(({ inicio }) => {
  som('whoosh', inicio - 0.38);
  const a = (inicio - 0.36).toFixed(3), b = (inicio - 0.28).toFixed(3);
  return `<div class="wipe w2" style="animation:vm-wipe .72s cubic-bezier(.7,0,.3,1) ${b}s both"></div><div class="wipe w1" style="animation:vm-wipe .72s cubic-bezier(.7,0,.3,1) ${a}s both">${logoMarca ? `<img src="${logoMarca}">` : ''}</div>`;
}).join('') : '';
const enfeites = roteiro.enfeites ?? noticia;
const estrelasHtml = enfeites ? Array.from({ length: 9 }, (_, i) => {
  const x = (8 + rnd() * 84).toFixed(1), y = (10 + rnd() * 80).toFixed(1), sz = Math.round(26 + rnd() * 34), dl = (-rnd() * 3).toFixed(2);
  return `<span class="estrela" style="left:${x}%;top:${y}%;width:${sz}px;height:${sz}px;animation:vm-twinkle ${(2.2 + rnd() * 1.6).toFixed(2)}s ease-in-out ${dl}s infinite">${ESTRELA}</span>`;
}).join('') + globoSVG('globo-bg', AZUL, 14) : '';
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

const FRAMES_DIR = saida.replace(/\.mp4$/i, '') + '-frames';
const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
:root{--marcador:${tema.marcador || (seres ? '#c4b1ff' : 'rgba(255,210,63,.3)')};--fundo:${tema.fundo};--fundo2:${tema.fundo2};--texto:${tema.texto};--suave:${tema.suave};--destaque:${tema.destaque};--acento:${tema.acento};--cartao:${tema.cartao};--cartaoTexto:${tema.cartaoTexto};--botao:${tema.botao};--botaoTexto:${tema.botaoTexto}}
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
.brand.com-logo{display:flex;align-items:center;gap:16px;color:var(--texto)}
.brand.com-logo img{width:68px;height:68px;border-radius:50%;object-fit:cover}
.brand.com-logo b{display:block;font-size:28px;font-weight:900;letter-spacing:.06em;text-transform:uppercase}
.brand.com-logo small{display:block;font-size:24px;font-weight:600;color:var(--suave)}
.rodape{display:flex;flex-direction:column;align-items:center;gap:20px;margin-top:10px;font-size:30px;font-weight:800;letter-spacing:.1em;color:var(--suave)}
.rodape .icons{display:flex;gap:34px;color:var(--acento)}
.rodape svg{width:62px;height:62px}
.tag.fake{background:#e11d2e;padding:12px 22px}
/* ---------- estilo seres (@seres.hu) ---------- */
.estilo-seres .progress{background:rgba(23,15,46,.1)}
.estilo-seres .grain{background-image:radial-gradient(rgba(106,44,245,.08) 1px,transparent 1px)}
.estilo-seres .tag{border-radius:0;font-style:italic;padding:12px 30px;box-shadow:8px 8px 0 ${tema.azul || '#4f6ef7'}}
.estilo-seres .tag.urg{box-shadow:none}
.estilo-seres .tag.fake{box-shadow:none;font-style:normal}
.estilo-seres .pill{background:var(--acento);color:#fff;border-radius:0;font-style:italic;text-transform:uppercase;letter-spacing:.06em;box-shadow:8px 8px 0 ${tema.azul || '#4f6ef7'}}
.estilo-seres .news{position:relative;background:var(--acento);color:#fff;padding:34px 40px 38px;margin:6px 0 10px}
.estilo-seres .news em,.estilo-seres .news .hl{color:#c3ceff}
.estilo-seres .news::before,.estilo-seres .news::after{content:'';position:absolute;width:70px;height:70px;border:9px solid ${tema.azul || '#4f6ef7'}}
.estilo-seres .news::before{left:-18px;top:-18px;border-right:0;border-bottom:0}
.estilo-seres .news::after{right:-18px;bottom:-18px;border-left:0;border-top:0}
.estilo-seres .sub{color:var(--suave)}
.estilo-seres .fonte{border-top-color:rgba(23,15,46,.15)}
.estilo-seres .fato,.estilo-seres .opcao,.estilo-seres .list li{background:#fff;border-color:rgba(106,44,245,.18);box-shadow:0 12px 30px rgba(60,30,140,.12)}
.estilo-seres .fato{border-left-color:var(--acento)}
.estilo-seres .ticker{background:var(--acento);color:#fff}
.estilo-seres .tk-label{background:${tema.azul || '#4f6ef7'}}
.estilo-seres .tk-move .dot{color:#c3ceff}
.estilo-seres .avatar{border-color:${tema.azul || '#4f6ef7'}}
.estilo-seres .follow{background:var(--acento);color:#fff}
.estilo-seres .caption{background:var(--acento);color:#fff}
.hl{position:relative}
.hl::after{content:'';position:absolute;left:-6px;right:-6px;bottom:.04em;height:.38em;background:var(--marcador);z-index:-1;transform-origin:left;animation:vm-mark .45s cubic-bezier(.6,0,.2,1) var(--d,0s) both}
.estilo-seres .news .hl{color:#fff}
.estilo-seres .news{--marcador:${AZUL}}
.emoji-wrap{position:relative;display:grid;place-items:center;width:210px;height:210px}
.emoji-wrap .emoji{font-size:170px;line-height:1;display:block}
.ring{position:absolute;left:50%;top:50%;width:220px;height:220px;margin:-110px 0 0 -110px;border-radius:50%;border:10px solid var(--acento);pointer-events:none}
.ring.grande{width:560px;height:560px;margin:-280px 0 0 -280px;border-color:${AZUL}}
.estrela{position:absolute;color:${AZUL};opacity:.0}
.estrela svg{width:100%;height:100%;display:block}
.globo-bg{position:absolute;width:1300px;height:1300px;right:-520px;bottom:-380px;opacity:.13}
.meri{transform-box:fill-box;transform-origin:center}
.wipe{position:absolute;top:-10%;bottom:-10%;left:-30%;width:160%;z-index:30;display:grid;place-items:center}
.wipe.w1{background:var(--acento)}
.wipe.w2{background:${AZUL}}
.wipe img{width:260px;height:260px;border-radius:50%;transform:skewX(14deg)}
.vinheta{position:relative;width:640px;height:640px;display:grid;place-items:center}
.vinheta .vg{position:absolute;inset:0;width:100%;height:100%}
.vlogo{position:relative;width:400px;height:400px;border-radius:50%;overflow:hidden;box-shadow:0 30px 80px rgba(40,20,120,.35);display:grid;place-items:center;background:${AZUL};color:#fff;font-size:70px;font-weight:900}
.vlogo img{width:100%;height:100%;object-fit:cover}
.vtexto{font-size:96px;font-weight:900;letter-spacing:.01em;text-transform:uppercase;color:var(--acento);line-height:1}
.cap{display:flex;align-items:flex-end;gap:20px;line-height:.8}
.cap-n{font-size:460px;font-weight:900;letter-spacing:-.06em;color:var(--acento);text-shadow:18px 18px 0 ${AZUL}}
.cap-de{font-size:80px;font-weight:900;color:var(--suave);padding-bottom:40px}
.globo-local{position:relative;width:620px;height:620px}
.globo-local .gl{width:100%;height:100%}
.pin{position:absolute;left:41%;top:24%;width:96px;height:128px;filter:drop-shadow(0 12px 10px rgba(0,0,0,.3))}
.pin svg{width:100%;height:100%}
.pinring{left:calc(41% + 48px);top:calc(24% + 128px);width:120px;height:44px;margin:-22px 0 0 -60px;border-width:6px;border-color:#e11d2e}
.tag.lugar{font-size:44px;text-transform:none;letter-spacing:0;font-style:normal}
.revela{position:relative;overflow:hidden;align-self:stretch;background:var(--cartao);color:var(--cartaoTexto);border-radius:26px;padding:40px 44px;font-size:52px;font-weight:700;line-height:1.25;text-align:left;box-shadow:0 20px 50px rgba(40,20,120,.18)}
.estilo-seres .revela{border-left:14px solid var(--acento);border-radius:0 26px 26px 0}
.scan{position:absolute;left:0;right:0;top:0;height:120px;background:linear-gradient(transparent,rgba(255,255,255,.95),transparent)}
@keyframes vm-mark{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes vm-ring{from{opacity:.9;transform:scale(.3)}to{opacity:0;transform:scale(1.9)}}
@keyframes vm-bob{0%,100%{transform:translateY(0) rotate(-5deg)}50%{transform:translateY(-16px) rotate(5deg)}}
@keyframes vm-twinkle{0%,100%{opacity:0;transform:scale(.4) rotate(0)}50%{opacity:.85;transform:scale(1) rotate(45deg)}}
@keyframes vm-meri{from{transform:scaleX(1)}to{transform:scaleX(-1)}}
@keyframes vm-wipe{from{transform:translateX(-150%) skewX(-14deg)}to{transform:translateX(150%) skewX(-14deg)}}
@keyframes vm-slam{0%{opacity:0;transform:scale(2.6) rotate(-10deg)}60%{opacity:1;transform:scale(.93) rotate(2deg)}100%{opacity:1;transform:scale(1) rotate(0)}}
@keyframes vm-pin{from{opacity:0;transform:translateY(-420px)}30%{opacity:1}to{opacity:1;transform:translateY(0)}}
@keyframes vm-unblur{from{filter:blur(22px);opacity:.55}to{filter:blur(0);opacity:1}}
@keyframes vm-scan{from{transform:translateY(-130px)}to{transform:translateY(600px)}}
@keyframes vm-push{from{transform:scale(1)}to{transform:scale(1.035)}}
.meme-card{position:relative;width:100%;aspect-ratio:1/1.05;border-radius:28px;overflow:hidden;background:linear-gradient(135deg,var(--acento),${AZUL});box-shadow:0 30px 80px rgba(40,20,120,.35);display:grid;place-items:center}
.meme-card img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.m-emoji{font-size:500px;line-height:1;filter:drop-shadow(0 20px 20px rgba(0,0,0,.25))}
.m-txt{position:absolute;left:24px;right:24px;text-align:center;font-weight:900;font-size:80px;line-height:1.04;text-transform:uppercase;color:#fff;-webkit-text-stroke:12px #000;paint-order:stroke fill;text-shadow:0 5px 0 #000;letter-spacing:-.01em;z-index:2}
.m-txt.top{top:28px}.m-txt.base{bottom:28px}
@keyframes vm-shake{0%,100%{transform:rotate(0)}25%{transform:rotate(-2.2deg) scale(1.02)}75%{transform:rotate(2.2deg) scale(1.02)}}
.graf-leg{list-style:none;align-self:stretch;display:flex;flex-direction:column;gap:12px;text-align:left}
.graf-leg li{display:flex;align-items:center;gap:20px;font-size:46px;font-weight:700}
.graf-leg i{width:34px;height:34px;border-radius:8px;display:block;flex:none}
.graf-pizza{position:relative;width:600px;height:600px;filter:drop-shadow(0 30px 30px rgba(40,20,120,.3))}
.graf-pizza svg{width:100%;height:100%;overflow:visible}
.graf-emoji{position:absolute;left:8%;top:14%;font-size:260px;line-height:1}
.pov-emoji{position:absolute;font-size:480px;line-height:1;filter:drop-shadow(0 20px 20px rgba(0,0,0,.25))}
.clipe-card{position:relative;width:100%;height:1150px;border-radius:28px;overflow:hidden;background:#000;box-shadow:0 30px 80px rgba(40,20,120,.35)}
.clipe-bg{position:absolute;inset:-60px;width:calc(100% + 120px);height:calc(100% + 120px);object-fit:cover;filter:blur(38px) brightness(.7)}
.clipe-img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}
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
</style></head><body class="estilo-${esc(roteiro.estilo || 'padrao')}">
<div class="bg"><div class="blob b1"></div><div class="blob b2"></div><div class="grain"></div>${estrelasHtml}</div>
${roteiro.barraProgresso === false ? '' : '<div class="progress"><div></div></div>'}
${tickerHtml}
${marca.handle && roteiro.mostrarMarca !== false ? (() => {
  const logo = imagemDataURI(marca.logo);
  return logo && marca.nome
    ? `<div class="brand com-logo"><img src="${logo}"><div><b>${esc(marca.nome)}</b><small>${esc(marca.handle)}</small></div></div>`
    : `<div class="brand">${esc(marca.handle)}</div>`;
})() : ''}
${cenas.map((c) => c.html).join('\n')}
${wipesHtml}
<style>${KEYFRAMES_EXTRA.join('')}</style>
<script>
const ease = (x) => 1 - Math.pow(1 - x, 3);
const CLIPES = ${JSON.stringify(CLIPES.map((c) => ({ k: c.k, ini: c.ini * 1000, dur: c.dur * 1000, n: Math.ceil(c.dur * FPS), dir: 'file://' + FRAMES_DIR + '/c' + c.k })))};
window.__pend = [];
window.__ready = async () => { await Promise.all(window.__pend.splice(0)); };
window.__seek = (ms) => {
  for (const c of CLIPES) {
    const idx = Math.min(c.n, Math.max(1, Math.floor(((ms - c.ini) / 1000) * ${FPS}) + 1));
    const url = c.dir + '/f_' + String(idx).padStart(4, '0') + '.jpg';
    for (const el of document.querySelectorAll('[data-clipe="' + c.k + '"]')) {
      if (el.dataset.cur !== url) { el.dataset.cur = url; el.src = url; window.__pend.push(el.decode().catch(() => {})); }
    }
  }
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
  for (const c of CLIPES) {
    const dir = path.join(FRAMES_DIR, 'c' + c.k);
    fs.mkdirSync(dir, { recursive: true });
    const r = require('child_process').spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(c.ss), '-t', c.dur.toFixed(3), '-i', c.arquivo, '-vf', `fps=${FPS},scale=720:-2`, '-q:v', '4', path.join(dir, 'f_%04d.jpg')]);
    if (r.status !== 0) throw new Error('Falha ao extrair quadros de ' + c.arquivo);
  }
  await page.goto('file://' + htmlPath);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.__seek(0));
  await page.evaluate(() => window.__ready());

  // áudio: trilha sintetizada + efeitos (desligue com "som": false; só efeitos com "trilha": false)
  const comSom = roteiro.som !== false;
  let wav = null;
  if (comSom) {
    wav = saida.replace(/\.mp4$/i, '') + '-audio.wav';
    require('./audio.cjs').gerarAudio(wav, TOTAL, SFX, { trilha: roteiro.trilha !== false && !musica && (!comVoz || typeof roteiro.trilha === 'string'), volumeEfeitos: comVoz ? 0.5 : undefined, estilo: typeof roteiro.trilha === 'string' ? roteiro.trilha : roteiro.estiloMusica, bpm: roteiro.bpm, mudo: MUDO });
  }
  const ffArgs = ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-'];
  const fadeOut = `afade=t=out:st=${Math.max(0, TOTAL - 1.5).toFixed(2)}:d=1.5`;
  const filtros = [], rotulos = [];
  let idx = 1;
  if (wav) { ffArgs.push('-i', wav); rotulos.push(`[${idx}:a]`); idx++; }
  let vozWav = null;
  if (VOZ_TRECHOS.length) {
    const dir = saida.replace(/\.mp4$/i, '') + '-voz';
    fs.writeFileSync(path.join(dir, 'linha.json'), JSON.stringify({ total: TOTAL, trechos: VOZ_TRECHOS }));
    vozWav = path.join(dir, 'voz.wav');
    const r = spawnSync('python3', [path.join(__dirname, 'narrar.py'), 'misturar', path.join(dir, 'linha.json'), vozWav], { encoding: 'utf8' });
    if (r.status === 0) { ffArgs.push('-i', vozWav); rotulos.push(`[${idx}:a]`); idx++; } else { vozWav = null; console.warn('AVISO: falha ao juntar a voz.\n' + String(r.stderr || '').slice(-300)); }
  }
  if (musica) { ffArgs.push('-i', path.resolve(musica)); filtros.push(`[${idx}:a]volume=0.35,${fadeOut}[m]`); rotulos.push('[m]'); idx++; }
  if (comSom) for (const c of CLIPES.filter((x) => x.audio)) {
    ffArgs.push('-ss', String(c.ss), '-t', c.dur.toFixed(3), '-i', c.arquivo);
    const ms = Math.max(0, Math.round(c.ini * 1000));
    filtros.push(`[${idx}:a]aresample=44100,aformat=channel_layouts=mono,volume=${c.vol},adelay=${ms}|${ms}[c${c.k}]`);
    rotulos.push(`[c${c.k}]`); idx++;
  }
  ffArgs.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '24', '-maxrate', '5M', '-bufsize', '10M', '-pix_fmt', 'yuv420p', '-r', String(FPS));
  if (rotulos.length > 1) {
    filtros.push(`${rotulos.join('')}amix=inputs=${rotulos.length}:duration=longest:normalize=0[a]`);
    ffArgs.push('-filter_complex', filtros.join(';'), '-map', '0:v', '-map', '[a]');
  } else if (musica) ffArgs.push('-af', fadeOut);
  if (rotulos.length) ffArgs.push('-c:a', 'aac', '-b:a', '192k', '-t', TOTAL.toFixed(3));
  ffArgs.push('-movflags', '+faststart', saida);
  const ff = spawn('ffmpeg', ffArgs, { stdio: ['pipe', 'inherit', 'inherit'] });
  const fim = new Promise((ok, erro) => ff.on('close', (code) => (code === 0 ? ok() : erro(new Error('ffmpeg saiu com código ' + code)))));

  for (let f = 0; f < quadros; f++) {
    await page.evaluate((ms) => window.__seek(ms), (f / FPS) * 1000);
    await page.evaluate(() => window.__ready());
    const buf = await page.screenshot({ type: 'jpeg', quality: 94 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (f % FPS === 0) process.stdout.write(`\rRenderizando ${Math.round((f / quadros) * 100)}%`);
  }
  ff.stdin.end();

  // capa (thumbnail): por padrão, o fim da primeira cena
  const tCapa = capaSeg != null ? +capaSeg : Math.max(0.5, (cenas[0]?.d || 1) - 0.6);
  await page.evaluate((ms) => window.__seek(ms), tCapa * 1000);
  await page.evaluate(() => window.__ready());
  const capa = saida.replace(/\.mp4$/i, '') + '-capa.jpg';
  await page.screenshot({ path: capa, type: 'jpeg', quality: 92 });

  await browser.close();
  await fim;
  if (wav) fs.unlinkSync(wav);
  fs.rmSync(FRAMES_DIR, { recursive: true, force: true });
  fs.rmSync(saida.replace(/\.mp4$/i, '') + '-voz', { recursive: true, force: true });
  if (!process.argv.includes('--manter-html')) fs.rmSync(htmlPath, { force: true });   // o .html só serve para pré-visualizar (--html-only); não vai para o repositório
  process.stdout.write('\rRenderizando 100%\n');
  console.log('Vídeo:', saida);
  console.log('Capa: ', capa);
})().catch((e) => { console.error(e); process.exit(1); });
