// Port of the reading part of Formats/Ass/AssDocument.cs.
// The writing part (AssDocument(SubtitleDocument) and Save()) is in assWriter.js.

import { ForeColorAnimation, KaraokeColorAnimation, SecondaryColorAnimation } from '../../animations/animations.js';
import { expandAnimations } from '../../animations/animator.js';
import { LineMergeType, RubyPart, ShadowType } from '../../enums.js';
import { Color } from '../../util/color.js';
import { decodeText, readLines, SortedNumberMap, splitMax } from '../../util/misc.js';
import { f32 } from '../../util/numbers.js';
import { minTime, roundTimeToFrameCenter } from '../../util/time.js';
import { SubtitleDocument } from '../subtitleDocument.js';
import { AssDialogue, AssDocumentSection, AssLine, AssSection, AssStyle, AssStyleOptions, loadStyleOptionsFromString } from './assModel.js';
import { createAssDocumentFrom, saveAssDocument } from './assWriter.js';
import { DEFAULT_STYLE_OPTIONS_XML } from './defaultStyleOptions.js';
import { DEFAULT_STYLES_ASS } from './defaultStyles.js';
import { colorTransforms, SimpleKaraokeType } from './karaokeTypes.js';
import { createTagHandlers } from './tags.js';

/**
 * Extensão do port: sem StyleOptions para o estilo, um nome no padrão dos estilos do .ass recuperado de um .ytt
 * (YTGlowSoftShadow, YTGlowBevelBox 2...) diz os tipos de sombra. O original usaria só a sombra suave.
 */
const inferredOptions = new Map();
function inferStyleOptions(name) {
  const match = /^YT(Plain|(?:Glow|SoftShadow|HardShadow|Bevel)+)(?:Box)?(?: \d+)?$/.exec(name ?? '');
  if (!match) return null;
  if (!inferredOptions.has(name)) {
    const options = new AssStyleOptions();
    options.name = name;
    options.shadowTypes = match[1] === 'Plain' ? [] : match[1].match(/Glow|SoftShadow|HardShadow|Bevel/g);
    inferredOptions.set(name, options);
  }
  return inferredOptions.get(name);
}

const EFFECT_NO_ANDROID_DARK_TEXT_HACK = 'no_android_dark_text_hack';
const ZERO_WIDTH_SPACE = '​';

// .NET \w: letters, combining marks, decimal digits and connector punctuation
const ITEM_LINE_RE = /^([\p{L}\p{Mn}\p{Nd}\p{Pc} ]+):\s*(.+)$/u;
// Extensão do port: \\K (maiúsculo, igual a \\kf) também é lido; o C# só via minúsculas e o ignorava.
const TAG_RE = /\\(?<tag>fn|r|K|\d?[a-z]+)\s*(?<arg>\([^()]*(?:\)|$)|[^\\()]*)/g;

export class AssDocument extends SubtitleDocument {
  /**
   * @param {string | Uint8Array | ArrayBuffer} content contents of the .ass file
   * @param {import('./assModel.js').AssStyleOptions[] | null} [styleOptions]
   * @param {{tagHierarchy?: boolean}} [options] tagHierarchy: extensão do port (ver docs/hierarquia-de-tags.md):
   *   as transições de opacidade do karaokê (\\ytkt(Fade)) também valem para a sombra/contorno/caixa da sílaba.
   */
  constructor(content, styleOptions = null, { tagHierarchy = false } = {}) {
    super();
    this.tagHierarchy = tagHierarchy;
    this._tagHandlers = createTagHandlers();
    /** @type {Map<string, AssStyle>} */
    this._styles = new Map();
    /** @type {Map<string, import('./assModel.js').AssStyleOptions> | null} */
    this._styleOptions = null;
    /** @type {AssStyle} */
    this.defaultStyle = null;

    if (content != null) this._load(decodeText(content), styleOptions);
  }

  /** Parses the text of an .ass file. */
  static parse(text, styleOptions = null, options = {}) {
    return new AssDocument(text, styleOptions, options);
  }

  /**
   * AssDocument(SubtitleDocument doc): converts another document to .ass, using the built-in YT* styles.
   * @param {SubtitleDocument} doc
   */
  static fromSubtitleDocument(doc) {
    return createAssDocumentFrom(AssDocument, doc, DEFAULT_STYLES_ASS, loadStyleOptionsFromString(DEFAULT_STYLE_OPTIONS_XML));
  }

  /**
   * Serializes the document as .ass (AssDocument.Save).
   * @param {{bom?: boolean, newline?: string}} [options] see saveAssDocument in assWriter.js
   */
  save(options) {
    return saveAssDocument(this, options);
  }

  _load(text, styleOptions) {
    const fileSections = readDocument(text);

    const infoSection = getFileSection(fileSections, 'Script Info');
    this.videoDimensions = { width: infoSection.getItemInt('PlayResX', 384), height: infoSection.getItemInt('PlayResY', 288) };
    this.lineMergeType = infoSection.getItemString('Collisions') === 'Reverse' ? LineMergeType.MoveExisting : LineMergeType.MoveNew;

    for (const style of getFileSection(fileSections, 'V4+ Styles').mapItems('Style', (i) => new AssStyle(i)))
      this._styles.set(style.name, style);

    if (styleOptions != null) {
      this._styleOptions = new Map();
      for (const options of styleOptions) this._styleOptions.set(options.name, options);
    }

    if (this._styles.size === 0) throw new Error('Sequence contains no elements (the .ass file has no styles)');
    this.defaultStyle = this._styles.get('Default') ?? this._styles.values().next().value;

    for (const dialogue of getFileSection(fileSections, 'Events').mapItems('Dialogue', (i) => new AssDialogue(i))) {
      const style = this.getStyle(dialogue.style);
      if (!style) throw new Error(`Line "${dialogue.text}" refers to style "${dialogue.style}" which doesn't exist.`);
      const options = this.getStyleOptions(dialogue.style);

      for (const line of this._parseLine(dialogue, style, options)) {
        for (const expanded of this._expandLine(line)) this.lines.push(expanded);
      }
    }

    this._emulateKaraokeForSimultaneousLines();
    for (const line of this.lines) line.normalizeAlpha();
  }

  /** @returns {Iterable<AssStyle>} */
  get styles() {
    return this._styles.values();
  }

  getStyle(name) {
    return this._styles.get(name) ?? null;
  }

  /** @param {string | AssStyle} nameOrStyle */
  getStyleOptions(nameOrStyle) {
    const name = nameOrStyle instanceof AssStyle ? nameOrStyle.name : nameOrStyle;
    return this._styleOptions?.get(name) ?? inferStyleOptions(name);
  }

  _parseLine(dialogue, style, styleOptions) {
    const line = new AssLine(roundTimeToFrameCenter(dialogue.start), roundTimeToFrameCenter(dialogue.end));
    line.layer = dialogue.layer;
    line.anchorPoint = style.anchorPoint;

    if (dialogue.effect.split(';').includes(EFFECT_NO_ANDROID_DARK_TEXT_HACK)) line.androidDarkTextHackAllowed = false;

    const context = {
      document: this,
      initialStyle: style,
      initialStyleOptions: styleOptions,
      style,
      styleOptions,
      line,
      section: new AssSection(),
      /** @type {Array<() => AssLine[] | null>} */
      postProcessors: [],
    };

    this.applyStyle(context.section, style, styleOptions);
    this.createTagSections(line, dialogue.text, context);
    createRubySections(line);

    const lines = [line];
    for (const postProcessor of context.postProcessors) {
      const extraLines = postProcessor();
      if (extraLines != null) lines.push(...extraLines);
    }
    return lines;
  }

  /** Splits the dialogue text into sections, running the tag handlers on each {...} group. */
  createTagSections(line, text, context) {
    text = text.replace(/(?:\\N)+$/, '');
    const handledWholeLineTags = new Set();

    let start = 0;
    for (const tagGroupMatch of text.matchAll(/\{(.*?)\}/g)) {
      const end = tagGroupMatch.index;

      if (end > start || (context.section.duration > 0 && /\\(?:k[fo]?|K)\s*\d+/.test(tagGroupMatch[1]))) {
        context.section.text = end === start ? ZERO_WIDTH_SPACE : resolveEscapeSequences(text.substring(start, end));
        line.sections.push(context.section);

        context.section = context.section.clone();
        context.section.text = null;
        context.section.duration = 0;
      }

      for (const tagMatch of tagGroupMatch[1].matchAll(TAG_RE)) {
        const tag = tagMatch.groups.tag;
        const handler = this._tagHandlers.get(tag);
        if (!handler) continue;

        if (handler.affectsWholeLine) {
          if (handledWholeLineTags.has(tag)) continue;
          handledWholeLineTags.add(tag);
        }

        handler.handle(context, tagMatch.groups.arg.trim());
      }

      start = tagGroupMatch.index + tagGroupMatch[0].length;
    }

    if (start < text.length) {
      context.section.text = resolveEscapeSequences(text.substring(start));
      line.sections.push(context.section);
    }
  }

  /**
   * @param {AssSection} section
   * @param {AssStyle} style
   * @param {import('./assModel.js').AssStyleOptions | null} [options] defaults to the options of the style
   */
  applyStyle(section, style, options) {
    if (options === undefined) options = this.getStyleOptions(style.name);

    section.font = style.font;
    section.scale = f32(style.lineHeight / this.defaultStyle.lineHeight);
    section.bold = style.bold;
    section.italic = style.italic;
    section.underline = style.underline;
    section.foreColor = style.primaryColor;
    section.secondaryColor = style.secondaryColor;
    if (options?.isKaraoke ?? false) {
      section.currentWordForeColor = options.currentWordTextColor;
      section.currentWordOutlineColor = options.currentWordOutlineColor;
      section.currentWordShadowColor = options.currentWordShadowColor;
    } else {
      section.currentWordForeColor = Color.Empty;
      section.currentWordOutlineColor = Color.Empty;
      section.currentWordShadowColor = Color.Empty;
    }

    section.backColor = Color.Empty;
    section.shadowColors.clear();

    if (style.hasShadow) {
      for (const shadowType of options?.shadowTypes ?? [ShadowType.SoftShadow]) section.shadowColors.set(shadowType, style.shadowColor);
    }

    if (style.hasOutline) {
      if (style.outlineIsBox) section.backColor = style.outlineColor;
      else section.shadowColors.set(ShadowType.Glow, style.outlineColor);
    }

    section.blur = 0;
  }

  *_expandLine(line) {
    for (const karaokeLine of this._expandLineForKaraoke(line)) yield* expandAnimations(this, karaokeLine);
  }

  _expandLineForKaraoke(line) {
    if (line.sections.every((s) => s.duration === 0)) return [line];

    if (canUseNativeKaraoke(line)) {
      applyNativeKaraoke(line);
      return [line];
    }

    return this.createEmulatedKaraokeLines(line);
  }

  *createEmulatedKaraokeLines(line) {
    const activeSectionsPerStep = getKaraokeSteps(line);
    for (let stepIdx = 0; stepIdx < activeSectionsPerStep.count; stepIdx++) {
      for (const stepLine of this._createKaraokeStepLines(line, activeSectionsPerStep, stepIdx)) {
        // Remove empty sections that were added in createTagSections()
        stepLine.sections = stepLine.sections.filter((s) => s.text !== ZERO_WIDTH_SPACE);
        yield stepLine;
      }
    }
  }

  _createKaraokeStepLines(originalLine, activeSectionsPerStep, stepIdx) {
    const timeOffset = activeSectionsPerStep.keys[stepIdx];
    const numActiveSections = activeSectionsPerStep.values[stepIdx];

    const startTime = roundTimeToFrameCenter(originalLine.start + timeOffset);
    if (startTime >= originalLine.end) return [];

    let endTime;
    if (stepIdx < activeSectionsPerStep.count - 1) {
      endTime = roundTimeToFrameCenter(originalLine.start + activeSectionsPerStep.keys[stepIdx + 1]);
      if (endTime > originalLine.end) endTime = originalLine.end;
    } else {
      endTime = originalLine.end;
    }

    const stepLine = originalLine.clone();
    stepLine.start = startTime;
    stepLine.end = endTime;

    for (const section of stepLine.sections.slice(0, numActiveSections)) {
      section.duration = 0;
      section.startOffset = 0;
      section.animations = section.animations.filter((a) => !(a instanceof SecondaryColorAnimation));
    }

    // Extensão do port: \\kf/\\K enchem a sílaba ao longo da duração dela. O .ytt não tem o preenchimento da
    // esquerda para a direita, então a sílaba que está sendo cantada vai da cor do \\2c até a do \\1c durante a
    // duração dela (as sílabas com \\k trocam de cor de uma vez, como antes).
    const prevNumActiveSections = stepIdx > 0 ? activeSectionsPerStep.values[stepIdx - 1] : 0;
    for (const section of stepLine.sections.slice(prevNumActiveSections, numActiveSections)) {
      const original = originalLine.sections[stepLine.sections.indexOf(section)];
      if (original.karaokeTag !== 'kf' || original.duration <= 0 || section.foreColor.equals(section.secondaryColor)) continue;
      const fillEnd = minTime(roundTimeToFrameCenter(startTime + original.duration), endTime);
      if (fillEnd > startTime)
        section.animations.push(new KaraokeColorAnimation(startTime, section.secondaryColor, fillEnd, section.foreColor, 1, colorTransforms(section)));
    }

    for (const section of stepLine.sections.slice(numActiveSections)) {
      section.duration = 0;
      section.startOffset = 0;
      // \\ko: a sílaba ainda não cantada fica sem contorno
      if (section.karaokeTag === 'ko') section.shadowColors.delete(ShadowType.Glow);

      section.foreColor = section.secondaryColor;

      section.animations = section.animations.filter((a) => !(a instanceof ForeColorAnimation));
      for (const anim of section.animations.filter((a) => a instanceof SecondaryColorAnimation)) {
        section.animations.splice(section.animations.indexOf(anim), 1);
        section.animations.push(new ForeColorAnimation(anim.startTime, anim.startColor, anim.endTime, anim.endColor, anim.acceleration).withChannelOf(anim));
      }

      if (section.foreColor.a === 0 && !section.animations.some((a) => a instanceof ForeColorAnimation)) {
        section.foreColor = Color.fromArgbInt(0);
        section.backColor = Color.fromArgbInt(0);
        section.shadowColors.clear();
      }
    }

    return this._applyKaraokeType(originalLine, stepLine, activeSectionsPerStep, stepIdx);
  }

  _applyKaraokeType(originalLine, stepLine, activeSectionsPerStep, stepIdx) {
    const prevNumActiveSections = stepIdx > 0 ? activeSectionsPerStep.values[stepIdx - 1] : 0;
    const numActiveSections = activeSectionsPerStep.values[stepIdx];
    const singingSections = stepLine.sections.slice(prevNumActiveSections, numActiveSections);

    const context = {
      document: this,
      originalLine,
      activeSectionsPerStep,
      stepLine,
      stepIndex: stepIdx,
      numActiveSections,
      singingSections,
    };
    return stepLine.karaokeType.apply(context);
  }

  _emulateKaraokeForSimultaneousLines() {
    for (let i = 0; i < this.lines.length; i++) {
      const line = this.lines[i];
      if (line.position != null || !line.sections.some((s) => s.startOffset > 0)) continue;

      // Note: like the C# code, this also matches the line itself
      if (!this.lines.some((l) => l.start < line.end && l.end > line.start && l.position == null && l.anchorPoint === line.anchorPoint))
        continue;

      this.lines.splice(i, 1, ...this.createEmulatedKaraokeLines(line));
    }
  }
}

// ---------------------------------------------------------------------------------------------

/** AssDocument.ReadDocument: splits the file into [sections] with their Format and items. */
function readDocument(text) {
  const sections = new Map();
  let currentSection = null;

  for (const line of readLines(text)) {
    if (line.trim().length === 0 || line.startsWith(';')) continue;

    if (line.startsWith('[') && line.endsWith(']')) {
      const name = line.substring(1, line.length - 1);
      if (sections.has(name)) throw new Error(`An item with the same key has already been added: [${name}]`);
      currentSection = new AssDocumentSection();
      sections.set(name, currentSection);
      continue;
    }

    const match = ITEM_LINE_RE.exec(line);
    if (!match) throw new Error(`Unrecognized line in .ass: ${line}`);

    if (currentSection == null) throw new Error(`Line ${line} is not inside a section`);

    const type = match[1];
    const values = splitMax(match[2], ',', currentSection.format?.size);
    if (type === 'Format') {
      if (currentSection.format != null) throw new Error('Section has multiple Format items');
      currentSection.setFormat(values.map((v) => v.trim()));
    } else {
      currentSection.addItem(type, values.map(trimSpaces));
    }
  }

  return sections;
}

function getFileSection(sections, name) {
  const section = sections.get(name);
  if (!section) throw new Error(`The .ass file has no [${name}] section`);
  return section;
}

/** string.Trim(' ') */
function trimSpaces(s) {
  return s.replace(/^ +| +$/g, '');
}

function resolveEscapeSequences(text) {
  return text.replaceAll('\\h', ' ').replaceAll('\\n', ' ').replaceAll('\\N', '\r\n');
}

function createRubySections(line) {
  for (let sectionIdx = line.sections.length - 1; sectionIdx >= 0; sectionIdx--) {
    const section = line.sections[sectionIdx];
    if (section.rubyPart === RubyPart.None) continue;

    const matches = [...section.text.matchAll(/\[(?<text>.+?)\/(?<ruby>.+?)\]/g)];
    if (matches.length === 0) {
      section.rubyPart = RubyPart.None;
      continue;
    }

    line.sections.splice(sectionIdx, 1);

    let interStartPos = 0;
    const counter = { numSubSections: 0 };
    for (const match of matches) {
      if (match.index > interStartPos)
        insertRubySection(line, section, section.text.substring(interStartPos, match.index), RubyPart.None, sectionIdx, counter);

      insertRubySection(line, section, match.groups.text, RubyPart.Base, sectionIdx, counter);
      insertRubySection(line, section, '(', RubyPart.Parenthesis, sectionIdx, counter);
      insertRubySection(line, section, match.groups.ruby, section.rubyPart, sectionIdx, counter);
      insertRubySection(line, section, ')', RubyPart.Parenthesis, sectionIdx, counter);

      interStartPos = match.index + match[0].length;
    }

    if (interStartPos < section.text.length)
      insertRubySection(line, section, section.text.substring(interStartPos), RubyPart.None, sectionIdx, counter);

    line.sections[sectionIdx].duration = section.duration;
  }
}

function insertRubySection(line, format, text, rubyPart, sectionIndex, counter) {
  const section = format.clone();
  section.text = text;
  section.rubyPart = rubyPart;
  section.duration = 0;
  line.sections.splice(sectionIndex + counter.numSubSections, 0, section);
  counter.numSubSections++;
}

function canUseNativeKaraoke(line) {
  return (
    line.karaokeType.constructor === SimpleKaraokeType &&
    line.animations.length === 0 &&
    line.sections.every(
      (s) =>
        s.secondaryColor.a === 0 &&
        s.currentWordForeColor.isEmpty &&
        s.currentWordOutlineColor.isEmpty &&
        s.currentWordShadowColor.isEmpty &&
        s.animations.length === 0 &&
        s.karaokeTag === 'k' &&
        s.duration !== 0,
    )
  );
}

function applyNativeKaraoke(line) {
  let timeOffset = 0;
  for (const section of line.sections) {
    section.startOffset = timeOffset;
    timeOffset += section.duration;
  }
}

/** SortedList<TimeSpan, int>: karaoke step start offset -> number of sections that are active from then on. */
function getKaraokeSteps(line) {
  const activeSectionsPerStep = new SortedNumberMap();
  let timeOffset = 0;
  let numActiveSections = 0;
  for (const section of line.sections) {
    numActiveSections++;
    if (section.duration > 0) {
      activeSectionsPerStep.set(timeOffset, numActiveSections);
      timeOffset += section.duration;
    } else {
      const prevTimeOffset = activeSectionsPerStep.count > 0 ? activeSectionsPerStep.keys[activeSectionsPerStep.count - 1] : 0;
      activeSectionsPerStep.set(prevTimeOffset, numActiveSections);
    }
  }
  return activeSectionsPerStep;
}
