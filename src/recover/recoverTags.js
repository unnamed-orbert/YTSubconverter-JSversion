// Recuperação de tags: .ytt -> .ass tentando reconstruir as tags originais por heurística.
//
// Não existe no YTSubConverter original. Quando o original converte um .ass com animação para .ytt, cada efeito vira
// uma pilha de <p> estáticos (um a cada dois quadros enquanto a animação roda, um por camada de sombra). A conversão
// comum .ytt -> .ass devolve esses quadros um por um. Aqui fazemos o caminho inverso do Animator.cs:
//
//   1. Camadas de sombra: as cópias de uma mesma linha, uma por tipo de sombra (expandLineForMultiShadows),
//      voltam a ser uma linha só com todas as sombras.
//   2. Trilhas: quadros seguidos (o fim de um é o começo do outro) com o mesmo texto e a mesma estrutura viram uma
//      trilha, que é uma linha do .ass original.
//   3. Em cada trilha:
//      - opacidade subindo/descendo igual em todas as letras            -> \fad / \fade
//      - cor/tamanho mudando aos poucos em todas as letras ao mesmo tempo -> \t(t1,t2,...)
//      - letras mudando de cor em sequência, da esquerda para a direita   -> \k (e \ytkt(Fade) se a troca é gradual)
//      - posição andando sempre no mesmo sentido                          -> \move
//      - posição tremendo em volta de um ponto                            -> \ytshake
//   4. Trilhas coloridas sem sombra, com o mesmo texto, que andam até a posição de outra trilha logo antes de ela
//      aparecer (ou logo depois de ela sumir)                             -> \ytchroma
//   5. Estilos: um por combinação de fonte/cores/sombras, com nome YT<sombras>[Box] (ver inferStyleOptionsFromName).
//
// O resultado é aproximado: o .ytt só guarda posições em % inteiro, opacidades por quadro e tempos em ms, então
// tempos e raios saem arredondados. Cada tag recuperada vem com o motivo (campo "reason") para uma tabela de debug.

import { AnchorPoint, HorizontalTextDirection, OffsetType, ShadowType, VerticalTextType } from '../enums.js';
import { Color } from '../util/color.js';
import { formatFloat } from '../util/numbers.js';
import { YttDocument } from '../formats/ytt.js';
import { AssLineContentBuilder, Float, formatTimestamp, SCRIPT_GENERATOR_VERSION } from '../formats/ass/assWriter.js';
import { getAlignment } from '../formats/ass/assModel.js';
import { getHorizontalTextDirectionId, getVerticalTextTypeId } from '../formats/ass/tags.js';

const DEFAULT_LINE_HEIGHT = 38;
/** Ordem das camadas que o escritor .ytt gera (expandLineForMultiShadows). */
const LAYER_ORDER = [ShadowType.SoftShadow, ShadowType.HardShadow, ShadowType.Bevel, ShadowType.Glow];
/** Ordem dos tipos no nome do estilo. */
const NAME_ORDER = [ShadowType.Glow, ShadowType.SoftShadow, ShadowType.HardShadow, ShadowType.Bevel];
/** Quadros de animação têm 2 quadros de vídeo (~67 ms; o último de uma animação pode ter 3, ~100 ms); acima disso é uma linha parada. */
const ANIM_FRAME_MAX_MS = 110;
const COLOR_TOLERANCE = 10;
const ALPHA_TOLERANCE = 14;

/**
 * Recupera as tags de um .ytt.
 * @param {string | Uint8Array | YttDocument | {lines: import('../model.js').Line[], videoDimensions?: object}} input
 *   conteúdo do .ytt/.srv3, um documento já lido ou só as linhas (sourceLines dos eventos são índices nelas)
 * @returns {{events: RecoveredEvent[], styles: RecoveredStyle[], ass: string, styleOptionsXml: string, summary: Record<string, number>}}
 *
 * @typedef {{tag: string, text: string, reason: string}} RecoveredTag
 * @typedef {{start: number, end: number, style: string, text: string, assText: string, tags: RecoveredTag[], frames: number, phrase: number, sourceLines: number[]}} RecoveredEvent
 * @typedef {{name: string, shadowTypes: string[], line: string}} RecoveredStyle
 */
export function recoverTags(input) {
  let doc;
  if (input instanceof YttDocument) doc = input;
  else if (Array.isArray(input?.lines)) {
    // Linhas já lidas (ex.: as do preview); sourceLines são índices nessa lista
    doc = new YttDocument();
    doc.lines = input.lines;
    if (input.videoDimensions) doc.videoDimensions = { ...input.videoDimensions };
  } else doc = YttDocument.parse(input);
  const frames = mergeShadowLayers(doc.lines.map((line, i) => toFrame(line, i)));
  normalizeVariantTexts(frames);
  const tracks = buildTracks(frames);

  const results = [];
  for (const track of tracks) results.push(...analyzeTrack(track, doc));
  detectChroma(results, doc);

  const events = results.filter((r) => !r.removed).sort((a, b) => a.start - b.start || a.sourceLines[0] - b.sourceLines[0]);
  assignPhrases(events, doc);
  return writeAss(doc, events);
}

// ---------------------------------------------------------------------------------------------
// Quadros (uma linha do .ytt, letra por letra)

function toFrame(line, index) {
  const chars = [];
  for (const s of line.sections) {
    for (const ch of s.text) {
      chars.push({
        ch,
        fore: s.foreColor,
        back: s.backColor,
        shadows: new Map(s.shadowColors),
        font: s.font,
        scale: s.scale,
        bold: s.bold,
        italic: s.italic,
        underline: s.underline,
        offset: s.offset,
        packed: s.packed,
        startOffset: s.startOffset,
      });
    }
  }
  return {
    sources: [index],
    start: line.start,
    end: line.end,
    anchor: line.anchorPoint,
    pos: line.position ? { x: line.position.x, y: line.position.y } : null,
    hdir: line.horizontalTextDirection,
    vtype: line.verticalTextType,
    text: chars.map((c) => c.ch).join(''),
    chars,
  };
}

const isBlank = (ch) => /^[\s ​]$/u.test(ch);
const samePos = (a, b) => (a == null && b == null) || (a != null && b != null && Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01);
const charStruct = (c) => `${c.ch}|${c.font}|${c.bold ? 1 : 0}${c.italic ? 1 : 0}${c.underline ? 1 : 0}|${c.offset}|${c.packed ? 1 : 0}`;

/** Passo 1: junta as cópias de uma linha (uma por tipo de sombra) numa linha só. */
function mergeShadowLayers(frames) {
  const merged = [];
  let i = 0;
  while (i < frames.length) {
    const group = frames[i];
    let j = i + 1;
    while (j < frames.length && canMergeLayer(group, frames[j])) {
      group.chars.forEach((c, k) => {
        for (const [type, color] of frames[j].chars[k].shadows) c.shadows.set(type, color);
      });
      group.sources.push(...frames[j].sources);
      j++;
    }
    merged.push(group);
    i = j;
  }
  return merged;
}

function canMergeLayer(a, b) {
  if (a.start !== b.start || a.end !== b.end || a.anchor !== b.anchor || !samePos(a.pos, b.pos) || a.text !== b.text) return false;
  if (a.chars.length !== b.chars.length) return false;
  let anyShadow = false;
  for (let k = 0; k < a.chars.length; k++) {
    const ca = a.chars[k];
    const cb = b.chars[k];
    if (charStruct(ca) !== charStruct(cb) || ca.scale !== cb.scale || ca.fore.toArgb() !== cb.fore.toArgb()) return false;
    if (cb.shadows.size > 1) return false;
    if (cb.shadows.size === 1) {
      const [type] = cb.shadows.keys();
      if (ca.shadows.size === 0 || ca.shadows.has(type)) return false;
      const maxOrder = Math.max(...[...ca.shadows.keys()].map((t) => LAYER_ORDER.indexOf(t)));
      if (LAYER_ORDER.indexOf(type) <= maxOrder) return false;
      anyShadow = true;
    }
  }
  return anyShadow;
}

/**
 * Frases, no mesmo esquema do deduplicador (src/dedup.js): mesmo texto, posição na mesma célula de uma grade de 20%
 * da tela e até 200 ms entre um pedaço e o próximo. Uma frase pode ter vários eventos (ex.: a linha dividida
 * quando tudo muda de uma vez, ou o texto principal e uma camada de brilho por cima); o número da frase vai no
 * resultado para a tabela de debug agrupar.
 */
function assignPhrases(events, doc) {
  const { width, height } = doc.videoDimensions;
  const open = new Map();
  let next = 0;
  for (const e of events) {
    const p = e.basePos ?? e.move?.from ?? doc.getDefaultPosition(e.anchor);
    const key = `${e.text.replace(/\s+/g, ' ').trim()}|${Math.round((p.x / width) * 5)}|${Math.round((p.y / height) * 5)}`;
    const phrase = open.get(key);
    if (phrase && e.start <= phrase.end + 200) {
      e.phrase = phrase.id;
      phrase.end = Math.max(phrase.end, e.end);
    } else {
      e.phrase = next++;
      open.set(key, { id: e.phrase, end: e.end });
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Passo 1b: karaokê Glitch e Cursor (o texto muda de um quadro para outro)
//
// \ytkt(Glitch): no primeiro quadro de cada sílaba, a sílaba que começa a ser cantada vira um caractere aleatório.
// \ytkt(Cursor/LCursor): cada passo do karaokê ganha um cursor ("_", "|"...) inserido depois do que já foi cantado
// (Cursor) ou antes da sílaba que está sendo cantada (LCursor), trocando a cada intervalo.
// Os quadros seguidos no mesmo lugar formam uma cadeia; se o texto varia só desse jeito, o texto "de verdade" é
// recuperado, os quadros são reescritos com ele (para virarem uma trilha só) e a variação fica anotada no quadro.

const MAX_CURSOR_LENGTH = 4;

function commonPrefix(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

function commonSuffix(a, b, max) {
  let i = 0;
  while (i < max && a[a.length - 1 - i] === b[b.length - 1 - i]) i++;
  return i;
}

/** Posição em que `text` tem algo inserido em relação a `base` (ou -1 se não for uma inserção). */
function insertionAt(text, base) {
  const d = text.length - base.length;
  if (d === 0) return text === base ? null : -1;
  if (d < 0 || d > MAX_CURSOR_LENGTH) return -1;
  const p = commonPrefix(text, base);
  for (let i = p; i >= 0; i--) {
    if (text.slice(0, i) === base.slice(0, i) && text.slice(i + d) === base.slice(i)) return i;
  }
  return -1;
}

function similarTexts(a, b) {
  if (a === b) return true;
  const p = commonPrefix(a, b);
  const sfx = commonSuffix(a, b, Math.min(a.length, b.length) - p);
  const da = a.length - p - sfx;
  const db = b.length - p - sfx;
  // Uma sílaba inteira (até ~40 caracteres) trocada por um caractere só: \\ytkt(Glitch)
  if (p + sfx >= 2 && ((da <= 12 && db <= 12) || (Math.min(da, db) <= 1 && Math.max(da, db) <= 40))) return true;
  // O cursor mudou de lugar: tirando um trecho curto de cada um, sobra o mesmo texto
  if (Math.abs(a.length - b.length) > MAX_CURSOR_LENGTH || Math.min(a.length, b.length) < 4) return false;
  const without = (t) => {
    const set = new Set([t]);
    for (let len = 1; len <= MAX_CURSOR_LENGTH; len++) for (let i = 0; i + len <= t.length; i++) set.add(t.slice(0, i) + t.slice(i + len));
    return set;
  };
  const wa = without(a);
  for (const t of without(b)) if (t.length >= 3 && wa.has(t)) return true;
  return false;
}

function buildChains(frames) {
  const sorted = [...frames].sort((a, b) => a.start - b.start || a.sources[0] - b.sources[0]);
  const chains = [];
  const open = [];
  for (const f of sorted) {
    let best = null;
    for (const chain of open) {
      const last = chain[chain.length - 1];
      if (Math.abs(last.end - f.start) > 2 || chain.taken === f.start) continue;
      if (last.anchor !== f.anchor || !samePos(last.pos, f.pos) || !similarTexts(last.text, f.text)) continue;
      if (!best || (best[best.length - 1].text !== f.text && last.text === f.text)) best = chain;
    }
    if (best) {
      best.push(f);
      best.taken = f.start;
    } else {
      best = [f];
      best.taken = f.start;
      chains.push(best);
      open.push(best);
    }
    // Cadeias que já acabaram saem da lista
    for (let i = open.length - 1; i >= 0; i--) if (open[i][open[i].length - 1].end < f.start - 2) open.splice(i, 1);
  }
  return chains;
}

function normalizeVariantTexts(frames) {
  for (const chain of buildChains(frames)) {
    const texts = new Set(chain.map((f) => f.text));
    if (texts.size < 2) continue;
    if (!tryCursor(chain)) tryGlitch(chain);
  }
}

function setChars(frame, chars) {
  frame.chars = chars;
  frame.text = chars.map((c) => c.ch).join('');
}

function tryCursor(chain) {
  const first = chain[0].text;
  const candidates = new Set([first]);
  for (let len = 1; len <= MAX_CURSOR_LENGTH; len++) {
    for (let i = 0; i + len <= first.length; i++) candidates.add(first.slice(0, i) + first.slice(i + len));
  }
  let base = null;
  for (const cand of candidates) {
    if (cand.trim().length === 0 || (base && cand.length <= base.length)) continue;
    if (chain.every((f) => insertionAt(f.text, cand) !== -1)) base = cand;
  }
  if (base == null) return false;
  const inserted = chain.map((f) => {
    const at = insertionAt(f.text, base);
    return at == null ? null : { at, text: f.text.slice(at, at + f.text.length - base.length) };
  });
  const withCursor = inserted.filter((x) => x);
  // O cursor é um texto curto, de poucas formas, presente em (quase) todos os quadros e que anda pela linha;
  // texto que só cresce no fim (máquina de escrever) ou troca de palavra não é cursor.
  if (withCursor.length < 3 || withCursor.length < chain.length * 0.9) return false;
  const cursorTexts = new Set(withCursor.map((x) => x.text));
  if (cursorTexts.size > 4 || base.trim().length < 3) return false;
  if (new Set(withCursor.map((x) => x.at)).size < 2) return false;
  for (let i = 1; i < withCursor.length; i++) if (withCursor[i].at < withCursor[i - 1].at) return false;

  chain.forEach((f, i) => {
    const ins = inserted[i];
    if (!ins) return;
    const cursorChars = f.chars.slice(ins.at, ins.at + ins.text.length);
    f.cursor = { at: ins.at, text: ins.text, color: cursorChars.find((c) => !isBlank(c.ch))?.fore ?? cursorChars[0].fore };
    setChars(f, [...f.chars.slice(0, ins.at), ...f.chars.slice(ins.at + ins.text.length)]);
  });
  return true;
}

function tryGlitch(chain) {
  const counts = new Map();
  for (const f of chain) counts.set(f.text, (counts.get(f.text) ?? 0) + (f.end - f.start));
  const base = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const edits = [];
  for (const f of chain) {
    if (f.text === base) {
      edits.push(null);
      continue;
    }
    const p = commonPrefix(f.text, base);
    const sfx = commonSuffix(f.text, base, Math.min(f.text.length, base.length) - p);
    const middle = f.text.length - p - sfx;
    const replaced = base.length - p - sfx;
    // O resto da linha fica igual (só uma sílaba vira o caractere aleatório)
    if (p + sfx < Math.max(2, base.length * 0.4)) return false;
    // Um caractere no lugar da sílaba inteira (que pode ter um caractere só e coincidir em parte)
    if (middle !== 1 || replaced < 1 || f.end - f.start > ANIM_FRAME_MAX_MS) return false;
    edits.push({ at: p, replaced, middle });
  }
  const glitched = edits.filter((x) => x);
  if (glitched.length === 0 || glitched.length > chain.length / 2) return false;

  chain.forEach((f, i) => {
    const e = edits[i];
    if (!e) return;
    const model = f.chars[e.at] ?? f.chars[e.at - 1];
    const fill = [...base.slice(e.at, e.at + e.replaced)].map((ch) => ({ ...model, ch, shadows: new Map(model.shadows) }));
    f.glitch = { at: e.at, text: f.text.slice(e.at, e.at + e.middle) };
    setChars(f, [...f.chars.slice(0, e.at), ...fill, ...f.chars.slice(e.at + e.middle)]);
  });
  return true;
}

// ---------------------------------------------------------------------------------------------
// Passo 2: trilhas

function trackKey(frame) {
  return `${frame.anchor}|${frame.hdir}|${frame.vtype}|${frame.chars.map(charStruct).join('\u0001')}`;
}

function firstVisibleColor(frame) {
  const c = frame.chars.find((ch) => !isBlank(ch.ch) && ch.fore.a > 0) ?? frame.chars[0];
  return c.fore;
}

function frameDistance(track, frame) {
  const last = track.frames[track.frames.length - 1];
  let posDist = 0;
  if (last.pos && frame.pos) posDist = Math.hypot(last.pos.x - frame.pos.x, last.pos.y - frame.pos.y);
  else if (!samePos(last.pos, frame.pos)) posDist = 1000;
  const a = firstVisibleColor(last);
  const b = firstVisibleColor(frame);
  const colorDist = Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b) + Math.abs(a.a - b.a) / 4;
  return { posDist, score: posDist + colorDist / 4 };
}

/** Cor única de um quadro sem sombra nem caixa (candidato a cópia do \\ytchroma), ou null. */
function plainColor(frame) {
  let color = null;
  for (const c of frame.chars) {
    if (isBlank(c.ch)) continue;
    if (c.shadows.size > 0 || c.back.a > 0) return null;
    if (color && !sameColor(color, c.fore, false)) return null;
    color ??= c.fore;
  }
  return color;
}

/**
 * Cópias de \\ytchroma: quadros que começam juntos, com o mesmo texto, sem sombra e cada um de uma cor. Elas ganham
 * uma chave própria por cor, para não serem coladas na trilha do texto principal (que começa quando elas acabam).
 */
function markColorCopies(batch) {
  const byText = new Map();
  for (const item of batch) {
    const color = plainColor(item.frame);
    if (!color) continue;
    const list = byText.get(item.frame.text) ?? [];
    list.push({ item, color });
    byText.set(item.frame.text, list);
  }
  for (const list of byText.values()) {
    const colors = new Set(list.map((x) => colorToHex(x.color)));
    if (colors.size < 2) continue;
    for (const { item, color } of list) item.key += `|copia ${colorToHex(color)}`;
  }
}

function buildTracks(frames) {
  const sorted = frames
    .filter((f) => f.chars.some((c) => !isBlank(c.ch)))
    .sort((a, b) => a.start - b.start || a.sources[0] - b.sources[0]);

  const tracks = [];
  /** @type {Map<number, object[]>} fim da trilha -> trilhas que terminam nesse ms */
  const openByEnd = new Map();
  const addOpen = (track) => {
    const list = openByEnd.get(track.end) ?? [];
    list.push(track);
    openByEnd.set(track.end, list);
  };
  const removeOpen = (track) => {
    const list = openByEnd.get(track.end);
    list.splice(list.indexOf(track), 1);
    if (list.length === 0) openByEnd.delete(track.end);
  };

  let i = 0;
  while (i < sorted.length) {
    const start = sorted[i].start;
    let j = i;
    while (j < sorted.length && sorted[j].start === start) j++;
    const batch = sorted.slice(i, j).map((frame) => ({ frame, key: trackKey(frame), track: null }));
    markColorCopies(batch);

    const candidates = [];
    for (let end = start - 2; end <= start + 2; end++) candidates.push(...(openByEnd.get(end) ?? []));

    const pairs = [];
    for (const item of batch) {
      for (const track of candidates) {
        if (track.key !== item.key) continue;
        const { posDist, score } = frameDistance(track, item.frame);
        if (posDist <= 200) pairs.push({ item, track, score });
      }
    }
    pairs.sort((a, b) => a.score - b.score);
    const usedTracks = new Set();
    for (const { item, track } of pairs) {
      if (item.track || usedTracks.has(track)) continue;
      item.track = track;
      usedTracks.add(track);
    }

    for (const item of batch) {
      if (item.track) {
        removeOpen(item.track);
        item.track.frames.push(item.frame);
        item.track.end = item.frame.end;
      } else {
        item.track = { key: item.key, frames: [item.frame], end: item.frame.end };
        tracks.push(item.track);
      }
      addOpen(item.track);
    }
    i = j;
  }
  return tracks.map((t) => t.frames);
}

// ---------------------------------------------------------------------------------------------
// Passo 3: análise de uma trilha

const mid = (f) => (f.start + f.end) / 2;
const round10 = (ms) => Math.max(0, Math.round(ms / 10) * 10);

function visibleIndexes(frames) {
  const chars = frames[0].chars;
  const result = [];
  for (let j = 0; j < chars.length; j++) {
    if (isBlank(chars[j].ch)) continue;
    if (frames.some((f) => f.chars[j].fore.a > 0 || f.chars[j].back.a > 0)) result.push(j);
  }
  return result;
}

function frameAlpha(frame, visible) {
  let a = 0;
  for (const j of visible) a = Math.max(a, frame.chars[j].fore.a);
  return a;
}

/**
 * @returns {object[]} eventos (normalmente um; mais de um quando a trilha teve de ser dividida)
 */
function analyzeTrack(allFrames, doc, depth = 0) {
  let frames = allFrames;
  let visible = visibleIndexes(frames);
  if (visible.length === 0) return [];

  // Quadros totalmente invisíveis no começo/fim não aparecem na tela.
  let first = 0;
  let last = frames.length - 1;
  while (first < last && frameAlpha(frames[first], visible) === 0) first++;
  while (last > first && frameAlpha(frames[last], visible) === 0) last--;
  frames = frames.slice(first, last + 1);
  if (frameAlpha(frames[0], visible) === 0) return [];

  const event = {
    start: frames[0].start,
    end: frames[frames.length - 1].end,
    frames,
    visible,
    anchor: frames[0].anchor,
    hdir: frames[0].hdir,
    vtype: frames[0].vtype,
    sourceLines: frames.flatMap((f) => f.sources).sort((a, b) => a - b),
    tags: [],
    fade: null,
    position: null,
    karaoke: null,
    transforms: false,
  };

  const alphas = frames.map((f) => frameAlpha(f, visible));
  const maxAlpha = Math.max(...alphas);
  const phi = frames.map(() => 1);
  detectFade(event, alphas, maxAlpha, phi);

  // Estados por letra (cor/opacidade normalizadas pelo fade)
  const known = frames.map((_, f) => phi[f] >= 0.15);
  const states = frames.map((f, fi) => f.chars.map((c) => charState(c, phi[fi])));
  const fadeOutStart = event.fade?.outFrames ?? frames.length;
  let to = -1;
  for (let f = Math.min(fadeOutStart, frames.length) - 1; f >= 0; f--) if (known[f]) { to = f; break; }
  if (to < 0) to = known.lastIndexOf(true);
  const from = known.indexOf(true);

  // Linha do tempo de cada letra: estado inicial + transições (t1, t2, estado de destino)
  const timelines = frames[0].chars.map((c, j) => charTimeline(frames, states, known, j, from, to));
  for (const j of frames[0].chars.keys()) if (!visible.includes(j)) timelines[j].transitions = [];
  const withChanges = visible.filter((j) => timelines[j].transitions.length > 0);

  let mode = 'static';
  if (withChanges.length > 0) {
    const sig = (j) => timelines[j].transitions.map((t) => `${Math.round(t.t1 / 40)}-${Math.round(t.t2 / 40)}`).join(',');
    const sameTimes = withChanges.length === visible.length && visible.every((j) => sameTransitionTimes(timelines[j], timelines[visible[0]]));
    const single = withChanges.every((j) => timelines[j].transitions.length === 1);
    const t1s = withChanges.map((j) => timelines[j].transitions[0].t1);
    const monotonic = single && t1s.every((t, k) => k === 0 || t >= t1s[k - 1] - 20);
    const distinctStarts = new Set(t1s.map((t) => Math.round(t / 40))).size;
    const instant = (t) => t.t2 - t.t1 <= 40;

    if (sameTimes && timelines[visible[0]].transitions.every(instant) && depth < 3) {
      // Tudo muda de uma vez: eram linhas separadas no .ass
      const cut = timelines[visible[0]].transitions[0].t2;
      const before = frames.filter((f) => f.start < cut);
      const after = frames.filter((f) => f.start >= cut);
      if (before.length > 0 && after.length > 0) return [...analyzeTrack(before, doc, depth + 1), ...analyzeTrack(after, doc, depth + 1)];
    }
    void sig;
    if (sameTimes) mode = 'line';
    else if (monotonic && distinctStarts >= 2) mode = 'karaoke';
    else mode = 'chars';
  }

  event.mode = mode;
  event.timelines = timelines;
  event.initialChars = timelines.map((t) => t.initial);
  event.finalChars = timelines.map((t) => (t.transitions.length > 0 ? t.transitions[t.transitions.length - 1].target : t.initial));
  if (mode === 'karaoke') {
    const changes = withChanges.map((j) => ({ j, t1: timelines[j].transitions[0].t1, t2: timelines[j].transitions[0].t2 }));
    const gradual = median(changes.map((c) => c.t2 - c.t1)) > ANIM_FRAME_MAX_MS;
    event.karaoke = buildKaraoke(event, changes, gradual);
    unifySungState(event, withChanges);
  } else if (mode === 'static') {
    event.karaoke = nativeKaraoke(event);
  }
  event.text = frames[0].text;
  event.glitchFrames = frames.filter((f) => f.glitch);
  event.cursorFrames = frames.filter((f) => f.cursor);
  detectMovement(event, doc);
  return [event];
}

function linearFit(xs, ys) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let cov = 0;
  let varX = 0;
  for (let i = 0; i < n; i++) {
    cov += (xs[i] - mx) * (ys[i] - my);
    varX += (xs[i] - mx) ** 2;
  }
  const slope = varX === 0 ? 0 : cov / varX;
  return { slope, intercept: my - slope * mx };
}

/** Karaokê nativo do YouTube: o .ytt guarda o início de cada sílaba no atributo t do <s>. */
function nativeKaraoke(event) {
  const chars = event.frames[0].chars;
  if (!chars.some((c) => c.startOffset > 0)) return null;
  const syllables = [];
  chars.forEach((c, j) => {
    const last = syllables[syllables.length - 1];
    if (!last || c.startOffset !== last.offset) syllables.push({ offset: c.startOffset, start: event.start + c.startOffset, from: j, to: j });
    else last.to = j;
  });
  const durations = syllables.map((s, i) => (i + 1 < syllables.length ? syllables[i + 1].offset - s.offset : null));
  durations[durations.length - 1] = median(durations.filter((d) => d != null)) || 500;
  syllables.forEach((s, i) => (s.duration = Math.round(durations[i] / 10)));
  return {
    syllables,
    lead: syllables[0].offset >= 100 ? Math.round(syllables[0].offset / 10) : 0,
    fadeType: false,
    native: true,
    reason: `karaokê nativo do YouTube: ${syllables.length} sílabas com início marcado (atributo t); letras não cantadas ficam invisíveis`,
  };
}

const exactColor = (a, b) => Math.abs(a.r - b.r) <= 2 && Math.abs(a.g - b.g) <= 2 && Math.abs(a.b - b.b) <= 2 && Math.abs(a.a - b.a) <= 2;

function exactState(s1, s2) {
  if (s1.fore.a <= 2 && s2.fore.a <= 2) return Math.abs(s1.scale - s2.scale) <= 0.001;
  if (!exactColor(s1.fore, s2.fore) || !exactColor(s1.back, s2.back) || Math.abs(s1.scale - s2.scale) > 0.001) return false;
  for (const [type, color] of s1.shadows) {
    const other = s2.shadows.get(type);
    if (other && !exactColor(color, other)) return false;
  }
  return true;
}

/**
 * Linha do tempo de uma letra: trechos parados (o mesmo estado por >= 120 ms, ou um quadro longo, que o
 * Animator só gera fora das animações) e, entre eles, transições lineares.
 */
function charTimeline(frames, states, known, j, from, to) {
  const c0 = frames[0].chars[j];
  const plateaus = [];
  let runStart = -1;
  let runEnd = -1;
  const close = () => {
    if (runStart < 0) return;
    const dur = frames[runEnd].end - frames[runStart].start;
    let longFrame = false;
    for (let f = runStart; f <= runEnd; f++) if (known[f] && frames[f].end - frames[f].start > ANIM_FRAME_MAX_MS) longFrame = true;
    if (dur >= 120 || longFrame) {
      const prev = plateaus[plateaus.length - 1];
      if (prev && sameState(prev.state, states[runStart][j])) prev.b = runEnd;
      else plateaus.push({ a: runStart, b: runEnd, state: states[runStart][j] });
    }
  };
  for (let f = from; f <= to; f++) {
    if (!known[f]) continue;
    if (runStart >= 0 && exactState(states[f][j], states[runStart][j])) {
      runEnd = f;
      continue;
    }
    close();
    runStart = runEnd = f;
  }
  close();

  const keyframes = [];
  if (plateaus.length === 0) {
    keyframes.push({ state: states[from][j] });
    if (!sameState(states[from][j], states[to][j])) keyframes.push({ state: states[to][j], t1: frames[from].start, t2: frames[to].end });
  } else {
    const p0 = plateaus[0];
    if (p0.a > from && !sameState(states[from][j], p0.state)) {
      keyframes.push({ state: states[from][j] });
      keyframes.push({ state: p0.state, t1: frames[from].start, t2: frames[p0.a].start });
    } else {
      keyframes.push({ state: p0.state });
    }
    for (let i = 1; i < plateaus.length; i++) {
      keyframes.push({ state: plateaus[i].state, t1: frames[plateaus[i - 1].b].end, t2: frames[plateaus[i].a].start });
    }
    const pl = plateaus[plateaus.length - 1];
    if (pl.b < to && !sameState(pl.state, states[to][j])) keyframes.push({ state: states[to][j], t1: frames[pl.b].end, t2: frames[to].end });
  }

  // Letra invisível: a cor guardada é a do "texto invisível fica preto" do escritor, não a original
  for (let i = 0; i < keyframes.length; i++) {
    const st = keyframes[i].state;
    if (st.fore.a > ALPHA_TOLERANCE) continue;
    const ref = keyframes.slice(i + 1).find((k) => k.state.fore.a > ALPHA_TOLERANCE) ?? keyframes.slice(0, i).reverse().find((k) => k.state.fore.a > ALPHA_TOLERANCE);
    if (ref) keyframes[i] = { ...keyframes[i], state: { ...st, fore: Color.fromArgb(st.fore.a, ref.state.fore.r, ref.state.fore.g, ref.state.fore.b) } };
  }

  mergeAcceleratedKeyframes(keyframes, frames, states, known, j, from, to);

  return {
    initial: stateToChar(c0, keyframes[0].state),
    transitions: keyframes.slice(1).map((k) => ({
      t1: Math.round(k.t1),
      t2: Math.round(Math.max(k.t2, k.t1)),
      target: stateToChar(c0, k.state),
      ...(k.accel ? { accel: k.accel } : {}),
    })),
  };
}

const stateChannels = (st) => [st.fore.r, st.fore.g, st.fore.b, st.fore.a, st.back.r, st.back.g, st.back.b, st.back.a, st.scale * 100];

/**
 * \t com aceleração (\t(t1,t2,accel,...)): a cor anda devagar no começo (ou no fim), e como a cor do .ytt é
 * arredondada, os quadros iguais viram "trechos parados" curtos que picam a curva em vários \t. Uma sequência de
 * transições que vão sempre na mesma direção, com paradas curtas entre elas, vira uma transição só, com a
 * aceleração que melhor explica os quadros.
 */
function mergeAcceleratedKeyframes(keyframes, frames, states, known, j, from, to) {
  for (let i = 1; i < keyframes.length; i++) {
    let last = i;
    while (last + 1 < keyframes.length && keyframes[last + 1].t1 - keyframes[last].t2 <= 2000) last++;
    // A maior sequência (de pelo menos três passos, todos na mesma direção) que uma curva só explica
    for (let m = last; m - i >= 2; m--) {
      if (!monotonicKeyframes(keyframes.slice(i - 1, m + 1))) continue;
      const fit = fitAcceleration(keyframes, i, m, frames, states, known, j, from, to);
      if (!fit) continue;
      const merged = { state: keyframes[m].state, t1: fit.t1, t2: keyframes[m].t2 };
      if (Math.abs(fit.accel - 1) >= 0.1) merged.accel = Math.round(fit.accel * 10) / 10;
      keyframes.splice(i, m - i + 1, merged);
      break;
    }
  }
}

function fitAcceleration(keyframes, i, m, frames, states, known, j, from, to) {
  const v0 = stateChannels(keyframes[i - 1].state);
  const v1 = stateChannels(keyframes[m].state);
  let channel = 0;
  for (let c = 1; c < v0.length; c++) if (Math.abs(v1[c] - v0[c]) > Math.abs(v1[channel] - v0[channel])) channel = c;
  const delta = v1[channel] - v0[channel];
  if (Math.abs(delta) < 8) return null;

  const t2 = keyframes[m].t2;
  const prevEnd = i - 1 === 0 ? frames[from].start : keyframes[i - 1].t2;
  let best = null;
  for (const t1 of new Set([keyframes[i].t1, prevEnd])) {
    if (t2 - t1 < 100) continue;
    const samples = [];
    for (let f = from; f <= to; f++) {
      if (!known[f]) continue;
      const mid = (frames[f].start + frames[f].end) / 2;
      if (mid < t1 || mid > t2) continue;
      samples.push([(mid - t1) / (t2 - t1), (stateChannels(states[f][j])[channel] - v0[channel]) / delta]);
    }
    if (samples.length < 4) continue;
    for (let a = 0.2; a <= 6.001; a += 0.05) {
      let err = 0;
      for (const [x, y] of samples) err += (y - x ** a) ** 2;
      err /= samples.length;
      if (!best || err < best.err) best = { t1, accel: Math.round(a * 20) / 20, err };
    }
  }
  return best && best.err <= 0.005 ? best : null;
}

function monotonicKeyframes(list) {
  const values = list.map((k) => stateChannels(k.state));
  for (let c = 0; c < values[0].length; c++) {
    let dir = 0;
    for (let n = 1; n < values.length; n++) {
      const d = Math.sign(Math.round(values[n][c] - values[n - 1][c]));
      if (d === 0) continue;
      if (dir !== 0 && d !== dir) return false;
      dir = d;
    }
  }
  return true;
}

function sameTransitionTimes(a, b) {
  if (a.transitions.length !== b.transitions.length) return false;
  return a.transitions.every((t, i) => Math.abs(t.t1 - b.transitions[i].t1) <= 40 && Math.abs(t.t2 - b.transitions[i].t2) <= 40);
}

/**
 * Karaokê com troca gradual: a última sílaba pode terminar a linha ainda no meio da troca. O estado "cantado"
 * de todas é o mais comum entre as letras que terminaram a troca.
 */
function unifySungState(event, changed) {
  const finals = changed.map((j) => event.finalChars[j]);
  let best = null;
  let bestCount = 0;
  for (const f of finals) {
    const n = finals.filter((g) => sameState(g, f)).length;
    if (n > bestCount) [best, bestCount] = [f, n];
  }
  if (!best) return;
  for (const j of changed) {
    const init = event.initialChars[j];
    const fin = event.finalChars[j];
    if (sameState(fin, best)) continue;
    const between = (x, a, b) => x >= Math.min(a, b) - COLOR_TOLERANCE && x <= Math.max(a, b) + COLOR_TOLERANCE;
    const ok = ['r', 'g', 'b', 'a'].every((ch) => between(fin.fore[ch], init.fore[ch], best.fore[ch]));
    if (ok) event.finalChars[j] = { ...fin, fore: best.fore, shadows: best.shadows, back: best.back };
  }
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length === 0 ? 0 : sorted[Math.floor(sorted.length / 2)];
}

function charState(c, phi) {
  return {
    fore: Color.fromArgb(snapAlpha(c.fore.a / phi), c.fore.r, c.fore.g, c.fore.b),
    back: c.back.a > 0 ? Color.fromArgb(snapAlpha(c.back.a / phi), c.back.r, c.back.g, c.back.b) : c.back,
    shadows: c.shadows,
    scale: c.scale,
  };
}

/** Opacidade quase cheia (arredondamento do fade) conta como cheia; o .ytt nunca usa 255. */
const snapAlpha = (v) => (v >= 254 - 10 ? 254 : clampByte(v));
const clampByte = (v) => Math.max(0, Math.min(255, Math.round(v)));

function stateToChar(c, state) {
  return { ...c, fore: state.fore, back: state.back, shadows: state.shadows, scale: state.scale };
}

function sameColor(a, b, alpha = true) {
  return (
    Math.abs(a.r - b.r) <= COLOR_TOLERANCE &&
    Math.abs(a.g - b.g) <= COLOR_TOLERANCE &&
    Math.abs(a.b - b.b) <= COLOR_TOLERANCE &&
    (!alpha || Math.abs(a.a - b.a) <= ALPHA_TOLERANCE)
  );
}

function sameState(s1, s2) {
  // Letra invisível: a cor não importa (o escritor .ytt pinta de preto o texto invisível)
  if (s1.fore.a <= ALPHA_TOLERANCE && s2.fore.a <= ALPHA_TOLERANCE) return Math.abs(s1.scale - s2.scale) <= 0.01;
  if (!sameColor(s1.fore, s2.fore)) return false;
  if ((s1.back.a > 0 || s2.back.a > 0) && !sameColor(s1.back, s2.back)) return false;
  // Sombra que some num quadro (corte do "true fade") é ignorada; só compara as que existem nos dois.
  for (const [type, color] of s1.shadows) {
    const other = s2.shadows.get(type);
    if (other && !sameColor(color, other, false)) return false;
  }
  return Math.abs(s1.scale - s2.scale) <= 0.01;
}

// --- fade --------------------------------------------------------------------------------------

function detectFade(event, alphas, maxAlpha, phi) {
  const { frames, visible } = event;
  const threshold = maxAlpha - 8;
  const refIn = alphas.findIndex((a) => a >= threshold);
  const refOut = alphas.length - 1 - [...alphas].reverse().findIndex((a) => a >= threshold);

  const consistent = (f, ref) => {
    const ratio = alphas[f] / maxAlpha;
    return visible.every((j) => {
      const refA = frames[ref].chars[j].fore.a;
      const a = frames[f].chars[j].fore.a;
      if (refA === 0) return a <= ALPHA_TOLERANCE;
      return Math.abs(a / refA - ratio) <= 0.12 || Math.abs(a - refA * ratio) <= ALPHA_TOLERANCE;
    });
  };

  // Karaokê \\ytkt(Fade) com as sílabas não cantadas invisíveis: a primeira sílaba aparece aos poucos e parece um
  // \\fad da linha, mas as seguintes (invisíveis no quadro de referência) também aparecem aos poucos depois.
  const gradualLater = (ref) =>
    visible.some((j) => {
      if (frames[ref].chars[j].fore.a > ALPHA_TOLERANCE) return false;
      let ramp = 0;
      for (let f = ref + 1; f < frames.length; f++) {
        const a = frames[f].chars[j].fore.a;
        if (a > 20 && a < maxAlpha - 20) ramp++;
      }
      return ramp >= 2;
    });

  let inRamp = null;
  if (refIn > 0 && !gradualLater(refIn)) {
    const idx = [...Array(refIn).keys()];
    if (idx.every((f) => consistent(f, refIn))) inRamp = fitRamp(frames, alphas, maxAlpha, idx, true, event.start);
  }
  let outRamp = null;
  if (refOut < frames.length - 1) {
    const idx = [];
    for (let f = refOut + 1; f < frames.length; f++) idx.push(f);
    if (idx.every((f) => consistent(f, refOut))) outRamp = fitRamp(frames, alphas, maxAlpha, idx, false, event.end);
  }
  if (!inRamp && !outRamp) return;

  event.fade = { in: inRamp, out: outRamp, outFrames: outRamp ? refOut + 1 : frames.length, maxAlpha };
  if (inRamp) for (let f = 0; f < refIn; f++) phi[f] = alphas[f] / maxAlpha;
  if (outRamp) for (let f = refOut + 1; f < frames.length; f++) phi[f] = alphas[f] / maxAlpha;
}

/** Reta opacidade x tempo pelos quadros da rampa: devolve quando começa (0%) e quando termina (100%). */
function fitRamp(frames, alphas, maxAlpha, indexes, fadeIn, edge) {
  const points = indexes.map((f) => ({ t: mid(frames[f]), r: alphas[f] / maxAlpha })).filter((p) => p.r > 0 && p.r < 1);
  let zeroAt;
  let fullAt;
  if (points.length >= 2) {
    const n = points.length;
    const mt = points.reduce((s, p) => s + p.t, 0) / n;
    const mr = points.reduce((s, p) => s + p.r, 0) / n;
    const cov = points.reduce((s, p) => s + (p.t - mt) * (p.r - mr), 0);
    const varT = points.reduce((s, p) => s + (p.t - mt) ** 2, 0);
    const slope = cov / varT;
    if ((fadeIn && slope > 0) || (!fadeIn && slope < 0)) {
      const intercept = mr - slope * mt;
      zeroAt = -intercept / slope;
      fullAt = (1 - intercept) / slope;
    }
  }
  if (zeroAt === undefined) {
    const p = points[0] ?? { t: mid(frames[indexes[indexes.length - 1]]), r: 0.5 };
    zeroAt = edge;
    fullAt = edge + (p.t - edge) / p.r;
  }
  // A rampa não pode passar da borda da linha
  if (fadeIn) zeroAt = Math.max(zeroAt, edge - 2000);
  return {
    zeroAt: Math.round(zeroAt),
    fullAt: Math.round(fullAt),
    frames: indexes.length,
    first: alphas[indexes[0]],
    last: alphas[indexes[indexes.length - 1]],
  };
}

// --- karaokê ------------------------------------------------------------------------------------

function buildKaraoke(event, changes, gradual) {
  const { frames } = event;
  const chars = frames[0].chars;
  // Momento em que cada letra começa a ser cantada; letras que não mudam (espaços, letras já cantadas no
  // primeiro quadro) herdam o da letra anterior.
  const changeAt = new Map(changes.map((c) => [c.j, c.t1]));
  const firstChanged = changes[0].j;
  const syllableStart = [];
  let current = event.start;
  for (let j = 0; j < chars.length; j++) {
    if (changeAt.has(j)) current = changeAt.get(j);
    else if (j < firstChanged && !isBlank(chars[j].ch)) current = event.start;
    syllableStart.push(current);
  }

  const syllables = [];
  for (let j = 0; j < chars.length; j++) {
    if (syllables.length === 0 || syllableStart[j] !== syllables[syllables.length - 1].start) syllables.push({ start: syllableStart[j], from: j, to: j });
    else syllables[syllables.length - 1].to = j;
  }
  // Espaços no fim de uma sílaba ficam nela; espaços no começo de uma sílaba vão para a anterior
  for (let s = 1; s < syllables.length; s++) {
    while (syllables[s].from < syllables[s].to && isBlank(chars[syllables[s].from].ch)) {
      syllables[s].from++;
      syllables[s - 1].to++;
    }
  }

  const durations = [];
  for (let s = 0; s < syllables.length; s++) {
    const next = s + 1 < syllables.length ? syllables[s + 1].start : null;
    durations.push(next != null ? next - syllables[s].start : null);
  }
  const typical = median(durations.filter((d) => d != null)) || 500;
  durations[durations.length - 1] = typical;
  syllables.forEach((s, i) => (s.duration = Math.max(0, Math.round(durations[i] / 10))));

  const lead = syllables[0].start - event.start;
  const fadeTransition = gradual;
  const reason =
    `${syllables.length} sílabas mudam de cor em sequência (primeira em ${lead} ms)` +
    (fadeTransition ? ', cada uma com transição gradual' : '');
  return { syllables, lead: lead >= 100 ? Math.round(lead / 10) : 0, fadeType: fadeTransition, reason };
}

// --- posição ------------------------------------------------------------------------------------

function detectMovement(event, doc) {
  const { frames } = event;
  const positions = frames.map((f) => f.pos ?? doc.getDefaultPosition(f.anchor));
  const firstPos = positions[0];
  const distinct = positions.some((p) => Math.abs(p.x - firstPos.x) > 0.5 || Math.abs(p.y - firstPos.y) > 0.5);
  event.basePos = frames[0].pos;
  if (!distinct) return;

  const monotonic = (axis) => {
    let dir = 0;
    for (let i = 1; i < positions.length; i++) {
      const d = Math.sign(Math.round(positions[i][axis] - positions[i - 1][axis]));
      if (d === 0) continue;
      if (dir !== 0 && d !== dir) return false;
      dir = d;
    }
    return true;
  };

  if (monotonic('x') && monotonic('y')) {
    const lastPos = positions[positions.length - 1];
    const axis = Math.abs(lastPos.x - firstPos.x) >= Math.abs(lastPos.y - firstPos.y) ? 'x' : 'y';
    const from = firstPos[axis];
    const to = lastPos[axis];
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    const moving = frames.map((f, i) => ({ t: mid(f), p: positions[i][axis] })).filter((pt) => pt.p > lo + 0.5 && pt.p < hi - 0.5);

    let t1;
    let t2;
    if (moving.length >= 2) {
      const n = moving.length;
      const mt = moving.reduce((s, p) => s + p.t, 0) / n;
      const mp = moving.reduce((s, p) => s + p.p, 0) / n;
      const slope = moving.reduce((s, p) => s + (p.t - mt) * (p.p - mp), 0) / moving.reduce((s, p) => s + (p.t - mt) ** 2, 0);
      const intercept = mp - slope * mt;
      t1 = (from - intercept) / slope;
      t2 = (to - intercept) / slope;
    } else {
      const lastAtStart = positions.findLastIndex((p) => Math.abs(p[axis] - from) <= 0.5 && positions.indexOf(p) < positions.length - 1);
      const firstAtEnd = positions.findIndex((p) => Math.abs(p[axis] - to) <= 0.5);
      t1 = lastAtStart >= 0 ? frames[lastAtStart].end : event.start;
      t2 = firstAtEnd >= 0 ? frames[firstAtEnd].start : event.end;
    }
    t1 = Math.min(Math.max(t1, event.start), event.end);
    t2 = Math.min(Math.max(t2, t1), event.end);
    event.move = { from: firstPos, to: lastPos, t1: Math.round(t1), t2: Math.round(t2), frames: frames.length };
    return;
  }

  // Tremor: os quadros curtos (animação) tremem em volta da posição dos quadros longos (antes/depois do efeito).
  const isShort = frames.map((f) => f.end - f.start <= ANIM_FRAME_MAX_MS);
  const firstShort = isShort.indexOf(true);
  const lastShort = isShort.lastIndexOf(true);
  let base;
  // Antes do tremor a linha está parada no lugar certo; depois dele ela fica no último deslocamento sorteado.
  if (firstShort > 0) base = positions[0];
  else {
    const xs = positions.map((p) => p.x);
    const ys = positions.map((p) => p.y);
    base = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
  }
  let rx = 0;
  let ry = 0;
  for (const p of positions) {
    rx = Math.max(rx, Math.abs(p.x - base.x));
    ry = Math.max(ry, Math.abs(p.y - base.y));
  }
  event.basePos = base;
  event.shake = {
    rx: roundRadius(rx),
    ry: roundRadius(ry),
    t1: firstShort >= 0 ? frames[firstShort].start : event.start,
    t2: lastShort >= 0 ? frames[lastShort].end : event.end,
    frames: lastShort - firstShort + 1,
  };
}

function roundRadius(r) {
  if (r < 3) return 0;
  return r >= 10 ? Math.round(r / 5) * 5 : Math.round(r);
}

// ---------------------------------------------------------------------------------------------
// Passo 4: \ytchroma

function isChromaCandidate(e) {
  if (e.karaoke || e.shake || e.end - e.start > 3000) return false;
  if (e.mode !== 'static' && e.mode !== 'line') return false;
  const color = e.finalChars[e.visible[0]].fore;
  return e.visible.every((j) => {
    const c = e.finalChars[j];
    return c.shadows.size === 0 && c.back.a === 0 && sameColor(c.fore, color, false);
  });
}

const hasShadowOrBox = (e) => e.visible.some((j) => e.finalChars[j].shadows.size > 0 || e.finalChars[j].back.a > 0);
const eventCenter = (e, doc) => e.basePos ?? e.move?.from ?? doc.getDefaultPosition(e.anchor);

/**
 * \ytchroma: o original desenha cópias do texto, uma por cor, sem sombra, que andam de um ponto deslocado até
 * perto do texto antes de ele aparecer (e o contrário depois de ele sumir). No .ytt isso fica como um "rastro":
 * cópias do mesmo texto, de uma cor só, ao mesmo tempo, espalhadas em volta da posição do texto (deslocamentos
 * pequenos podem nem aparecer como movimento, porque as posições do .ytt andam em passos de ~12 px).
 * Cópias que se sobrepõem no tempo formam um grupo; o grupo que termina quando o texto aparece é a entrada e o
 * que começa quando ele some é a saída.
 */
/** Mesmo texto, ignorando espaços nas pontas (a sílaba final do karaokê costuma levar um espaço) e ZWSP. */
const sameWords = (a, b) => a.replace(/[\u200B\s]+/g, ' ').trim() === b.replace(/[\u200B\s]+/g, ' ').trim();

function detectChroma(events, doc) {
  const candidates = events.filter(isChromaCandidate);
  if (candidates.length === 0) return;

  // Grupos de cópias com o mesmo texto que se sobrepõem no tempo
  const clusters = [];
  const byText = new Map();
  for (const c of [...candidates].sort((x, y) => x.start - y.start)) {
    const key = c.text.replace(/[\u200B\s]+/g, ' ').trim();
    const list = byText.get(key) ?? [];
    let cluster = list.find((cl) => c.start <= cl.end + 2 && cl.start < c.end);
    if (!cluster) {
      cluster = { text: c.text, start: c.start, end: c.end, members: [] };
      list.push(cluster);
      clusters.push(cluster);
    }
    cluster.members.push(c);
    cluster.end = Math.max(cluster.end, c.end);
    byText.set(key, list);
  }

  const mains = events.filter((e) => !isChromaCandidate(e) || hasShadowOrBox(e));
  const attach = (cluster, main, fadeIn) => {
    if (cluster.used) return null;
    const c = fadeIn ? eventCenter(main, doc) : main.move?.to ?? eventCenter(main, doc);
    const far = (k) => (k.move ? (fadeIn ? k.move.from : k.move.to) : eventCenter(k, doc));
    // Cópias da mesma cor juntas; deslocamento = o maior visto daquela cor
    const byColor = new Map();
    for (const k of cluster.members) {
      const col = k.finalChars[k.visible[0]].fore;
      const key = colorToHex(col);
      // O quadro da ponta já andou um pouco: corrige pela fração do movimento que ele representa
      let factor = 1;
      if (k.move) {
        const edge = fadeIn ? k.frames[0] : k.frames[k.frames.length - 1];
        const p = Math.min(0.5, Math.abs(mid(edge) - (fadeIn ? k.start : k.end)) / Math.max(1, k.end - k.start));
        factor = 1 - 0.8 * p;
      }
      const off = { x: (far(k).x - c.x) / factor, y: (far(k).y - c.y) / factor };
      const prev = byColor.get(key);
      if (!prev || Math.hypot(off.x, off.y) > Math.hypot(prev.off.x, prev.off.y)) byColor.set(key, { col, off });
    }
    const list = [...byColor.values()];
    const maxDist = Math.max(...list.map((l) => Math.hypot(l.off.x, l.off.y)));
    if (maxDist > 120) return null;
    list.sort((a, b) => b.off.x - a.off.x || b.off.y - a.off.y);
    return { list, c };
  };

  for (const cluster of clusters) {
    if (cluster.used) continue;
    const center = { x: 0, y: 0 };
    for (const k of cluster.members) {
      const p = eventCenter(k, doc);
      center.x += p.x / cluster.members.length;
      center.y += p.y / cluster.members.length;
    }
    const near = (m) => {
      const p = eventCenter(m, doc);
      return sameWords(m.text, cluster.text) && !m.removed && Math.hypot(p.x - center.x, p.y - center.y) <= 40;
    };
    const ins = mains.filter((m) => near(m) && !cluster.members.includes(m) && Math.abs(m.start - cluster.end) <= 100 && m.start >= cluster.start);
    const outs = mains.filter((m) => near(m) && !cluster.members.includes(m) && Math.abs(cluster.start - m.end) <= 100 && m.end <= cluster.end);
    const pickBest = (list, key) => list.sort((a, b) => Number(hasShadowOrBox(b)) - Number(hasShadowOrBox(a)) || key(a) - key(b))[0];
    const mainIn = pickBest(ins, (m) => Math.abs(m.start - cluster.end));
    const mainOut = pickBest(outs, (m) => Math.abs(cluster.start - m.end));
    const main = mainIn ?? mainOut;
    if (!main) continue;
    const fadeIn = main === mainIn;
    const info = attach(cluster, main, fadeIn);
    if (!info) continue;

    cluster.used = true;
    for (const k of cluster.members) k.removed = true;
    main.sourceLines.push(...cluster.members.flatMap((k) => k.sourceLines));
    main.sourceLines.sort((x, y) => x - y);
    main.chromaParts = main.chromaParts ?? {};
    const ms = round10(fadeIn ? main.start - cluster.start : cluster.end - main.end);
    main.chromaParts[fadeIn ? 'in' : 'out'] = { ms, ...info, copies: cluster.members.length };
    if (fadeIn) main.start = cluster.start;
    else main.end = cluster.end;
  }

  for (const main of events) {
    if (!main.chromaParts) continue;
    const { in: pin, out: pout } = main.chromaParts;
    const part = pin ?? pout;
    const baseFore = main.finalChars[main.visible[0]].fore;
    const colors = part.list.map((l) => Color.fromArgb(clampByte((l.col.a * 255) / Math.max(1, baseFore.a)), l.col.r, l.col.g, l.col.b));
    const snap = (v, step) => (Math.abs(v - Math.round(v / 5) * 5) <= step / 2 ? Math.round(v / 5) * 5 : Math.round(v));
    let offX = snap(part.list[0].off.x, 12);
    let offY = snap(part.list[0].off.y, 7);
    const inMs = pin?.ms ?? 0;
    const outMs = pout?.ms ?? 0;

    const isDefault =
      colors.length === 3 &&
      [[255, 0, 0], [0, 255, 0], [0, 0, 255]].every((rgb, i) => colors[i].r === rgb[0] && colors[i].g === rgb[1] && colors[i].b === rgb[2]) &&
      Math.abs(colors[0].a - (baseFore.r * 128) / 255) <= 12 &&
      Math.abs(colors[1].a - (baseFore.g * 128) / 255) <= 12 &&
      Math.abs(colors[2].a - (baseFore.b * 128) / 255) <= 12;
    if (isDefault && Math.abs(offX - 20) <= 6 && Math.abs(offY) <= 4) [offX, offY] = [20, 0];

    let args;
    if (isDefault) {
      if (offX === 20 && offY === 0) args = inMs === 270 && outMs === 270 ? null : [inMs, outMs];
      else args = [offX, offY, inMs, outMs];
    } else {
      const alpha = Math.max(...colors.map((col) => col.a));
      args = [...colors.map(assColor), hex2(255 - alpha), offX, offY, inMs, outMs];
    }
    const copies = (pin?.copies ?? 0) + (pout?.copies ?? 0);
    main.chroma = {
      text: args == null ? '\\ytchroma' : `\\ytchroma(${args.join(',')})`,
      reason:
        `rastro de ${copies} cópias sem sombra em ${colors.length} cores (${colors.map(colorToHex).join(', ')}), deslocadas até ${Math.round(Math.hypot(part.list[0].off.x, part.list[0].off.y))} px` +
        (inMs ? `, ${inMs} ms antes do texto aparecer` : '') + (outMs ? `, ${outMs} ms depois de ele sumir` : ''),
    };
  }
}

// ---------------------------------------------------------------------------------------------
// Passo 5: escrita do .ass

const hex2 = (v) => v.toString(16).toUpperCase().padStart(2, '0');
const assColor = (c) => `&H${hex2(c.b)}${hex2(c.g)}${hex2(c.r)}&`;
const styleColor = (c) => `&H${hex2(255 - c.a)}${hex2(c.b)}${hex2(c.g)}${hex2(c.r)}`;
const colorToHex = (c) => `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`;

function glowColor(c) {
  return c.shadows.get(ShadowType.Glow) ?? null;
}

function otherShadowColor(c) {
  for (const type of NAME_ORDER) if (type !== ShadowType.Glow && c.shadows.has(type)) return c.shadows.get(type);
  return null;
}

function shadowTypesOf(c) {
  return NAME_ORDER.filter((t) => c.shadows.has(t));
}

function styleBaseName(types, box) {
  return 'YT' + (types.length === 0 ? 'Plain' : types.join('')) + (box ? 'Box' : '');
}

class StyleRegistry {
  constructor() {
    this.styles = [];
    this.byKey = new Map();
    this.countByName = new Map();
  }

  /** @param {object} c letra no estado final; @param {object} secondary cor das letras não cantadas */
  get(c, secondary) {
    const types = shadowTypesOf(c);
    const box = c.back.a > 0;
    const glow = glowColor(c);
    const shadow = otherShadowColor(c);
    const outline = box ? c.back : glow;
    // Fonte, tamanho, negrito e alinhamento vão como tags: o estilo guarda só as cores e as sombras.
    const fields = {
      font: 'Roboto',
      size: DEFAULT_LINE_HEIGHT,
      primary: c.fore,
      secondary: secondary ?? Color.fromArgb(0, 0, 0, 0),
      outline: outline ?? Color.fromArgb(255, 0, 0, 0),
      back: shadow ?? (box && glow ? glow : Color.fromArgb(255, 0, 0, 0)),
      bold: false,
      italic: false,
      underline: false,
      borderStyle: box ? 3 : 1,
      outlineWidth: box ? 0.01 : glow ? 2 : 0,
      shadowDistance: shadow || (box && glow) ? 4 : 0,
      alignment: 2,
    };
    const key = JSON.stringify({ ...fields, types, primary: styleColor(fields.primary), secondary: styleColor(fields.secondary), outline: styleColor(fields.outline), back: styleColor(fields.back) });
    let style = this.byKey.get(key);
    if (!style) {
      const base = styleBaseName(types, box);
      const count = (this.countByName.get(base) ?? 0) + 1;
      this.countByName.set(base, count);
      const name = count === 1 ? base : `${base} ${count}`;
      style = { name, types, fields };
      this.byKey.set(key, style);
      this.styles.push(style);
    }
    return style;
  }
}


function styleLine(style) {
  const f = style.fields;
  return (
    `Style: ${style.name},${f.font},${formatNumber(f.size)},${styleColor(f.primary)},${styleColor(f.secondary)},${styleColor(f.outline)},${styleColor(f.back)},` +
    `${f.bold ? 1 : 0},${f.italic ? 1 : 0},${f.underline ? 1 : 0},0,100,100,0,0,${f.borderStyle},${formatNumber(f.outlineWidth)},${formatNumber(f.shadowDistance)},` +
    `${f.alignment},25,25,15,1`
  );
}

const formatNumber = (v) => formatFloat(Math.fround(v));

/** Estado "como o estilo deixa" de uma letra, para comparar e gerar só as tags que mudam. */
function styleState(style) {
  const f = style.fields;
  return {
    font: f.font,
    size: f.size,
    bold: f.bold,
    italic: f.italic,
    underline: f.underline,
    fore: f.primary,
    secondary: f.secondary,
    outline: f.outline,
    shadow: f.back,
    offset: OffsetType.Regular,
    packed: false,
  };
}

function charTagState(c, secondary, style) {
  const box = c.back.a > 0;
  const glow = glowColor(c);
  return {
    font: c.font ?? 'Roboto',
    size: Math.round(DEFAULT_LINE_HEIGHT * c.scale),
    bold: c.bold,
    italic: c.italic,
    underline: c.underline,
    fore: c.fore,
    secondary: secondary ?? style.fields.secondary,
    outline: box ? c.back : glow ?? style.fields.outline,
    shadow: otherShadowColor(c) ?? style.fields.back,
    offset: c.offset,
    packed: c.packed,
  };
}

function appendStateTags(builder, prev, next) {
  if (next.font !== prev.font) builder.appendTag('fn', next.font);
  if (next.size !== prev.size) builder.appendTag('fs', new Float(Math.fround(next.size)));
  if (next.bold !== prev.bold) builder.appendTag('b', next.bold);
  if (next.italic !== prev.italic) builder.appendTag('i', next.italic);
  if (next.underline !== prev.underline) builder.appendTag('u', next.underline);
  appendColor(builder, 'c', '1a', prev.fore, next.fore);
  appendColor(builder, '2c', '2a', prev.secondary, next.secondary);
  appendColor(builder, '3c', '3a', prev.outline, next.outline);
  appendColor(builder, '4c', '4a', prev.shadow, next.shadow);
  if (next.offset !== prev.offset) builder.appendTag({ [OffsetType.Subscript]: 'ytsub', [OffsetType.Superscript]: 'ytsup', [OffsetType.Regular]: 'ytsur' }[next.offset]);
  if (next.packed !== prev.packed) builder.appendTag('ytpack', next.packed);
}

function appendColor(builder, colorTag, alphaTag, prev, next) {
  if (prev.r !== next.r || prev.g !== next.g || prev.b !== next.b) builder.appendTag(colorTag, Color.fromRgb(next.r, next.g, next.b));
  if (prev.a !== next.a) builder.appendTag(alphaTag, 255 - next.a);
}

/** Tags de \t: só o que muda entre o estado inicial e o final. */
function transformTags(from, to) {
  const b = new AssLineContentBuilder();
  appendStateTags(b, from, to);
  return b._pendingTags;
}

/** Canais que as transições de um trecho mexem (cor, opacidade, contorno, sombra, tamanho). */
function animatedChannels(base, targets) {
  const set = new Set();
  for (const t of targets) {
    if (t.fore.r !== base.fore.r || t.fore.g !== base.fore.g || t.fore.b !== base.fore.b || t.fore.a !== base.fore.a) set.add('fore');
    if (!exactColor(t.outline, base.outline)) set.add('outline');
    if (!exactColor(t.shadow, base.shadow)) set.add('shadow');
    if (t.size !== base.size) set.add('size');
  }
  return set;
}

/** Estado "desconhecido" nos canais animados, para que as tags deles sejam escritas de novo. */
function forgetAnimated(prev, channels) {
  const other = (c) => Color.fromArgb(c.a ^ 1, c.r ^ 1, c.g, c.b);
  return {
    ...prev,
    fore: channels.has('fore') ? other(prev.fore) : prev.fore,
    outline: channels.has('outline') ? other(prev.outline) : prev.outline,
    shadow: channels.has('shadow') ? other(prev.shadow) : prev.shadow,
    size: channels.has('size') ? -1 : prev.size,
  };
}

function sameTagState(a, b) {
  return transformTags(a, b) === '';
}

/** \\ytkt(Glitch) / \\ytkt(Cursor|LCursor,...) a partir do que normalizeVariantTexts anotou nos quadros. */
function karaokeTypeTag(e) {
  const { syllables } = e.karaoke;
  if (e.cursorFrames.length > 0) {
    const chars = e.frames[0].chars;
    const singingAt = (t) => {
      let s = 0;
      while (s + 1 < syllables.length && syllables[s + 1].start <= t + 20) s++;
      return syllables[s];
    };
    let after = 0;
    let before = 0;
    for (const f of e.cursorFrames) {
      const syl = singingAt(f.start);
      let lastText = syl.to;
      while (lastText > syl.from && isBlank(chars[lastText].ch)) lastText--;
      let firstText = syl.from;
      while (firstText > 0 && isBlank(chars[firstText - 1].ch)) firstText--;
      if (f.cursor.at >= lastText + 1 && f.cursor.at <= syl.to + 1) after++;
      else if (f.cursor.at >= firstText && f.cursor.at <= syl.from) before++;
    }
    const type = before > after ? 'LCursor' : 'Cursor';

    // Troca do cursor: a cada intervalo, contado do início da linha
    const changes = [];
    for (let i = 1; i < e.cursorFrames.length; i++) {
      const a = e.cursorFrames[i - 1].cursor;
      const b = e.cursorFrames[i].cursor;
      if (a.text !== b.text || !sameColor(a.color, b.color, true)) changes.push(e.cursorFrames[i].start - e.start);
    }
    const key = (c) => `${c.text}|${colorToHex(c.color)}|${c.color.a}`;
    const distinct = new Set(e.cursorFrames.map((f) => key(f.cursor)));
    const sungColor = e.finalChars[e.visible[0]].fore;
    const needsColor = [...distinct].length > 1 || !sameColor(e.cursorFrames[0].cursor.color, sungColor, true);

    if (changes.length === 0) {
      const c = e.cursorFrames[0].cursor;
      const text = needsColor ? `\\ytkt(${type},\\c${assColor(c.color)},${c.text})` : c.text === '_' ? `\\ytkt${type}` : `\\ytkt(${type},${c.text})`;
      return { text, reason: `cursor "${c.text}" ${type === 'Cursor' ? 'logo depois do que já foi cantado' : 'antes da sílaba que está sendo cantada'} em ${e.cursorFrames.length} quadros` };
    }
    // O intervalo é o menor passo que explica todas as trocas
    const gaps = changes.map((t, i) => t - (i > 0 ? changes[i - 1] : 0)).filter((g) => g > 30);
    let interval = round10(Math.min(...gaps));
    for (const g of gaps) {
      const k = Math.round(g / interval);
      if (k >= 1 && Math.abs(g - k * interval) > 40) interval = round10(Math.min(interval, g));
    }
    interval = Math.max(interval, 10);
    // Ordem do ciclo: o cursor de cada passo
    const steps = new Map();
    for (const f of e.cursorFrames) {
      const step = Math.floor((f.start - e.start + 20) / interval);
      if (!steps.has(step)) steps.set(step, f.cursor);
    }
    const ordered = [...steps.entries()].sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    const n = distinct.size;
    let cycle = ordered.slice(0, n);
    // Confere o ciclo com os passos vistos; senão fica a ordem de aparição
    const fits = [...steps.entries()].every(([step, c]) => key(cycle[step % n] ?? c) === key(c));
    if (!fits) {
      const seen = new Map();
      for (const c of ordered) if (!seen.has(key(c))) seen.set(key(c), c);
      cycle = [...seen.values()];
    }
    const args = cycle.map((c) => `${needsColor ? `\\c${assColor(c.color)}` : ''},${c.text}`).join(',');
    return {
      text: `\\ytkt(${type},${interval},${args})`,
      reason:
        `cursor ${type === 'Cursor' ? 'logo depois do que já foi cantado' : 'antes da sílaba que está sendo cantada'} em ${e.cursorFrames.length} quadros, ` +
        `trocando entre ${cycle.map((c) => `"${c.text}"`).join(', ')} a cada ~${interval} ms`,
    };
  }
  if (e.glitchFrames.length > 0) {
    return { text: '\\ytkt(Glitch)', reason: `${e.glitchFrames.length} sílabas aparecem como um caractere aleatório no primeiro quadro em que são cantadas` };
  }
  return null;
}

function writeAss(doc, events) {
  const registry = new StyleRegistry();
  const out = [];
  const lines = [];
  const summary = {};
  const count = (tag) => (summary[tag] = (summary[tag] ?? 0) + 1);

  for (const e of events) {
    const chars = e.finalChars;
    const firstVisible = e.visible[0];
    // Cor das letras ainda não cantadas no karaokê = estado inicial delas
    let secondary = null;
    if (e.karaoke) {
      const changing = e.initialChars.map((c, j) => j).filter((j) => e.visible.includes(j) && !isBlank(chars[j].ch) && !sameState(e.initialChars[j], chars[j]));
      const unsung = e.initialChars[changing[0] ?? firstVisible];
      // A opacidade vem da última sílaba: a primeira pode já estar no meio da troca (\\ytkt(Fade)) no primeiro quadro.
      // A cor vem da primeira, porque o .ytt pinta de preto as letras invisíveis.
      const last = e.initialChars[changing[changing.length - 1] ?? firstVisible];
      const fore = last.fore.a < unsung.fore.a ? Color.fromArgb(last.fore.a, unsung.fore.r, unsung.fore.g, unsung.fore.b) : unsung.fore;
      secondary = e.karaoke.native ? Color.fromArgb(0, 0, 0, 0) : fore;
    }
    const style = registry.get((e.mode === 'line' || e.mode === 'chars' ? e.initialChars : chars)[firstVisible], secondary);
    const builder = new AssLineContentBuilder();
    const tags = [];
    const addTag = (tag, text, reason) => {
      tags.push({ tag, text, reason });
      count(tag);
    };

    // --- tags da linha
    const posTag = (p) => `${formatNumber(Math.round(p.x))},${formatNumber(Math.round(p.y))}`;
    if (e.anchor !== AnchorPoint.BottomCenter) builder.appendTag('an', getAlignment(e.anchor));
    if (e.vtype !== VerticalTextType.None) builder.appendTag('ytvert', getVerticalTextTypeId(e.hdir, e.vtype));
    else if (e.hdir !== HorizontalTextDirection.LeftToRight) builder.appendTag('ytdir', getHorizontalTextDirectionId(e.hdir));

    if (e.move) {
      const m = e.move;
      const rel1 = round10(m.t1 - e.start);
      const rel2 = round10(m.t2 - e.start);
      const full = rel1 <= 70 && e.end - m.t2 <= 70;
      const text = `\\move(${posTag(m.from)},${posTag(m.to)}${full ? '' : `,${rel1},${rel2}`})`;
      builder._pendingTags += text;
      addTag('move', text, `posição anda em linha reta em ${m.frames} quadros`);
    } else if (e.basePos) {
      const def = doc.getDefaultPosition(e.anchor);
      if (Math.abs(e.basePos.x - def.x) > 1 || Math.abs(e.basePos.y - def.y) > 1) builder._pendingTags += `\\pos(${posTag(e.basePos)})`;
    }

    if (e.fade) {
      const text = fadeTag(e);
      if (text) {
        builder._pendingTags += text;
        const parts = [];
        if (e.fade.in) parts.push(`entra em ${e.fade.in.frames} quadros (opacidade ${pct(e.fade.in.first, e.fade.maxAlpha)} → 100%)`);
        if (e.fade.out) parts.push(`sai em ${e.fade.out.frames} quadros (100% → ${pct(e.fade.out.last, e.fade.maxAlpha)})`);
        addTag(text.startsWith('\\fade(') ? 'fade' : 'fad', text, `todas as letras mudam de opacidade juntas: ${parts.join('; ')}`);
      }
    }

    if (e.shake) {
      const s = e.shake;
      const rel1 = round10(s.t1 - e.start);
      const rel2 = round10(s.t2 - e.start);
      const full = rel1 <= 70 && e.end - s.t2 <= 70;
      let text;
      if (full) text = s.rx === 20 && s.ry === 20 ? '\\ytshake' : s.rx === s.ry ? `\\ytshake(${s.rx})` : `\\ytshake(${s.rx},${s.ry})`;
      else text = s.rx === s.ry ? `\\ytshake(${s.rx},${rel1},${rel2})` : `\\ytshake(${s.rx},${s.ry},${rel1},${rel2})`;
      builder._pendingTags += text;
      addTag('ytshake', text, `posição pula sem direção em ${s.frames} quadros (até ${s.rx} px na horizontal e ${s.ry} px na vertical)`);
    }

    if (e.chroma) {
      builder._pendingTags += e.chroma.text;
      addTag('ytchroma', e.chroma.text, e.chroma.reason);
    }

    const karaokeType = e.karaoke ? karaokeTypeTag(e) : null;
    if (karaokeType) {
      builder._pendingTags += karaokeType.text;
      addTag('ytkt', karaokeType.text, karaokeType.reason);
    } else if (e.karaoke?.fadeType) {
      builder._pendingTags += '\\ytkt(Fade)';
      addTag('ytkt', '\\ytkt(Fade)', 'cada sílaba troca de cor aos poucos, não de uma vez');
    }

    // --- trechos (letras com a mesma formatação, sílaba e animação)
    const syllableOf = (j) => (e.karaoke ? e.karaoke.syllables.findIndex((s) => j >= s.from && j <= s.to) : 0);
    if (e.karaoke && e.karaoke.lead > 0) {
      // Sílaba vazia antes da primeira: precisa de um bloco só dela
      builder._flushTags();
      builder._content += `{\\k${e.karaoke.lead}}`;
    }

    // No karaokê, a letra é escrita no estado cantado e a cor de antes vai no \2c; nos outros modos, no estado
    // inicial, com um \t por transição.
    const animated = e.mode === 'line' || e.mode === 'chars';
    const baseOf = (j) => (animated ? e.timelines[j].initial : chars[j]);
    const transOf = (j) => (animated ? e.timelines[j].transitions : []);
    const transKey = (j) => transOf(j).map((t) => `${round10(t.t1 - e.start)},${round10(t.t2 - e.start)},${t.accel ?? 1},${transformTags(charTagState(baseOf(j), secondary, style), charTagState(t.target, secondary, style))}`).join('|');

    let prev = styleState(style);
    let prevAnimated = null;
    let j = 0;
    let lineReasonDone = false;
    let charTransforms = 0;
    while (j < chars.length) {
      const syl = syllableOf(j);
      const base = charTagState(baseOf(j), secondary, style);
      const key = isBlank(chars[j].ch) ? null : transKey(j);
      let k = j + 1;
      while (k < chars.length && syllableOf(k) === syl) {
        if (isBlank(chars[k].ch)) {
          if (!sameStructure(chars[k], chars[j])) break;
        } else if (!sameTagState(charTagState(baseOf(k), secondary, style), base) || (key !== null && transKey(k) !== key) || (key === null && transOf(k).length > 0)) {
          break;
        }
        k++;
      }

      // Um trecho herda as animações do anterior: escrever de novo a cor/opacidade as apaga
      appendStateTags(builder, prevAnimated ? forgetAnimated(prev, prevAnimated) : prev, base);
      const transitions = isBlank(chars[j].ch) ? [] : transOf(j);
      let from = base;
      for (const t of transitions) {
        const to = charTagState(t.target, secondary, style);
        const tagText = transformTags(from, to);
        from = to;
        if (!tagText) continue;
        const t1 = round10(t.t1 - e.start);
        const t2 = Math.max(round10(t.t2 - e.start), t1 + 10);
        const full = t1 <= 70 && e.end - t.t2 <= 70;
        const accel = t.accel ? `${formatNumber(t.accel)},` : '';
        const text = full ? `\\t(${accel}${tagText})` : `\\t(${t1},${t2},${accel}${tagText})`;
        builder._pendingTags += text;
        if (e.mode === 'line' && !lineReasonDone) addTag('t', text, `todas as letras mudam juntas de ${t1} ms a ${t2} ms`);
        if (e.mode === 'chars') charTransforms++;
      }
      if (e.mode === 'line') lineReasonDone = lineReasonDone || transitions.length > 0;
      prev = base;
      prevAnimated = transitions.length > 0 ? animatedChannels(base, transitions.map((t) => charTagState(t.target, secondary, style))) : null;

      if (e.karaoke && j === e.karaoke.syllables[syl].from) builder.appendTag('k', e.karaoke.syllables[syl].duration);
      builder.appendText(chars.slice(j, k).map((c) => c.ch).join(''));
      j = k;
    }
    if (charTransforms > 0) addTag('t', `\\t × ${charTransforms}`, `as letras mudam (cor/opacidade/tamanho) em momentos diferentes: um \\t por trecho`);
    if (e.karaoke) addTag('k', `\\k × ${e.karaoke.syllables.length}`, e.karaoke.reason);

    const assText = builder.toString();
    const startMs = e.start;
    lines.push(`Dialogue: 0,${formatTimestamp(startMs)},${formatTimestamp(e.end)},${style.name},,0,0,0,,${assText}`);
    out.push({
      start: e.start,
      end: e.end,
      style: style.name,
      text: e.text.replace(/\r\n/g, '\n'),
      assText,
      tags,
      frames: e.frames.length,
      phrase: e.phrase,
      sourceLines: e.sourceLines,
    });
  }

  const defaultStyle = `Style: Default,Roboto,${DEFAULT_LINE_HEIGHT},&H01FEFEFE,&HFF000000,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,2,25,25,15,1`;
  const header = [
    '[Script Info]',
    `; Recuperado de um .ytt por heurística (YTSubConverter JS ${SCRIPT_GENERATOR_VERSION})`,
    '; As tags (\\fad, \\move, \\k, \\t, \\ytshake, \\ytchroma...) foram deduzidas dos quadros do .ytt: tempos e posições são aproximados.',
    '; Estilos com mais de uma sombra: use o StyleOptions.xml que acompanha este arquivo no YTSubConverter original.',
    'ScriptType: v4.00+',
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    `PlayResX: ${doc.videoDimensions.width}`,
    `PlayResY: ${doc.videoDimensions.height}`,
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    defaultStyle,
    ...registry.styles.map(styleLine),
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...lines,
    '',
  ];

  return {
    events: out,
    styles: registry.styles.map((s) => ({ name: s.name, shadowTypes: s.types, line: styleLine(s) })),
    ass: header.join('\r\n'),
    styleOptionsXml: buildStyleOptionsXml(registry.styles),
    summary,
  };
}

function sameStructure(a, b) {
  return a.font === b.font && a.scale === b.scale && a.bold === b.bold && a.italic === b.italic && a.underline === b.underline && a.offset === b.offset && a.packed === b.packed;
}

const pct = (a, max) => `${Math.round((a / max) * 100)}%`;

function fadeTag(e) {
  const { in: fin, out: fout } = e.fade;
  const inMs = fin ? round10(fin.fullAt - e.start) : 0;
  const outMs = fout ? round10(e.end - fout.fullAt) : 0;
  const inStartsAtEdge = !fin || Math.abs(fin.zeroAt - e.start) <= 100;
  const outEndsAtEdge = !fout || Math.abs(e.end - fout.zeroAt) <= 100;
  if (inStartsAtEdge && outEndsAtEdge) return inMs || outMs ? `\\fad(${inMs},${outMs})` : null;

  const duration = e.end - e.start;
  const t1 = fin ? round10(fin.zeroAt - e.start) : 0;
  const t2 = fin ? inMs : 0;
  const t3 = fout ? round10(fout.fullAt - e.start) : round10(duration);
  const t4 = fout ? round10(fout.zeroAt - e.start) : round10(duration);
  return `\\fade(${fin ? 255 : 0},0,${fout ? 255 : 0},${t1},${t2},${t3},${t4})`;
}

function buildStyleOptionsXml(styles) {
  const items = styles
    .map((s) => [
      '  <Style>',
      `    <Name>${s.name}</Name>`,
      `    <ShadowType>${s.types.length === 0 ? 'None' : s.types.join(' ')}</ShadowType>`,
      '    <IsKaraoke>false</IsKaraoke>',
      '    <CurrentWordTextColor />',
      '    <CurrentWordOutlineColor />',
      '    <CurrentWordShadowColor />',
      '  </Style>',
    ].join('\r\n'))
    .join('\r\n');
  return [
    '<?xml version="1.0"?>',
    '<StyleOptions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">',
    items,
    '</StyleOptions>',
    '',
  ].join('\r\n');
}
