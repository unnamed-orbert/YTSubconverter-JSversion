// Compara duas legendas (normalmente o .ytt original e o .ytt refeito a partir do .ass recuperado).
//
// A cada `step` ms (100 por padrão) pega o que está na tela nos dois lados, emparelha as linhas visíveis
// (pelo texto e pela posição) e compara texto, posição, cor e opacidade. O resultado tem a semelhança geral
// (média das amostras em que algum dos lados mostra alguma coisa), a semelhança por propriedade, a nota de
// cada amostra (para desenhar na barra de tempo) e os trechos de tempo em que os dois diferem.
// Não usa DOM: roda no Node (testes) e no navegador (página).

import { AnchorPoint } from '../enums.js';

const REF_WIDTH = 1280;
const REF_HEIGHT = 720;

/** Distância (px de 1280x720) até a qual a posição conta como igual; a nota cai até zero em POS_ZERO. */
const POS_TOLERANCE = 6;
const POS_ZERO = 120;
/** Diferença de cor (0-255 por canal, média) até a qual conta como igual; a nota cai até zero em COLOR_ZERO. */
const COLOR_TOLERANCE = 12;
const COLOR_ZERO = 160;
/** Diferença de opacidade (0-255) até a qual conta como igual; a nota cai até zero em ALPHA_ZERO. */
const ALPHA_TOLERANCE = 16;
const ALPHA_ZERO = 200;
/** Abaixo desta nota a amostra é marcada como diferente. */
const SAMPLE_DIFF = 0.97;

export const PROPERTIES = ['text', 'position', 'color', 'opacity'];

const ANCHOR = {
  [AnchorPoint.TopLeft]: [0, 0], [AnchorPoint.TopCenter]: [50, 0], [AnchorPoint.TopRight]: [100, 0],
  [AnchorPoint.MiddleLeft]: [0, 50], [AnchorPoint.Center]: [50, 50], [AnchorPoint.MiddleRight]: [100, 50],
  [AnchorPoint.BottomLeft]: [0, 100], [AnchorPoint.BottomCenter]: [50, 100], [AnchorPoint.BottomRight]: [100, 100],
};

/** Posição da linha (a padrão do alinhamento, como no preview, quando não tem \pos). */
export function linePosition(line) {
  if (line.position) return line.position;
  const [ax, ay] = ANCHOR[line.anchorPoint] ?? ANCHOR[AnchorPoint.BottomCenter];
  return { x: REF_WIDTH * (0.02 + 0.0096 * ax), y: REF_HEIGHT * (0.02 + 0.0096 * ay) };
}

/** Só as linhas que aparecem (como no preview). */
export function visibleLines(lines) {
  return lines.filter((l) => l.end > l.start && l.text.trim() !== '');
}

/**
 * O que uma linha mostra no instante t: texto visível (trechos do karaokê que já começaram e não estão
 * totalmente transparentes), cor de cada letra,
 * opacidade média e posição.
 */
function snapshot(line, index, t) {
  let text = '';
  const colors = [];
  let alphaSum = 0;
  for (const s of line.sections) {
    if (t < line.start + s.startOffset) continue;
    // Trecho totalmente transparente não aparece (ex.: sílabas do karaokê do json3 que ainda não chegaram).
    if (!s.foreColor.isEmpty && s.foreColor.a === 0) continue;
    const str = (s.text ?? '').replace(/\r\n|\r/g, '\n');
    text += str;
    const c = s.foreColor;
    const rgb = c.isEmpty ? [255, 255, 255] : [c.r, c.g, c.b];
    const a = c.isEmpty ? 255 : c.a;
    for (const ch of str) {
      if (/\s/.test(ch)) continue;
      colors.push(rgb);
      alphaSum += a;
    }
  }
  const pos = linePosition(line);
  return { index, text, key: text.replace(/\s+/g, ' ').trim(), colors, alpha: colors.length ? alphaSum / colors.length : 0, x: pos.x, y: pos.y };
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

const textCache = new Map();
/** Semelhança de texto de 0 a 1 (1 - distância de edição / tamanho maior). */
export function textSimilarity(a, b) {
  if (a === b) return 1;
  const key = a.length < b.length ? `${a}\u0000${b}` : `${b}\u0000${a}`;
  let v = textCache.get(key);
  if (v === undefined) {
    // Textos muito longos: compara só o começo (a distância de edição é quadrática).
    const A = [...a].slice(0, 300);
    const B = [...b].slice(0, 300);
    v = 1 - levenshtein(A, B) / Math.max(A.length, B.length);
    if (textCache.size > 50000) textCache.clear();
    textCache.set(key, v);
  }
  return v;
}

/** 1 até `tol`, cai em linha reta até 0 em `zero`. */
const falloff = (d, tol, zero) => (d <= tol ? 1 : d >= zero ? 0 : 1 - (d - tol) / (zero - tol));

function colorDistance(a, b) {
  // Letras emparelhadas pela ordem (o texto pode ter tamanhos diferentes: compara o trecho em comum).
  const n = Math.min(a.length, b.length);
  if (!n) return a.length === b.length ? 0 : 255;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += (Math.abs(a[i][0] - b[i][0]) + Math.abs(a[i][1] - b[i][1]) + Math.abs(a[i][2] - b[i][2])) / 3;
  }
  return sum / n;
}

/** Compara duas linhas visíveis: nota de 0 a 1 por propriedade. */
function comparePair(a, b) {
  const text = textSimilarity(a.key, b.key);
  const dist = Math.hypot(a.x - b.x, a.y - b.y);
  const colorDist = colorDistance(a.colors, b.colors);
  const alphaDist = Math.abs(a.alpha - b.alpha);
  const scores = {
    text,
    position: falloff(dist, POS_TOLERANCE, POS_ZERO),
    color: falloff(colorDist, COLOR_TOLERANCE, COLOR_ZERO),
    opacity: falloff(alphaDist, ALPHA_TOLERANCE, ALPHA_ZERO),
  };
  return {
    scores,
    score: (scores.text + scores.position + scores.color + scores.opacity) / 4,
    dist,
    colorDist,
    alphaDist,
  };
}

/**
 * Emparelha as linhas visíveis dos dois lados: primeiro as de texto igual mais próximas, depois o resto pela
 * melhor nota. O que sobra fica sem par (linha a mais ou a menos).
 */
function matchItems(as, bs) {
  const candidates = [];
  for (let i = 0; i < as.length; i++) {
    for (let j = 0; j < bs.length; j++) {
      const cmp = comparePair(as[i], bs[j]);
      // Texto sem nada em comum e longe: não é a mesma linha.
      if (cmp.scores.text < 0.5 && cmp.scores.position === 0) continue;
      candidates.push({ i, j, cmp, rank: (cmp.scores.text === 1 ? 2 : 0) + cmp.score });
    }
  }
  candidates.sort((x, y) => y.rank - x.rank || x.cmp.dist - y.cmp.dist);
  const usedA = new Set();
  const usedB = new Set();
  const pairs = [];
  for (const c of candidates) {
    if (usedA.has(c.i) || usedB.has(c.j)) continue;
    usedA.add(c.i);
    usedB.add(c.j);
    pairs.push({ a: as[c.i], b: bs[c.j], ...c.cmp });
  }
  return {
    pairs,
    onlyA: as.filter((_, i) => !usedA.has(i)),
    onlyB: bs.filter((_, j) => !usedB.has(j)),
  };
}

/** Linhas na tela em cada instante, com varredura (as linhas ordenadas pelo começo). */
function makeSweeper(lines) {
  const order = lines.map((_, i) => i).sort((a, b) => lines[a].start - lines[b].start);
  let next = 0;
  let active = [];
  return (t) => {
    while (next < order.length && lines[order[next]].start <= t) active.push(order[next++]);
    active = active.filter((i) => lines[i].end > t);
    return active.filter((i) => lines[i].start <= t).sort((x, y) => x - y);
  };
}

/** Linha que aparece de fato: tem texto e não está totalmente transparente. */
const shown = (s) => s.key !== '' && s.alpha >= 1;

/**
 * Compara o que está na tela nos dois lados num instante.
 * @returns {{score: number | null, scores: Record<string, number>, pairs: object[], onlyA: object[], onlyB: object[]}}
 *   score null quando os dois lados estão vazios.
 */
export function compareAt(linesA, linesB, t, activeA, activeB) {
  const as = (activeA ?? linesA.map((_, i) => i).filter((i) => linesA[i].start <= t && linesA[i].end > t))
    .map((i) => snapshot(linesA[i], i, t)).filter(shown);
  const bs = (activeB ?? linesB.map((_, i) => i).filter((i) => linesB[i].start <= t && linesB[i].end > t))
    .map((i) => snapshot(linesB[i], i, t)).filter(shown);
  const { pairs, onlyA, onlyB } = matchItems(as, bs);
  const total = pairs.length + onlyA.length + onlyB.length;
  const scores = {};
  if (!total) {
    for (const p of PROPERTIES) scores[p] = 1;
    return { score: null, scores, pairs, onlyA, onlyB };
  }
  // Linha sem par conta como zero em tudo.
  for (const p of PROPERTIES) scores[p] = pairs.reduce((sum, x) => sum + x.scores[p], 0) / total;
  const score = pairs.reduce((sum, x) => sum + x.score, 0) / total;
  return { score, scores, pairs, onlyA, onlyB };
}

/** Quais propriedades diferem numa comparação (para os rótulos). */
export function differences(result) {
  const kinds = new Set();
  if (result.onlyA.length || result.onlyB.length) kinds.add('missing');
  for (const p of result.pairs) {
    for (const prop of PROPERTIES) if (p.scores[prop] < 1) kinds.add(prop);
  }
  return kinds;
}

/**
 * Compara as duas legendas inteiras, uma amostra a cada `step` ms.
 * @param {import('../model.js').Line[]} linesA original
 * @param {import('../model.js').Line[]} linesB refeito
 * @param {{step?: number}} [options]
 * @returns {{
 *   step: number, duration: number,
 *   similarity: number, byProperty: Record<string, number>,
 *   samples: Float32Array,  // nota de cada amostra (0-1), NaN quando os dois lados estão vazios
 *   kinds: Uint8Array,      // bits das diferenças de cada amostra: 1 texto, 2 posição, 4 cor, 8 opacidade, 16 linha sem par
 *   segments: {start: number, end: number, kinds: string[], worst: number}[],
 *   counted: number,
 * }}
 */
export function compareDocuments(linesA, linesB, options = {}) {
  const step = options.step ?? 100;
  linesA = visibleLines(linesA);
  linesB = visibleLines(linesB);
  const end = Math.max(0, ...linesA.map((l) => l.end), ...linesB.map((l) => l.end));
  const n = Math.ceil(end / step) + 1;
  const samples = new Float32Array(n);
  const kinds = new Uint8Array(n);
  const sweepA = makeSweeper(linesA);
  const sweepB = makeSweeper(linesB);
  let sum = 0;
  let counted = 0;
  const propSum = Object.fromEntries(PROPERTIES.map((p) => [p, 0]));

  for (let k = 0; k < n; k++) {
    // No meio do intervalo (evita cair bem na troca de quadro)
    const t = k * step + step / 2;
    const r = compareAt(linesA, linesB, t, sweepA(t), sweepB(t));
    if (r.score === null) {
      samples[k] = NaN;
      continue;
    }
    samples[k] = r.score;
    sum += r.score;
    counted++;
    for (const p of PROPERTIES) propSum[p] += r.scores[p];
    if (r.score < SAMPLE_DIFF) {
      const d = differences(r);
      kinds[k] = (d.has('text') ? 1 : 0) | (d.has('position') ? 2 : 0) | (d.has('color') ? 4 : 0) |
        (d.has('opacity') ? 8 : 0) | (d.has('missing') ? 16 : 0);
    }
  }

  // Trechos seguidos de amostras diferentes
  const segments = [];
  let cur = null;
  for (let k = 0; k < n; k++) {
    if (kinds[k]) {
      if (cur && cur.endK === k - 1) {
        cur.endK = k;
        cur.bits |= kinds[k];
        cur.worst = Math.min(cur.worst, samples[k]);
      } else {
        cur = { startK: k, endK: k, bits: kinds[k], worst: samples[k] };
        segments.push(cur);
      }
    }
  }

  const pct = (v) => (counted ? (v / counted) * 100 : 100);
  return {
    step,
    duration: n * step,
    similarity: pct(sum),
    byProperty: Object.fromEntries(PROPERTIES.map((p) => [p, pct(propSum[p])])),
    samples,
    kinds,
    counted,
    segments: segments.map((s) => ({
      start: s.startK * step,
      end: (s.endK + 1) * step,
      kinds: kindNames(s.bits),
      worst: s.worst,
    })),
  };
}

export function kindNames(bits) {
  const names = [];
  if (bits & 1) names.push('text');
  if (bits & 2) names.push('position');
  if (bits & 4) names.push('color');
  if (bits & 8) names.push('opacity');
  if (bits & 16) names.push('missing');
  return names;
}
