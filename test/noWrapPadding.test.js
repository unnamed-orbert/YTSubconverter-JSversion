import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDocument, convertDocument } from '../src/convert.js';
import { YttDocument } from '../src/formats/ytt.js';

const ASS = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: 2,Arial,60,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,5,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:02.00,2,,0,0,0,,{\\pos(1880,540)}첫 소절 Verse
Dialogue: 0,0:00:03.00,0:00:04.00,2,,0,0,0,,{\\fad(0,200)\\move(1900,540,960,540,0,400)}Aproxima
`;

async function ytt(noWrapPadding) {
  return convertDocument(await loadDocument('x.ass', ASS), '.ytt', { noWrapPadding }).save();
}
const bodyText = (y) => [...y.matchAll(/<p [^>]*>(.*?)<\/p>/g)].map((m) => m[1].replace(/<[^>]+>/g, '')).join('\n');

test('desligada: preenchimento igual ao original (zwsp + espaço)', async () => {
  const text = bodyText(await ytt(false));
  assert.ok(text.includes('​ ​'));
  assert.ok(!text.includes('⁠'));
});

test('ligada: o preenchimento não tem nenhum ponto de quebra de linha', async () => {
  const y = await ytt(true);
  for (const p of bodyText(y).split('\n')) {
    assert.ok(!p.includes('​'), 'sem zwsp');
    // só o espaço entre as palavras do próprio texto pode quebrar
    const semTexto = p.replace('첫 소절 Verse', '').replace('Aproxima', '');
    assert.ok(!/ /.test(semTexto), `espaço comum no preenchimento: ${JSON.stringify(semTexto)}`);
  }
});

test('ligada: ler o .ytt de volta devolve o texto limpo', async () => {
  const doc = YttDocument.parse(await ytt(true));
  const texts = new Set(doc.lines.map((l) => l.sections.map((s) => s.text).join('')));
  assert.ok(texts.has('첫 소절 Verse'));
  assert.ok(texts.has('Aproxima'));
});
