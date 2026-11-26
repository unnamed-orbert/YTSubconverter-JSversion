// Informações para a tabela de debug do preview (sem DOM, para dar para testar no Node).
//
// O .ytt não guarda as tags do .ass de origem: cada efeito animado (\fad, \move, \t...) vira uma sequência de
// linhas curtas, uma por quadro, com o mesmo texto. Aqui essas sequências são juntadas em "trilhas" e comparadas
// quadro a quadro para adivinhar o efeito (fade, movimento, mudança de cor/tamanho) e as tags .ass prováveis.

import { AnchorPoint, OffsetType, RubyPart, ShadowType } from '../src/enums.js';

/** Folga entre o fim de um quadro e o começo do seguinte para considerar que é a mesma trilha (ms). */
const FRAME_GAP = 70;
/** Distância máxima (em px de 1280x720) entre dois quadros seguidos da mesma trilha. */
const MAX_JUMP = 160;

const AN = {
  [AnchorPoint.BottomLeft]: 1, [AnchorPoint.BottomCenter]: 2, [AnchorPoint.BottomRight]: 3,
  [AnchorPoint.MiddleLeft]: 4, [AnchorPoint.Center]: 5, [AnchorPoint.MiddleRight]: 6,
  [AnchorPoint.TopLeft]: 7, [AnchorPoint.TopCenter]: 8, [AnchorPoint.TopRight]: 9,
};

export const anNumber = (anchor) => AN[anchor] ?? 2;

const hex2 = (v) => v.toString(16).toUpperCase().padStart(2, '0');
/** #RRGGBB */
export const hexColor = (c) => `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`;
/** Cor no formato do .ass: &HBBGGRR& */
export const assColor = (c) => `&H${hex2(c.b)}${hex2(c.g)}${hex2(c.r)}&`;
/** Transparência no formato do .ass (00 = opaco): &HAA& */
export const assAlpha = (a) => `&H${hex2(255 - a)}&`;
const round1 = (v) => Math.round(v * 10) / 10;
const fmt = (v) => String(round1(v));

/** Trecho que conta para a opacidade/cor da linha: o primeiro que não é só espaço. */
function mainSection(line) {
  return line.sections.find((s) => s.text.trim() !== '') ?? line.sections[0];
}

/** Opacidade média (0-255) do texto da linha, pesada pelo número de letras de cada trecho. */
function alphaOf(line) {
  let sum = 0;
  let n = 0;
  for (const s of line.sections) {
    const len = s.text.replace(/\s/g, '').length;
    if (!len) continue;
    sum += (s.foreColor.isEmpty ? 255 : s.foreColor.a) * len;
    n += len;
  }
  return n ? Math.round(sum / n) : 0;
}

/** Opaco: o YouTube grava no máximo 254 em fo. */
const OPAQUE = 254;

// Só o texto e as camadas de sombra: num fade letra por letra os trechos mudam a cada quadro.
function trackKey(line) {
  return `${line.anchorPoint}|${line.verticalTextType}|${line.text}|${[...mainSection(line).shadowColors.keys()].join('+')}`;
}

function distance(a, b) {
  if (!a.position || !b.position) return a.position === b.position ? 0 : Infinity;
  return Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y);
}

/**
 * Junta as linhas que continuam umas às outras (mesmo texto e estilo, quadro seguinte) em trilhas.
 * @param {import('../src/model.js').Line[]} lines
 * @returns {{trackOf: Int32Array, tracks: {lines: number[], info: TrackInfo}[]}}
 */
export function buildTracks(lines) {
  const order = lines.map((_, i) => i).sort((a, b) => lines[a].start - lines[b].start || a - b);
  const trackOf = new Int32Array(lines.length);
  const tracks = [];
  /** @type {Map<string, number[]>} trilhas ainda abertas, por chave */
  const open = new Map();

  for (const i of order) {
    const line = lines[i];
    const key = trackKey(line);
    let list = open.get(key);
    if (!list) open.set(key, (list = []));

    let best = -1;
    let bestScore = Infinity;
    let w = 0;
    for (const id of list) {
      const last = lines[tracks[id].lines.at(-1)];
      if (last.end < line.start - FRAME_GAP) continue; // fechada: sai da lista
      list[w++] = id;
      if (last.start >= line.start || last.end > line.start + 20) continue; // ao mesmo tempo: outra camada
      const d = distance(last, line);
      if (d > MAX_JUMP) continue;
      const score = d + Math.abs(line.start - last.end);
      if (score < bestScore) {
        bestScore = score;
        best = id;
      }
    }
    list.length = w;

    if (best < 0) {
      best = tracks.length;
      tracks.push({ lines: [], info: null });
      list.push(best);
    }
    tracks[best].lines.push(i);
    trackOf[i] = best;
  }

  for (const track of tracks) track.info = analyzeTrack(track.lines.map((i) => lines[i]));
  return { trackOf, tracks };
}

/**
 * @typedef {object} TrackInfo
 * @property {number} frames
 * @property {number} start
 * @property {number} end
 * @property {number} maxAlpha
 * @property {number} fadeIn duração em ms (0 = sem fade-in)
 * @property {number} fadeOut
 * @property {{from: {x: number, y: number}, to: {x: number, y: number}, t1: number, t2: number} | null} move
 * @property {{from: string, to: string, fromAss: string, toAss: string} | null} color
 * @property {{from: number, to: number} | null} scale
 * @property {boolean} shadowChanges
 */

/** @returns {TrackInfo} */
function analyzeTrack(seq) {
  const first = seq[0];
  const last = seq.at(-1);
  const info = {
    frames: seq.length, start: first.start, end: last.end, maxAlpha: alphaOf(first),
    fadeIn: 0, fadeOut: 0, move: null, color: null, scale: null, shadowChanges: false,
  };
  if (seq.length < 2) return info;

  const alphas = seq.map(alphaOf);
  const maxA = Math.max(...alphas);
  info.maxAlpha = maxA;
  const near = (a) => a >= maxA - 2;
  const firstPeak = alphas.findIndex(near);
  const lastPeak = alphas.length - 1 - [...alphas].reverse().findIndex(near);
  if (firstPeak > 0) info.fadeIn = seq[firstPeak].start - first.start;
  if (lastPeak < seq.length - 1) info.fadeOut = last.end - seq[lastPeak].end;

  // Movimento: primeira e última posição, e quando começa/termina de mexer.
  const moved = (a, b) => distance(a, b) > 0.5;
  if (first.position && last.position && seq.some((l) => moved(l, first))) {
    const i1 = seq.findIndex((l) => moved(l, first)) - 1;
    let i2 = seq.length - 1;
    while (i2 > 0 && !moved(seq[i2 - 1], last)) i2--;
    info.move = {
      from: first.position, to: last.position,
      // Se mexe até o último quadro, o movimento vai até o fim da linha.
      t1: seq[Math.max(0, i1)].start - first.start,
      t2: (i2 === seq.length - 1 ? last.end : seq[i2].start) - first.start,
    };
  }

  const c0 = mainSection(first).foreColor;
  const c1 = mainSection(last).foreColor;
  const rgb = (c) => c.toArgb() & 0xffffff;
  if (seq.some((l) => rgb(mainSection(l).foreColor) !== rgb(c0))) {
    info.color = { from: hexColor(c0), to: hexColor(c1), fromAss: assColor(c0), toAss: assColor(c1) };
  }

  const s0 = mainSection(first).scale;
  if (seq.some((l) => Math.abs(mainSection(l).scale - s0) > 0.001)) {
    info.scale = { from: Math.round(s0 * 100), to: Math.round(mainSection(last).scale * 100) };
  }

  const shadowSig = (l) => [...mainSection(l).shadowColors.values()].map((c) => c.toArgb()).join(',');
  info.shadowChanges = seq.some((l) => shadowSig(l) !== shadowSig(first));
  return info;
}

/** Formatos dos trechos iguais, sem contar as sombras (camadas do mesmo texto só mudam a sombra). */
function sameExceptShadows(a, b) {
  if (a.sections.length !== b.sections.length) return false;
  return a.sections.every((x, i) => {
    const y = b.sections[i];
    return x.text === y.text && x.font === y.font && x.scale === y.scale && x.bold === y.bold && x.italic === y.italic &&
      x.underline === y.underline && x.offset === y.offset && x.rubyPart === y.rubyPart && x.startOffset === y.startOffset &&
      x.foreColor.toArgb() === y.foreColor.toArgb() && x.backColor.toArgb() === y.backColor.toArgb();
  });
}

/**
 * Agrupa as linhas ativas que são o mesmo texto no mesmo lugar e só mudam a sombra (o conversor escreve uma
 * linha por tipo de sombra quando há mais de uma).
 * @param {number[]} indices linhas ativas
 * @returns {number[][]}
 */
export function groupLayers(lines, indices) {
  const groups = [];
  for (const i of indices) {
    const line = lines[i];
    const g = groups.find((grp) => {
      const other = lines[grp[0]];
      return other.start === line.start && other.end === line.end && other.anchorPoint === line.anchorPoint &&
        distance(other, line) < 0.01 && sameExceptShadows(other, line);
    });
    if (g) g.push(i);
    else groups.push([i]);
  }
  return groups;
}

/** Sombras de um trecho somando todas as camadas do grupo, sem repetir. */
export function groupShadows(lines, group, sectionIndex) {
  const out = new Map();
  for (const i of group) {
    const s = lines[i].sections[sectionIndex];
    if (!s) continue;
    for (const [type, color] of s.shadowColors) if (!out.has(type)) out.set(type, color);
  }
  return out;
}

/** Duração do \k de cada trecho (centésimos), ou null se a linha não tem karaokê. */
export function karaokeDurations(line) {
  if (!line.sections.some((s) => s.startOffset > 0)) return null;
  const total = line.end - line.start;
  return line.sections.map((s, i) => {
    const next = line.sections.slice(i + 1).find((n) => n.startOffset !== s.startOffset);
    return Math.max(0, Math.round(((next ? next.startOffset : total) - s.startOffset) / 10));
  });
}

/**
 * Tags .ass prováveis para desenhar este grupo (palpite a partir do que o .ytt desenha).
 * @param {import('../src/model.js').Line[]} lines
 * @param {number[]} group
 * @param {TrackInfo | null} track
 */
export function guessAssTags(lines, group, track) {
  const line = lines[group[0]];
  const head = [`\\an${anNumber(line.anchorPoint)}`];
  if (track?.move) {
    const m = track.move;
    const times = m.t1 > 0 || m.t2 < track.end - track.start ? `,${m.t1},${m.t2}` : '';
    head.push(`\\move(${fmt(m.from.x)},${fmt(m.from.y)},${fmt(m.to.x)},${fmt(m.to.y)}${times})`);
  } else if (line.position) {
    head.push(`\\pos(${fmt(line.position.x)},${fmt(line.position.y)})`);
  }
  if (track && (track.fadeIn || track.fadeOut)) head.push(`\\fad(${track.fadeIn},${track.fadeOut})`);
  if (track?.color) head.push(`\\c${track.color.fromAss}\\t(\\c${track.color.toAss})`);
  if (track?.scale) head.push(`\\t(\\fscx${track.scale.to}\\fscy${track.scale.to})`);

  const k = karaokeDurations(line);
  const parts = [];
  let prev = null;
  let prevShadowSig = '';
  const fading = Boolean(track && (track.fadeIn || track.fadeOut));
  line.sections.forEach((s, idx) => {
    const tags = [];
    if (k) tags.push(`\\k${k[idx]}`);
    if (s.font && s.font !== prev?.font) tags.push(`\\fn${s.font}`);
    if (s.bold !== (prev?.bold ?? false)) tags.push(`\\b${s.bold ? 1 : 0}`);
    if (s.italic !== (prev?.italic ?? false)) tags.push(`\\i${s.italic ? 1 : 0}`);
    if (s.underline !== (prev?.underline ?? false)) tags.push(`\\u${s.underline ? 1 : 0}`);
    if (!track?.color && !s.foreColor.isEmpty && (!prev || prev.foreColor.toArgb() !== s.foreColor.toArgb())) {
      tags.push(`\\c${assColor(s.foreColor)}`);
    }
    // Com fade a opacidade muda a cada quadro: vale a do pico, não a do quadro atual.
    const alpha = fading ? track.maxAlpha : s.foreColor.a;
    const prevAlpha = prev ? (fading ? track.maxAlpha : prev.foreColor.a) : OPAQUE;
    if (!s.foreColor.isEmpty && Math.min(alpha, OPAQUE) !== Math.min(prevAlpha, OPAQUE)) tags.push(`\\1a${assAlpha(Math.min(alpha, OPAQUE) === OPAQUE ? 255 : alpha)}`);
    const shadows = groupShadows(lines, group, idx);
    const sig = [...shadows].map(([type, c]) => type + c.toArgb()).join();
    if (sig !== prevShadowSig) {
      const glow = shadows.get(ShadowType.Glow);
      const drop = [...shadows].find(([type]) => type !== ShadowType.Glow)?.[1];
      if (glow) tags.push(`\\3c${assColor(glow)}`, '\\bord2');
      else if (prevShadowSig) tags.push('\\bord0');
      if (drop) tags.push(`\\4c${assColor(drop)}`, '\\shad2');
      else if (prevShadowSig) tags.push('\\shad0');
      if (glow && glow.a < OPAQUE) tags.push(`\\3a${assAlpha(glow.a)}`);
      if (drop && drop.a < OPAQUE) tags.push(`\\4a${assAlpha(drop.a)}`);
      prevShadowSig = sig;
    }
    if (s.offset === OffsetType.Subscript) tags.push('\\ytsub');
    else if (s.offset === OffsetType.Superscript) tags.push('\\ytsup');
    if (s.rubyPart === RubyPart.Base) tags.push('\\ytruby2');
    if (s.packed) tags.push('\\ytpack1');
    const text = s.text.replace(/\r?\n/g, '\\N');
    parts.push((tags.length ? `{${tags.join('')}}` : '') + text);
    prev = s;
  });
  return `{${head.join('')}}${parts.join('')}`;
}

const pct = (a) => Math.round((Math.min(a, OPAQUE) === OPAQUE ? 255 : a) / 2.55);

/**
 * Efeitos percebidos no grupo, como itens traduzíveis ({key, params} com chaves de i18n.js).
 * @param {import('../src/model.js').Line[]} lines
 * @param {number[]} group
 * @param {{lines: number[], info: TrackInfo} | null} track
 */
export function describeEffects(lines, group, track) {
  const line = lines[group[0]];
  const out = [];
  const info = track?.info;
  if (info && info.frames > 1) {
    out.push({ key: 'dbgFrames', params: { i: track.lines.indexOf(group[0]) + 1, n: info.frames, ms: info.end - info.start } });
  }
  if (info?.fadeIn) out.push({ key: 'dbgFadeIn', params: { ms: info.fadeIn } });
  if (info?.fadeOut) out.push({ key: 'dbgFadeOut', params: { ms: info.fadeOut } });
  const now = alphaOf(line);
  if (info && info.frames > 1 && now < info.maxAlpha - 2) {
    out.push({ key: 'dbgOpacityNow', params: { now: pct(now), max: pct(info.maxAlpha) } });
  }

  const alphas = line.sections.filter((s) => s.text.trim() !== '' && !s.foreColor.isEmpty).map((s) => s.foreColor.a);
  if (new Set(alphas.map((a) => Math.min(a, OPAQUE))).size >= 2) {
    out.push({ key: 'dbgAlphaSteps', params: { n: alphas.length, from: pct(alphas[0]), to: pct(alphas.at(-1)) } });
  }
  if (info?.move) {
    const { from, to } = info.move;
    out.push({ key: 'dbgMove', params: { x1: fmt(from.x), y1: fmt(from.y), x2: fmt(to.x), y2: fmt(to.y) } });
  }
  if (info?.color) out.push({ key: 'dbgColorAnim', params: { from: info.color.from, to: info.color.to } });
  if (info?.scale) out.push({ key: 'dbgScaleAnim', params: { from: info.scale.from, to: info.scale.to } });
  if (info?.shadowChanges) out.push({ key: 'dbgShadowAnim' });
  if (group.length > 1) out.push({ key: 'dbgLayers', params: { n: group.length } });
  const k = karaokeDurations(line);
  if (k) out.push({ key: 'dbgKaraoke', params: { n: line.sections.length } });
  return out;
}

export { alphaOf, pct as opacityPercent };
