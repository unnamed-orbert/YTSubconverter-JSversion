import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Line, Section } from '../src/model.js';
import { Color } from '../src/util/color.js';
import { AnchorPoint, ShadowType } from '../src/enums.js';
import { SubtitleDocument } from '../src/formats/subtitleDocument.js';
import { YttDocument, getYouTubeFontScale, getRealFontScale } from '../src/formats/ytt.js';

function section(text, init = {}) {
  const s = new Section(text);
  s.font = 'Roboto';
  s.foreColor = Color.fromArgb(255, 255, 255, 255);
  s.backColor = Color.fromArgb(255, 0, 0, 0);
  return Object.assign(s, init);
}

function doc(...lines) {
  const d = new SubtitleDocument();
  d.lines.push(...lines);
  return d;
}

test('single line matches the original output layout', () => {
  const line = new Line(0, 5000, [section('Bottom center')]);
  line.end = 4989; // as rounded to the frame center by the .ass reader
  const out = new YttDocument(doc(line)).save();
  assert.equal(
    out,
    '<?xml version="1.0" encoding="utf-8"?><timedtext format="3"><head>' +
      '<wp id="0" ap="7" ah="0" av="0" /><wp id="1" ap="7" ah="50" av="100" />' +
      '<ws id="0" ju="2" pd="0" sd="0" wfo="0" /><ws id="1" ju="2" pd="0" sd="0" wfo="0" />' +
      '<pen id="0" sz="100" fc="#000000" fo="0" bo="0" /><pen id="1" sz="100" fc="#A0AAB4" fo="0" bo="0" />' +
      '<pen id="2" sz="100" fc="#FEFEFE" fo="254" bc="#000000" bo="254" /></head><body>' +
      '<p t="1" d="4988" wp="1" ws="1"><s p="1">​</s>​<s p="2">​ ​Bottom center​ ​</s><s p="1">​</s></p>' +
      '</body></timedtext>',
  );
});

test('multiple shadows are split into layered lines', () => {
  const s = section('Sombra', { backColor: Color.Empty });
  s.shadowColors.set(ShadowType.Glow, Color.fromArgb(255, 0, 0, 0));
  s.shadowColors.set(ShadowType.SoftShadow, Color.fromArgb(255, 0, 0, 0));
  const out = new YttDocument(doc(new Line(1000, 2000, [s]))).save();
  assert.equal((out.match(/<p /g) || []).length, 2);
  assert.match(out, /et="4"/);
  assert.match(out, /et="3"/);
});

test('dark text gets an invisible bright copy for Android', () => {
  const s = section('Escuro', { foreColor: Color.fromArgb(255, 10, 20, 40) });
  const out = new YttDocument(doc(new Line(1000, 2000, [s]))).save();
  assert.equal((out.match(/<p /g) || []).length, 2);
  assert.match(out, /fc="#4080FF" fo="0"/);
});

test('positions and text escaping', () => {
  const line = new Line(1000, 2000, [section('a < b & c > d')]);
  line.anchorPoint = AnchorPoint.TopLeft;
  line.position = { x: 0, y: 0 };
  const out = new YttDocument(doc(line)).save();
  assert.match(out, /<wp id="1" ap="0" ah="0" av="0" \/>/);
  assert.match(out, /a &lt; b &amp; c &gt; d/);
});

test('italic prefetch line is added', () => {
  const out = new YttDocument(doc(new Line(1000, 2000, [section('itálico', { italic: true })]))).save();
  assert.match(out, /<p t="4989" d="100"/);
});

test('font scale quantization', () => {
  assert.equal(getYouTubeFontScale(1), 100);
  assert.equal(getYouTubeFontScale(1.25), 200);
  assert.equal(getYouTubeFontScale(0.5), 0);
  assert.equal(getRealFontScale(200), 1.25);
});
