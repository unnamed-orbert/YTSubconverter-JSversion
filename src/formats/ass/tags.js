// Port of Formats/Ass/Tags/*.cs: the override tag handlers ({\b1}, {\pos(...)}, {\t(...)}, ...).
//
// A handler is { tag, affectsWholeLine, handle(context, arg) }. The context is the AssTagContext:
// { document, initialStyle, initialStyleOptions, style, styleOptions, line, section, postProcessors }.

import {
  BackColorAnimation,
  ColorAnimation,
  FadeAnimation,
  ForeColorAnimation,
  MoveAnimation,
  ScaleAnimation,
  SecondaryColorAnimation,
  ShadowColorAnimation,
  ShakeAnimation,
} from '../../animations/animations.js';
import { HorizontalTextDirection, OffsetType, RubyPart, ShadowType, VerticalTextType } from '../../enums.js';
import { Color, changeAlpha } from '../../util/color.js';
import { f32, toInt, tryParseFloat, tryParseHexInt, tryParseInt } from '../../util/numbers.js';
import { addMs, roundTimeToFrameCenter } from '../../util/time.js';
import { getAnchorPoint, getRequired } from './assModel.js';
import { createKaraokeType } from './karaokeTypes.js';

// ---------------------------------------------------------------------------------------------
// AssTagHandlerBase helpers

function stripParensAndSpaces(arg) {
  return arg.replaceAll('(', '').replaceAll(')', '').replaceAll(' ', '');
}

export function tryParseIntArg(arg) {
  return tryParseInt(stripParensAndSpaces(arg));
}

export function parseIntArg(arg) {
  return tryParseIntArg(arg) ?? 0;
}

export function tryParseFloatArg(arg) {
  return tryParseFloat(stripParensAndSpaces(arg));
}

export function parseHex(arg) {
  const cleaned = arg.replaceAll('&', '').replaceAll('H', '').replaceAll('(', '').replaceAll(')', '');
  return tryParseHexInt(cleaned) ?? 0;
}

/** Returns [] for an empty argument, null if the argument isn't parenthesized. */
export function parseStringList(arg) {
  if (arg == null || arg.trim().length === 0) return [];
  arg = arg.trim();
  if (!arg.startsWith('(')) return null;
  return arg
    .replaceAll('(', '')
    .replaceAll(')', '')
    .split(',')
    .map((i) => i.trim());
}

export function parseFloatList(arg) {
  const items = parseStringList(arg);
  if (items == null) return null;
  return items.map((item) => tryParseFloat(item.replaceAll(' ', '')) ?? 0);
}

export function parseColor(arg, alpha) {
  const bgr = parseHex(arg);
  const r = bgr & 255;
  const g = (bgr >> 8) & 255;
  const b = (bgr >> 16) & 255;
  return Color.fromArgb(alpha, r, g, b);
}

/** Alpha value of a \alpha / \1a ... argument (the .ass value is inverted). */
function parseAlpha(arg) {
  return 255 - (parseHex(arg) & 255);
}

function removeAnimations(section, predicate) {
  section.animations = section.animations.filter((a) => !predicate(a));
}

const isEmptyArg = (arg) => arg == null || arg.length === 0;

// ---------------------------------------------------------------------------------------------
// Simple formatting tags

function boolTag(tag, prop) {
  return {
    tag,
    affectsWholeLine: false,
    handle(context, arg) {
      if (isEmptyArg(arg)) {
        context.section[prop] = context.initialStyle[prop];
        return;
      }
      const value = tryParseIntArg(arg);
      if (value === null) context.section[prop] = false;
      else if (value === 0) context.section[prop] = false;
      else if (value === 1) context.section[prop] = true;
      else context.section[prop] = context.initialStyle[prop];
    },
  };
}

const alignmentTag = {
  tag: 'an',
  affectsWholeLine: true,
  handle(context, arg) {
    const alignment = parseIntArg(arg);
    if (alignment >= 1 && alignment <= 9) context.line.anchorPoint = getAnchorPoint(alignment);
  },
};

const fontTag = {
  tag: 'fn',
  affectsWholeLine: false,
  handle(context, arg) {
    context.section.font = !isEmptyArg(arg) ? arg : context.style.font;
  },
};

const fontSizeTag = {
  tag: 'fs',
  affectsWholeLine: false,
  handle(context, arg) {
    const lineHeight = tryParseFloatArg(arg) ?? context.style.lineHeight;
    context.section.scale = f32(lineHeight / context.document.defaultStyle.lineHeight);
    removeAnimations(context.section, (a) => a instanceof ScaleAnimation);
  },
};

function offsetTag(tag, offset) {
  return {
    tag,
    affectsWholeLine: false,
    handle(context) {
      context.section.offset = offset;
    },
  };
}

const packTag = {
  tag: 'ytpack',
  affectsWholeLine: false,
  handle(context, arg) {
    context.section.packed = arg !== '0';
  },
};

const rubyTag = {
  tag: 'ytruby',
  affectsWholeLine: false,
  handle(context, arg) {
    const rubyPos = tryParseInt(arg) ?? 0;
    context.section.rubyPart = rubyPos === 2 ? RubyPart.TextAfter : RubyPart.TextBefore;
  },
};

export function getHorizontalTextDirection(directionId) {
  return directionId === 4 ? HorizontalTextDirection.RightToLeft : HorizontalTextDirection.LeftToRight;
}

export function getHorizontalTextDirectionId(direction) {
  return direction === HorizontalTextDirection.RightToLeft ? 4 : 6;
}

const horizontalTextDirectionTag = {
  tag: 'ytdir',
  affectsWholeLine: true,
  handle(context, arg) {
    const direction = tryParseInt(arg) ?? 6;
    context.line.horizontalTextDirection = getHorizontalTextDirection(direction);
  },
};

export function getVerticalTextType(id) {
  switch (id) {
    case 9: return [HorizontalTextDirection.RightToLeft, VerticalTextType.Positioned];
    case 7: return [HorizontalTextDirection.LeftToRight, VerticalTextType.Positioned];
    case 1: return [HorizontalTextDirection.LeftToRight, VerticalTextType.Rotated];
    case 3: return [HorizontalTextDirection.RightToLeft, VerticalTextType.Rotated];
    default: return [HorizontalTextDirection.LeftToRight, VerticalTextType.None];
  }
}

export function getVerticalTextTypeId(hor, ver) {
  if (hor === HorizontalTextDirection.LeftToRight)
    return ver === VerticalTextType.Positioned ? 7 : ver === VerticalTextType.Rotated ? 1 : 0;
  return ver === VerticalTextType.Positioned ? 9 : ver === VerticalTextType.Rotated ? 3 : 0;
}

const verticalTypeTag = {
  tag: 'ytvert',
  affectsWholeLine: true,
  handle(context, arg) {
    const vertType = tryParseInt(arg) ?? 9;
    [context.line.horizontalTextDirection, context.line.verticalTextType] = getVerticalTextType(vertType);
  },
};

const resetTag = {
  tag: 'r',
  affectsWholeLine: false,
  handle(context, arg) {
    context.style = context.document.getStyle(arg) ?? context.initialStyle;
    context.styleOptions = context.document.getStyleOptions(arg) ?? context.initialStyleOptions;
    context.document.applyStyle(context.section, context.style, context.styleOptions);
    context.section.offset = OffsetType.Regular;
    context.section.rubyPart = RubyPart.None;
    context.section.animations = [];
  },
};

// ---------------------------------------------------------------------------------------------
// Colors and alpha

function foreColorTag(tag) {
  return {
    tag,
    affectsWholeLine: false,
    handle(context, arg) {
      context.section.foreColor = !isEmptyArg(arg) ? parseColor(arg, context.section.foreColor.a) : context.style.primaryColor;
      removeAnimations(context.section, (a) => a instanceof ForeColorAnimation);
    },
  };
}

const secondaryColorTag = {
  tag: '2c',
  affectsWholeLine: false,
  handle(context, arg) {
    context.section.secondaryColor = !isEmptyArg(arg)
      ? parseColor(arg, context.section.secondaryColor.a)
      : context.style.secondaryColor;
    removeAnimations(context.section, (a) => a instanceof SecondaryColorAnimation);
  },
};

const outlineColorTag = {
  tag: '3c',
  affectsWholeLine: false,
  handle(context, arg) {
    if (!context.style.hasOutline) return;

    const section = context.section;
    if (context.style.outlineIsBox) {
      section.backColor = !isEmptyArg(arg) ? parseColor(arg, section.backColor.a) : context.style.outlineColor;
      removeAnimations(section, (a) => a instanceof BackColorAnimation);
    } else {
      section.shadowColors.set(
        ShadowType.Glow,
        !isEmptyArg(arg) ? parseColor(arg, getRequired(section.shadowColors, ShadowType.Glow).a) : context.style.outlineColor,
      );
      removeAnimations(section, (a) => a instanceof ShadowColorAnimation);
    }
  },
};

const shadowColorTag = {
  tag: '4c',
  affectsWholeLine: false,
  handle(context, arg) {
    if (!context.style.hasShadow) return;

    const section = context.section;
    for (const [type, color] of [...section.shadowColors]) {
      if (type !== ShadowType.Glow || !context.style.hasOutline || context.style.hasOutlineBox)
        section.shadowColors.set(type, !isEmptyArg(arg) ? parseColor(arg, color.a) : context.style.shadowColor);
    }
    removeAnimations(section, (a) => a instanceof ShadowColorAnimation);
  },
};

const alphaTag = {
  tag: 'alpha',
  affectsWholeLine: false,
  handle(context, arg) {
    const alpha = parseAlpha(arg);
    const section = context.section;
    section.foreColor = changeAlpha(section.foreColor, alpha);
    section.secondaryColor = changeAlpha(section.secondaryColor, alpha);
    if (context.style.hasOutlineBox) section.backColor = changeAlpha(section.backColor, alpha);

    for (const type of [...section.shadowColors.keys()])
      section.shadowColors.set(type, changeAlpha(section.shadowColors.get(type), alpha));

    removeAnimations(section, (a) => a instanceof ColorAnimation);
  },
};

const foreAlphaTag = {
  tag: '1a',
  affectsWholeLine: false,
  handle(context, arg) {
    const alpha = !isEmptyArg(arg) ? parseAlpha(arg) : context.style.primaryColor.a;
    context.section.foreColor = changeAlpha(context.section.foreColor, alpha);
    removeAnimations(context.section, (a) => a instanceof ForeColorAnimation);
  },
};

const secondaryAlphaTag = {
  tag: '2a',
  affectsWholeLine: false,
  handle(context, arg) {
    const alpha = !isEmptyArg(arg) ? parseAlpha(arg) : context.style.secondaryColor.a;
    context.section.secondaryColor = changeAlpha(context.section.secondaryColor, alpha);
    removeAnimations(context.section, (a) => a instanceof SecondaryColorAnimation);
  },
};

const outlineAlphaTag = {
  tag: '3a',
  affectsWholeLine: false,
  handle(context, arg) {
    if (!context.style.hasOutline) return;

    const alpha = !isEmptyArg(arg) ? parseAlpha(arg) : context.style.outlineColor.a;
    const section = context.section;
    if (context.style.outlineIsBox) {
      section.backColor = changeAlpha(section.backColor, alpha);
      removeAnimations(section, (a) => a instanceof BackColorAnimation);
    } else {
      section.shadowColors.set(ShadowType.Glow, changeAlpha(getRequired(section.shadowColors, ShadowType.Glow), alpha));
      removeAnimations(section, (a) => a instanceof ShadowColorAnimation);
    }
  },
};

const shadowAlphaTag = {
  tag: '4a',
  affectsWholeLine: false,
  handle(context, arg) {
    if (!context.style.hasShadow) return;

    const alpha = !isEmptyArg(arg) ? parseAlpha(arg) : context.style.shadowColor.a;
    const section = context.section;
    for (const [type, color] of [...section.shadowColors]) {
      if (type !== ShadowType.Glow || !context.style.hasOutline || context.style.hasOutlineBox)
        section.shadowColors.set(type, changeAlpha(color, alpha));
    }
    removeAnimations(section, (a) => a instanceof ShadowColorAnimation);
  },
};

// ---------------------------------------------------------------------------------------------
// Position, movement and fades

const positionTag = {
  tag: 'pos',
  affectsWholeLine: true,
  handle(context, arg) {
    const coords = parseFloatList(arg);
    if (coords == null || coords.length !== 2 || context.line.position != null) return;
    context.line.position = { x: coords[0], y: coords[1] };
  },
};

const moveTag = {
  tag: 'move',
  affectsWholeLine: true,
  handle(context, arg) {
    const args = parseFloatList(arg);
    if (args == null || args.length < 4) return;

    const line = context.line;
    const startPos = { x: args[0], y: args[1] };
    const endPos = { x: args[2], y: args[3] };
    let startTime = line.start;
    let endTime = line.end;
    if (args.length >= 6) {
      startTime = addMs(line.start, args[4]);
      endTime = addMs(line.start, args[5]);
    }

    if (endTime > startTime) line.animations.push(new MoveAnimation(startTime, startPos, endTime, endPos));
  },
};

const simpleFadeTag = {
  tag: 'fad',
  affectsWholeLine: true,
  handle(context, arg) {
    const times = parseFloatList(arg);
    if (times == null || times.length !== 2) return;

    const line = context.line;
    const fadeInStartTime = line.start;
    const fadeInEndTime = addMs(line.start, times[0]);
    const fadeOutStartTime = addMs(line.end, -times[1]);
    const fadeOutEndTime = line.end;

    if (fadeInEndTime > fadeInStartTime) line.animations.push(new FadeAnimation(fadeInStartTime, 0, fadeInEndTime, 255));
    if (fadeOutEndTime > fadeOutStartTime) line.animations.push(new FadeAnimation(fadeOutStartTime, 255, fadeOutEndTime, 0));
  },
};

const complexFadeTag = {
  tag: 'fade',
  affectsWholeLine: true,
  handle(context, arg) {
    const args = parseFloatList(arg);
    // Extensão do port: \\fade(entrada,saída) com 2 valores é um sinônimo de \\fad no libass/VSFilter (o Aegisub
    // mostra o fade); no C# ele era ignorado e a linha ficava sem fade.
    if (args != null && args.length === 2) {
      simpleFadeTag.handle(context, arg);
      return;
    }
    if (args == null || args.length !== 7) return;

    const line = context.line;
    const initialAlpha = 255 - toInt(args[0]);
    const midAlpha = 255 - toInt(args[1]);
    const finalAlpha = 255 - toInt(args[2]);
    const fadeInStartTime = addMs(line.start, args[3]);
    const fadeInEndTime = addMs(line.start, args[4]);
    const fadeOutStartTime = addMs(line.start, args[5]);
    const fadeOutEndTime = addMs(line.start, args[6]);

    if (fadeInEndTime > fadeInStartTime) line.animations.push(new FadeAnimation(fadeInStartTime, initialAlpha, fadeInEndTime, midAlpha));
    if (fadeOutEndTime > fadeOutStartTime) line.animations.push(new FadeAnimation(fadeOutStartTime, midAlpha, fadeOutEndTime, finalAlpha));
  },
};

// ---------------------------------------------------------------------------------------------
// Karaoke

const karaokeTag = {
  tag: 'k',
  affectsWholeLine: false,
  handle(context, arg) {
    const centiSeconds = tryParseInt(arg) ?? 0;
    context.section.duration = centiSeconds * 10;
  },
};

const karaokeTypeTag = {
  tag: 'ytkt',
  affectsWholeLine: true,
  handle(context, arg) {
    const args = parseStringList(arg);
    const typeName = args != null && args.length > 0 ? args[0] : arg;
    context.line.karaokeType = createKaraokeType(typeName, args);
  },
};

// ---------------------------------------------------------------------------------------------
// \ytshake, \ytshake(radius), \ytshake(radiusX, radiusY), \ytshake(radius, t1, t2), \ytshake(radiusX, radiusY, t1, t2)

const shakeTag = {
  tag: 'ytshake',
  affectsWholeLine: true,
  handle(context, arg) {
    const parsed = parseShakeArgs(context, arg);
    if (!parsed) return;

    context.postProcessors.push(() => {
      context.line.animations.push(new ShakeAnimation(parsed.startTime, parsed.endTime, parsed.radius));
      return null;
    });
  },
};

function parseShakeArgs(context, arg) {
  const defaultRadius = 20;
  let radius = { width: defaultRadius, height: defaultRadius };
  let startTime = context.line.start;
  let endTime = context.line.end;
  if (arg == null || arg.trim().length === 0) return { radius, startTime, endTime };

  const args = parseFloatList(arg);
  if (args == null) return null;

  switch (args.length) {
    case 0:
      break;
    case 1:
      radius = { width: args[0], height: args[0] };
      break;
    case 2:
      radius = { width: args[0], height: args[1] };
      break;
    case 3:
      radius = { width: args[0], height: args[0] };
      startTime = addMs(context.line.start, args[1]);
      endTime = addMs(context.line.start, args[2]);
      break;
    case 4:
      radius = { width: args[0], height: args[1] };
      startTime = addMs(context.line.start, args[2]);
      endTime = addMs(context.line.start, args[3]);
      break;
    default:
      return null;
  }
  return { radius, startTime, endTime };
}

// ---------------------------------------------------------------------------------------------
// \ytchroma(intime, outtime), \ytchroma(offsetX, offsetY, intime, outtime),
// \ytchroma(color1, color2..., alpha, offsetX, offsetY, intime, outtime)

const chromaTag = {
  tag: 'ytchroma',
  affectsWholeLine: true,
  handle(context, arg) {
    const parsed = parseChromaArgs(arg);
    if (!parsed) return;
    const { colors, alpha, maxOffsetX, maxOffsetY, chromaInMs, chromaOutMs } = parsed;

    context.postProcessors.push(() => {
      const originalLine = context.line;
      const center = originalLine.position ?? context.document.getDefaultPosition(originalLine.anchorPoint);
      const chromaLines = [];

      if (colors.length === 0) {
        const baseColor = context.line.sections.length > 0 ? context.line.sections[0].foreColor : Color.White;
        colors.push(Color.fromArgb(toInt(f32((baseColor.r * alpha) / 255)), 255, 0, 0));
        colors.push(Color.fromArgb(toInt(f32((baseColor.g * alpha) / 255)), 0, 255, 0));
        colors.push(Color.fromArgb(toInt(f32((baseColor.b * alpha) / 255)), 0, 0, 255));
      }

      if (chromaInMs > 0) {
        chromaLines.push(...createChromaLines(originalLine, colors, center, maxOffsetX, maxOffsetY, chromaInMs, true));
        const start = roundTimeToFrameCenter(addMs(originalLine.start, chromaInMs));
        delayKaraokeStart(originalLine, start - originalLine.start);
        originalLine.start = start;
      }

      if (chromaOutMs > 0) {
        chromaLines.push(...createChromaLines(originalLine, colors, center, maxOffsetX, maxOffsetY, chromaOutMs, false));
        originalLine.end = roundTimeToFrameCenter(addMs(originalLine.end, -chromaOutMs));
      }

      return chromaLines;
    });
  },
};

function parseChromaArgs(arg) {
  const colors = [];
  let alpha = 128;
  let maxOffsetX = 20;
  let maxOffsetY = 0;
  let chromaInMs = 270;
  let chromaOutMs = 270;

  const args = parseStringList(arg);
  if (args == null) return null;

  const n = args.length;
  if (n >= 5) alpha = parseHex(args[n - 5]) & 255;
  if (n >= 4 && (maxOffsetX = tryParseInt(args[n - 4])) === null) return null;
  if (n >= 3 && (maxOffsetY = tryParseInt(args[n - 3])) === null) return null;
  if (n >= 2 && (chromaInMs = tryParseInt(args[n - 2])) === null) return null;
  if (n >= 1 && (chromaOutMs = tryParseInt(args[n - 1])) === null) return null;

  alpha = 255 - alpha;
  for (let i = 0; i < n - 5; i++) colors.push(parseColor(args[i], alpha));

  return { colors, alpha, maxOffsetX, maxOffsetY, chromaInMs, chromaOutMs };
}

/**
 * Extension of the port (in C# the karaoke restarts): the karaoke timing (\\k) is relative to the line start, so
 * when \\ytchroma moves the start of the line (or of the copies that fly out at the end) forward, the syllables
 * already sung by then are made active from the new start, and the karaoke keeps going where it was.
 */
function delayKaraokeStart(line, ms) {
  let rest = ms;
  for (const section of line.sections) {
    if (rest <= 0) break;
    if (section.duration <= 0) continue;
    const used = Math.min(rest, section.duration);
    section.duration -= used;
    rest -= used;
  }
}

function* createChromaLines(originalLine, colors, center, maxOffsetX, maxOffsetY, durationMs, moveIn) {
  if (originalLine.sections.length === 0) return;

  for (let i = 0; i < colors.length; i++) {
    if (colors[i].a === 0) continue;

    const chromaLine = originalLine.clone();
    const tint = (c) => Color.fromArgb(toInt(f32(c.a * f32(colors[i].a / 255))), colors[i].r, colors[i].g, colors[i].b);
    for (const section of chromaLine.sections) {
      section.foreColor = tint(section.foreColor);
      section.backColor = Color.Empty;
      section.shadowColors.clear();
      // Extension of the port: in C# the karaoke (unsung text in \\2c, \\ytkt(Fade) going from \\2c to \\1c) and
      // \\t color animations paint the copies back in the line's own colors, which hides the chroma effect.
      // The copies keep the karaoke and the animations, but only their opacity: the color is the chroma color.
      if (!section.secondaryColor.isEmpty) section.secondaryColor = tint(section.secondaryColor);
      if (!section.currentWordForeColor.isEmpty) section.currentWordForeColor = tint(section.currentWordForeColor);
      section.currentWordOutlineColor = Color.Empty;
      section.currentWordShadowColor = Color.Empty;
      section.animations = section.animations
        .filter((a) => !(a instanceof ShadowColorAnimation) && !(a instanceof BackColorAnimation))
        .map((a) => {
          if (a instanceof ForeColorAnimation) return new ForeColorAnimation(a.startTime, tint(a.startColor), a.endTime, tint(a.endColor), a.acceleration);
          if (a instanceof SecondaryColorAnimation)
            return new SecondaryColorAnimation(a.startTime, tint(a.startColor), a.endTime, tint(a.endColor), a.acceleration);
          return a;
        });
    }

    const offsetFactor = colors.length > 1 ? f32(i / (colors.length - 1)) : f32(0.5);
    const offsetX = f32(f32(offsetFactor * (-maxOffsetX * 2)) + maxOffsetX);
    const offsetY = f32(f32(offsetFactor * (-maxOffsetY * 2)) + maxOffsetY);
    const farPosition = { x: f32(center.x + offsetX), y: f32(center.y + offsetY) };
    const nearPosition = { x: f32(center.x + f32(offsetX / 5)), y: f32(center.y + f32(offsetY / 5)) };

    if (moveIn) {
      chromaLine.end = roundTimeToFrameCenter(addMs(originalLine.start, durationMs));
      chromaLine.animations.push(new MoveAnimation(chromaLine.start, farPosition, chromaLine.end, nearPosition));
    } else {
      chromaLine.start = roundTimeToFrameCenter(addMs(originalLine.end, -durationMs));
      delayKaraokeStart(chromaLine, chromaLine.start - originalLine.start);
      chromaLine.animations.push(new MoveAnimation(chromaLine.start, nearPosition, chromaLine.end, farPosition));
    }

    yield chromaLine;
  }
}

// ---------------------------------------------------------------------------------------------
// \t(...)

const TRANSFORM_TAG_HANDLERS = {
  c: transformForeColor,
  '1c': transformForeColor,
  '2c': transformSecondaryColor,
  '3c': transformOutlineColor,
  '4c': transformShadowColors,
  alpha: transformAlpha,
  '1a': transformForeAlpha,
  '2a': transformSecondaryAlpha,
  '3a': transformOutlineAlpha,
  '4a': transformShadowAlphas,
  fs: transformFontSize,
};

const transformTag = {
  tag: 't',
  affectsWholeLine: false,
  handle(context, arg) {
    const parsed = parseTransformArgs(context, arg);
    if (!parsed) return;
    const { startTime, endTime, accel, modifiers } = parsed;

    context.line.androidDarkTextHackAllowed = false;
    for (const match of modifiers.matchAll(/\\(?<tag>\d?[a-z]+)(?<arg>[^\\]*)/g)) {
      const handler = Object.hasOwn(TRANSFORM_TAG_HANDLERS, match.groups.tag) ? TRANSFORM_TAG_HANDLERS[match.groups.tag] : null;
      if (handler) handler(context, startTime, endTime, accel, match.groups.arg.trim());
    }
  },
};

function parseTransformArgs(context, arg) {
  let startTime = context.line.start;
  let endTime = context.line.end;
  let accel = 1;

  const args = parseStringList(arg);
  if (args == null) return null;

  switch (args.length) {
    case 1:
      return { startTime, endTime, accel, modifiers: args[0] };
    case 2:
      if ((accel = tryParseFloatArg(args[0])) === null) return null;
      return { startTime, endTime, accel, modifiers: args[1] };
    case 3: {
      const t1 = tryParseIntArg(args[0]);
      const t2 = tryParseIntArg(args[1]);
      if (t1 === null || t2 === null) return null;
      return { startTime: addMs(context.line.start, t1), endTime: addMs(context.line.start, t2), accel, modifiers: args[2] };
    }
    case 4: {
      const t1 = tryParseIntArg(args[0]);
      const t2 = tryParseIntArg(args[1]);
      if (t1 === null || t2 === null || (accel = tryParseFloatArg(args[2])) === null) return null;
      return { startTime: addMs(context.line.start, t1), endTime: addMs(context.line.start, t2), accel, modifiers: args[3] };
    }
    default:
      return null;
  }
}

/**
 * FetchColorAnimation<T>: finds (or creates) the animation of type `AnimClass` with the given time range
 * that the transform should modify.
 */
function fetchColorAnimation(context, startTime, endTime, AnimClass, predicate, getSectionColor, createAnim) {
  const section = context.section;
  removeAnimations(section, (a) => a instanceof AnimClass && a.startTime > startTime);

  const ofType = () => section.animations.filter((a) => a instanceof AnimClass && (predicate == null || predicate(a)));
  let anim = ofType().find((a) => a.startTime === startTime && a.endTime === endTime);
  if (!anim) {
    const prevAnims = ofType();
    const prevAnim = prevAnims.length > 0 ? prevAnims[prevAnims.length - 1] : null;
    anim = createAnim(startTime, endTime, prevAnim ? prevAnim.endColor : getSectionColor(section));
    section.animations.push(anim);
  }
  return anim;
}

function fetchForeColorAnim(context, startTime, endTime, accel) {
  return fetchColorAnimation(context, startTime, endTime, ForeColorAnimation, null, (s) => s.foreColor,
    (s, e, c) => new ForeColorAnimation(s, c, e, c, accel));
}

function fetchSecondaryColorAnim(context, startTime, endTime, accel) {
  return fetchColorAnimation(context, startTime, endTime, SecondaryColorAnimation, null, (s) => s.secondaryColor,
    (s, e, c) => new SecondaryColorAnimation(s, c, e, c, accel));
}

function fetchBackColorAnim(context, startTime, endTime, accel) {
  return fetchColorAnimation(context, startTime, endTime, BackColorAnimation, null, (s) => s.backColor,
    (s, e, c) => new BackColorAnimation(s, c, e, c, accel));
}

function fetchShadowColorAnim(context, shadowType, startTime, endTime, accel) {
  return fetchColorAnimation(context, startTime, endTime, ShadowColorAnimation, (a) => a.shadowType === shadowType,
    (s) => getRequired(s.shadowColors, shadowType),
    (s, e, c) => new ShadowColorAnimation(shadowType, s, c, e, c, accel));
}

function transformForeColor(context, startTime, endTime, accel, arg) {
  const anim = fetchForeColorAnim(context, startTime, endTime, accel);
  anim.endColor = parseColor(arg, anim.endColor.a);
}

function transformSecondaryColor(context, startTime, endTime, accel, arg) {
  const anim = fetchSecondaryColorAnim(context, startTime, endTime, accel);
  anim.endColor = parseColor(arg, anim.endColor.a);
}

function transformOutlineColor(context, startTime, endTime, accel, arg) {
  if (!context.style.hasOutline) return;

  if (context.style.outlineIsBox) {
    const anim = fetchBackColorAnim(context, startTime, endTime, accel);
    anim.endColor = parseColor(arg, anim.endColor.a);
  } else {
    transformShadowColor(context, ShadowType.Glow, startTime, endTime, accel, arg);
  }
}

function transformShadowColors(context, startTime, endTime, accel, arg) {
  for (const shadowType of [...context.section.shadowColors.keys()]) {
    if (shadowType !== ShadowType.Glow || !context.style.hasOutline || context.style.hasOutlineBox)
      transformShadowColor(context, shadowType, startTime, endTime, accel, arg);
  }
}

function transformShadowColor(context, shadowType, startTime, endTime, accel, arg) {
  const anim = fetchShadowColorAnim(context, shadowType, startTime, endTime, accel);
  anim.endColor = parseColor(arg, anim.endColor.a);
}

function transformAlpha(context, startTime, endTime, accel, arg) {
  transformForeAlpha(context, startTime, endTime, accel, arg);
  transformSecondaryAlpha(context, startTime, endTime, accel, arg);
  transformOutlineAlpha(context, startTime, endTime, accel, arg);
  transformShadowAlphas(context, startTime, endTime, accel, arg);
}

function transformForeAlpha(context, startTime, endTime, accel, arg) {
  const anim = fetchForeColorAnim(context, startTime, endTime, accel);
  anim.endColor = changeAlpha(anim.endColor, parseAlpha(arg));
}

function transformSecondaryAlpha(context, startTime, endTime, accel, arg) {
  const anim = fetchSecondaryColorAnim(context, startTime, endTime, accel);
  anim.endColor = changeAlpha(anim.endColor, parseAlpha(arg));
}

function transformOutlineAlpha(context, startTime, endTime, accel, arg) {
  if (!context.style.hasOutline) return;

  if (context.style.outlineIsBox) {
    const anim = fetchBackColorAnim(context, startTime, endTime, accel);
    anim.endColor = changeAlpha(anim.endColor, parseAlpha(arg));
  } else {
    transformShadowAlpha(context, ShadowType.Glow, startTime, endTime, accel, arg);
  }
}

function transformShadowAlphas(context, startTime, endTime, accel, arg) {
  for (const shadowType of [...context.section.shadowColors.keys()]) {
    if (shadowType !== ShadowType.Glow || !context.style.hasOutline || context.style.hasOutlineBox)
      transformShadowAlpha(context, shadowType, startTime, endTime, accel, arg);
  }
}

function transformShadowAlpha(context, shadowType, startTime, endTime, accel, arg) {
  const anim = fetchShadowColorAnim(context, shadowType, startTime, endTime, accel);
  anim.endColor = changeAlpha(anim.endColor, parseAlpha(arg));
}

function transformFontSize(context, startTime, endTime, accel, arg) {
  const lineHeight = tryParseFloatArg(arg);
  if (lineHeight === null) return;

  const section = context.section;
  removeAnimations(section, (a) => a instanceof ScaleAnimation && a.startTime >= startTime);
  const scaleAnims = section.animations.filter((a) => a instanceof ScaleAnimation);
  const prevAnim = scaleAnims.length > 0 ? scaleAnims[scaleAnims.length - 1] : null;
  const startScale = prevAnim ? prevAnim.endScale : section.scale;
  const endScale = f32(lineHeight / context.document.defaultStyle.lineHeight);
  section.animations.push(new ScaleAnimation(startTime, startScale, endTime, endScale, accel));
}

// ---------------------------------------------------------------------------------------------

/** The handlers registered by AssDocument.RegisterTagHandlers(), keyed by tag name. */
export function createTagHandlers() {
  const handlers = [
    alignmentTag,
    alphaTag,
    boolTag('b', 'bold'),
    chromaTag,
    complexFadeTag,
    fontSizeTag,
    fontTag,
    foreAlphaTag,
    foreColorTag('c'),
    foreColorTag('1c'),
    horizontalTextDirectionTag,
    boolTag('i', 'italic'),
    karaokeTag,
    karaokeTypeTag,
    moveTag,
    outlineAlphaTag,
    outlineColorTag,
    packTag,
    positionTag,
    offsetTag('ytsur', OffsetType.Regular),
    resetTag,
    rubyTag,
    secondaryAlphaTag,
    secondaryColorTag,
    shadowAlphaTag,
    shadowColorTag,
    shakeTag,
    simpleFadeTag,
    offsetTag('ytsub', OffsetType.Subscript),
    offsetTag('ytsup', OffsetType.Superscript),
    transformTag,
    boolTag('u', 'underline'),
    verticalTypeTag,
  ];

  const map = new Map();
  for (const handler of handlers) {
    if (map.has(handler.tag)) throw new Error(`Duplicate tag handler ${handler.tag}`);
    map.set(handler.tag, handler);
  }
  return map;
}
