// Port of AssLine.cs, AssSection.cs, AssStyle.cs, AssStyleOptions.cs, AssStyleOptionsList.cs,
// AssDialogue.cs, AssDocumentItem.cs and AssFileSection.cs.

import { AnchorPoint, ShadowType } from '../../enums.js';
import { Line, Section } from '../../model.js';
import { Color, changeAlpha, colorFromHtml } from '../../util/color.js';
import { f32, toInt, tryParseFloatAny, tryParseInt } from '../../util/numbers.js';

// ---------------------------------------------------------------------------------------------
// Alignment <-> AnchorPoint (AssDocument.GetAnchorPoint / GetAlignment)

const ALIGNMENT_TO_ANCHOR = {
  1: AnchorPoint.BottomLeft,
  2: AnchorPoint.BottomCenter,
  3: AnchorPoint.BottomRight,
  4: AnchorPoint.MiddleLeft,
  5: AnchorPoint.Center,
  6: AnchorPoint.MiddleRight,
  7: AnchorPoint.TopLeft,
  8: AnchorPoint.TopCenter,
  9: AnchorPoint.TopRight,
};

export function getAnchorPoint(alignment) {
  const anchor = ALIGNMENT_TO_ANCHOR[alignment];
  if (anchor === undefined) throw new Error(`${alignment} is not a valid alignment`);
  return anchor;
}

export function getAlignment(anchorPoint) {
  for (const [alignment, anchor] of Object.entries(ALIGNMENT_TO_ANCHOR)) {
    if (anchor === anchorPoint) return Number(alignment);
  }
  throw new Error(`${anchorPoint} is not a valid anchor point`);
}

/** Dictionary indexer semantics: throws when the key is missing (KeyNotFoundException in C#). */
export function getRequired(map, key) {
  if (!map.has(key)) throw new Error(`The given key '${key}' was not present in the dictionary.`);
  return map.get(key);
}

// ---------------------------------------------------------------------------------------------
// AssSection / AssLine

export class AssSection extends Section {
  constructor(text = null) {
    super(text);
    this.secondaryColor = Color.Empty;
    this.blur = 0;
    this.currentWordForeColor = Color.Empty;
    this.currentWordOutlineColor = Color.Empty;
    this.currentWordShadowColor = Color.Empty;
    /** Karaoke duration (\k) in ms. */
    this.duration = 0;
    /** @type {import('../../animations/animations.js').Animation[]} */
    this.animations = [];
  }

  static from(other) {
    const section = new AssSection();
    section.assign(other);
    return section;
  }

  clone() {
    return AssSection.from(this);
  }

  assign(section) {
    super.assign(section);
    if (!(section instanceof AssSection)) return;
    this.secondaryColor = section.secondaryColor;
    this.blur = section.blur;
    this.currentWordForeColor = section.currentWordForeColor;
    this.currentWordOutlineColor = section.currentWordOutlineColor;
    this.currentWordShadowColor = section.currentWordShadowColor;
    this.duration = section.duration;
    this.animations = section.animations.map((a) => a.clone());
  }
}

export class AssLine extends Line {
  constructor(start = 0, end = 0, content) {
    super(start, end, content);
    this.layer = 0;
    this.alpha = 255;
    /** @type {import('../../animations/animations.js').Animation[]} */
    this.animations = [];
    /** Set by the .ass reader; defaults to SimpleKaraokeType.instance (see karaokeTypes.js). */
    this.karaokeType = AssLine.defaultKaraokeType;
  }

  /** AssLine(Line line, bool copySections): converts a generic line, deriving \k durations from start offsets. */
  static from(other, copySections = true) {
    const line = new AssLine();
    line.assign(other, copySections);
    if (other instanceof AssLine || line.sections.every((s) => s.startOffset === 0)) return line;

    for (let i = 0; i < line.sections.length - 1; i++)
      line.sections[i].duration = line.sections[i + 1].startOffset - line.sections[i].startOffset;

    const lastSection = line.sections[line.sections.length - 1];
    lastSection.duration = line.end - line.start - lastSection.startOffset;
    return line;
  }

  clone() {
    return AssLine.from(this);
  }

  assign(line, assignSections = true) {
    super.assign(line, assignSections);
    if (!(line instanceof AssLine)) return;
    this.layer = line.layer;
    this.alpha = line.alpha;
    this.animations = line.animations.map((a) => a.clone());
    this.karaokeType = line.karaokeType;
  }

  createSection(section) {
    return AssSection.from(section);
  }

  normalizeAlpha() {
    if (this.alpha === 255) return;

    const factor = f32(this.alpha / 255);
    for (const section of this.sections) {
      section.foreColor = multiplyColorAlpha(section.foreColor, factor);
      section.backColor = multiplyColorAlpha(section.backColor, factor);
      for (const [type, color] of [...section.shadowColors]) section.shadowColors.set(type, multiplyColorAlpha(color, factor));
    }
    this.alpha = 255;
  }
}

AssLine.defaultKaraokeType = null;

function multiplyColorAlpha(color, factor) {
  if (color.isEmpty) return color;
  return changeAlpha(color, toInt(f32(color.a * factor)));
}

// ---------------------------------------------------------------------------------------------
// File structure: AssDocumentSection / AssDocumentItem

export class AssDocumentSection {
  constructor() {
    /** @type {Map<string, number> | null} */
    this.format = null;
    /** @type {AssDocumentItem[]} */
    this.items = [];
  }

  setFormat(format) {
    this.format = new Map();
    format.forEach((field, i) => {
      if (this.format.has(field)) throw new Error(`An item with the same key has already been added: ${field}`);
      this.format.set(field, i);
    });
  }

  addItem(type, values) {
    this.items.push(new AssDocumentItem(this, type, values));
  }

  getItemString(type) {
    const item = this.items.find((i) => i.type === type);
    return item ? (item.values[0] ?? null) : null;
  }

  getItemInt(type, defaultValue = 0) {
    return tryParseInt(this.getItemString(type)) ?? defaultValue;
  }

  getItemFloat(type, defaultValue = 0) {
    return tryParseFloatAny(this.getItemString(type)) ?? defaultValue;
  }

  getItemBool(type, defaultValue = false) {
    return this.getItemInt(type, defaultValue ? 1 : 0) !== 0;
  }

  mapItems(type, selector) {
    return this.items.filter((i) => i.type === type).map(selector);
  }
}

export class AssDocumentItem {
  constructor(section, type, values) {
    this.section = section;
    this.type = type;
    this.values = values;
  }

  getString(field) {
    const format = this.section.format;
    if (format == null) throw new Error(`Section has no Format line (needed for field "${field}")`);
    if (!format.has(field)) throw new Error(`The given key '${field}' was not present in the dictionary.`);
    const index = format.get(field);
    if (index >= this.values.length) throw new Error(`Item "${this.type}" has no value for field "${field}"`);
    return this.values[index];
  }

  getInt(field, defaultValue = 0) {
    return tryParseInt(this.getString(field)) ?? defaultValue;
  }

  getFloat(field, defaultValue = 0) {
    return tryParseFloatAny(this.getString(field)) ?? defaultValue;
  }

  getBool(field, defaultValue = false) {
    return this.getInt(field, defaultValue ? 1 : 0) !== 0;
  }

  getColor(field) {
    const value = this.getString(field);
    if (value.length !== 10 || !value.startsWith('&H') || !/^[0-9a-fA-F]{8}$/.test(value.substring(2)))
      throw new Error(`${value} is not a valid color`);

    const abgr = parseInt(value.substring(2), 16) >>> 0;
    const a = 255 - (abgr >>> 24);
    const r = abgr & 255;
    const g = (abgr >>> 8) & 255;
    const b = (abgr >>> 16) & 255;
    return Color.fromArgb(a, r, g, b);
  }

  /** Returns the timestamp in ms. */
  getTimestamp(field) {
    const value = this.getString(field);
    const match = /^(\d+):(\d\d):(\d\d)\.(\d\d)$/.exec(value);
    if (!match) throw new Error(`${value} is not a valid timestamp`);

    const [hours, minutes, seconds, centiseconds] = match.slice(1).map(Number);
    if (minutes > 59 || seconds > 59) throw new Error(`${value} is not a valid timestamp`);
    return hours * 3600000 + minutes * 60000 + seconds * 1000 + centiseconds * 10;
  }

  toString() {
    return this.type;
  }
}

export class AssDialogue {
  /** @param {AssDocumentItem} item */
  constructor(item) {
    this.layer = item.getInt('Layer');
    this.start = item.getTimestamp('Start');
    this.end = item.getTimestamp('End');
    this.style = item.getString('Style');
    this.effect = item.getString('Effect');
    this.text = item.getString('Text');
  }

  toString() {
    return this.text;
  }
}

// ---------------------------------------------------------------------------------------------
// AssStyle

export class AssStyle {
  /** @param {AssDocumentItem} item */
  constructor(item) {
    this.name = item.getString('Name');
    this.font = item.getString('Fontname');
    this.lineHeight = item.getFloat('Fontsize');
    this.bold = item.getBool('Bold');
    this.italic = item.getBool('Italic');
    this.underline = item.getBool('Underline');
    this.primaryColor = item.getColor('PrimaryColour');
    this.secondaryColor = item.getColor('SecondaryColour');
    this.outlineColor = item.getColor('OutlineColour');
    this.outlineThickness = item.getFloat('Outline');
    this.outlineIsBox = item.getInt('BorderStyle') === 3;
    this.shadowColor = item.getColor('BackColour');
    this.shadowDistance = item.getFloat('Shadow');
    this.anchorPoint = getAnchorPoint(item.getInt('Alignment'));
  }

  get hasOutline() {
    return this.outlineThickness > 0;
  }

  get hasOutlineBox() {
    return this.hasOutline && this.outlineIsBox;
  }

  get hasShadow() {
    return this.shadowDistance > 0;
  }

  toString() {
    return this.name;
  }
}

// ---------------------------------------------------------------------------------------------
// AssStyleOptions (+ the StyleOptions.xml loader of AssStyleOptionsList)

const XML_SHADOW_TYPES = { None: 0, Glow: 1, HardShadow: 2, SoftShadow: 4, Bevel: 8 };

export class AssStyleOptions {
  /** @param {AssStyle} [style] */
  constructor(style) {
    this.name = null;
    /** @type {string[]} ShadowType values */
    this.shadowTypes = [];
    this.isKaraoke = false;
    this.currentWordTextColor = Color.Empty;
    this.currentWordOutlineColor = Color.Empty;
    this.currentWordShadowColor = Color.Empty;
    this.backgroundImagePath = null;

    if (style) {
      this.name = style.name;
      if (style.hasOutline && !style.hasOutlineBox) this.shadowTypes.push(ShadowType.Glow);
      if (style.hasShadow) this.shadowTypes.push(ShadowType.SoftShadow);
    }
  }

  /** The XmlSerializer bitmask setter: always adds the types in this fixed order. */
  set shadowTypesBitmask(value) {
    this.shadowTypes = [];
    if (value & XML_SHADOW_TYPES.Glow) this.shadowTypes.push(ShadowType.Glow);
    if (value & XML_SHADOW_TYPES.Bevel) this.shadowTypes.push(ShadowType.Bevel);
    if (value & XML_SHADOW_TYPES.SoftShadow) this.shadowTypes.push(ShadowType.SoftShadow);
    if (value & XML_SHADOW_TYPES.HardShadow) this.shadowTypes.push(ShadowType.HardShadow);
  }

  get shadowTypesBitmask() {
    let mask = 0;
    for (const type of this.shadowTypes) mask |= XML_SHADOW_TYPES[type];
    return mask;
  }

  setShadowTypeEnabled(type, enable) {
    if (enable) {
      if (!this.shadowTypes.includes(type)) this.shadowTypes.push(type);
    } else {
      this.shadowTypes = this.shadowTypes.filter((t) => t !== type);
    }
  }

  toString() {
    return this.name;
  }
}

function decodeXmlEntities(text) {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_, entity) => {
    switch (entity) {
      case 'amp': return '&';
      case 'lt': return '<';
      case 'gt': return '>';
      case 'quot': return '"';
      case 'apos': return "'";
      default:
        return String.fromCodePoint(entity[1] === 'x' ? parseInt(entity.substring(2), 16) : parseInt(entity.substring(1), 10));
    }
  });
}

function getXmlElement(xml, name) {
  const match = new RegExp(`<${name}(?:\\s[^>]*)?(?:/>|>([\\s\\S]*?)</${name}\\s*>)`).exec(xml);
  if (!match) return undefined;
  return decodeXmlEntities(match[1] ?? '');
}

/**
 * AssStyleOptionsList.LoadFromString: reads a StyleOptions.xml document.
 * Like the C# code, returns an empty list if the document can't be read.
 * @returns {AssStyleOptions[]}
 */
export function loadStyleOptionsFromString(xml) {
  try {
    const root = /<StyleOptions(?:\s[^>]*)?(?:\/>|>([\s\S]*)<\/StyleOptions\s*>)/.exec(xml);
    if (!root) return [];

    const list = [];
    for (const match of (root[1] ?? '').matchAll(/<Style(?:\s[^>]*)?(?:\/>|>([\s\S]*?)<\/Style\s*>)/g)) {
      const body = match[1] ?? '';
      const options = new AssStyleOptions();
      options.name = getXmlElement(body, 'Name') ?? null;

      const shadowType = getXmlElement(body, 'ShadowType');
      if (shadowType !== undefined) {
        let mask = 0;
        for (const flag of shadowType.trim().split(/\s+/).filter((f) => f.length > 0)) {
          if (!(flag in XML_SHADOW_TYPES)) throw new Error(`Invalid shadow type ${flag}`);
          mask |= XML_SHADOW_TYPES[flag];
        }
        options.shadowTypesBitmask = mask;
      }

      const isKaraoke = getXmlElement(body, 'IsKaraoke');
      if (isKaraoke !== undefined) {
        const value = isKaraoke.trim();
        if (value !== 'true' && value !== 'false' && value !== '1' && value !== '0') throw new Error(`Invalid boolean ${value}`);
        options.isKaraoke = value === 'true' || value === '1';
      }

      for (const [element, prop] of [
        ['CurrentWordTextColor', 'currentWordTextColor'],
        ['CurrentWordOutlineColor', 'currentWordOutlineColor'],
        ['CurrentWordShadowColor', 'currentWordShadowColor'],
      ]) {
        const value = getXmlElement(body, element);
        if (value !== undefined) options[prop] = colorFromHtml(value);
      }

      const backgroundImagePath = getXmlElement(body, 'BackgroundImagePath');
      if (backgroundImagePath !== undefined) options.backgroundImagePath = backgroundImagePath;

      list.push(options);
    }
    return list;
  } catch {
    return [];
  }
}
