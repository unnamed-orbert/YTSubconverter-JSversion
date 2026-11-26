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

const mixOf = (pen) => /ec="#([0-9A-F]{6})"/.exec(pen)?.[1];

test('\\fad: o contorno vai até a cor do texto e sai abaixo de 40%', async () => {
  const all = pens(await convert('Dialogue: 0,0:00:05.00,0:00:08.00,Rosa,,0,0,0,,{\\fad(0,2000)}Rosa\n', true));
  const limit = 0.4 * 255;
  const above = all.filter((p) => fo(p) >= limit && fo(p) < 250);
  const below = all.filter((p) => fo(p) > 0 && fo(p) < limit);
  assert.ok(above.length > 2 && below.length > 2);
  // Acima do corte: "ec" opaco com uma cor entre o rosa do contorno (#CF4575) e o branco do texto (#FEFEFE)
  for (const p of above) {
    const ec = mixOf(p);
    assert.ok(ec, p);
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(ec.slice(i, i + 2), 16));
    assert.ok(r >= 0xcf && g >= 0x45 && b >= 0x75, p);
  }
  // Quanto mais transparente o texto, mais perto do branco
  const sorted = above.sort((x, y) => fo(y) - fo(x)).map((p) => parseInt(mixOf(p).slice(2, 4), 16));
  assert.ok(sorted[sorted.length - 1] > sorted[0]);
  // Abaixo do corte: sem contorno, só o texto sumindo
  for (const p of below) assert.ok(!/et=/.test(p), p);
});

test('fadeShadowCutoff muda o corte da hierarquia', async () => {
  const all = pens(await convert(FADE_OUT, true, { fadeShadowCutoff: 60 }));
  const faint = all.filter((p) => fo(p) > 0 && fo(p) < 0.6 * 255);
  assert.ok(faint.length > 2);
  for (const p of faint) assert.ok(!/et=/.test(p), p);
});

test('\\ytkt(Fade) com \\2c transparente: a sílaba não nasce como um contorno opaco', async () => {
  const line = 'Dialogue: 0,0:00:01.00,0:00:04.00,Preto,,0,0,0,,{\\ytkt(Fade)\\k50}Pri{\\k50}mei{\\k50}ra\n';
  // Logo depois do começo da sílaba "mei" (1,5 s): o texto dela ainda está quase transparente
  const at = (ytt) => layersAt(ytt, 1540).flat().find((s) => s.text.includes('mei'));

  const original = at(await convert(line, false));
  assert.ok(original.foreColor.a < 100);
  assert.equal([...original.shadowColors.values()][0].a, 254, 'no original o contorno já nasce opaco');

  const hierarchy = at(await convert(line, true));
  assert.ok(hierarchy.foreColor.a < 100);
  assert.equal(hierarchy.shadowColors.size, 0, 'abaixo do corte a sílaba entra só com o texto');
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

test('\\fade com 2 valores funciona como \\fad (libass), também com karaokê', async () => {
  const line = (tag) => `Dialogue: 0,0:00:00.00,0:00:03.00,Preto,,0,0,0,,{${tag}}{\\k50}Ka{\\k50}ra{\\k50}o{\\k50}kê\n`;
  const fade = await convert(line('\\fade(300,300)'), true);
  const fad = await convert(line('\\fad(300,300)'), true);
  assert.equal(fade, fad);
  assert.ok(pens(fade).some((p) => fo(p) > 0 && fo(p) < 200), 'tem quadros do fade');
});

test('no fade só o contorno vai para a cor do texto; a sombra deslocada não vira um borrão claro', async () => {
  const ytt = await convert('Dialogue: 0,0:00:00.00,0:00:03.00,YTGlowSoftShadow,,0,0,0,,{\\fad(0,2000)}Duas\n', true);
  const fading = pens(ytt).filter((p) => /et=/.test(p) && fo(p) < 200);
  const soft = fading.filter((p) => /et="4"/.test(p));
  const glow = fading.filter((p) => /et="3"/.test(p));
  assert.ok(soft.length > 2 && glow.length > 2);
  // Sombra suave preta: sombra automática (#222222, sem "ec"), nunca clara
  for (const p of soft) assert.ok(!/ec=/.test(p), p);
  // Contorno: "ec" clareando na direção do texto branco
  assert.ok(glow.some((p) => /ec="#(?!000000)[0-9A-F]{6}"/.test(p)));
});
