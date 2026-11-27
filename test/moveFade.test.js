import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDocument, convertDocument } from '../src/convert.js';

// \move + \fad: a letra precisa terminar no destino do \move e ficar lá durante o fade de saída.
const HEADER = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: 2,Arial,60,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,5,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

/** [início, ah, fo] de cada <p>. */
async function frames(text) {
  const doc = await loadDocument('x.ass', `${HEADER}Dialogue: 0,0:00:25.80,0:00:26.43,2,,0,0,0,Split,${text}\n`);
  const ytt = convertDocument(doc, '.ytt').save();
  const ah = Object.fromEntries([...ytt.matchAll(/<wp id="(\d+)" ap="\d+" ah="(\d+)"/g)].map((m) => [m[1], Number(m[2])]));
  const fo = Object.fromEntries([...ytt.matchAll(/<pen id="(\d+)"[^>]*fo="(\d+)"/g)].map((m) => [m[1], Number(m[2])]));
  return [...ytt.matchAll(/<p t="(\d+)" d="\d+" wp="(\d+)"[^>]*>(.*?)<\/p>/g)].map((m) => [
    Number(m[1]),
    ah[m[2]],
    Math.max(...[...m[3].matchAll(/p="(\d+)"/g)].map((p) => fo[p[1]])),
  ]);
}

const DESTINO = 56; // 1068.9 px em 1920 -> ah 56

test('linha do Aegisub (\\fad + \\move + \\pos): o fade acontece no destino, sem voltar ao início', async () => {
  const f = await frames('{\\fad(0,200)\\move(1210.619,1060.0,1068.9,1060.0,0,191)}{\\pos(1068.9,1060.0)}a');
  assert.equal(f[0][1], 63);
  const fading = f.filter(([, , o]) => o < 254);
  assert.ok(fading.length >= 3);
  for (const [, ah] of fading) assert.equal(ah, DESTINO);
});

test('\\move que termina exatamente quando o fade de saída começa chega ao destino', async () => {
  // Antes (e no C#): o fade herdava a posição do último quadro do \move (ah 58) e a letra nunca chegava.
  const f = await frames('{\\fad(0,200)\\move(1400,1060,1068.9,1060,0,430)}a');
  const fading = f.filter(([, , o]) => o < 254);
  assert.ok(fading.length >= 3);
  for (const [, ah] of fading) assert.equal(ah, DESTINO);
  // posição nunca volta para trás
  for (let i = 1; i < f.length; i++) assert.ok(f[i][1] <= f[i - 1][1]);
});
