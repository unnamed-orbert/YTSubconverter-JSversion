import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDocument, convertDocument } from '../src/convert.js';

const ASS = `[Script Info]
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 720

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Preto,Roboto,38,&H00FFFFFF,&HFF000000,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,25,25,15,1
Style: Rosa,Roboto,38,&H00FFFFFF,&HFF000000,&H007545CF,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,25,25,15,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:03.00,Preto,,0,0,0,,{\\fad(0,2000)}Preto
Dialogue: 0,0:00:05.00,0:00:08.00,Rosa,,0,0,0,,{\\fad(0,2000)}Rosa
`;

const pens = (ytt) => [...ytt.matchAll(/<pen [^>]*>/g)].map((m) => m[0]);
const fo = (pen) => Number(/fo="(\d+)"/.exec(pen)[1]);
const convert = async (options) => convertDocument(await loadDocument('x.ass', ASS), '.ytt', options).save();

test('sem a opção, igual ao original: contorno com "ec" (opaco) até o fim do fade', async () => {
  const faint = pens(await convert()).filter((p) => fo(p) > 0 && fo(p) < 100);
  assert.ok(faint.length > 2);
  assert.ok(faint.every((p) => /et="3"/.test(p) && /ec="/.test(p)));
});

test('com fadeShadowCutoff 45, contorno some abaixo de 45% e fica acima', async () => {
  const all = pens(await convert({ fadeShadowCutoff: 45 }));
  const limit = 0.45 * 255;
  const below = all.filter((p) => fo(p) > 0 && fo(p) < limit);
  const above = all.filter((p) => fo(p) >= limit);
  assert.ok(below.length > 2 && above.length > 2);
  for (const p of below) assert.ok(!/et=/.test(p), p);
  for (const p of above) assert.ok(/et="3"/.test(p), p);
  // Vale para qualquer cor de contorno
  assert.ok(above.some((p) => p.includes('ec="#CF4575"')) && above.some((p) => p.includes('ec="#000000"')));
});
