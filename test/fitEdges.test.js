import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDocument, convertDocument } from '../src/convert.js';

// Coluna "INCONTROLÁVEL" colada nas bordas (caso real): \an2 em x = 48 e x = 1852 numa tela de 1920.
const ASS = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: P,Garamond,60,&H00D38DEA,&H00000000,&H0041CBFF,&H00FF0000,-1,0,0,0,100,100,0,0,1,3,2,2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:02.00,P,,0,0,0,,{\\pos(48.161,871.109)}I\\NN\\NC\\NO
Dialogue: 0,0:00:01.00,0:00:02.00,P,,0,0,0,,{\\pos(1852.576,871.109)}I\\NN\\NC\\NO
Dialogue: 0,0:00:03.00,0:00:04.00,P,,0,0,0,,{\\pos(960,540)}No meio da tela
`;

/** [ap, ah] de cada <p>, na ordem. */
async function windows(fitEdges) {
  const ytt = convertDocument(await loadDocument('x.ass', ASS), '.ytt', { fitEdges }).save();
  const wp = Object.fromEntries([...ytt.matchAll(/<wp id="(\d+)" ap="(\d+)" ah="(\d+)"/g)].map((m) => [m[1], [Number(m[2]), Number(m[3])]]));
  const ws = Object.fromEntries([...ytt.matchAll(/<ws id="(\d+)" ju="(\d+)"/g)].map((m) => [m[1], Number(m[2])]));
  // cada linha vira duas <p> (cópia para a sombra): uma de cada basta
  const all = [...ytt.matchAll(/<p t="\d+" d="\d+" wp="(\d+)" ws="(\d+)"/g)].map((m) => JSON.stringify([...wp[m[1]], ws[m[2]]]));
  return [...new Set(all)].map((x) => JSON.parse(x));
}

test('desligada: igual ao original (âncora no centro, colada na borda)', async () => {
  assert.deepEqual(await windows(false), [[7, 1, 2], [7, 98, 2], [7, 50, 2]]);
});

test('ligada: âncora vai para o lado da borda, justificação continua centralizada', async () => {
  const [left, right, middle] = await windows(true);
  assert.deepEqual(left, [6, 0, 2]); // embaixo à esquerda, ah 0: limite de largura 98% em vez de 1,9%
  assert.deepEqual(right, [8, 100, 2]); // embaixo à direita, ah 100
  assert.deepEqual(middle, [7, 50, 2]); // longe das bordas: não muda
});
