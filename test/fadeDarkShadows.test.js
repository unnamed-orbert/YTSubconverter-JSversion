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
const convert = async (options) => convertDocument(await loadDocument('x.ass', ASS), '.ytt', options).save();

test('sem a opção, igual ao original: contorno preto com "ec" (opaco) durante o fade', async () => {
  const ytt = await convert();
  const fading = pens(ytt).filter((p) => /et="3"/.test(p) && !/fo="254"/.test(p));
  assert.ok(fading.length > 5);
  assert.ok(fading.some((p) => p.includes('ec="#000000"')));
});

test('com fadeDarkShadows, contorno preto vira #222222 sem "ec" (acompanha o fo) nos passos do fade', async () => {
  const ytt = await convert({ fadeDarkShadows: true });
  const all = pens(ytt);
  const fadingBlack = all.filter((p) => /et="3"/.test(p) && !/fo="254"/.test(p) && !p.includes('ec="#CF4575"'));
  assert.ok(fadingBlack.length > 5);
  for (const p of fadingBlack) assert.ok(!p.includes('ec='), p);
  // Texto opaco mantém o contorno preto
  assert.ok(all.some((p) => /fo="254"/.test(p) && p.includes('ec="#000000"')));
  // Contorno colorido não muda: o YouTube não tem como deixá-lo transparente
  assert.ok(all.filter((p) => !/fo="254"/.test(p)).some((p) => p.includes('ec="#CF4575"')));
});
