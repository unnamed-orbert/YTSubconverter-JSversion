// Port of YTSubConverter.Shared/Animations/*Animation.cs
// Times are ms (see src/util/time.js). Interpolation reproduces the C# float32 arithmetic.

import { Color } from '../util/color.js';
import { NetRandom } from '../util/netRandom.js';
import { f32, toInt } from '../util/numbers.js';
import { TIME_BASE } from '../util/time.js';

export class Animation {
  constructor(startTime, endTime, acceleration) {
    this.startTime = startTime;
    this.endTime = endTime;
    this.acceleration = f32(acceleration);
  }

  /** Whether the animation's start state applies before it starts. */
  get affectsPast() {
    throw new Error('abstract');
  }

  get affectsText() {
    return false;
  }

  /**
   * @param {import('../formats/ass/assModel.js').AssLine} line
   * @param {import('../formats/ass/assModel.js').AssSection | null} section
   * @param {number} t float32 in [0, 1]
   */
  apply(line, section, t) {
    throw new Error('abstract');
  }

  /** int Interpolate(int from, int to, float t) */
  interpolateInt(from, to, t) {
    return from + toInt((to - from) * Math.pow(t, this.acceleration));
  }

  /** float Interpolate(float from, float to, float t) */
  interpolateFloat(from, to, t) {
    return f32(from + f32(f32(to - from) * f32(Math.pow(t, this.acceleration))));
  }

  interpolateColor(from, to, t) {
    return Color.fromArgb(
      this.interpolateInt(from.a, to.a, t),
      this.interpolateInt(from.r, to.r, t),
      this.interpolateInt(from.g, to.g, t),
      this.interpolateInt(from.b, to.b, t),
    );
  }

  clone() {
    throw new Error('abstract');
  }
}

export class ColorAnimation extends Animation {
  constructor(startTime, startColor, endTime, endColor, acceleration) {
    super(startTime, endTime, acceleration);
    this.startColor = startColor;
    this.endColor = endColor;
  }

  get affectsPast() {
    return false;
  }

  getColor(t) {
    return this.interpolateColor(this.startColor, this.endColor, t);
  }
}

export class ForeColorAnimation extends ColorAnimation {
  apply(line, section, t) {
    section.foreColor = this.getColor(t);
  }

  clone() {
    return new ForeColorAnimation(this.startTime, this.startColor, this.endTime, this.endColor, this.acceleration);
  }
}

export class SecondaryColorAnimation extends ColorAnimation {
  apply(line, section, t) {
    section.secondaryColor = this.getColor(t);
  }

  clone() {
    return new SecondaryColorAnimation(this.startTime, this.startColor, this.endTime, this.endColor, this.acceleration);
  }
}

export class BackColorAnimation extends ColorAnimation {
  apply(line, section, t) {
    section.backColor = this.getColor(t);
  }

  clone() {
    return new BackColorAnimation(this.startTime, this.startColor, this.endTime, this.endColor, this.acceleration);
  }
}

export class ShadowColorAnimation extends ColorAnimation {
  constructor(shadowType, startTime, startColor, endTime, endColor, acceleration) {
    super(startTime, startColor, endTime, endColor, acceleration);
    this.shadowType = shadowType;
  }

  apply(line, section, t) {
    section.shadowColors.set(this.shadowType, this.getColor(t));
  }

  clone() {
    return new ShadowColorAnimation(this.shadowType, this.startTime, this.startColor, this.endTime, this.endColor, this.acceleration);
  }
}

export class FadeAnimation extends Animation {
  constructor(startTime, startAlpha, endTime, endAlpha) {
    super(startTime, endTime, 1);
    this.startAlpha = startAlpha;
    this.endAlpha = endAlpha;
  }

  get affectsPast() {
    return true;
  }

  apply(line, section, t) {
    line.alpha = this.interpolateInt(this.startAlpha, this.endAlpha, t);
  }

  clone() {
    return new FadeAnimation(this.startTime, this.startAlpha, this.endTime, this.endAlpha);
  }
}

export class MoveAnimation extends Animation {
  /** Positions are {x, y} objects with float32 values. */
  constructor(startTime, startPos, endTime, endPos) {
    super(startTime, endTime, 1);
    this.startPosition = startPos;
    this.endPosition = endPos;
  }

  get affectsPast() {
    return true;
  }

  apply(line, section, t) {
    const x = this.interpolateFloat(this.startPosition.x, this.endPosition.x, t);
    const y = this.interpolateFloat(this.startPosition.y, this.endPosition.y, t);
    line.position = { x, y };
  }

  clone() {
    return new MoveAnimation(this.startTime, this.startPosition, this.endTime, this.endPosition);
  }
}

export class ScaleAnimation extends Animation {
  constructor(startTime, startScale, endTime, endScale, acceleration) {
    super(startTime, endTime, acceleration);
    this.startScale = f32(startScale);
    this.endScale = f32(endScale);
  }

  get affectsPast() {
    return false;
  }

  apply(line, section, t) {
    section.scale = this.interpolateFloat(this.startScale, this.endScale, t);
  }

  clone() {
    return new ScaleAnimation(this.startTime, this.startScale, this.endTime, this.endScale, this.acceleration);
  }
}

/** Seed used by the C# code: (int)(startTime - TimeBase).TotalMilliseconds */
function seedFromTime(time) {
  return toInt(time - TIME_BASE);
}

export class ShakeAnimation extends Animation {
  /** @param {{width: number, height: number}} radius */
  constructor(startTime, endTime, radius) {
    super(startTime, endTime, 1);
    this.radius = radius;
    this._random = new NetRandom(seedFromTime(startTime));
  }

  get affectsPast() {
    return false;
  }

  apply(line, section, t) {
    if (t <= 0 || t >= 1 || line.position == null) return;

    const dx = f32(this.radius.width * f32(f32(f32(this._random.nextDouble()) * 2) - 1));
    const x = f32(line.position.x + dx);
    const dy = f32(this.radius.height * f32(f32(f32(this._random.nextDouble()) * 2) - 1));
    const y = f32(line.position.y + dy);
    line.position = { x, y };
  }

  clone() {
    return new ShakeAnimation(this.startTime, this.endTime, this.radius);
  }
}

export class GlitchingCharAnimation extends Animation {
  /** @param {import('../util/misc.js').CharacterRange[]} charRanges */
  constructor(startTime, endTime, charRanges) {
    super(startTime, endTime, 1);
    this._random = new NetRandom(seedFromTime(startTime));
    this._charRanges = charRanges;
  }

  get affectsPast() {
    return false;
  }

  get affectsText() {
    return true;
  }

  apply(line, section, t) {
    if (t > 0 && t < 1) section.text = this._getRandomChar();
  }

  _getRandomChar() {
    const range = this._charRanges[this._random.next(this._charRanges.length)];
    return String.fromCharCode(range.start + this._random.next(range.end - range.start));
  }

  clone() {
    return new GlitchingCharAnimation(this.startTime, this.endTime, this._charRanges);
  }
}
