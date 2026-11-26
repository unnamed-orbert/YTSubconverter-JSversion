// Port of Formats/Ass/KaraokeTypes/*.cs and the type selection of AssKaraokeTypeTagHandler.cs.
//
// apply(context) receives the AssKaraokeStepContext:
// { document, originalLine, activeSectionsPerStep (SortedNumberMap offset -> active section count),
//   stepLine, stepIndex, numActiveSections, singingSections }
// and returns an iterable of lines.

import { GlitchingCharAnimation, ForeColorAnimation, ShadowColorAnimation } from '../../animations/animations.js';
import { RubyPart, ShadowType } from '../../enums.js';
import { Color } from '../../util/color.js';
import { CharacterRange } from '../../util/misc.js';
import { toInt, tryParseInt } from '../../util/numbers.js';
import { TIME_BASE, addMs, frameToEndTime, minTime, roundTimeToFrameCenter, startTimeToFrame } from '../../util/time.js';
import { AssLine, getRequired } from './assModel.js';

const INT_MAX = 2147483647;

function removeAnimations(section, predicate) {
  section.animations = section.animations.filter((a) => !predicate(a));
}

export class SimpleKaraokeType {
  apply(context) {
    for (const singingSection of context.singingSections) {
      if (!singingSection.currentWordForeColor.isEmpty) {
        singingSection.foreColor = singingSection.currentWordForeColor;
        removeAnimations(singingSection, (a) => a instanceof ForeColorAnimation);
      }

      if (!singingSection.currentWordShadowColor.isEmpty) {
        for (const shadowType of [...singingSection.shadowColors.keys()]) {
          singingSection.shadowColors.set(shadowType, singingSection.currentWordShadowColor);
          removeAnimations(singingSection, (a) => a instanceof ShadowColorAnimation && a.shadowType === shadowType);
        }
      }

      if (!singingSection.currentWordOutlineColor.isEmpty && singingSection.shadowColors.has(ShadowType.Glow)) {
        singingSection.shadowColors.set(ShadowType.Glow, singingSection.currentWordOutlineColor);
        removeAnimations(singingSection, (a) => a instanceof ShadowColorAnimation && a.shadowType === ShadowType.Glow);
      }
    }
    return [context.stepLine];
  }
}

SimpleKaraokeType.instance = new SimpleKaraokeType();
AssLine.defaultKaraokeType = SimpleKaraokeType.instance;

export class FadeKaraokeType {
  apply(context) {
    applyFadeInKaraokeEffect(context.stepLine, context.singingSections);
    applyFadeOutKaraokeEffect(context.originalLine, context.stepLine, context.activeSectionsPerStep, context.stepIndex);
    return [context.stepLine];
  }
}

/** Dictionary.GetOrDefault: default(Color) is Color.Empty */
function getOrEmpty(map, key) {
  return map.has(key) ? map.get(key) : Color.Empty;
}

function applyFadeInKaraokeEffect(stepLine, singingSections) {
  const fadeEndTime = minTime(addMs(stepLine.start, 500), stepLine.end);
  for (const s of singingSections) {
    if (s.currentWordForeColor.isEmpty) {
      if (!s.foreColor.equals(s.secondaryColor))
        s.animations.push(new ForeColorAnimation(stepLine.start, s.secondaryColor, fadeEndTime, s.foreColor, 1));
    } else if (!s.currentWordForeColor.equals(s.secondaryColor)) {
      s.animations.push(new ForeColorAnimation(stepLine.start, s.secondaryColor, fadeEndTime, s.currentWordForeColor, 1));
    }

    if (!s.currentWordShadowColor.isEmpty) {
      for (const [shadowType, color] of s.shadowColors) {
        if (!s.currentWordShadowColor.equals(color))
          s.animations.push(new ShadowColorAnimation(shadowType, stepLine.start, color, fadeEndTime, s.currentWordShadowColor, 1));
      }
    }

    if (!s.currentWordOutlineColor.isEmpty && !s.currentWordOutlineColor.equals(getOrEmpty(s.shadowColors, ShadowType.Glow))) {
      s.animations.push(new ShadowColorAnimation(
        ShadowType.Glow, stepLine.start, getRequired(s.shadowColors, ShadowType.Glow), fadeEndTime, s.currentWordOutlineColor, 1));
    }
  }
}

function applyFadeOutKaraokeEffect(originalLine, stepLine, activeSectionsPerStep, stepIdx) {
  let stepFirstSectionIdx = 0;
  for (let prevStepIdx = 0; prevStepIdx < stepIdx; prevStepIdx++) {
    const fadeStartTime = originalLine.start + activeSectionsPerStep.keys[prevStepIdx + 1];
    const fadeEndTime = addMs(fadeStartTime, 1000);

    const stepLastSectionIdx = activeSectionsPerStep.values[prevStepIdx] - 1;
    for (let sectionIdx = stepFirstSectionIdx; sectionIdx <= stepLastSectionIdx; sectionIdx++) {
      const s = stepLine.sections[sectionIdx];
      if (!s.currentWordForeColor.isEmpty && !s.currentWordForeColor.equals(s.foreColor))
        s.animations.push(new ForeColorAnimation(fadeStartTime, s.currentWordForeColor, fadeEndTime, s.foreColor, 1));

      if (!s.currentWordShadowColor.isEmpty) {
        for (const [shadowType, color] of s.shadowColors) {
          if (!s.currentWordShadowColor.equals(color))
            s.animations.push(new ShadowColorAnimation(shadowType, fadeStartTime, s.currentWordShadowColor, fadeEndTime, color, 1));
        }
      }

      if (!s.currentWordOutlineColor.isEmpty && !s.currentWordOutlineColor.equals(getOrEmpty(s.shadowColors, ShadowType.Glow))) {
        s.animations.push(new ShadowColorAnimation(
          ShadowType.Glow, fadeStartTime, s.currentWordOutlineColor, fadeEndTime, getRequired(s.shadowColors, ShadowType.Glow), 1));
      }
    }

    stepFirstSectionIdx = stepLastSectionIdx + 1;
  }
}

const LANGUAGE_CHARACTER_RANGES = [
  [new CharacterRange('A', 'Z'), new CharacterRange('a', 'z')],
  [CharacterRange.IdeographRange, CharacterRange.IdeographExtensionRange, CharacterRange.IdeographCompatibilityRange],
  [CharacterRange.HiraganaRange],
  [CharacterRange.KatakanaRange],
  [CharacterRange.HangulRange],
];

const RANDOM_CHARACTER_RANGES = [new CharacterRange(0x2300, 0x231a), new CharacterRange(0x231c, 0x23e1)];

function getGlitchKaraokeCharacterRanges(c) {
  for (const ranges of LANGUAGE_CHARACTER_RANGES) {
    if (ranges.some((r) => r.contains(c))) return ranges;
  }
  return RANDOM_CHARACTER_RANGES;
}

export class GlitchKaraokeType extends SimpleKaraokeType {
  apply(context) {
    const candidates = context.singingSections.filter((s) => s.rubyPart === RubyPart.None || s.rubyPart === RubyPart.Base);
    const singingSection = candidates.length > 0 ? candidates[candidates.length - 1] : null;
    if (singingSection == null || singingSection.text.length === 0) return [context.stepLine];

    super.apply(context);
    const glitchEndTime = frameToEndTime(startTimeToFrame(context.stepLine.start) + 1);
    const charRanges = getGlitchKaraokeCharacterRanges(singingSection.text.charCodeAt(0));
    singingSection.animations.push(new GlitchingCharAnimation(context.stepLine.start, glitchEndTime, charRanges));
    return [context.stepLine];
  }
}

export class CursorKaraokeType extends SimpleKaraokeType {
  /**
   * @param {string[]} cursors cursor texts (may contain override tags)
   * @param {number} intervalMs
   * @param {boolean} beforeSinging
   */
  constructor(cursors, intervalMs, beforeSinging) {
    super();
    this._cursors = cursors;
    this._intervalMs = toInt(intervalMs);
    this._beforeSinging = beforeSinging;
  }

  *apply(context) {
    super.apply(context);

    const startCursorStepIdx = toInt(toInt(context.stepLine.start - context.originalLine.start) / this._intervalMs);
    const endCursorStepIdx = toInt(toInt(context.stepLine.end - context.originalLine.start) / this._intervalMs);
    for (let cursorStepIdx = startCursorStepIdx; cursorStepIdx <= endCursorStepIdx; cursorStepIdx++) {
      const cursorStepLine = context.stepLine.clone();
      if (cursorStepIdx > startCursorStepIdx)
        cursorStepLine.start = roundTimeToFrameCenter(addMs(context.originalLine.start, Math.imul(cursorStepIdx, this._intervalMs)));

      if (cursorStepIdx < endCursorStepIdx)
        cursorStepLine.end = roundTimeToFrameCenter(addMs(context.originalLine.start, Math.imul(cursorStepIdx + 1, this._intervalMs)));

      if (cursorStepLine.start === cursorStepLine.end) continue;

      const cursorSectionIdx = this._beforeSinging ? context.numActiveSections - context.singingSections.length : context.numActiveSections;
      const initialFormatting = cursorStepLine.sections[Math.max(cursorSectionIdx - 1, 0)];
      const cursorSections = this._generateCursor(
        context.document,
        initialFormatting,
        this._cursors[cursorStepIdx % this._cursors.length],
      );
      cursorStepLine.sections.splice(cursorSectionIdx, 0, ...cursorSections);
      yield cursorStepLine;
    }
  }

  _generateCursor(doc, initialFormatting, cursor) {
    const section = initialFormatting.clone();
    section.text = '';
    const line = new AssLine(TIME_BASE, TIME_BASE);
    // Like the C# code, the context has no style: cursor tags that need one (e.g. "\c" without a value) fail.
    const context = {
      document: doc,
      initialStyle: null,
      initialStyleOptions: null,
      style: null,
      styleOptions: null,
      line,
      section,
      postProcessors: [],
    };
    doc.createTagSections(line, cursor, context);
    return line.sections;
  }
}

const fadeKaraokeType = new FadeKaraokeType();
const glitchKaraokeType = new GlitchKaraokeType();

/**
 * \ytktCursor
 * \ytkt(Cursor,<cursor>)
 * \ytkt(Cursor,<formatting tags>,<cursor>)
 * \ytkt(Cursor,interval,<tags1>,<cursor1>,<tags2>,<cursor2>,...)
 */
function createCursorKaraokeType(args, beforeSinging) {
  let intervalMs;
  const cursors = [];
  if (args == null || args.length === 1) {
    intervalMs = 3600000;
    cursors.push('_');
  } else if (args.length === 2) {
    intervalMs = 3600000;
    cursors.push(args[1]);
  } else if (args.length === 3) {
    intervalMs = 3600000;
    cursors.push('{' + args[1] + '}' + args[2]);
  } else {
    intervalMs = tryParseInt(args[1]) ?? INT_MAX;
    for (let i = 2; i < args.length; i += 2) cursors.push('{' + args[i] + '}' + (i + 1 < args.length ? args[i + 1] : '_'));
  }
  return new CursorKaraokeType(cursors, intervalMs, beforeSinging);
}

/** AssKaraokeTypeTagHandler.GetKaraokeType */
export function createKaraokeType(typeName, args) {
  switch (typeName.toLowerCase()) {
    case 'fade': return fadeKaraokeType;
    case 'glitch': return glitchKaraokeType;
    case 'cursor': return createCursorKaraokeType(args, false);
    case 'lcursor': return createCursorKaraokeType(args, true);
    default: return SimpleKaraokeType.instance;
  }
}
