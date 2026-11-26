import { test } from 'node:test';
import assert from 'node:assert/strict';
import { YttDocument } from '../src/formats/ytt.js';
import { Json3Document } from '../src/formats/json3.js';
import { SrtDocument } from '../src/formats/srt.js';
import { canFixMassiveDuplication, fixMassiveDuplication } from '../src/dedup.js';

// Monta um .ytt com <p> por quadro. frames: [t, d, texto, wp]
function ytt(frames, positions = '<wp id="0" ap="7" ah="50" av="100"/><wp id="1" ap="1" ah="50" av="0"/>') {
  const ps = frames.map(([t, d, text, wp = 0]) => `<p t="${t}" d="${d}" wp="${wp}"><s>${text}</s></p>`).join('');
  return `<?xml version="1.0" encoding="utf-8"?><timedtext format="3"><head>${positions}</head><body>${ps}</body></timedtext>`;
}

/** Quadros de 67 ms de start a end, com `copies` cópias por quadro (camadas de sombra). */
function frames(start, end, text, wp = 0, copies = 4) {
  const out = [];
  for (let t = start; t < end; t += 67) for (let i = 0; i < copies; i++) out.push([t, Math.min(67, end - t), text, wp]);
  return out;
}

const lines = (doc) => doc.lines.map((l) => [l.start, l.end, l.text]);

test('dedup: quadros repetidos viram uma linha por frase, e o buraco pequeno é fechado', () => {
  const doc = YttDocument.parse(ytt([...frames(200, 2000, 'Olá mundo'), ...frames(2300, 4000, 'Tudo bem?')]));
  assert.equal(doc.lines.length > 100, true);
  fixMassiveDuplication(doc);
  // O buraco de 300 ms (<= 500) é fechado: a primeira vai até o começo da segunda.
  assert.deepEqual(lines(doc), [[200, 2300, 'Olá mundo'], [2300, 4000, 'Tudo bem?']]);
});

test('dedup: texto que cresce (karaokê/digitação) fica com a versão mais longa', () => {
  const doc = YttDocument.parse(ytt([...frames(0, 400, 'Um'), ...frames(400, 800, 'Um dois'), ...frames(800, 1500, 'Um dois três')]));
  fixMassiveDuplication(doc);
  assert.deepEqual(lines(doc), [[0, 1500, 'Um dois três']]);
});

test('dedup: frases curtas (< 300 ms) somem e na colisão fica a de baixo', () => {
  const doc = YttDocument.parse(ytt([
    ...frames(0, 200, 'Piscada'),
    ...frames(1000, 3000, 'Em cima', 1),
    ...frames(1000, 3000, 'Embaixo', 0),
  ]));
  fixMassiveDuplication(doc);
  assert.deepEqual(lines(doc), [[1000, 3000, 'Embaixo']]);
});

test('dedup: mantém a formatação do quadro mais opaco (fade)', () => {
  const pens = '<pen id="0" fc="#FF0000" fo="10"/><pen id="1" fc="#FF0000" fo="254"/>';
  const ps = [0, 67, 134, 201, 268, 335].map((t, i) => `<p t="${t}" d="67" wp="0" p="${i < 3 ? 0 : 1}"><s>Some</s></p>`).join('');
  const doc = YttDocument.parse(`<timedtext format="3"><head>${pens}<wp id="0" ap="7" ah="50" av="100"/></head><body>${ps}</body></timedtext>`);
  fixMassiveDuplication(doc);
  assert.equal(doc.lines.length, 1);
  assert.equal(doc.lines[0].sections[0].foreColor.a, 254);
});

test('dedup: .json3 e .ytt dão o mesmo .srt', () => {
  const fr = [...frames(0, 1000, 'Alpha'), ...frames(1100, 2000, 'Beta')];
  const json = JSON.stringify({
    wpWinPositions: [{ apPoint: 7, ahHorPos: 50, avVerPos: 100 }, { apPoint: 1, ahHorPos: 50, avVerPos: 0 }],
    events: fr.map(([t, d, text, wp]) => ({ tStartMs: t, dDurationMs: d, wpWinPosId: wp, segs: [{ utf8: text }] })),
  });
  const a = Json3Document.parse(json);
  const b = YttDocument.parse(ytt(fr));
  assert.equal(canFixMassiveDuplication(a), true);
  assert.equal(new SrtDocument(fixMassiveDuplication(a)).save(), new SrtDocument(fixMassiveDuplication(b)).save());
});

test('dedup: só vale para .ytt/.json3', () => {
  assert.equal(canFixMassiveDuplication(SrtDocument.parse('1\n00:00:01,000 --> 00:00:02,000\nOi\n')), false);
});
