// Line.cs, Section.cs and SectionFormatComparer.cs
//
// Interface notes for other formats (e.g. the .ass reader):
// - Times (start, end, startOffset) are integer milliseconds relative to TIME_BASE (0).
// - Colors are instances of Color (src/util/color.js); Color.Empty is the C# default(Color).
// - shadowColors is a Map<ShadowType, Color> (insertion ordered, like the C# Dictionary).
// - position is null or a plain {x, y} object with float32 values.
// - Subclasses (AssLine/AssSection) override clone(), assign() and createSection().

import { AnchorPoint, HorizontalTextDirection, OffsetType, RubyPart, VerticalTextType } from './enums.js';
import { Color } from './util/color.js';

export class Section {
  constructor(text = null) {
    this.text = text;
    this.font = null;
    this.scale = 1;
    this.offset = OffsetType.Regular;
    this.bold = false;
    this.italic = false;
    this.underline = false;
    this.foreColor = Color.Empty;
    this.backColor = Color.Empty;
    /** @type {Map<string, Color>} */
    this.shadowColors = new Map();
    this.rubyPart = RubyPart.None;
    this.packed = false;
    this.startOffset = 0;
  }

  static from(other) {
    const section = new Section();
    section.assign(other);
    return section;
  }

  clone() {
    return Section.from(this);
  }

  assign(section) {
    this.text = section.text;
    this.font = section.font;
    this.scale = section.scale;
    this.offset = section.offset;
    this.bold = section.bold;
    this.italic = section.italic;
    this.underline = section.underline;
    this.foreColor = section.foreColor;
    this.backColor = section.backColor;
    this.shadowColors = new Map(section.shadowColors);
    this.rubyPart = section.rubyPart;
    this.packed = section.packed;
    this.startOffset = section.startOffset;
  }

  toString() {
    return this.text;
  }
}

export class Line {
  /**
   * @param {number} start
   * @param {number} end
   * @param {string | Section[]} [content]
   */
  constructor(start = 0, end = 0, content) {
    this.start = start;
    this.end = end;
    /** @type {Section[]} */
    this.sections = [];
    this.anchorPoint = AnchorPoint.BottomCenter;
    this.position = null;
    this.horizontalTextDirection = HorizontalTextDirection.LeftToRight;
    this.verticalTextType = VerticalTextType.None;
    this.androidDarkTextHackAllowed = true;

    if (typeof content === 'string') this.sections.push(new Section(content));
    else if (Array.isArray(content)) this.sections.push(...content);
  }

  get text() {
    return this.sections.map((s) => s.text).join('');
  }

  static from(other, copySections = true) {
    const line = new Line();
    line.assign(other, copySections);
    return line;
  }

  clone() {
    return Line.from(this);
  }

  assign(line, assignSections = true) {
    this.start = line.start;
    this.end = line.end;
    this.anchorPoint = line.anchorPoint;
    this.position = line.position;
    this.horizontalTextDirection = line.horizontalTextDirection;
    this.verticalTextType = line.verticalTextType;
    this.androidDarkTextHackAllowed = line.androidDarkTextHackAllowed;
    if (assignSections) this.sections = line.sections.map((s) => this.createSection(s));
  }

  createSection(section) {
    return Section.from(section);
  }

  toString() {
    return this.text;
  }
}

export class SectionFormatComparer {
  normalizeFont(font) {
    return font;
  }

  normalizeScale(scale) {
    return scale;
  }

  equals(x, y) {
    if (
      x.bold !== y.bold ||
      x.italic !== y.italic ||
      x.underline !== y.underline ||
      this.normalizeFont(x.font) !== this.normalizeFont(y.font) ||
      Math.abs(this.normalizeScale(x.scale) - this.normalizeScale(y.scale)) > 0.001 ||
      x.offset !== y.offset ||
      x.foreColor.toArgb() !== y.foreColor.toArgb() ||
      x.backColor.toArgb() !== y.backColor.toArgb() ||
      x.rubyPart !== y.rubyPart ||
      x.packed !== y.packed ||
      x.shadowColors.size !== y.shadowColors.size
    )
      return false;

    for (const [type, color] of x.shadowColors) {
      const other = y.shadowColors.get(type);
      if (other === undefined || other.toArgb() !== color.toArgb()) return false;
    }
    return true;
  }
}
