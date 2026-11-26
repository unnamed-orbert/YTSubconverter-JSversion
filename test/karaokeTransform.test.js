import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDocument, convertDocument } from '../src/convert.js';
import { YttDocument } from '../src/formats/ytt.js';
import { recoverTags } from '../src/recover/recoverTags.js';

// \k × \t (destaque × transição), \kf/\K/\ko e Layer
const HEAD = `[Script Info]
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 720

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Branco,Roboto,38,&H00FFFFFF,&H00FF0000,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,25,25,15,1
Style: Sumido,Roboto,38,&H00FFFFFF,&HFF000000,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,25,25,15,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

async function toYtt(events, tagHierarchy = true) {
  const doc = await loadDocument('x.ass', HEAD + events, { tagHierarchy });
  return convertDocument(doc, '.ytt', { tagHierarchy }).save();
}

/** Trecho com o texto `text` na tela no instante t (primeira camada que tiver). */
function sectionAt(ytt, t, text) {
  for (const l of YttDocument.parse(ytt).lines.filter((l) => l.start <= t && l.end > t)) {
    const s = l.sections.find((s) => s.text.includes(text));
    if (s) return s;
  }
  return null;
}

test('\\kf e \\K contam como sílabas (o C# ignorava e a linha perdia o tempo)', async () => {
  for (const tag of ['kf', 'K']) {
    const ytt = await toYtt(`Dialogue: 0,0:00:01.00,0:00:04.00,Branco,,0,0,0,,{\\k50}Um{\\${tag}100}Dois{\\k50}Tres\n`);
    // \2c azul (#0000FF) antes de cantar, \1c branco depois
    assert.equal(sectionAt(ytt, 1200, 'Dois').foreColor.b, 255);
    assert.ok(sectionAt(ytt, 1200, 'Dois').foreColor.r < 50, `${tag}: Dois ainda não cantado em 1,2 s`);
    assert.ok(sectionAt(ytt, 1200, 'Um').foreColor.r > 200, `${tag}: Um já cantado`);
    // \kf enche aos poucos: no meio da sílaba a cor está entre o azul e o branco
    const middle = sectionAt(ytt, 2000, 'Dois').foreColor.r;
    assert.ok(middle > 60 && middle < 220, `${tag}: no meio do \\kf r=${middle}`);
    assert.ok(sectionAt(ytt, 2600, 'Tres').foreColor.r > 200, `${tag}: Tres cantado em 2,6 s`);
  }
});

test('\\ko: a sílaba ainda não cantada fica sem contorno', async () => {
  const ytt = await toYtt('Dialogue: 0,0:00:01.00,0:00:04.00,Branco,,0,0,0,,{\\ko50}Um{\\ko100}Dois\n');
  assert.equal(sectionAt(ytt, 1200, 'Dois').shadowColors.size, 0);
  assert.ok(sectionAt(ytt, 1200, 'Um').shadowColors.size > 0);
  assert.ok(sectionAt(ytt, 2000, 'Dois').shadowColors.size > 0);
});

test('\\k com \\ytkt(Fade) e \\t de cor no mesmo trecho: a troca do karaokê vai até a cor do \\t', async () => {
  // "Dois" começa a ser cantado em 1,5 s (troca de 500 ms) enquanto um \t o deixa vermelho de 0 a 1 s
  const line = 'Dialogue: 0,0:00:01.00,0:00:04.00,Sumido,,0,0,0,,{\\ytkt(Fade)\\k50}Um{\\k50\\t(0,1000,\\c&H0000FF&)}Dois\n';
  // No C# a troca ia até o branco fixo do \1c e apagava o \t (a sílaba terminava branca); agora vai até o vermelho
  const ytt = await toYtt(line, false);
  assert.ok(sectionAt(ytt, 1900, 'Dois').foreColor.g < 60);
  const end = sectionAt(ytt, 3000, 'Dois').foreColor;
  assert.deepEqual([end.r, end.g, end.b], [255, 0, 0]);
});

test('Layer: a linha de Layer maior fica por cima mesmo começando antes', async () => {
  const events =
    'Dialogue: 1,0:00:01.00,0:00:05.00,Branco,,0,0,0,,{\\pos(640,360)}Cima\n' +
    'Dialogue: 0,0:00:02.00,0:00:04.00,Branco,,0,0,0,,{\\pos(640,360)}Baixo\n';
  const ytt = await toYtt(events);
  const order = YttDocument.parse(ytt).lines.filter((l) => l.start <= 2500 && l.end > 2500).map((l) => l.text.replace(/[​\s]/g, ''));
  assert.ok(order.indexOf('Baixo') < order.lastIndexOf('Cima'), order.join(','));
});

test('recuperação: karaokê seguido de \\t da linha vira \\k + \\t, não um \\t por letra', async () => {
  const line = 'Dialogue: 0,0:00:01.00,0:00:05.00,Branco,,0,0,0,,{\\t(2500,2700,\\c&H00FF00&)\\k40}Pri{\\k40}mei{\\k40}ra\n';
  const result = recoverTags(await toYtt(line));
  const ass = result.ass.split('\n').filter((l) => l.startsWith('Dialogue:')).join('\n');
  assert.match(ass, /\\k\d+/);
  assert.match(ass, /\\t\(/);
  assert.ok((ass.match(/\\t\(/g) ?? []).length <= 3, ass);
});
