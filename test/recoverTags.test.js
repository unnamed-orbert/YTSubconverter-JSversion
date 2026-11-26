// Recuperação de tags (.ytt -> .ass): converte um .ass com cada efeito para .ytt com o próprio port e
// confere se a heurística acha a tag de volta (com tempos/posições aproximados).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDocument, convertDocument } from '../src/convert.js';
import { recoverTags } from '../src/recover/recoverTags.js';

const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 720

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: YTGlow,Roboto,38,&H00FFFFFF,&H00808080,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,25,25,15,1
Style: YTPlain,Roboto,38,&H00FFFFFF,&HFF000000,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,2,25,25,15,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

async function roundTrip(...dialogues) {
  const ass = header + dialogues.map((d) => `Dialogue: 0,${d}`).join('\n') + '\n';
  const ytt = convertDocument(await loadDocument('x.ass', ass), '.ytt').save();
  return recoverTags(ytt);
}

const only = (result) => {
  assert.equal(result.events.length, 1, result.ass);
  return result.events[0];
};
const tagOf = (event, name) => event.tags.find((t) => t.tag === name);
const numbers = (text) => text.match(/-?\d+/g).map(Number);
const near = (actual, expected, tolerance, what) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${what}: ${actual} (esperado ${expected} ± ${tolerance})`);

test('\\fad: os quadros do fade viram uma linha com \\fad', async () => {
  const e = only(await roundTrip('0:00:01.00,0:00:05.00,YTGlow,,0,0,0,,{\\an5\\pos(640,360)\\fad(500,1000)}Olá'));
  const [fadeIn, fadeOut] = numbers(tagOf(e, 'fad').text);
  near(fadeIn, 500, 70, 'fade-in');
  near(fadeOut, 1000, 70, 'fade-out');
  assert.equal(e.text, 'Olá');
  // (640,360) é a posição padrão do \an5: não precisa de \pos
  assert.match(e.assText, /^\{\\an5\\fad/);
  assert.ok(e.frames > 10);
});

test('\\move com tempos', async () => {
  const e = only(await roundTrip('0:00:01.00,0:00:07.00,YTGlow,,0,0,0,,{\\an5\\move(200,300,1000,300,1000,4000)}Andando'));
  const [x1, y1, x2, y2, t1, t2] = numbers(tagOf(e, 'move').text);
  near(x1, 200, 13, 'x1');
  near(y1, 300, 7, 'y1');
  near(x2, 1000, 13, 'x2');
  near(y2, 300, 7, 'y2');
  near(t1, 1000, 100, 't1');
  near(t2, 4000, 100, 't2');
});

test('\\k: sílabas que mudam de cor em sequência', async () => {
  const e = only(await roundTrip('0:00:01.00,0:00:05.00,YTGlow,,0,0,0,,{\\an5\\pos(640,360)\\2c&H808080&}{\\k50}ca{\\k50}ra{\\k50}o{\\k50}kê'));
  assert.ok(tagOf(e, 'k'), e.assText);
  assert.match(e.assText, /\{[^}]*\\k50\}ca\{\\k50\}ra\{\\k50\}o\{\\k50\}kê/);
  assert.equal(e.style.startsWith('YTGlow'), true);
});

test('\\t: cor mudando aos poucos', async () => {
  const e = only(await roundTrip('0:00:00.00,0:00:06.00,YTGlow,,0,0,0,,{\\an5\\pos(640,360)\\t(1000,3000,\\c&H0000FF&)}Muda'));
  const t = tagOf(e, 't');
  assert.ok(t, e.assText);
  const [t1, t2] = numbers(t.text);
  near(t1, 1000, 100, 't1');
  near(t2, 3000, 150, 't2');
  assert.match(t.text, /\\c&H0000FE&|\\c&H0000FF&|\\c&H0101FE&/);
});

test('\\ytshake: posição pulando em volta de um ponto', async () => {
  const e = only(await roundTrip('0:00:01.00,0:00:04.00,YTGlow,,0,0,0,,{\\an5\\pos(640,360)\\ytshake(30,0)}Treme'));
  const [rx, ry] = numbers(tagOf(e, 'ytshake').text);
  near(rx, 30, 13, 'raio x');
  assert.equal(ry, 0);
});

test('\\ytchroma: as cópias coloridas somem e viram a tag', async () => {
  const e = only(await roundTrip('0:00:01.00,0:00:05.00,YTPlain,,0,0,0,,{\\an5\\pos(640,360)\\ytchroma}Cromático'));
  assert.equal(tagOf(e, 'ytchroma').text, '\\ytchroma');
  near(e.start, 1000, 40, 'início (com a entrada das cópias)');
  near(e.end, 5000, 40, 'fim (com a saída das cópias)');
});

test('várias sombras: as camadas viram um estilo só, com StyleOptions', async () => {
  const ass = header.replace(
    'Style: YTPlain',
    'Style: Multi,Roboto,38,&H00FFFFFF,&HFF000000,&H000000FF,&H00FF0000,1,0,0,0,100,100,0,0,1,2,4,2,25,25,15,1\nStyle: YTPlain',
  );
  const options = (await import('../src/formats/ass/index.js')).loadStyleOptions(
    '<StyleOptions><Style><Name>Multi</Name><ShadowType>Glow SoftShadow HardShadow</ShadowType></Style></StyleOptions>',
  );
  const doc = await loadDocument('x.ass', ass + 'Dialogue: 0,0:00:01.00,0:00:03.00,Multi,,0,0,0,,{\\an5\\pos(640,360)}Sombras\n', { styleOptions: options });
  const result = recoverTags(convertDocument(doc, '.ytt').save());
  const e = only(result);
  assert.equal(e.style, 'YTGlowSoftShadowHardShadow');
  assert.match(result.styleOptionsXml, /<Name>YTGlowSoftShadowHardShadow<\/Name>\s*<ShadowType>Glow SoftShadow HardShadow<\/ShadowType>/);

  // O .ass recuperado volta para .ytt com as três sombras (o nome do estilo diz os tipos)
  const back = convertDocument(await loadDocument('r.ass', result.ass), '.ytt').save();
  assert.equal((back.match(/<p /g) ?? []).length >= 3, true);
  for (const et of ['et="1"', 'et="3"', 'et="4"']) assert.ok(back.includes(et), et);
});

test('linhas já lidas: sourceLines apontam para elas (usado pela tabela de debug)', async () => {
  const ass = header + 'Dialogue: 0,0:00:01.00,0:00:03.00,YTGlow,,0,0,0,,{\\an5\\pos(640,360)\\fad(300,300)}Oi\n';
  const ytt = convertDocument(await loadDocument('x.ass', ass), '.ytt').save();
  const { YttDocument } = await import('../src/formats/ytt.js');
  const lines = YttDocument.parse(ytt).lines;
  const e = only(recoverTags({ lines }));
  assert.ok(e.sourceLines.length > 2);
  assert.ok(e.sourceLines.every((i) => lines[i].text === 'Oi'));
});

const karaokeLine = (type) =>
  `0:00:01.00,0:00:05.00,YTGlow,,0,0,0,,{\\an4\\pos(60,360)${type}\\2a&HFF&}{\\k100}ca{\\k100}ra{\\k100}o{\\k100}kê`;

test('\\ytkt(Glitch): o caractere aleatório some e a linha fica inteira', async () => {
  const e = only(await roundTrip(karaokeLine('\\ytkt(Glitch)')));
  assert.equal(e.text, 'caraokê');
  assert.equal(tagOf(e, 'ytkt').text, '\\ytkt(Glitch)');
  assert.match(e.assText, /\\k100\}ca\{\\k100\}ra\{\\k100\}o\{\\k100\}kê/);
});

test('\\ytkt(Cursor,...): cursor depois do que já foi cantado, com cores e intervalo', async () => {
  const e = only(await roundTrip(karaokeLine('\\ytkt(Cursor,300,\\c&H00FFFF&,_,\\c&H0080FF&,|)')));
  assert.equal(e.text, 'caraokê');
  assert.equal(tagOf(e, 'ytkt').text, '\\ytkt(Cursor,300,\\c&H00FFFF&,_,\\c&H0080FF&,|)');
});

test('\\ytkt(LCursor): cursor antes da sílaba cantada, forma simples', async () => {
  const e = only(await roundTrip(karaokeLine('\\ytktLCursor')));
  assert.equal(e.text, 'caraokê');
  assert.equal(tagOf(e, 'ytkt').text, '\\ytktLCursor');
});

test('texto que cresce (máquina de escrever) não vira cursor nem glitch', async () => {
  const result = await roundTrip(
    '0:00:01.00,0:00:01.50,YTGlow,,0,0,0,,{\\an5\\pos(640,360)}O cas',
    '0:00:01.50,0:00:02.00,YTGlow,,0,0,0,,{\\an5\\pos(640,360)}O caste',
    '0:00:02.00,0:00:03.00,YTGlow,,0,0,0,,{\\an5\\pos(640,360)}O castelo',
  );
  assert.deepEqual(result.events.map((e) => e.text), ['O cas', 'O caste', 'O castelo']);
  assert.ok(result.events.every((e) => !tagOf(e, 'ytkt')));
});
