import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDocument, convertDocument } from '../src/convert.js';
import { YttDocument } from '../src/formats/ytt.js';

// Hierarquia de tags (docs/hierarquia-de-tags.md): fade + karaokê + sombras.
const STYLES = `[Script Info]
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 720

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Preto,Roboto,38,&H00FFFFFF,&HFF000000,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,25,25,15,1
Style: Rosa,Roboto,38,&H00FFFFFF,&HFF000000,&H007545CF,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,25,25,15,1
Style: YTGlowSoftShadow,Roboto,38,&H00FFFFFF,&HFF000000,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,2,2,25,25,15,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

const pens = (ytt) => [...ytt.matchAll(/<pen [^>]*>/g)].map((m) => m[0]);
const fo = (pen) => Number(/fo="(\d+)"/.exec(pen)[1]);
async function convert(events, tagHierarchy, options = {}) {
  const doc = await loadDocument('x.ass', STYLES + events, { tagHierarchy });
  return convertDocument(doc, '.ytt', { ...options, tagHierarchy }).save();
}

/** Camadas (<p>) na tela no instante t, com os trechos que têm texto. */
function layersAt(ytt, t) {
  return YttDocument.parse(ytt)
    .lines.filter((l) => l.start <= t && l.end > t)
    .map((l) => l.sections.filter((s) => s.text.replace(/[​\s]/g, '').length > 0));
}

const FADE_OUT = 'Dialogue: 0,0:00:00.00,0:00:03.00,Preto,,0,0,0,,{\\fad(0,2000)}Preto\n';

test('desligada: igual ao original (contorno preto com "ec", opaco, até o fim do fade)', async () => {
  const faint = pens(await convert(FADE_OUT, false)).filter((p) => fo(p) > 0 && fo(p) < 200);
  assert.ok(faint.length > 2);
  assert.ok(faint.every((p) => /ec="#000000"/.test(p)));
});

test('\\fad: contorno escuro vira a sombra automática e some junto com o texto', async () => {
  const faint = pens(await convert(FADE_OUT, true)).filter((p) => fo(p) > 0 && fo(p) < 254);
  assert.ok(faint.length > 2);
  for (const p of faint) {
    assert.ok(/et="3"/.test(p), p);
    assert.ok(!/ec=/.test(p), p);
  }
});

test('\\fad com contorno colorido: mantém a cor acima do corte e acompanha o texto abaixo', async () => {
  const all = pens(await convert('Dialogue: 0,0:00:05.00,0:00:08.00,Rosa,,0,0,0,,{\\fad(0,2000)}Rosa\n', true));
  const limit = 0.45 * 255;
  const above = all.filter((p) => fo(p) >= limit && fo(p) < 254);
  const below = all.filter((p) => fo(p) > 0 && fo(p) < limit);
  assert.ok(above.length > 2 && below.length > 2);
  for (const p of above) assert.ok(p.includes('ec="#CF4575"'), p);
  for (const p of below) assert.ok(/et="3"/.test(p) && !/ec=/.test(p), p);
});

test('\\ytkt(Fade) com \\2c transparente: a sombra da sílaba aparece junto com o texto', async () => {
  const line = 'Dialogue: 0,0:00:01.00,0:00:04.00,Preto,,0,0,0,,{\\ytkt(Fade)\\k50}Pri{\\k50}mei{\\k50}ra\n';
  // Logo depois do começo da sílaba "mei" (1,5 s): o texto dela ainda está quase transparente
  const at = (ytt) => layersAt(ytt, 1540).flat().find((s) => s.text.includes('mei'));

  const original = at(await convert(line, false));
  assert.ok(original.foreColor.a < 128);
  assert.equal([...original.shadowColors.values()][0].a, 254, 'no original o contorno já nasce opaco');

  const hierarchy = at(await convert(line, true));
  assert.ok(hierarchy.foreColor.a < 128);
  const shadow = [...hierarchy.shadowColors.values()][0];
  assert.equal(shadow.toArgb() & 0xffffff, 0x222222);
  assert.equal(shadow.a, hierarchy.foreColor.a, 'o contorno acompanha a opacidade do texto');
});

test('várias sombras: as cópias do .ytt não somam a opacidade do texto', async () => {
  const ytt = await convert('Dialogue: 0,0:00:00.00,0:00:03.00,YTGlowSoftShadow,,0,0,0,,{\\fad(0,2000)}Duas\n', true);
  const layers = layersAt(ytt, 2000);
  assert.equal(layers.length, 2);
  const alphas = layers.map((l) => l[0].foreColor.a / 255);
  const combined = 1 - alphas.reduce((acc, a) => acc * (1 - a), 1);

  const single = layersAt(await convert('Dialogue: 0,0:00:00.00,0:00:03.00,Preto,,0,0,0,,{\\fad(0,2000)}Uma\n', true), 2000);
  const target = single[0][0].foreColor.a / 255;
  assert.ok(Math.abs(combined - target) < 0.02, `${combined} vs ${target}`);
});
