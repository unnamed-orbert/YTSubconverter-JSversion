import { roundHalfEven } from './numbers.js';

// Equivalent of System.Drawing.Color plus YTSubConverter's ColorUtil.
// Color.Empty is a distinct value from a transparent black color, just like in .NET.

export class Color {
  constructor(a, r, g, b, empty = false) {
    this.a = a & 255;
    this.r = r & 255;
    this.g = g & 255;
    this.b = b & 255;
    this.isEmpty = empty;
    Object.freeze(this);
  }

  /** Color.FromArgb(a, r, g, b) or Color.FromArgb(r, g, b) */
  static fromArgb(a, r, g, b) {
    if (b === undefined) return new Color(255, a, r, g);
    return new Color(a, r, g, b);
  }

  static fromRgb(r, g, b) {
    return new Color(255, r, g, b);
  }

  /** Color.FromArgb(int argb) */
  static fromArgbInt(argb) {
    return new Color((argb >>> 24) & 255, (argb >>> 16) & 255, (argb >>> 8) & 255, argb & 255);
  }

  withRgb(r, g, b) {
    return new Color(this.a, r, g, b, this.isEmpty);
  }

  /** Color.ToArgb() as a signed 32 bit int. */
  toArgb() {
    return ((this.a << 24) | (this.r << 16) | (this.g << 8) | this.b) | 0;
  }

  /** Equivalent of the C# == operator (Empty only equals Empty). */
  equals(other) {
    if (this.isEmpty || other.isEmpty) return this.isEmpty === other.isEmpty;
    return this.toArgb() === other.toArgb();
  }

  toString() {
    return this.isEmpty ? 'Color.Empty' : `Color(A=${this.a}, R=${this.r}, G=${this.g}, B=${this.b})`;
  }
}

Color.Empty = new Color(0, 0, 0, 0, true);
Color.White = new Color(255, 255, 255, 255);
Color.Black = new Color(255, 0, 0, 0);

export function changeAlpha(color, alpha) {
  return Color.fromArgbInt((alpha << 24) | (color.toArgb() & 0xffffff));
}

export function isDark(color) {
  return Math.max(color.r, color.g, color.b) < 128;
}

export function brighten(color) {
  const r = Math.max(color.r, 1);
  const g = Math.max(color.g, 1);
  const b = Math.max(color.b, 1);
  const highest = Math.max(r, g, b);
  const factor = Math.fround(255 / highest);
  // Math.Round(double) on a float*int product (computed in float32)
  const round = (v) => roundHalfEven(Math.fround(v * factor));
  return new Color(color.a, round(r), round(g), round(b));
}

export function colorFromHtml(html) {
  if (!html) return Color.Empty;
  if (html.length !== 7 || !html.startsWith('#') || !/^[0-9a-fA-F]{6}$/.test(html.substring(1)))
    throw new Error(`Invalid HTML color: ${html}`);
  return Color.fromArgbInt((0xff << 24) | parseInt(html.substring(1), 16));
}

export function colorToHtml(color) {
  if (color.isEmpty) return '';
  return '#' + (color.toArgb() & 0xffffff).toString(16).toUpperCase().padStart(6, '0');
}
