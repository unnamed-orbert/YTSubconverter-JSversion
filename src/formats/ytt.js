// YttDocument.cs (writing): YouTube's "srv3" / .ytt timed text format.

import { AnchorPoint, HorizontalTextDirection, OffsetType, RubyPart, ShadowType, VerticalTextType } from '../enums.js';
import { Line, Section, SectionFormatComparer } from '../model.js';
import { brighten, changeAlpha, Color, colorToHtml, isDark } from '../util/color.js';
import { CharacterRange } from '../util/misc.js';
import { f32, roundHalfEven } from '../util/numbers.js';
import { roundTimeToFrameCenter, TIME_BASE } from '../util/time.js';
import { SubtitleDocument } from './subtitleDocument.js';

const ZERO_WIDTH_SPACE = '​';
// Surrounded with zwsp's so it can be recognized and removed during reverse conversion
const PADDING_SPACE = '​ ​';

export class YttDocument extends SubtitleDocument {
  /** @param {SubtitleDocument} [doc] */
  constructor(doc) {
    super(doc);
  }

  /**
   * Serializes to .ytt. Like the C# original this mutates the document (merges lines, applies workarounds).
   * @param {{bom?: boolean}} [options] bom: prepend a UTF-8 BOM, as the C# StreamWriter does (default false)
   * @returns {string}
   */
  save({ bom = false } = {}) {
    this.closeGaps();
    this.mergeSimultaneousLines();
    this.mergeIdenticallyFormattedSections();
    this.applyEnhancements();
    this.mergeIdenticallyFormattedSections();

    const positions = SubtitleDocument.extractAttributes(this.lines, (l) => this.linePositionKey(l));
    const windowStyles = SubtitleDocument.extractAttributes(this.lines, lineAlignmentKey);
    const pens = SubtitleDocument.extractAttributes(this.lines.flatMap((l) => l.sections), normalizedSectionKey);

    const w = new XmlWriter();
    w.start('timedtext');
    w.attr('format', '3');
    this.writeHead(w, positions, windowStyles, pens);
    this.writeBody(w, positions, windowStyles, pens);
    w.end();

    return (bom ? '﻿' : '') + w.toString();
  }

  // ---------------------------------------------------------------- enhancements

  applyEnhancements() {
    this.addItalicPrefetch();
    for (let i = 0; i < this.lines.length; i++) {
      this.makeInvisibleTextBlack(i);
      this.preventShadowClipping(i);
      this.hardenSpaces(i);
      this.limitColors(i);
      i += this.expandLineForMultiShadows(i) - 1;
      i += this.expandLineForDarkText(i) - 1;
    }
    this.applyManualLinePadding();
  }

  /**
   * On PC, the first piece of italic text shows up with a noticeable delay. Adding an invisible italic
   * subtitle at the start makes YouTube eagerly load whatever it normally loads lazily.
   */
  addItalicPrefetch() {
    if (!this.lines.some((l) => l.sections.some((s) => s.italic))) return;

    const italicLine = new Line(roundTimeToFrameCenter(TIME_BASE + 5000), roundTimeToFrameCenter(TIME_BASE + 5100));
    italicLine.position = { x: 0, y: 0 };
    italicLine.anchorPoint = AnchorPoint.BottomRight;
    const section = new Section(ZERO_WIDTH_SPACE);
    section.foreColor = Color.fromArgb(1, 255, 255, 255);
    section.backColor = Color.Empty;
    section.italic = true;
    italicLine.sections.push(section);
    this.lines.push(italicLine);
  }

  /** The Android app doesn't support text transparency: make invisible text black so it melts into the background. */
  makeInvisibleTextBlack(lineIndex) {
    for (const section of this.lines[lineIndex].sections) {
      if (section.foreColor.a === 0) section.foreColor = Color.fromArgb(0, 0, 0, 0);
    }
  }

  /**
   * A section with a shadow and no trailing space gets its shadow cut off. Steal the starting space of
   * the next section (or, for RTL text, the ending space of the previous one).
   */
  preventShadowClipping(lineIndex) {
    const line = this.lines[lineIndex];
    for (let i = 0; i < line.sections.length; i++) {
      const curr = line.sections[i];
      if (curr.rubyPart === RubyPart.Base) {
        i += 3;
        continue;
      }
      if (curr.shadowColors.size === 0 || curr.underline) continue;

      if ([...curr.text].some((c) => CharacterRange.isRightToLeft(c))) {
        if (curr.text.startsWith(' ') || i === 0) continue;
        const prev = line.sections[i - 1];
        if (prev.rubyPart === RubyPart.Parenthesis || !prev.text.endsWith(' ')) continue;
        prev.text = prev.text.substring(0, prev.text.length - 1);
        curr.text = ' ' + curr.text;
      } else {
        if (curr.text.endsWith(' ') || i === line.sections.length - 1) continue;
        const next = line.sections[i + 1];
        if (next.rubyPart === RubyPart.Base || !next.text.startsWith(' ')) continue;
        curr.text = curr.text + ' ';
        next.text = next.text.substring(1);
      }
    }
  }

  /** Browsers collapse sequences of spaces: replace them by non-breaking spaces. */
  hardenSpaces(lineIndex) {
    for (const section of this.lines[lineIndex].sections) {
      section.text = section.text.replace(/  +/g, (m) => ' '.repeat(m.length));
    }
  }

  /**
   * Never use 255 for an opacity (the upload strips the attribute and players fall back to user defaults),
   * avoid pure white text (ignored by Android), and normalize shadow opacities.
   */
  limitColors(lineIndex) {
    for (const section of this.lines[lineIndex].sections) {
      if ((section.foreColor.toArgb() & 0xffffff) === 0xffffff)
        section.foreColor = Color.fromArgbInt((section.foreColor.a << 24) | 0xfefefe);
      if (section.foreColor.a === 255) section.foreColor = changeAlpha(section.foreColor, 254);
      if (section.backColor.a === 255) section.backColor = changeAlpha(section.backColor, 254);

      for (const [type, color] of [...section.shadowColors]) {
        if (color.a === 0) section.shadowColors.delete(type);
      }

      const toChange = [];
      for (const [type, color] of section.shadowColors) {
        if (color.a !== 254 && ((color.toArgb() & 0xffffff) !== 0x222222 || color.a !== section.foreColor.a)) toChange.push(type);
      }
      for (const type of toChange) section.shadowColors.set(type, changeAlpha(section.shadowColors.get(type), 254));
    }
  }

  /** Multiple shadow types on one subtitle are supported by duplicating it. */
  expandLineForMultiShadows(lineIndex) {
    const line = this.lines[lineIndex];
    const maxNumShadows = Math.max(...line.sections.map((s) => s.shadowColors.size));
    if (maxNumShadows <= 1) return 1;

    const ordered = [ShadowType.SoftShadow, ShadowType.HardShadow, ShadowType.Bevel, ShadowType.Glow];
    const layerTypes = line.sections.map((s) => ordered.filter((t) => s.shadowColors.has(t)));

    this.lines.splice(lineIndex, 1);
    for (let layerIdx = 0; layerIdx < maxNumShadows; layerIdx++) {
      const shadowLine = line.clone();
      shadowLine.sections.forEach((section, sectionIdx) => {
        const types = layerTypes[sectionIdx];
        if (layerIdx > 0) section.backColor = Color.Empty;
        if (layerIdx < types.length) {
          for (const t of [...section.shadowColors.keys()]) if (t !== types[layerIdx]) section.shadowColors.delete(t);
        } else {
          section.shadowColors.clear();
        }
      });
      this.lines.splice(lineIndex + layerIdx, 0, shadowLine);
    }
    return maxNumShadows;
  }

  /**
   * The mobile apps have an unchangeable black background. Overlap dark text with an invisible bright copy:
   * PC shows the dark text, Android (no transparency support) shows the bright one.
   */
  expandLineForDarkText(lineIdx) {
    const line = this.lines[lineIdx];
    if (!line.androidDarkTextHackAllowed || !line.sections.some((s) => s.foreColor.a > 0 && isDark(s.foreColor))) return 1;

    const brightLine = line.clone();
    for (const section of brightLine.sections) {
      if (section.foreColor.a > 0 && isDark(section.foreColor)) section.foreColor = brighten(section.foreColor);
      section.foreColor = changeAlpha(section.foreColor, 0);
      section.backColor = changeAlpha(section.backColor, 0);
      section.shadowColors.clear();
    }
    this.lines.splice(lineIdx + 1, 0, brightLine);
    return 2;
  }

  /**
   * Works around several YouTube padding/line-height/flicker bugs by surrounding every line of text
   * with padding sections (see the long comment in the C# original).
   */
  applyManualLinePadding() {
    for (const line of this.lines) {
      this.applyManualLinePaddingToLine(line);
      avoidZeroDurationKaraoke(line);
    }
  }

  applyManualLinePaddingToLine(line) {
    if (line.verticalTextType === VerticalTextType.Positioned) return;

    SubtitleDocument.moveLineBreaksToSeparateSections(line);

    // A (hopefully) unique color combination so padding sections won't be merged with others during upload
    const hiddenTemplate = new Section();
    hiddenTemplate.backColor = Color.fromArgb(0, 130, 140, 150);
    hiddenTemplate.foreColor = Color.fromArgb(0, 160, 170, 180);

    const createPadding = (template, text, startOffset) => {
      const padding = template.clone();
      padding.text = text;
      padding.rubyPart = RubyPart.None;
      padding.underline = false;
      padding.startOffset = startOffset;
      return padding;
    };

    let i = 0;
    while (i < line.sections.length) {
      const section = line.sections[i];
      let nextIdx = i + (section.rubyPart === RubyPart.Base ? 4 : 1);
      hiddenTemplate.scale = section.scale;

      if (section.text.includes('\r\n')) {
        line.sections[i] = createPadding(hiddenTemplate, section.text, section.startOffset);
        i = nextIdx;
        continue;
      }

      if (i === 0 || line.sections[i - 1].text.endsWith('\r\n')) {
        line.sections.splice(i, 0, createPadding(hiddenTemplate, ZERO_WIDTH_SPACE, section.startOffset), createPadding(section, PADDING_SPACE, section.startOffset));
        nextIdx += 2;
      }

      if (nextIdx === line.sections.length || line.sections[nextIdx].text.startsWith('\r\n')) {
        line.sections.splice(nextIdx, 0, createPadding(section, PADDING_SPACE, section.startOffset), createPadding(hiddenTemplate, ZERO_WIDTH_SPACE, section.startOffset));
        nextIdx += 2;
      }

      i = nextIdx;
    }
  }

  // ---------------------------------------------------------------- writing

  writeHead(w, positions, windowStyles, pens) {
    w.start('head');

    // The iOS app ignores the background color of the first pen (and maybe similar items), so write dummies.
    const dummyPos = new Line(TIME_BASE, TIME_BASE);
    dummyPos.position = { x: 0, y: 0 };
    this.writeWindowPosition(w, 0, dummyPos);
    for (const { id, item } of positions.items) this.writeWindowPosition(w, id, item);

    writeWindowStyle(w, 0, new Line(TIME_BASE, TIME_BASE));
    for (const { id, item } of windowStyles.items) writeWindowStyle(w, id, item);

    writePen(w, 0, new Section());
    for (const { id, item } of pens.items) writePen(w, id, item);

    w.end();
  }

  writeWindowPosition(w, id, position) {
    const pos = this.getYouTubePosition(position);
    w.start('wp');
    w.attr('id', id);
    w.attr('ap', getAnchorPointId(position.anchorPoint));
    w.attr('ah', pos.x);
    w.attr('av', pos.y);
    w.end();
  }

  writeBody(w, positions, windowStyles, pens) {
    w.start('body');
    for (const line of this.lines) writeLine(w, line, positions, windowStyles, pens);
    w.end();
  }

  /**
   * YouTube moves subtitles slightly toward the center (X=0% becomes 2%, 10% becomes 11.6%...).
   * Counteract this so subtitles are displayed where they should be.
   */
  getYouTubePosition(line) {
    const pixelPos = line.position ?? this.getDefaultPosition(line.anchorPoint);
    return {
      x: getYouTubeCoord(pixelPos.x, this.videoDimensions.width),
      y: getYouTubeCoord(pixelPos.y, this.videoDimensions.height),
    };
  }

  linePositionKey(line) {
    const pos = this.getYouTubePosition(line);
    return `${line.anchorPoint}|${pos.x}|${pos.y}`;
  }
}

/** YouTube's upload breaks zero-duration karaoke segments, so give them 1ms instead. */
function avoidZeroDurationKaraoke(line) {
  for (let i = 1; i < line.sections.length; i++) {
    const prev = line.sections[i - 1];
    const section = line.sections[i];
    if (section.startOffset > 0 && prev.startOffset >= section.startOffset) section.startOffset = prev.startOffset + 1;
  }
}

function writeWindowStyle(w, id, style) {
  w.start('ws');
  w.attr('id', id);
  w.attr('ju', getJustificationId(style.anchorPoint));
  const [pd, sd] = getPrintAndScrollDirectionIds(style.horizontalTextDirection, style.verticalTextType);
  w.attr('pd', pd);
  w.attr('sd', sd);
  w.attr('wfo', '0');
  w.end();
}

function writePen(w, id, format) {
  w.start('pen');
  w.attr('id', id);

  const fontStyleId = getFontStyleId(format.font);
  if (fontStyleId !== 0) w.attr('fs', fontStyleId);
  w.attr('sz', getYouTubeFontScale(format.scale));
  if (format.offset !== OffsetType.Regular) w.attr('of', getOffsetTypeId(format.offset));
  if (format.bold) w.attr('b', '1');
  if (format.italic) w.attr('i', '1');
  if (format.underline) w.attr('u', '1');

  w.attr('fc', colorToHtml(format.foreColor.isEmpty ? Color.Black : format.foreColor));
  w.attr('fo', format.foreColor.a);
  if (format.backColor.a > 0) w.attr('bc', colorToHtml(format.backColor));
  w.attr('bo', format.backColor.a);

  if (format.shadowColors.size > 0) {
    if (format.shadowColors.size > 1) throw new Error('YTT lines must be reduced to one shadow color before saving');
    const [type, color] = format.shadowColors.entries().next().value;
    if (color.a > 0) {
      w.attr('et', getEdgeTypeId(type));
      // With "ec" the shadow is fully opaque; without it (default #222222) it follows the foreground opacity.
      // So only write "ec" if we have to.
      if ((color.toArgb() & 0xffffff) !== 0x222222 || color.a !== format.foreColor.a) w.attr('ec', colorToHtml(color));
    }
  }

  if (format.rubyPart !== RubyPart.None) w.attr('rb', getRubyPartId(format.rubyPart));
  if (format.packed) w.attr('hg', '1');
  w.end();
}

function writeLine(w, line, positions, windowStyles, pens) {
  if (line.sections.length === 0) return;

  let startMs = line.start - TIME_BASE;
  let durationMs = line.end - line.start;

  // Negative/zero start: use 1ms instead (Android doesn't position, or sometimes show, subtitles at 0ms)
  if (startMs <= 0) {
    durationMs -= -startMs + 1;
    startMs = 1;
  }
  if (durationMs <= 0) return;

  w.start('p');
  w.attr('t', startMs);
  w.attr('d', durationMs);
  if (line.sections.length === 1) w.attr('p', pens.idOf(line.sections[0]));
  w.attr('wp', positions.idOf(line));
  w.attr('ws', windowStyles.idOf(line));

  if (line.sections.length === 1) {
    w.text(line.sections[0].text);
  } else {
    // The server removes the pen of the first section unless the line has text outside any section.
    // A zero-width space after the first section avoids visual impact.
    const workaroundIdx = line.sections[0].rubyPart === RubyPart.None ? 0 : 3;
    line.sections.forEach((section, i) => {
      w.start('s');
      w.attr('p', pens.idOf(section));
      if (section.startOffset > 0) w.attr('t', Math.trunc(section.startOffset));
      w.text(section.text);
      w.end();
      if (i === workaroundIdx) w.text(ZERO_WIDTH_SPACE);
    });
  }
  w.end();
}

function getYouTubeCoord(pixelCoord, maxValue) {
  let percentage = f32(f32(pixelCoord / maxValue) * 100);
  percentage = f32(f32(percentage - 2) / f32(0.96));
  percentage = Math.min(Math.max(percentage, 0), 100);
  return roundHalfEven(percentage);
}

/**
 * YouTube applies realScale = 1 + (yttScale - 1) / 4, so 200% gives 125% and the minimum is 75%.
 */
export function getRealFontScale(yttScale) {
  return f32(1 + f32(f32(f32(yttScale / 100) - 1) / 4));
}

export function getYouTubeFontScale(realScale) {
  const yttScale = Math.max(f32(1 + f32(f32(realScale - 1) * 4)), 0);
  return roundHalfEven(f32(yttScale * 100));
}

function lineAlignmentKey(line) {
  return `${getJustificationId(line.anchorPoint)}|${line.horizontalTextDirection}|${line.verticalTextType}`;
}

/** Key equivalent to NormalizedSectionFormatComparer (fonts and scales compared after YouTube's quantization). */
function normalizedSectionKey(s) {
  const shadows = [...s.shadowColors].map(([t, c]) => `${t}=${c.toArgb()}`).sort().join(',');
  return [
    s.bold, s.italic, s.underline,
    getFontName(getFontStyleId(s.font)),
    getYouTubeFontScale(s.scale),
    s.offset, s.foreColor.toArgb(), s.backColor.toArgb(), s.rubyPart, s.packed, shadows,
  ].join('|');
}

export class NormalizedSectionFormatComparer extends SectionFormatComparer {
  normalizeFont(font) {
    return getFontName(getFontStyleId(font));
  }

  normalizeScale(scale) {
    return getRealFontScale(getYouTubeFontScale(scale));
  }
}

const ANCHOR_POINT_IDS = [
  AnchorPoint.TopLeft, AnchorPoint.TopCenter, AnchorPoint.TopRight,
  AnchorPoint.MiddleLeft, AnchorPoint.Center, AnchorPoint.MiddleRight,
  AnchorPoint.BottomLeft, AnchorPoint.BottomCenter, AnchorPoint.BottomRight,
];

export function getAnchorPointId(anchorPoint) {
  const id = ANCHOR_POINT_IDS.indexOf(anchorPoint);
  if (id < 0) throw new RangeError(`Invalid anchor point: ${anchorPoint}`);
  return id;
}

export function getAnchorPointFromId(id) {
  const ap = ANCHOR_POINT_IDS[id];
  if (ap === undefined) throw new RangeError(`Invalid anchor point id: ${id}`);
  return ap;
}

function getJustificationId(anchorPoint) {
  switch (anchorPoint) {
    case AnchorPoint.TopLeft: case AnchorPoint.MiddleLeft: case AnchorPoint.BottomLeft: return 0;
    case AnchorPoint.TopCenter: case AnchorPoint.Center: case AnchorPoint.BottomCenter: return 2;
    case AnchorPoint.TopRight: case AnchorPoint.MiddleRight: case AnchorPoint.BottomRight: return 1;
    default: throw new RangeError(`Invalid anchor point: ${anchorPoint}`);
  }
}

function getPrintAndScrollDirectionIds(hor, ver) {
  switch (ver) {
    case VerticalTextType.Positioned: return [2, hor === HorizontalTextDirection.RightToLeft ? 0 : 1];
    case VerticalTextType.Rotated: return [3, hor === HorizontalTextDirection.LeftToRight ? 0 : 1];
    default: return [hor === HorizontalTextDirection.LeftToRight ? 0 : 1, 0];
  }
}

function getEdgeTypeId(type) {
  switch (type) {
    case ShadowType.HardShadow: return 1;
    case ShadowType.Bevel: return 2;
    case ShadowType.Glow: return 3;
    case ShadowType.SoftShadow: return 4;
    default: throw new RangeError(`Invalid shadow type: ${type}`);
  }
}

function getOffsetTypeId(type) {
  switch (type) {
    case OffsetType.Subscript: return 0;
    case OffsetType.Regular: return 1;
    case OffsetType.Superscript: return 2;
    default: throw new RangeError(`Invalid offset type: ${type}`);
  }
}

function getRubyPartId(part) {
  switch (part) {
    case RubyPart.None: return 0;
    case RubyPart.Base: return 1;
    case RubyPart.Parenthesis: return 2;
    case RubyPart.TextBefore: return 4;
    case RubyPart.TextAfter: return 5;
    default: throw new RangeError(`Invalid ruby part: ${part}`);
  }
}

export function getFontStyleId(font) {
  switch (font?.toLowerCase()) {
    case 'courier new': case 'courier': case 'nimbus mono l': case 'cutive mono':
      return 1;
    case 'times new roman': case 'times': case 'georgia': case 'cambria': case 'pt serif caption':
      return 2;
    case 'deja vu sans mono': case 'dejavu sans mono': case 'lucida console': case 'monaco': case 'consolas': case 'pt mono':
      return 3;
    case 'comic sans ms': case 'impact': case 'handlee':
      return 5;
    case 'monotype corsiva': case 'urw chancery l': case 'apple chancery': case 'dancing script':
      return 6;
    case 'carrois gothic sc':
      return 7;
    default:
      return 0;
  }
}

export function getFontName(fontStyleId) {
  switch (fontStyleId) {
    case 1: return 'Courier New';
    case 2: return 'Times New Roman';
    case 3: return 'Lucida Console';
    case 5: return 'Comic Sans Ms';
    case 6: return 'Monotype Corsiva';
    case 7: return 'Carrois Gothic Sc';
    default: return 'Roboto';
  }
}

/**
 * Minimal equivalent of .NET's XmlWriter with default settings: XML declaration, no indentation,
 * `<e a="v" />` for empty elements, newlines in text normalized to "\n".
 */
class XmlWriter {
  constructor() {
    this.out = ['<?xml version="1.0" encoding="utf-8"?>'];
    this.stack = [];
    this.openTag = false;
  }

  closeStartTag() {
    if (this.openTag) {
      this.out.push('>');
      this.openTag = false;
      this.stack[this.stack.length - 1].hasContent = true;
    }
  }

  start(name) {
    this.closeStartTag();
    this.out.push('<', name);
    this.stack.push({ name, hasContent: false });
    this.openTag = true;
  }

  attr(name, value) {
    if (!this.openTag) throw new Error('Attributes must be written right after the element start');
    this.out.push(' ', name, '="', escapeAttr(String(value)), '"');
  }

  text(value) {
    if (value == null || value === '') return;
    checkChars(value);
    this.closeStartTag();
    this.out.push(escapeText(value));
  }

  end() {
    const elem = this.stack.pop();
    if (this.openTag && !elem.hasContent) {
      this.out.push(' />');
      this.openTag = false;
    } else {
      this.closeStartTag();
      this.out.push('</', elem.name, '>');
    }
  }

  toString() {
    return this.out.join('');
  }
}

function escapeText(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r\n|\r|\n/g, '\n');
}

function escapeAttr(s) {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/\t/g, '&#x9;').replace(/\n/g, '&#xA;').replace(/\r/g, '&#xD;');
}

function checkChars(s) {
  // XmlWriter (CheckCharacters = true) rejects characters that are invalid in XML 1.0
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/.test(s)) throw new Error(`Invalid XML character in text: ${JSON.stringify(s)}`);
}
