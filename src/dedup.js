// "Corrigir duplicação massiva": junta as cópias quadro a quadro de uma legenda .ytt/.json3.
//
// Não existe no YTSubConverter original. É o port da lógica da ferramenta "YTT → SRT" do Carlos
// (coisasquegosto.vercel.app/YTT_Files/Ferramenta_para_converter_json3-ytt_para_srt, arquivo Logica.js).
// Um .ytt gerado a partir de um .ass com animação (\fade, \move, \t, karaokê, várias sombras) tem a mesma frase
// repetida em centenas de <p> de ~67 ms, um por quadro e um por camada de sombra. Isso fica ilegível num .srt.
// A lógica abaixo agrupa os quadros pela posição na tela (grade de 20%), junta os que continuam a mesma frase,
// resolve frases que se sobrepõem (fica a mais de baixo) e acerta os tempos entre uma frase e a próxima.
//
// A diferença para a ferramenta original é que aqui ela roda sobre as linhas já lidas (Line), e não sobre o
// JSON cru: assim vale igual para .ytt e .json3, e as linhas que sobram mantêm a formatação (cor, fonte,
// posição) de um dos quadros, para quem converte para .ytt/.ass em vez de .srt.

import { YttDocument } from './formats/ytt.js';

/** Gap máximo (ms) entre quadros para continuar a mesma frase. */
const MAX_MERGE_GAP = 200;
/** Duração mínima (ms) de uma frase para ela ficar. */
const MIN_DURATION = 300;
/** Tamanho da grade de posição (% da tela), na vertical e na horizontal. */
const GRID_V = 20;
const GRID_H = 20;
/** Se a próxima frase começa até este tanto (ms) depois do fim da atual, a atual é esticada até ela. */
const STRETCH_THRESHOLD = 500;

/** Diz se a opção se aplica a este documento (só entradas .ytt/.srv3/.json3). */
export function canFixMassiveDuplication(doc) {
  return doc instanceof YttDocument;
}

/**
 * Junta as cópias quadro a quadro das linhas do documento (altera e devolve o próprio documento).
 * @param {import('./formats/subtitleDocument.js').SubtitleDocument} doc
 */
export function fixMassiveDuplication(doc) {
  const { width, height } = doc.videoDimensions ?? { width: 1280, height: 720 };

  // PASSO 1: extrai as frases, com a posição encaixada na grade
  const subs = [];
  for (const line of doc.lines) {
    const text = normalizeText(line.text);
    if (!text) continue;

    // Igual à ferramenta: sem posição conta como topo (0) e centro (50). Diferença: a ferramenta lia ah="0"
    // (encostado à esquerda) como centro, por causa do "|| 50"; aqui a esquerda continua esquerda.
    const vPos = line.position ? toYouTubeCoord(line.position.y, height) : 0;
    const hPos = line.position ? toYouTubeCoord(line.position.x, width) : 50;
    const duration = line.end - line.start;
    subs.push({
      start: line.start,
      end: line.start + (duration || 1000),
      text,
      vPos,
      vGrid: Math.round(vPos / GRID_V) * GRID_V,
      hGrid: Math.round(hPos / GRID_H) * GRID_H,
      line,
    });
  }
  sortByStart(subs);

  // PASSO 2: agrupa por célula da grade
  const byCell = new Map();
  for (const sub of subs) {
    const key = `${sub.vGrid}-${sub.hGrid}`;
    if (!byCell.has(key)) byCell.set(key, []);
    byCell.get(key).push(sub);
  }

  // PASSO 3: dentro de cada célula, junta quadros seguidos com o mesmo texto ou texto que cresce/encolhe
  let merged = [];
  for (const frames of byCell.values()) {
    sortByStart(frames);
    let current = null;
    for (const frame of frames) {
      if (!current) {
        current = { ...frame };
        continue;
      }
      const gap = frame.start - current.end;
      const progression = frame.text.startsWith(current.text) || current.text.startsWith(frame.text);
      if (gap < MAX_MERGE_GAP && progression) {
        current.end = frame.end;
        if (frame.text.length > current.text.length) {
          current.text = frame.text;
          current.line = frame.line;
        } else if (frame.text === current.text && opacity(frame.line) > opacity(current.line)) {
          // Num fade o primeiro quadro é quase transparente: guarda a formatação do quadro mais visível.
          current.line = frame.line;
        }
      } else {
        if (current.end - current.start >= MIN_DURATION) merged.push(current);
        current = { ...frame };
      }
    }
    if (current && current.end - current.start >= MIN_DURATION) merged.push(current);
  }
  sortByStart(merged);

  // PASSO 3.5: colapsa frases iguais encadeadas (de células vizinhas)
  const collapsed = [];
  let cur = null;
  for (const sub of merged) {
    if (!cur) {
      cur = { ...sub };
      continue;
    }
    if (sub.start - cur.end <= 0 && sub.text === cur.text) {
      cur.end = sub.end;
    } else {
      collapsed.push(cur);
      cur = { ...sub };
    }
  }
  if (cur) collapsed.push(cur);
  merged = collapsed;

  // PASSO 4: resolve colisões no tempo (fica a de vPos maior, ou seja, a mais de baixo)
  let result = [];
  for (const sub of merged) {
    const collisions = result.filter((r) => r.start < sub.end && sub.start < r.end);
    if (collisions.length === 0) {
      result.push(sub);
      continue;
    }
    result = result.filter((r) => !(collisions.includes(r) && r.vPos < sub.vPos));
    if (collisions.every((c) => sub.vPos >= c.vPos)) result.push(sub);
  }
  sortByStart(result);

  // Descarta as de duração zero
  result = result.filter((r) => r.end - r.start !== 0);

  // PASSO 4.5: estica A até B se o buraco é pequeno, ou corta A no começo de B se elas se sobrepõem
  for (let i = 0; i < result.length - 1; i++) {
    const a = result[i];
    const b = result[i + 1];
    const diff = b.start - a.end;
    if (diff <= STRETCH_THRESHOLD) a.end = b.start;
  }

  doc.lines = result.map((r) => {
    const line = r.line.clone();
    line.start = r.start;
    line.end = r.end;
    // Os tempos de karaokê eram relativos ao quadro; a linha agora começa em outro ponto.
    for (const s of line.sections) s.startOffset = 0;
    trimLine(line);
    return line;
  });
  return doc;
}

/** Texto para comparar: sem espaços de largura zero, com espaços (e quebras) colapsados. */
function normalizeText(text) {
  return text.replace(/​/g, '').replace(/\s+/g, ' ').trim();
}

/** Inverso de getPixelCoord do leitor de .ytt: pixel -> % do YouTube (0 a 100, inteiro). */
function toYouTubeCoord(pixel, max) {
  const percentage = ((pixel / max) * 100 - 2) / 0.96;
  return Math.round(Math.min(Math.max(percentage, 0), 100));
}

/** Tira os espaços do começo e do fim do texto (os quadros costumam ter espaços de preenchimento). */
function trimLine(line) {
  const sections = line.sections.filter((s) => s.text.length > 0);
  if (sections.length === 0) return;
  sections[0].text = sections[0].text.trimStart();
  const last = sections[sections.length - 1];
  last.text = last.text.trimEnd();
}

function opacity(line) {
  return Math.max(0, ...line.sections.map((s) => s.foreColor?.a ?? 0));
}

/** Ordena pelo início mantendo a ordem original nos empates (como o sort estável do navegador). */
function sortByStart(list) {
  list.sort((a, b) => a.start - b.start);
}
