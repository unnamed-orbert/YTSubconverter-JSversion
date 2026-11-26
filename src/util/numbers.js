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
