// Small helpers ported from YTSubConverter.Shared.Util.

import { AnchorPoint } from '../enums.js';

export class Range {
  constructor(start, end) {
    this.start = start;
    this.end = end;
  }

  contains(point) {
    return point >= this.start && point < this.end;
  }

  overlaps(other) {
    return this.start < other.end && this.end > other.start;
  }

  intersectWith(other) {
    if (!this.overlaps(other)) throw new Error("Can't intersect with a non-overlapping time range");
    this.start = Math.max(this.start, other.start);
    this.end = Math.min(this.end, other.end);
  }

  unionWith(other) {
    if (!this.overlaps(other)) throw new Error("Can't union with a non-overlapping time range");
    this.start = Math.min(this.start, other.start);
    this.end = Math.max(this.end, other.end);
  }
}

export class CharacterRange {
  constructor(start, end) {
    this.start = typeof start === 'string' ? start.charCodeAt(0) : start;
    this.end = typeof end === 'string' ? end.charCodeAt(0) : end;
  }

  contains(c) {
    const code = typeof c === 'string' ? c.charCodeAt(0) : c;
    return code >= this.start && code < this.end;
  }

  static isRightToLeft(c) {
    return CharacterRange.ArabicRange.contains(c) || CharacterRange.HebrewRange.contains(c);
  }
}

CharacterRange.ArabicRange = new CharacterRange(0x600, 0x6ff);
CharacterRange.HebrewRange = new CharacterRange(0x590, 0x5ff);
CharacterRange.HiraganaRange = new CharacterRange(0x3041, 0x3097);
CharacterRange.KatakanaRange = new CharacterRange(0x30a0, 0x3100);
CharacterRange.IdeographExtensionRange = new CharacterRange(0x3400, 0x4db6);
CharacterRange.IdeographRange = new CharacterRange(0x4e00, 0x9fcc);
CharacterRange.IdeographCompatibilityRange = new CharacterRange(0xf900, 0xfa6b);
CharacterRange.HangulRange = new CharacterRange(0xac00, 0xd7a4);

/** StringExtensions.Split(str, separator, maxItems) */
export function splitMax(str, separator, maxItems) {
  const result = [];
  let start = 0;
  while (start <= str.length) {
    let end;
    if (start < str.length && (maxItems == null || result.length < maxItems - 1)) {
      end = str.indexOf(separator, start);
      if (end < 0) end = str.length;
    } else {
      end = str.length;
    }
    result.push(str.substring(start, end));
    start = end + separator.length;
  }
  return result;
}

/** StringExtensions.ToCrlf */
export function toCrlf(str) {
  return str.replace(/\r\n|\r|\n/g, '\r\n');
}

/** Splits text into lines the way TextReader.ReadLine() does. */
export function readLines(text) {
  if (text.length === 0) return [];
  const lines = text.split(/\r\n|\r|\n/);
  if (/[\r\n]$/.test(text)) lines.pop();
  return lines;
}

/** Decodes a file buffer like StreamReader does (BOM detection, UTF-8 default). */
export function decodeText(buffer) {
  if (typeof buffer === 'string') return buffer.replace(/^﻿/, '');
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  return new TextDecoder('utf-8').decode(bytes).replace(/^﻿/, '');
}

/** Sorted dictionary with numeric keys (System.Collections.Generic.SortedList). */
export class SortedNumberMap {
  constructor() {
    this.keys = [];
    this.values = [];
  }

  get count() {
    return this.keys.length;
  }

  indexOfKey(key) {
    const idx = binarySearchIndexAtOrAfter(this.keys, key);
    return idx < this.keys.length && this.keys[idx] === key ? idx : -1;
  }

  set(key, value) {
    const idx = binarySearchIndexAtOrAfter(this.keys, key);
    if (idx < this.keys.length && this.keys[idx] === key) {
      this.values[idx] = value;
    } else {
      this.keys.splice(idx, 0, key);
      this.values.splice(idx, 0, value);
    }
  }
}

export function binarySearchIndexAtOrAfter(items, searchItem) {
  let startIdx = 0;
  let endIdx = items.length;
  while (endIdx > startIdx) {
    const pivotIdx = (startIdx + endIdx) >> 1;
    const pivot = items[pivotIdx];
    if (searchItem === pivot) return pivotIdx;
    if (searchItem < pivot) endIdx = pivotIdx;
    else startIdx = pivotIdx + 1;
  }
  return startIdx;
}

export const AnchorPointUtil = {
  isLeftAligned: (a) => a === AnchorPoint.TopLeft || a === AnchorPoint.MiddleLeft || a === AnchorPoint.BottomLeft,
  isCenterAligned: (a) => a === AnchorPoint.TopCenter || a === AnchorPoint.Center || a === AnchorPoint.BottomCenter,
  isRightAligned: (a) => a === AnchorPoint.TopRight || a === AnchorPoint.MiddleRight || a === AnchorPoint.BottomRight,
  isTopAligned: (a) => a === AnchorPoint.TopLeft || a === AnchorPoint.TopCenter || a === AnchorPoint.TopRight,
  isMiddleAligned: (a) => a === AnchorPoint.MiddleLeft || a === AnchorPoint.Center || a === AnchorPoint.MiddleRight,
  isBottomAligned: (a) => a === AnchorPoint.BottomLeft || a === AnchorPoint.BottomCenter || a === AnchorPoint.BottomRight,
};

/** FontSizeMapper: Aegisub line heights vs. real font sizes. */
const LINE_HEIGHT_TO_FONT_SIZE = {
  'carrois gothic sc': 32 / 38,
  'comic sans ms': 32 / 45,
  'courier new': 32 / 36,
  'lucida console': 32 / 32,
  'monotype corsiva': 32 / 35,
  roboto: 32 / 38,
  'times new roman': 32 / 35,
};

function getSizeFactor(fontName) {
  const factor = LINE_HEIGHT_TO_FONT_SIZE[fontName.toLowerCase()];
  if (factor === undefined) throw new Error(`No size factor defined for font ${fontName}`);
  return Math.fround(factor);
}

export const FontSizeMapper = {
  lineHeightToFontSize: (fontName, lineHeight) => Math.fround(lineHeight * getSizeFactor(fontName)),
  fontSizeToLineHeight: (fontName, fontSize) => Math.fround(fontSize / getSizeFactor(fontName)),
};
