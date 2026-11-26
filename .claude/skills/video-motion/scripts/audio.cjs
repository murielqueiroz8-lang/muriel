/*
 * Sintetizador de áudio do video-motion.
 * Gera uma trilha original (batida + acordes) e efeitos sonoros sincronizados
 * com as animações, tudo calculado aqui — sem arquivos de música de terceiros.
 */
const fs = require('fs');

const SR = 44100;

function gerarAudio(arquivo, total, sfx, opcoes = {}) {
  const n = Math.ceil((total + 0.5) * SR);
  const musica = new Float32Array(n);
  const efeitos = new Float32Array(n);
  const ruido = () => Math.random() * 2 - 1;
  const add = (buf, i, v) => { if (i >= 0 && i < n) buf[i] += v; };

  // ---------------- trilha ----------------
  if (opcoes.trilha !== false) {
    const bpm = opcoes.bpm || 104;
    const beat = 60 / bpm;
    // Am - F - C - G (4 tempos cada)
    const acordes = [
      [220.0, 261.63, 329.63, 110.0],
      [174.61, 220.0, 261.63, 87.31],
      [196.0, 261.63, 329.63, 65.41],
      [196.0, 246.94, 293.66, 98.0],
    ];
    const compasso = beat * 4;
    let lp = 0, lpSn = 0;
    for (let i = 0; i < n; i++) {
      const tt = i / SR;
      const ac = acordes[Math.floor(tt / compasso) % 4];
      const tc = tt % compasso;
      // pad (acorde) com ataque suave
      const envPad = Math.min(1, tc / 0.35) * (0.75 + 0.25 * Math.cos((2 * Math.PI * tt) / compasso));
      let v = 0;
      for (let k = 0; k < 3; k++) {
        v += Math.sin(2 * Math.PI * ac[k] * tt) * 0.028 + Math.sin(2 * Math.PI * (ac[k] * 1.004) * tt) * 0.022;
      }
      v *= envPad;
      // arpejo em colcheias
      const colcheia = beat / 2;
      const idx = Math.floor(tt / colcheia);
      const tn = tt % colcheia;
      const notaArp = ac[[0, 1, 2, 1][idx % 4]] * 2;
      v += Math.sin(2 * Math.PI * notaArp * tt) * Math.exp(-tn * 9) * 0.045;
      // baixo
      const tb = tt % beat;
      v += Math.sin(2 * Math.PI * ac[3] * tt) * Math.exp(-tb * 3) * 0.12;
      // bumbo em todos os tempos
      const fk = 45 + 75 * Math.exp(-tb * 30);
      v += Math.sin(2 * Math.PI * fk * tb) * Math.exp(-tb * 9) * 0.42;
      // caixa (tempos 2 e 4)
      const nb = Math.floor(tt / beat) % 4;
      if (nb === 1 || nb === 3) { lpSn += 0.35 * (ruido() - lpSn); v += lpSn * Math.exp(-tb * 16) * 0.22; }
      // chimbal nos contratempos
      const th = (tt + beat / 2) % beat;
      const r = ruido(); lp += 0.5 * (r - lp);
      v += (r - lp) * Math.exp(-th * 45) * 0.07;
      // fade in / out
      const fade = Math.min(1, tt / 0.6) * Math.min(1, Math.max(0, (total - tt) / 1.5));
      musica[i] = v * fade * (opcoes.volumeTrilha ?? 0.55);
    }
  }

  // ---------------- efeitos ----------------
  const FX = {
    whoosh(i0) {
      const d = 0.75 * SR; let y = 0;
      for (let k = 0; k < d; k++) {
        const p = k / d, a = 0.015 + 0.35 * Math.sin(Math.PI * p) ** 2;
        y += a * (ruido() - y);
        add(efeitos, i0 + k, y * Math.sin(Math.PI * p) ** 2 * 0.9);
      }
    },
    pop(i0) {
      const d = 0.12 * SR; let ph = 0;
      for (let k = 0; k < d; k++) {
        const p = k / d; ph += (2 * Math.PI * (480 + 900 * p)) / SR;
        add(efeitos, i0 + k, Math.sin(ph) * Math.exp(-p * 5) * 0.32);
      }
    },
    tick(i0) {
      const d = 0.06 * SR;
      for (let k = 0; k < d; k++) { const p = k / d; add(efeitos, i0 + k, Math.sin((2 * Math.PI * 1900 * k) / SR) * Math.exp(-p * 7) * 0.18); }
    },
    hit(i0) {
      const d = 0.7 * SR; let ph = 0, y = 0;
      for (let k = 0; k < d; k++) {
        const p = k / d, tt = k / SR; ph += (2 * Math.PI * (38 + 80 * Math.exp(-tt * 18))) / SR;
        y += 0.25 * (ruido() - y);
        add(efeitos, i0 + k, Math.sin(ph) * Math.exp(-p * 4) * 0.75 + y * Math.exp(-tt * 22) * 0.5);
      }
    },
    riser(i0) {
      const d = 0.55 * SR; let y = 0, ph = 0;
      for (let k = 0; k < d; k++) {
        const p = k / d; y += (0.01 + 0.5 * p * p) * (ruido() - y); ph += (2 * Math.PI * (250 + 1100 * p * p)) / SR;
        add(efeitos, i0 + k, (y * 0.5 + Math.sin(ph) * 0.08) * p * p);
      }
    },
    shine(i0) {
      [1318.5, 1760, 2093, 2637].forEach((f, j) => {
        const o = i0 + Math.round(j * 0.07 * SR), d = 0.6 * SR;
        for (let k = 0; k < d; k++) add(efeitos, o + k, Math.sin((2 * Math.PI * f * k) / SR) * Math.exp((-k / d) * 6) * 0.11);
      });
    },
    drop(i0) {
      const d = 0.2 * SR; let ph = 0;
      for (let k = 0; k < d; k++) { const p = k / d; ph += (2 * Math.PI * (1000 - 760 * p)) / SR; add(efeitos, i0 + k, Math.sin(ph) * (1 - p) * 0.28); }
      FX.tick(i0 + d);
    },
  };
  for (const [tipo, tt] of sfx) if (FX[tipo]) FX[tipo](Math.round(Math.max(0, tt) * SR));

  // ---------------- mixagem (abaixa a trilha quando há efeito) ----------------
  const pcm = Buffer.alloc(n * 2);
  let env = 0;
  for (let i = 0; i < n; i++) {
    const e = Math.abs(efeitos[i]);
    env = e > env ? e : env * 0.9997;
    const duck = 1 - Math.min(0.45, env * 0.9);
    const v = Math.tanh((musica[i] * duck + efeitos[i] * (opcoes.volumeEfeitos ?? 0.9)) * 1.1);
    pcm.writeInt16LE(Math.round(v * 32000), i * 2);
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(SR, 24);
  h.writeUInt32LE(SR * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  fs.writeFileSync(arquivo, Buffer.concat([h, pcm]));
  return arquivo;
}

module.exports = { gerarAudio };
