import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SrtDocument, SbvDocument } from '../src/formats/srt.js';
import { YttDocument } from '../src/formats/ytt.js';
import { convertDocument } from '../src/convert.js';
import { Color } from '../src/util/color.js';

const fmt = (s) => [s.text, s.bold, s.italic, s.underline];

test('SRT: <i>, <b>, <u> no meio do texto viram trechos formatados', () => {
  const doc = SrtDocument.parse('1\n00:00:01,000 --> 00:00:03,000\nOlá <i>mundo</i> e <b><u>todos</u></b>!\n<I>linha dois</I>\n');
  const line = doc.lines[0];
  assert.equal(line.text, 'Olá mundo e todos!\r\nlinha dois');
  assert.deepEqual(line.sections.map(fmt), [
    ['Olá ', false, false, false],
    ['mundo', false, true, false],
    [' e ', false, false, false],
    ['todos', true, false, true],
    ['!\r\n', false, false, false],
    ['linha dois', false, true, false],
  ]);
  for (const s of line.sections) assert.ok(s.foreColor.equals(Color.White));
});

test('SRT: tag sem fechamento, <font color> e tags desconhecidas', () => {
  const doc = SrtDocument.parse('1\n00:00:01,000 --> 00:00:03,000\n<i>sem fim <font color="#ff0000">verm</font> <c>x</c>\n');
  const [a, b, c] = doc.lines[0].sections;
  assert.deepEqual(fmt(a), ['sem fim ', false, true, false]);
  assert.deepEqual(fmt(b), ['verm', false, true, false]);
  assert.ok(b.foreColor.equals(Color.fromArgb(255, 255, 0, 0)));
  assert.deepEqual(fmt(c), [' <c>x</c>', false, true, false]);
});

test('SRT sem tags continua com um trecho só', () => {
  const doc = SrtDocument.parse('1\n00:00:01,000 --> 00:00:03,000\n2 < 3 e 4 > 1\n');
  assert.equal(doc.lines[0].sections.length, 1);
  assert.equal(doc.lines[0].text, '2 < 3 e 4 > 1');
});

test('SBV também lê as tags', () => {
  const doc = SbvDocument.parse('0:00:01.000,0:00:02.500\num <b>dois</b>\n');
  assert.deepEqual(doc.lines[0].sections.map(fmt), [['um ', false, false, false], ['dois', true, false, false]]);
});

test('SRT com tags -> .ytt e .ass mantêm a formatação', () => {
  const srt = '1\n00:00:01,000 --> 00:00:03,000\nOlá <i>mundo</i> <b>forte</b> <u>sub</u>\n';
  const ytt = convertDocument(SrtDocument.parse(srt), '.ytt').save();
  assert.ok(!ytt.includes('&lt;i&gt;'));
  const back = YttDocument.parse(ytt).lines.find((l) => l.text.includes('mundo'));
  assert.equal(back.text, 'Olá mundo forte sub');
  assert.ok(back.sections.find((s) => s.text === 'mundo').italic);
  assert.ok(back.sections.find((s) => s.text === 'forte').bold);
  assert.ok(back.sections.find((s) => s.text === 'sub').underline);

  const ass = convertDocument(SrtDocument.parse(srt), '.ass').save();
  assert.match(ass, /Olá \{\\i1\}mundo\{\\i0\} \{\\b1\}forte\{\\b0\} \{\\u1\}sub/);
});
