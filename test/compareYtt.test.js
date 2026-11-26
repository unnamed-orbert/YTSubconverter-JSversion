// Comparação entre o .ytt original e o refeito (src/compare/compareYtt.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Line, Section } from '../src/model.js';
import { Color } from '../src/util/color.js';
import { compareAt, compareDocuments } from '../src/compare/compareYtt.js';
import { recoverAndRemake } from '../src/compare/remake.js';

function line(start, end, text, { x = 640, y = 600, color = Color.fromRgb(255, 255, 255), alpha = 254 } = {}) {
  const l = new Line(start, end);
  const s = new Section(text);
  s.foreColor = Color.fromArgb(alpha, color.r, color.g, color.b);
  l.sections.push(s);
  l.position = { x, y };
  return l;
}

test('legendas iguais: 100% e nenhum trecho diferente', () => {
  const a = [line(0, 1000, 'Olá'), line(1500, 3000, 'Mundo')];
  const b = [line(0, 1000, 'Olá'), line(1500, 3000, 'Mundo')];
  const r = compareDocuments(a, b);
  assert.equal(r.similarity, 100);
  assert.equal(r.segments.length, 0);
  // Amostras sem nada na tela não contam
  assert.equal(r.counted, 25);
});

test('posição, cor e opacidade diferentes aparecem no trecho certo', () => {
  const a = [line(0, 1000, 'Olá'), line(2000, 3000, 'Mundo')];
  const b = [line(0, 1000, 'Olá', { x: 700 }), line(2000, 3000, 'Mundo', { color: Color.fromRgb(255, 0, 0), alpha: 100 })];
  const r = compareDocuments(a, b);
  assert.deepEqual(r.segments.map((s) => [s.start, s.end, s.kinds]), [
    [0, 1000, ['position']],
    [2000, 3000, ['color', 'opacity']],
  ]);
  assert.ok(r.similarity < 100 && r.similarity > 50, String(r.similarity));
  assert.equal(r.byProperty.text, 100);
  assert.ok(r.byProperty.position < 100);
});

test('linha só de um lado e texto diferente', () => {
  const a = [line(0, 1000, 'Olá'), line(0, 1000, 'Extra', { y: 100 })];
  const b = [line(0, 1000, 'Olá!')];
  const at = compareAt(a, b, 500);
  assert.equal(at.pairs.length, 1);
  assert.equal(at.onlyA.length, 1);
  assert.equal(at.onlyA[0].key, 'Extra');
  assert.ok(at.pairs[0].scores.text < 1 && at.pairs[0].scores.text > 0.7);
  const r = compareDocuments(a, b);
  assert.deepEqual(r.segments[0].kinds, ['text', 'missing']);
});

test('trecho totalmente transparente não conta como texto visível', () => {
  const a = line(0, 1000, 'Faço ');
  const hidden = new Section('então');
  hidden.foreColor = Color.fromArgb(0, 0, 0, 0);
  a.sections.push(hidden);
  const at = compareAt([a], [line(0, 1000, 'Faço')], 500);
  assert.equal(at.score, 1);
});

test('demonstração: .ytt refeito a partir do .ass recuperado fica parecido com o original', async () => {
  const content = readFileSync(new URL('../exemplos/demonstracao-tags.ytt', import.meta.url));
  const { original, remade } = await recoverAndRemake('demonstracao-tags.ytt', content);
  const r = compareDocuments(original.lines, remade.lines);
  assert.ok(r.similarity > 95, `semelhança ${r.similarity}`);
  assert.ok(r.counted > 500);
});
