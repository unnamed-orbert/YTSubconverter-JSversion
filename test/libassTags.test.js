import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadAssDocument } from '../src/formats/ass/index.js';
import { YttDocument } from '../src/formats/ytt.js';

// Tags que o libass (Aegisub) mostra e que o conversor quebrava (caso real: legenda do "Amor Doce").
const HEADER = `[Script Info]
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 720

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: D,Arial,60,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1
Style: Caixa,Arial,50,&H00FFFFFF,&H00FFFFFF,&H00FF0000,&H00000000,0,0,0,0,100,100,0,0,3,1,0,2,7,7,7,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

/** As linhas do .ytt gerado (lidas de volta), com a hierarquia de tags ligada ou não. */
function convert(events, { tagHierarchy = true } = {}) {
  const doc = loadAssDocument(HEADER + events.map((e) => `Dialogue: 0,${e}\n`).join(''), { tagHierarchy });
  return YttDocument.parse(new YttDocument(doc, { tagHierarchy }).save()).lines;
}

/** A primeira seção com texto visível (o .ytt tem trechos invisíveis de preenchimento). */
const textSection = (line) => line.sections.find((s) => s.text.trim().replace(/​/g, '') !== '');
/** O .ytt guarda no máximo 254 de opacidade e cores como #FEFEFE: compara com folga. */
const near = (color, [r, g, b]) => Math.abs(color.r - r) <= 3 && Math.abs(color.g - g) <= 3 && Math.abs(color.b - b) <= 3;
const at = (lines, ms) => lines.find((l) => l.start <= ms && l.end > ms);

test('\\move(x1,y1,x2,y2,0,0) anda durante a linha inteira, como no libass', () => {
  const lines = convert(['0:00:00.00,0:00:02.00,D,,0,0,0,,{\\move(100,100,1100,600,0,0)}a']);
  assert.ok(lines.length > 10, 'precisa gerar quadros do movimento');
  const xs = lines.map((l) => l.position.x);
  assert.ok(xs[xs.length - 1] - xs[0] > 50, `a linha não andou: ${xs[0]} -> ${xs[xs.length - 1]}`);
  for (let i = 1; i < xs.length; i++) assert.ok(xs[i] >= xs[i - 1]);
});

test('vale o primeiro \\pos ou \\move da linha', () => {
  const posFirst = convert(['0:00:00.00,0:00:02.00,D,,0,0,0,,{\\pos(100,360)\\move(1100,100,1100,600)}a']);
  assert.equal(posFirst.filter((l) => textSection(l)).length, 1, '\\pos antes do \\move: linha parada');
  const moveFirst = convert(['0:00:00.00,0:00:02.00,D,,0,0,0,,{\\move(100,100,1100,600)\\pos(100,360)}a']);
  assert.ok(moveFirst.length > 10, '\\move antes do \\pos: a linha anda');
});

test('\\c depois de \\t(\\alpha) não apaga o fade da letra', () => {
  const lines = convert(['0:00:00.00,0:00:02.00,D,,0,0,0,,{\\alpha&HFF&\\t(0,500,\\alpha&H00&)\\c&H0000FF&}a']);
  const end = textSection(at(lines, 1500)).foreColor;
  assert.ok(end.a >= 254, 'a letra precisa aparecer');
  assert.ok(near(end, [255, 0, 0]), `${end}`);
  assert.ok(textSection(at(lines, 100)).foreColor.a < 128, 'e começar transparente');
  // Sem a hierarquia de tags fica como no C#: a letra nunca aparece.
  const original = convert(['0:00:00.00,0:00:02.00,D,,0,0,0,,{\\alpha&HFF&\\t(0,500,\\alpha&H00&)\\c&H0000FF&}a'], { tagHierarchy: false });
  assert.ok(original.every((l) => !textSection(l) || textSection(l).foreColor.a === 0));
});

test('\\alpha depois de \\t(\\c) não apaga a troca de cor', () => {
  const lines = convert(['0:00:00.00,0:00:02.00,D,,0,0,0,,{\\t(0,1000,\\c&H0000FF&)\\alpha&H00&}a']);
  const start = textSection(at(lines, 10)).foreColor;
  const end = textSection(at(lines, 1500)).foreColor;
  assert.ok(start.g > 200 && start.b > 200, `começa branca: ${start}`);
  assert.ok(near(end, [255, 0, 0]), `${end}`);
});

test('caixa: \\t(\\3c) da linha inteira e \\t(\\alpha) de cada letra correm juntos', () => {
  // Como no "Armin, tudo pra você...": a cor da caixa muda e as letras aparecem uma por uma.
  const text = '{\\t(\\3c&H0000FF&)}{\\alpha&HFF&\\t(0,40,\\alpha&H00&)}A{\\alpha&HFF&\\t(400,440,\\alpha&H00&)}B';
  const lines = convert([`0:00:00.00,0:00:04.00,Caixa,,0,0,0,,${text}`]);
  const box = (ms) => textSection(at(lines, ms)).backColor;
  assert.ok(box(1000).a >= 254, 'a caixa continua visível');
  assert.ok(box(3900).r > 200 && box(3900).b < 60, `a caixa fica vermelha no fim: ${box(3900)}`);
  assert.ok(box(200).b > box(3900).b, 'e começa azul');
  const b = (ms) => at(lines, ms).sections.find((s) => s.text.includes('B')).foreColor.a;
  assert.ok(b(200) < 128, 'B ainda invisível em 200 ms');
  assert.ok(b(1000) >= 254);
});
