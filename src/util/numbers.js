// Helpers that reproduce .NET numeric behavior so the output matches the C# original byte for byte.

/** Round to float32 (C# `float`). */
export const f32 = Math.fround;

/** C# Math.Round(double): banker's rounding (MidpointRounding.ToEven). */
export function roundHalfEven(x) {
  const floor = Math.floor(x);
  const diff = x - floor;
  if (diff > 0.5) return floor + 1;
  if (diff < 0.5) return floor;
  return floor % 2 === 0 ? floor : floor + 1;
}

/** Rounding used by .NET Framework DateTime.AddMilliseconds / TimeSpan.FromMilliseconds (half away from zero). */
export function roundHalfAway(x) {
  return x >= 0 ? Math.floor(x + 0.5) : Math.ceil(x - 0.5);
}

/** C# (int) cast of a floating point value (truncation toward zero). */
export function toInt(x) {
  return Math.trunc(x) | 0;
}

const INT_RE = /^\s*[+-]?\d+\s*$/;

/** int.TryParse(string) with NumberStyles.Integer. Returns null on failure. */
export function tryParseInt(s) {
  if (s == null || !INT_RE.test(s)) return null;
  const v = Number(s.trim());
  if (v > 2147483647 || v < -2147483648) return null;
  return v;
}

const FLOAT_RE = /^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?\s*$/;

/** float.TryParse(s, NumberStyles.Float, InvariantCulture). Returns null on failure. */
export function tryParseFloat(s) {
  if (s == null || !FLOAT_RE.test(s)) return null;
  const v = f32(Number(s.trim()));
  return Number.isFinite(v) ? v : null;
}

/** float.TryParse(s, NumberStyles.Any, InvariantCulture): like Float but also accepts thousands separators. */
export function tryParseFloatAny(s) {
  if (s == null) return null;
  const cleaned = s.replace(/(\d),(?=\d)/g, '$1');
  return tryParseFloat(cleaned);
}

/** int.TryParse(s, AllowHexSpecifier | whitespace). Returns null on failure. */
export function tryParseHexInt(s) {
  if (s == null) return null;
  const t = s.trim();
  if (!/^[0-9a-fA-F]+$/.test(t)) return null;
  const digits = t.replace(/^0+(?=.)/, '');
  if (digits.length > 8) return null;
  return parseInt(digits, 16) | 0;
}

/**
 * float.ToString(CultureInfo.InvariantCulture) on .NET Framework: format "G" with 7 significant digits
 * (scientific notation when the exponent is >= 7 or <= -5; "-0" is written as "0").
 */
export function formatFloat(x) {
  x = f32(x);
  if (Number.isNaN(x)) return 'NaN';
  if (x === Infinity) return 'Infinity';
  if (x === -Infinity) return '-Infinity';
  if (x === 0) return '0';

  const [mantissa, expPart] = x.toExponential(6).split('e');
  const exponent = Number(expPart);
  if (exponent > -5 && exponent < 7) return String(Number(x.toPrecision(7)));

  const digits = mantissa.replace(/\.?0+$/, '');
  const sign = exponent < 0 ? '-' : '+';
  return `${digits}E${sign}${String(Math.abs(exponent)).padStart(2, '0')}`;
}
