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
  // estilos: "funk" (batida de baile leve), "pop" (animado, 4x4), "trap" (808 + sinos)
  if (opcoes.trilha !== false) {
    const estilo = ['funk', 'pop', 'trap'].includes(opcoes.estilo) ? opcoes.estilo : 'funk';
    const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
    const put = (i0, len, fn) => { for (let k = 0; k < len; k++) { const i = i0 + k; if (i >= n) break; musica[i] += fn(k / SR, k / len); } };
    const kick = (i0, a = 0.7) => put(i0, (0.32 * SR) | 0, (t) => Math.sin(2 * Math.PI * (45 * t + (110 / 35) * (1 - Math.exp(-35 * t)))) * Math.exp(-t * 11) * a);
    const hat = (i0, aberto = false, a = 0.09) => { let y = 0; put(i0, ((aberto ? 0.22 : 0.05) * SR) | 0, (t) => { const r = ruido(); y += 0.4 * (r - y); return (r - y) * Math.exp(-t * (aberto ? 14 : 75)) * a; }); };
    const clap = (i0, a = 0.3) => { let y = 0; put(i0, (0.22 * SR) | 0, (t) => { const r = ruido(); y += 0.25 * (r - y); const env = Math.exp(-t * 20) + (t > 0.012 ? 0.8 * Math.exp(-(t - 0.012) * 60) : 0) + (t > 0.026 ? 0.6 * Math.exp(-(t - 0.026) * 60) : 0); return y * 2.5 * env * a; }); };
    const baixo = (i0, f, dur = 0.4, a = 0.55) => put(i0, (dur * SR) | 0, (t, p) => { const ph = 2 * Math.PI * f * (t + (0.5 * (1 - Math.exp(-30 * t))) / 30); return (Math.sin(ph) + 0.3 * Math.sin(2 * ph)) * Math.min(1, t / 0.005) * Math.exp(-t * 2.8) * Math.min(1, (1 - p) * 20) * a; });
    const marimba = (i0, f, dur = 0.35, a = 0.22) => put(i0, (dur * SR) | 0, (t, p) => (Math.sin(2 * Math.PI * f * t) + 0.5 * Math.sin(2 * Math.PI * f * 4 * t) * Math.exp(-t * 30) + 0.2 * Math.sin(2 * Math.PI * f * 2 * t)) * Math.exp(-t * 7) * Math.min(1, (1 - p) * 20) * a);
    const sino = (i0, f, a = 0.2) => put(i0, (0.9 * SR) | 0, (t, p) => (Math.sin(2 * Math.PI * f * t) + 0.5 * Math.sin(2 * Math.PI * f * 2.76 * t) + 0.25 * Math.sin(2 * Math.PI * f * 5.4 * t)) * Math.exp(-t * 4) * Math.min(1, (1 - p) * 20) * a);
    const acorde = (i0, notas, dur = 0.2, a = 0.1) => put(i0, (dur * SR) | 0, (t, p) => { let v = 0; for (const m of notas) { const f = midi(m); for (let h = 1; h <= 5; h++) v += Math.sin(2 * Math.PI * f * h * t) / h; } return (v / notas.length) * Math.exp(-t * 10) * Math.min(1, t / 0.004) * Math.min(1, (1 - p) * 20) * a; });

    const bpm = opcoes.bpm || { funk: 130, pop: 120, trap: 140 }[estilo];
    const passo = 60 / bpm / 4;
    const compassos = Math.ceil((total + 1) / (passo * 16));
    const at = (c, st, swing = 0) => Math.round(((c * 16 + st) * passo + (st % 2 ? swing * passo : 0)) * SR);

    for (let c = 0; c < compassos; c++) {
      if (estilo === 'funk') {
        const raiz = [45, 45, 41, 43][c % 4];
        const riff = [[0, 72], [3, 76], [6, 79], [8, 76], [10, 72], [12, 69], [14, 72], [16, 74], [19, 77], [22, 81], [24, 77], [26, 74], [28, 72], [30, 69]];
        [0, 3, 6, 8, 11, 14].forEach((st) => kick(at(c, st)));
        [4, 12].forEach((st) => clap(at(c, st)));
        for (let st = 0; st < 16; st++) hat(at(c, st, 0.12), st % 4 === 2, st % 2 ? 0.05 : 0.09);
        [0, 6, 8, 14].forEach((st) => baixo(at(c, st), midi(raiz), 0.3));
        [3, 11].forEach((st) => baixo(at(c, st), midi(raiz + 12), 0.2, 0.4));
        riff.filter(([st]) => Math.floor(st / 16) === c % 2).forEach(([st, m]) => marimba(at(c, st % 16, 0.12), midi(m)));
        [6, 14].forEach((st) => sino(at(c, st), midi(93), 0.05));
      } else if (estilo === 'pop') {
        const acordes = [[60, 64, 67], [59, 62, 67], [57, 60, 64], [57, 60, 65]];
        const ac = acordes[c % 4];
        const raiz = [48, 43, 45, 41][c % 4];
        [0, 4, 8, 12].forEach((st) => kick(at(c, st), 0.65));
        [4, 12].forEach((st) => clap(at(c, st)));
        for (let st = 0; st < 16; st++) hat(at(c, st), st % 4 === 2, st % 2 ? 0.04 : 0.07);
        [0, 6, 8, 14].forEach((st) => baixo(at(c, st), midi(raiz), 0.22, 0.5));
        [3, 11].forEach((st) => baixo(at(c, st), midi(raiz + 12), 0.18, 0.4));
        [0, 6, 10].forEach((st) => acorde(at(c, st), ac, 0.18, 0.13));
        [0, 2, 4, 7, 8, 10, 12, 14].forEach((st, k) => marimba(at(c, st), midi(ac[[0, 1, 2, 1, 2, 1, 0, 1][k]] + 12), 0.25, 0.17));
      } else {
        const raiz = [36, 44, 39, 46][c % 4];
        const mel = [[[0, 79], [3, 77], [6, 75], [8, 72], [11, 75], [14, 77]], [[0, 75], [3, 77], [6, 79], [10, 82], [12, 79], [14, 77]]][c % 2];
        [0, 7, 10].forEach((st) => kick(at(c, st), 0.6));
        clap(at(c, 8), 0.34);
        baixo(at(c, 0), midi(raiz), 0.9, 0.65);
        baixo(at(c, 10), midi(raiz), 0.5, 0.55);
        for (let st = 0; st < 16; st++) {
          hat(at(c, st), false, st % 4 === 0 ? 0.09 : 0.055);
          if (c % 2 === 1 && st >= 12) hat(at(c, st) + Math.round((passo * SR) / 2), false, 0.05);
        }
        mel.forEach(([st, m]) => sino(at(c, st), midi(m), 0.2));
      }
    }
    // normaliza e aplica entrada/saída suaves
    let pico = 0;
    for (let i = 0; i < n; i++) pico = Math.max(pico, Math.abs(musica[i]));
    const esc = pico > 0 ? 0.9 / pico : 1;
    for (let i = 0; i < n; i++) {
      const tt = i / SR;
      let mudo = 1;
      for (const [a0, b0] of opcoes.mudo || []) {
        const m = tt >= a0 && tt <= b0 ? 0 : Math.min(1, (tt < a0 ? a0 - tt : tt - b0) / 0.15);
        mudo = Math.min(mudo, m);
      }
      musica[i] *= mudo;
      musica[i] *= esc * Math.min(1, tt / 0.4) * Math.min(1, Math.max(0, (total - tt) / 1.5)) * (opcoes.volumeTrilha ?? 0.5);
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
    boing(i0) {
      const d = 0.55 * SR; let ph = 0;
      for (let k = 0; k < d; k++) {
        const tt = k / SR, p = k / d;
        ph += (2 * Math.PI * (380 + 330 * Math.sin(2 * Math.PI * 7 * tt) * Math.exp(-tt * 5))) / SR;
        add(efeitos, i0 + k, Math.sin(ph) * Math.exp(-p * 4) * 0.3);
      }
    },
    fail(i0) {
      // "trombone triste": quatro notas descendo
      const notas = [[233, 0.3], [220, 0.3], [208, 0.3], [196, 0.9]];
      let o = i0;
      notas.forEach(([f, dur], j) => {
        const d = dur * SR;
        for (let k = 0; k < d; k++) {
          const tt = k / SR, vib = j === 3 ? 1 + 0.025 * Math.sin(2 * Math.PI * 6 * tt) : 1;
          const w = 2 * Math.PI * f * vib * tt;
          const env = Math.min(1, tt / 0.03) * Math.exp(-(k / d) * 1.6);
          add(efeitos, o + k, (Math.sin(w) + 0.5 * Math.sin(2 * w) + 0.25 * Math.sin(3 * w)) * env * 0.17);
        }
        o += Math.round((dur - 0.02) * SR);
      });
    },
    tada(i0) {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, j) => {
        const o = i0 + Math.round(j * 0.08 * SR), d = 0.7 * SR;
        for (let k = 0; k < d; k++) add(efeitos, o + k, (Math.sin((2 * Math.PI * f * k) / SR) + 0.3 * Math.sin((4 * Math.PI * f * k) / SR)) * Math.exp((-k / d) * 5) * 0.14);
      });
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
