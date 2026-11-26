import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SrtDocument, SbvDocument } from '../src/formats/srt.js';
import { Color, changeAlpha, brighten, colorToHtml } from '../src/util/color.js';
import { roundTimeToFrameCenter, startTimeToFrame, endTimeToFrame } from '../src/util/time.js';
import { NetRandom } from '../src/util/netRandom.js';
import { roundHalfEven, tryParseHexInt } from '../src/util/numbers.js';

test('SRT round trip', () => {
  const srt = '1\r\n00:00:01,500 --> 00:00:03,000\r\nOlá\r\nmundo\r\n\r\n2\r\n00:01:00.25 --> 00:01:02,000\r\n42 anos\r\n';
  const doc = SrtDocument.parse(srt);
  assert.equal(doc.lines.length, 2);
  assert.equal(doc.lines[0].start, 1500);
  assert.equal(doc.lines[0].text, 'Olá\r\nmundo');
  assert.equal(doc.lines[1].start, 60250);
  assert.equal(doc.lines[1].text, '42 anos');
  assert.equal(doc.save(), '1\r\n00:00:01,500 --> 00:00:03,000\r\nOlá\r\nmundo\r\n\r\n2\r\n00:01:00,250 --> 00:01:02,000\r\n42 anos\r\n\r\n');
});

test('SBV parse', () => {
  const doc = SbvDocument.parse('0:00:01.000,0:00:02.500\nLinha um\n\n0:00:03.000,0:00:04.000\nLinha dois\n');
  assert.deepEqual(doc.lines.map((l) => [l.start, l.end, l.text]), [[1000, 2500, 'Linha um'], [3000, 4000, 'Linha dois']]);
  assert.ok(doc.lines[0].sections[0].backColor.equals(Color.fromArgb(192, 8, 8, 8)));
});

test('colors', () => {
  assert.equal(colorToHtml(changeAlpha(Color.Empty, 10)), '#000000');
  assert.equal(changeAlpha(Color.Empty, 10).isEmpty, false);
  assert.ok(!Color.Empty.equals(Color.fromArgbInt(0)));
  const b = brighten(Color.fromArgb(255, 10, 20, 40));
  assert.deepEqual([b.r, b.g, b.b], [64, 128, 255]);
});

test('frames', () => {
  assert.equal(endTimeToFrame(1000), 30);
  assert.equal(startTimeToFrame(1000), 31);
  assert.equal(roundTimeToFrameCenter(5000), 4989);
  assert.equal(roundTimeToFrameCenter(0), 0);
});

test('numbers', () => {
  assert.equal(roundHalfEven(2.5), 2);
  assert.equal(roundHalfEven(3.5), 4);
  assert.equal(tryParseHexInt('FFFFFFFF'), -1);
  assert.equal(tryParseHexInt('0000F6'), 0xf6);
});

test('NetRandom is deterministic per seed', () => {
  const a = new NetRandom(1234);
  const b = new NetRandom(1234);
  const seq = () => [0, 0, 0, 0, 0].map(() => a.next(100));
  assert.deepEqual(seq(), [0, 0, 0, 0, 0].map(() => b.next(100)));
});
