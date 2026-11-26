// SrtDocument.cs and SbvDocument.cs

import { Line, Section } from '../model.js';
import { Color } from '../util/color.js';
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

function addLine(doc, line) {
  if (line == null || line.sections.length === 0) return;
  line.sections[0].text = line.sections[0].text.trimEnd();
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
