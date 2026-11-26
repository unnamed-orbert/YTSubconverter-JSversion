// SrtDocument.cs and SbvDocument.cs

import { Line, Section } from '../model.js';
import { Color, colorFromHtml } from '../util/color.js';
import { decodeText, readLines } from '../util/misc.js';
import { SubtitleDocument } from './subtitleDocument.js';

const DEFAULT_BACK_COLOR = Color.fromArgb(192, 8, 8, 8);

function parseTimestampPair(text, regex) {
  const m = regex.exec(text);
  if (!m) return null;
  const toMs = (h, min, s, frac) => {
    const ms = Number(frac.padEnd(3, '0'));
    if (Number(min) > 59 || Number(s) > 59 || Number(h) > 23 || ms > 999) throw new RangeError(`Invalid timestamp: ${text}`);
    return ((Number(h) * 60 + Number(min)) * 60 + Number(s)) * 1000 + ms;
  };
  return { start: toMs(m[1], m[2], m[3], m[4]), end: toMs(m[5], m[6], m[7], m[8]) };
}

function appendToLine(line, text) {
  if (line == null || text == null) return;
  if (line.sections.length === 0) {
    const section = new Section(text);
    section.foreColor = Color.White;
    section.backColor = DEFAULT_BACK_COLOR;
    line.sections.push(section);
  } else {
    line.sections[0].text += '\r\n' + text;
  }
}

// Tags de formatação no estilo HTML que os players aceitam em .srt/.sbv: <b>, <i>, <u> e <font color="...">.
// Extensão do port: o original em C# deixa as tags como texto, e elas apareciam literalmente no .ytt/.ass.
const TAG_REGEX = /<(\/?)(b|i|u|font)(\s[^<>]*)?>/gi;

function parseFontColor(attrs) {
  const m = /color\s*=\s*["']?\s*#?([0-9a-f]{6}|[0-9a-f]{3})\b/i.exec(attrs ?? '');
  if (!m) return null;
  const hex = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  return colorFromHtml('#' + hex);
}

/**
 * Troca as tags <b>, <i>, <u> e <font color> do texto da linha por trechos (Section) com a formatação.
 * Tags sem par são aceitas (valem até o fim da linha ou são ignoradas); outras tags ficam como texto.
 */
function applyHtmlTags(line) {
  const base = line.sections[0];
  const text = base.text;
  TAG_REGEX.lastIndex = 0;
  if (!TAG_REGEX.test(text)) return;

  const counts = { b: 0, i: 0, u: 0 };
  const colors = [];
  const sections = [];
  let current = null;
  const append = (part) => {
    if (part === '') return;
    const color = colors.length ? colors[colors.length - 1] : base.foreColor;
    const bold = counts.b > 0, italic = counts.i > 0, underline = counts.u > 0;
    if (current && current.bold === bold && current.italic === italic && current.underline === underline && current.foreColor.equals(color)) {
      current.text += part;
      return;
    }
    current = base.clone();
    current.text = part;
    current.bold = bold;
    current.italic = italic;
    current.underline = underline;
    current.foreColor = color;
    sections.push(current);
  };

  let pos = 0;
  TAG_REGEX.lastIndex = 0;
  for (let m; (m = TAG_REGEX.exec(text)); ) {
    append(text.slice(pos, m.index));
    pos = m.index + m[0].length;
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    if (tag === 'font') {
      if (closing) colors.pop();
      else colors.push(parseFontColor(m[3]) ?? (colors.length ? colors[colors.length - 1] : base.foreColor));
    } else {
      counts[tag] = closing ? Math.max(0, counts[tag] - 1) : counts[tag] + 1;
    }
  }
  append(text.slice(pos));

  if (sections.length === 0) {
    base.text = '';
    return;
  }
  // Tira as quebras/espaços que sobraram no fim (ex.: "texto\r\n</i>")
  for (let i = sections.length - 1; i >= 0; i--) {
    sections[i].text = sections[i].text.trimEnd();
    if (sections[i].text !== '') break;
    sections.pop();
  }
  line.sections = sections.length ? sections : [base];
  if (!sections.length) base.text = '';
}

function addLine(doc, line) {
  if (line == null || line.sections.length === 0) return;
  line.sections[0].text = line.sections[0].text.trimEnd();
  applyHtmlTags(line);
  doc.lines.push(line);
}

const pad = (n, len = 2) => String(n).padStart(len, '0');

export class SrtDocument extends SubtitleDocument {
  /** @param {string | Uint8Array} content */
  static parse(content) {
    const doc = new SrtDocument();
    let subLine = null;
    let lineNumber = null;
    for (const fileLine of readLines(decodeText(content))) {
      if (/^\s*[+-]?\d+\s*$/.test(fileLine) && Math.abs(Number(fileLine)) <= 2147483647) {
        appendToLine(subLine, lineNumber);
        lineNumber = fileLine;
        continue;
      }

      const times = lineNumber != null ? parseTimestampPair(fileLine, /^(\d+):(\d+):(\d+)[.,](\d+) --> (\d+):(\d+):(\d+)[.,](\d+)/) : null;
      if (times) {
        addLine(doc, subLine);
        subLine = new Line(times.start, times.end);
        lineNumber = null;
        continue;
      }

      appendToLine(subLine, lineNumber);
      lineNumber = null;
      appendToLine(subLine, fileLine);
    }
    addLine(doc, subLine);
    return doc;
  }

  /** @returns {string} */
  save() {
    const fmt = (t) => `${pad(Math.floor(t / 3600000) % 24)}:${pad(Math.floor(t / 60000) % 60)}:${pad(Math.floor(t / 1000) % 60)},${pad(t % 1000, 3)}`;
    let out = '';
    this.lines.forEach((line, i) => {
      out += `${i + 1}\r\n${fmt(line.start)} --> ${fmt(line.end)}\r\n${line.text}\r\n\r\n`;
    });
    return out;
  }
}

export class SbvDocument extends SubtitleDocument {
  /** @param {string | Uint8Array} content */
  static parse(content) {
    const doc = new SbvDocument();
    let subLine = null;
    for (const fileLine of readLines(decodeText(content))) {
      const times = parseTimestampPair(fileLine, /^(\d+):(\d+):(\d+)[.,](\d+),(\d+):(\d+):(\d+)[.,](\d+)/);
      if (times) {
        addLine(doc, subLine);
        subLine = new Line(times.start, times.end);
      } else {
        appendToLine(subLine, fileLine);
      }
    }
    addLine(doc, subLine);
    return doc;
  }
}
