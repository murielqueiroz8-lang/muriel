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
}, roteiro.tema || {});
const marca = roteiro.marca || {};

const DUR_PADRAO = { hook: 3, texto: 3.2, step: 4.8, list: null, stat: 3.6, cta: 3.8 };
const durDe = (c) => c.duracao || (c.type === 'list' ? 1.6 + 0.7 * (c.itens || []).length + 1 : DUR_PADRAO[c.type] || 3);

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
};

// ---------- linha do tempo ----------
let t = 0;
const cenas = (roteiro.cenas || []).map((c, i, arr) => {
  const d = durDe(c);
  const gerar = CENAS[c.type];
  if (!gerar) throw new Error(`Tipo de cena desconhecido: "${c.type}" (use: ${Object.keys(CENAS).join(', ')})`);
  const ultima = i === arr.length - 1;
  const html = `<section class="scene" style="animation:vm-in .45s cubic-bezier(.2,.8,.2,1) ${t.toFixed(3)}s both${ultima ? '' : `, vm-out .4s ease-in ${(t + d - 0.4).toFixed(3)}s forwards`}">
    <div class="content">${gerar(c, t, d)}</div>
    ${c.legenda ? `<div class="caption" style="${anim('vm-up', t + 0.3, 0.4)}">${rich(c.legenda)}</div>` : ''}
  </section>`;
  const inicio = t; t += d;
  return { html, inicio, d };
});
const TOTAL = t;
const quadros = Math.round(TOTAL * FPS);
const seguro = H >= 1900 ? [220, 380] : H >= 1300 ? [120, 160] : [80, 100];

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
.scene{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:${seguro[0]}px 80px ${seguro[1]}px}
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
.caption{position:absolute;left:60px;right:60px;bottom:${Math.round(seguro[1] * 0.55)}px;text-align:center;font-size:40px;font-weight:700;line-height:1.3}
.caption{background:rgba(0,0,0,.55);padding:18px 28px;border-radius:18px}
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
