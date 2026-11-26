import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { detectFormat, InputFormat } from '../src/detect.js';
import { loadDocument, getInputFormat } from '../src/convert.js';

const dir = join(import.meta.dirname, 'files', 'ass');
const enc = (s) => new TextEncoder().encode(s);

const SRT = '1\r\n00:00:01,000 --> 00:00:02,500\r\nOlá\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\nMundo\r\n';
const SBV = '0:00:01.000,0:00:02.500\nOlá\n\n0:00:03.000,0:00:04.000\nMundo\n';
const JSON3 = '{"wireMagic":"pb3","events":[{"tStartMs":1000,"dDurationMs":1500,"segs":[{"utf8":"Olá"}]}]}';

test('reconhece cada formato pelo conteúdo', () => {
  assert.equal(detectFormat(SRT), InputFormat.Srt);
  assert.equal(detectFormat(SBV), InputFormat.Sbv);
  assert.equal(detectFormat(JSON3), InputFormat.Json3);
  assert.equal(detectFormat(readFileSync(join(dir, 'Colors.ass'))), InputFormat.Ass);
  assert.equal(detectFormat(readFileSync(join(dir, 'Colors.ytt'))), InputFormat.Ytt);
  assert.equal(detectFormat('<timedtext format="3"><body><p t="0" d="1000">Oi</p></body></timedtext>'), InputFormat.Ytt);
});

test('aceita BOM e UTF-16', () => {
  assert.equal(detectFormat(enc('﻿' + SRT)), InputFormat.Srt);
  const utf16 = new Uint8Array([0xff, 0xfe, ...new Uint8Array(new Uint16Array([...SBV].map((c) => c.charCodeAt(0))).buffer)]);
  assert.equal(detectFormat(utf16), InputFormat.Sbv);
});

test('não reconhece texto qualquer', () => {
  assert.equal(detectFormat('apenas um texto\ncom duas linhas'), null);
  assert.equal(detectFormat('{"outra":"coisa"}'), null);
  assert.equal(detectFormat('<html><body>oi</body></html>'), null);
});

test('o conteúdo vale mais que a extensão', async () => {
  // Sem extensão, com extensão errada ou genérica
  assert.equal(getInputFormat('timedtext', enc(JSON3)), InputFormat.Json3);
  assert.equal(getInputFormat('legenda.srt', readFileSync(join(dir, 'Colors.ytt'))), InputFormat.Ytt);
  assert.equal(getInputFormat('legenda.txt', enc(SBV)), InputFormat.Sbv);
  const doc = await loadDocument('download', enc(SRT));
  assert.deepEqual(doc.lines.map((l) => [l.start, l.end, l.text]), [[1000, 2500, 'Olá'], [3000, 4000, 'Mundo']]);
  const ass = await loadDocument('arquivo.bin', readFileSync(join(dir, 'Colors.ass')));
  assert.ok(ass.lines.length > 0);
});

test('sem reconhecer o conteúdo, usa a extensão', () => {
  assert.equal(getInputFormat('vazio.srt', enc('')), InputFormat.Srt);
  assert.equal(getInputFormat('vazio', enc('')), null);
});
