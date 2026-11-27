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
    /**
     * Extensão do port (hierarquia de tags): 'rgb' = o \\t só muda a cor, 'alpha' = só muda a opacidade, 'all' = as duas
     * (como no C#). No libass a cor e a opacidade são independentes: um \\t(\\3c) da linha inteira e um
     * \\t(0,20,\\alpha) da letra correm juntos, sem um apagar o outro.
     */
    this.channel = 'all';
  }

  /** A cor no ponto t partindo da cor atual (só a parte do canal da animação muda). */
  blend(current, t) {
    const color = this.getColor(t);
    if (this.channel === 'all' || current == null || current.isEmpty) return color;
    if (this.channel === 'rgb') return Color.fromArgb(current.a, color.r, color.g, color.b);
    return Color.fromArgb(color.a, current.r, current.g, current.b);
  }

  /** Copia o canal para a cópia (clone) desta animação. */
  withChannelOf(other) {
    this.channel = other.channel;
    return this;
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
    section.foreColor = this.blend(section.foreColor, t);
  }

  clone() {
    return new ForeColorAnimation(this.startTime, this.startColor, this.endTime, this.endColor, this.acceleration).withChannelOf(this);
  }
}

/**
 * Extensão do port (hierarquia de tags): a troca de cor do karaokê (\\ytkt(Fade), \\kf) vai do \\2c até a cor que o
 * trecho tem *naquele momento*. No C# ela ia até a cor fixa do \\1c e, como era aplicada por último, apagava o \\t de
 * cor/opacidade do mesmo trecho (o destaque atropelava a transição). Sem \\t no trecho o resultado é o mesmo de antes.
 */
export class KaraokeColorAnimation extends ForeColorAnimation {
  /** @param {ForeColorAnimation[]} transforms os \\t de cor do trecho, avaliados no mesmo instante */
  constructor(startTime, startColor, endTime, endColor, acceleration, transforms = []) {
    super(startTime, startColor, endTime, endColor, acceleration);
    this.transforms = transforms;
  }

  /** Cor do trecho (\\1c com os \\t aplicados) no instante `time`. */
  targetAt(time) {
    let color = this.endColor;
    for (const a of this.transforms) {
      if (time >= a.endTime) color = a.blend(color, 1);
      else if (time > a.startTime) color = a.blend(color, a.getProgress ? a.getProgress(time) : (time - a.startTime) / (a.endTime - a.startTime));
    }
    return color;
  }

  apply(line, section, t) {
    const time = this.startTime + (this.endTime - this.startTime) * t;
    section.foreColor = this.interpolateColor(this.startColor, this.targetAt(time), t);
  }

  clone() {
    return new KaraokeColorAnimation(this.startTime, this.startColor, this.endTime, this.endColor, this.acceleration, this.transforms);
  }
}

export class SecondaryColorAnimation extends ColorAnimation {
  apply(line, section, t) {
    section.secondaryColor = this.blend(section.secondaryColor, t);
  }

  clone() {
    return new SecondaryColorAnimation(this.startTime, this.startColor, this.endTime, this.endColor, this.acceleration).withChannelOf(this);
  }
}

export class BackColorAnimation extends ColorAnimation {
  apply(line, section, t) {
    section.backColor = this.blend(section.backColor, t);
  }

  clone() {
    return new BackColorAnimation(this.startTime, this.startColor, this.endTime, this.endColor, this.acceleration).withChannelOf(this);
  }
}

export class ShadowColorAnimation extends ColorAnimation {
  constructor(shadowType, startTime, startColor, endTime, endColor, acceleration) {
    super(startTime, startColor, endTime, endColor, acceleration);
    this.shadowType = shadowType;
  }

  apply(line, section, t) {
    section.shadowColors.set(this.shadowType, this.blend(section.shadowColors.get(this.shadowType), t));
  }

  clone() {
    return new ShadowColorAnimation(this.shadowType, this.startTime, this.startColor, this.endTime, this.endColor, this.acceleration).withChannelOf(this);
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
