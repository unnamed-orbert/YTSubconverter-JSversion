// \ytchroma + \k: o karaokê continua de onde estava enquanto as cópias coloridas entram e saem
// (no C# as cópias e a linha deslocada recomeçam o karaokê do zero).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDocument, convertDocument } from '../src/convert.js';
import { YttDocument } from '../src/formats/ytt.js';

const ass = (tags) => `[Script Info]
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 720

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: YTGlow,Roboto,38,&H003EE1FF,&HFF000000,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,25,25,15,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:03.00,YTGlow,,0,0,0,,{${tags}}{\\k20}Eu {\\k20}sou {\\k20}a {\\k20}len{\\k20}da {\\k20}da {\\k30}mi{\\k30}nha
`;

async function visibleAt(tags, t) {
  const ytt = convertDocument(await loadDocument('k.ass', ass(tags)), '.ytt').save();
  const lines = YttDocument.parse(ytt).lines.filter((l) => l.start <= t && t < l.end);
  assert.ok(lines.length > 0, `nada na tela em ${t} ms`);
  return lines.map((l) => l.sections.filter((s) => s.foreColor.a > 0).map((s) => s.text).join('').trim());
}

test('cópias de saída do \\ytchroma continuam o karaokê', async () => {
  // 2,40 s: já dentro das cópias (saída de 600 ms); a essa altura "mi" já foi cantado
  for (const text of await visibleAt('\\ytchroma(0,600)\\fad(0,300)', 2450)) assert.equal(text, 'Eu sou a lenda da mi');
  for (const text of await visibleAt('\\ytchroma(0,600)\\fad(0,300)', 2800)) assert.equal(text, 'Eu sou a lenda da minha');
});

test('a linha que começa depois das cópias de entrada continua o karaokê', async () => {
  for (const text of await visibleAt('\\ytchroma(400,0)', 1300)) assert.equal(text, 'Eu sou');
  for (const text of await visibleAt('\\ytchroma(400,0)', 1500)) assert.equal(text, 'Eu sou a');
});

test('\\ytkt(Fade) + \\ytchroma + \\fad: as cópias ficam na cor do chroma, com o fade', async () => {
  const tags = '\\ytkt(Fade)\\ytchroma(&H0000FF&,&H00FF00&,&HFF0000&,7F,15,0,400,400)\\fad(300,200)';
  const ytt = convertDocument(await loadDocument('k.ass', ass(tags).replace('&HFF000000', '&H00FFFFFF')), '.ytt').save();
  const lines = YttDocument.parse(ytt).lines;
  const copies = lines.filter((l) => l.start < 1400 || l.start >= 2600);
  assert.ok(copies.length > 0);
  const chroma = new Set(['ff0000', '00ff00', '0000ff']);
  for (const l of copies) {
    for (const s of l.sections) {
      if (s.foreColor.a === 0) continue;
      const rgb = [s.foreColor.r, s.foreColor.g, s.foreColor.b].map((v) => v.toString(16).padStart(2, '0')).join('');
      assert.ok(chroma.has(rgb), `cópia em ${l.start} ms com a cor ${rgb} ("${s.text}")`);
      assert.equal(s.shadowColors.size, 0);
    }
  }
  // O \fad continua valendo: a primeira cópia ainda está quase transparente
  const first = lines.filter((l) => l.start === Math.min(...lines.map((x) => x.start)));
  assert.ok(first.every((l) => l.sections.every((s) => s.foreColor.a < 40)));
});
