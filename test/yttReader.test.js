import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AnchorPoint, HorizontalTextDirection, OffsetType, RubyPart, ShadowType, VerticalTextType } from '../src/enums.js';
import { Line, Section } from '../src/model.js';
import { Color } from '../src/util/color.js';
import { parseXml, XmlNodeType } from '../src/util/xml.js';
import { SubtitleDocument } from '../src/formats/subtitleDocument.js';
import { SrtDocument } from '../src/formats/srt.js';
import { YttDocument } from '../src/formats/ytt.js';
import { loadDocument } from '../src/convert.js';

const filesDir = fileURLToPath(new URL('./files/ass/', import.meta.url));
const ZWSP = '​';

function ytt(head, body) {
  return `<?xml version="1.0" encoding="utf-8"?><timedtext format="3"><head>${head}</head><body>${body}</body></timedtext>`;
}

// ------------------------------------------------------------------ round trip with the original's output

for (const file of readdirSync(filesDir).filter((f) => f.endsWith('.ytt'))) {
  test(`ida e volta: ${file} lido e escrito de novo fica idêntico`, () => {
    const original = readFileSync(filesDir + file);
    const doc = YttDocument.parse(original);
    const resaved = new YttDocument(doc).save({ bom: original[0] === 0xef });
    assert.equal(resaved, original.toString('utf8'));
  });
}

test('ida e volta a partir de um documento em memória', () => {
  const s1 = new Section('Olá ');
  s1.font = 'Roboto';
  s1.foreColor = Color.fromArgb(255, 255, 0, 0);
  s1.backColor = Color.fromArgb(128, 0, 0, 0);
  const s2 = new Section('mundo');
  s2.font = 'Courier New';
  s2.bold = true;
  s2.foreColor = Color.fromArgb(254, 0, 255, 0);
  s2.backColor = Color.fromArgb(128, 0, 0, 0);
  s2.shadowColors.set(ShadowType.Glow, Color.fromArgb(254, 0, 0, 255));
  const line = new Line(1000, 3000, [s1, s2]);
  line.anchorPoint = AnchorPoint.TopLeft;
  const src = new SubtitleDocument();
  src.lines.push(line);

  const doc = YttDocument.parse(new YttDocument(src).save());
  assert.equal(doc.lines.length, 1);
  const [a, b] = doc.lines[0].sections;
  assert.equal(doc.lines[0].start, 1000);
  assert.equal(doc.lines[0].end, 3000);
  assert.equal(doc.lines[0].anchorPoint, AnchorPoint.TopLeft);
  assert.equal(a.text, 'Olá ');
  assert.equal(a.foreColor.toArgb(), Color.fromArgb(254, 255, 0, 0).toArgb());
  assert.equal(b.text, 'mundo');
  assert.equal(b.font, 'Courier New');
  assert.equal(b.bold, true);
  assert.equal(b.shadowColors.get(ShadowType.Glow).toArgb(), Color.fromArgb(254, 0, 0, 255).toArgb());
});

test('.ytt -> .srt pelo loadDocument', async () => {
  const doc = await loadDocument('x.ytt', readFileSync(filesDir + 'BoldItalicUnderline.ytt'));
  assert.ok(doc instanceof YttDocument);
  const srt = new SrtDocument(doc).save();
  assert.match(srt, /^1\r\n00:00:00,000 --> /);
  assert.doesNotMatch(srt, new RegExp(ZWSP));
});

// ------------------------------------------------------------------ attributes and defaults

test('valores padrão quando faltam atributos', () => {
  const doc = YttDocument.parse(ytt('', '<p>Texto</p>'));
  assert.deepEqual(doc.videoDimensions, { width: 1280, height: 720 });
  const [line] = doc.lines;
  assert.equal(line.start, 0);
  assert.equal(line.end, 5000);
  assert.equal(line.anchorPoint, AnchorPoint.BottomCenter);
  assert.equal(line.position, null);
  const [s] = line.sections;
  assert.equal(s.text, 'Texto');
  assert.equal(s.font, 'Roboto');
  assert.equal(s.foreColor.toArgb(), Color.fromArgb(255, 255, 255, 255).toArgb());
  assert.equal(s.backColor.toArgb(), Color.fromArgb(192, 8, 8, 8).toArgb());
});

test('pen sem atributos usa os padrões do YouTube', () => {
  const doc = YttDocument.parse(ytt('<pen id="1" />', '<p p="1">x</p>'));
  const [s] = doc.lines[0].sections;
  assert.equal(s.font, 'Roboto');
  assert.equal(s.scale, 1);
  assert.equal(s.offset, OffsetType.Regular);
  assert.equal(s.foreColor.toArgb(), Color.fromArgb(254, 255, 255, 255).toArgb());
  assert.equal(s.backColor.toArgb(), Color.fromArgb(192, 8, 8, 8).toArgb());
  assert.equal(s.shadowColors.size, 0);
});

test('atributos de pen, posição e estilo de janela', () => {
  const doc = YttDocument.parse(
    ytt(
      '<wp id="1" ap="0" ah="0" av="100" /><ws id="1" pd="3" sd="1" />' +
        '<pen id="1" fs="1" sz="200" of="2" b="1" i="1" u="1" fc="#102030" fo="100" bc="#405060" bo="50" et="1" rb="5" hg="1" />' +
        '<pen id="2" et="3" ec="#FF0000" fo="10" />',
      '<p t="100" d="200" p="1" wp="1" ws="1">a</p><p t="0" d="10" p="2">b</p>',
    ),
  );
  const [l1, l2] = doc.lines;
  assert.equal(l1.start, 100);
  assert.equal(l1.end, 300);
  assert.equal(l1.anchorPoint, AnchorPoint.TopLeft);
  // float32: (2 + 0 * 0.96f) / 100 * 1280
  assert.deepEqual(l1.position, { x: 25.599998474121094, y: 705.6000366210938 });
  assert.equal(l1.horizontalTextDirection, HorizontalTextDirection.RightToLeft);
  assert.equal(l1.verticalTextType, VerticalTextType.Rotated);

  const s = l1.sections[0];
  assert.equal(s.font, 'Courier New');
  assert.equal(s.scale, 1.25);
  assert.equal(s.offset, OffsetType.Superscript);
  assert.deepEqual([s.bold, s.italic, s.underline, s.packed], [true, true, true, true]);
  assert.equal(s.foreColor.toArgb(), Color.fromArgb(100, 0x10, 0x20, 0x30).toArgb());
  assert.equal(s.backColor.toArgb(), Color.fromArgb(50, 0x40, 0x50, 0x60).toArgb());
  assert.equal(s.shadowColors.get(ShadowType.HardShadow).toArgb(), Color.fromArgb(100, 0x22, 0x22, 0x22).toArgb());
  assert.equal(s.rubyPart, RubyPart.TextAfter);

  // "ec" given: the shadow is fully opaque (254)
  assert.equal(l2.sections[0].shadowColors.get(ShadowType.Glow).toArgb(), Color.fromArgb(254, 255, 0, 0).toArgb());
});

test('atributos inválidos ou ids fora da faixa são ignorados', () => {
  const doc = YttDocument.parse(ytt('<pen id="1" b="sim" sz="abc" />', '<p t="x" p="9" wp="-1">a</p><p p="1">b</p>'));
  assert.equal(doc.lines[0].start, 0);
  assert.equal(doc.lines[0].sections[0].foreColor.a, 255); // no pen: default section
  assert.equal(doc.lines[1].sections[0].bold, false);
  assert.equal(doc.lines[1].sections[0].scale, 1);
});

test('ids de âncora, sombra e deslocamento inválidos geram erro, como no original', () => {
  assert.throws(() => YttDocument.parse(ytt('<wp id="1" ap="9" />', '')));
  assert.throws(() => YttDocument.parse(ytt('<pen id="1" et="7" />', '')));
  assert.throws(() => YttDocument.parse(ytt('<pen id="1" of="5" />', '')));
  assert.throws(() => YttDocument.parse(ytt('<pen id="1" fc="red" />', '')));
});

test('t="1" desfaz o ajuste do Android', () => {
  const doc = YttDocument.parse(ytt('', '<p t="1" d="999">a</p>'));
  assert.equal(doc.lines[0].start, 0);
  assert.equal(doc.lines[0].end, 1000);
});

// ------------------------------------------------------------------ undoing the writer's workarounds

test('remove espaços de preenchimento e zero-width spaces, e converte quebras para CRLF', () => {
  const doc = YttDocument.parse(
    ytt('<pen id="1" fc="#A0AAB4" fo="0" bo="0" /><pen id="2" />', `<p><s p="1">${ZWSP}</s>${ZWSP}<s p="2">${ZWSP} ${ZWSP}Linha 1${ZWSP} ${ZWSP}</s><s p="1">\n</s><s p="2">${ZWSP} ${ZWSP}Linha 2${ZWSP} ${ZWSP}</s><s p="1">${ZWSP}</s></p>`),
  );
  const [line] = doc.lines;
  assert.equal(line.text, 'Linha 1\r\nLinha 2');
  assert.equal(line.sections.length, 1);
});

test('karaokê: deslocamentos de 1ms são desfeitos', () => {
  const doc = YttDocument.parse(ytt('<pen id="1" />', '<p><s p="1">a</s><s p="1" t="1">b</s><s p="1" t="500">c</s><s p="1" t="501">d</s></p>'));
  const [line] = doc.lines;
  assert.deepEqual(line.sections.map((s) => [s.text, s.startOffset]), [['ab', 0], ['cd', 500]]);
});

test('cópia clara do texto escuro (ajuste do Android) é descartada', () => {
  const head = '<pen id="1" fc="#102030" fo="254" bo="0" /><pen id="2" fc="#4080FF" fo="0" bo="0" />';
  const doc = YttDocument.parse(ytt(head, '<p t="10" d="100" p="1">Escuro</p><p t="10" d="100" p="2">Escuro</p>'));
  assert.equal(doc.lines.length, 1);
  assert.equal(doc.lines[0].androidDarkTextHackAllowed, true);

  // Without the bright copy, the dark line must not get one when saved again
  const alone = YttDocument.parse(ytt(head, '<p t="10" d="100" p="1">Escuro</p>'));
  assert.equal(alone.lines[0].androidDarkTextHackAllowed, false);
  const different = YttDocument.parse(ytt(head, '<p t="10" d="100" p="1">Escuro</p><p t="10" d="100" p="2">Outro</p>'));
  assert.equal(different.lines.length, 2);
  assert.equal(different.lines[0].androidDarkTextHackAllowed, false);
});

test('nós só de espaço em branco entre seções são ignorados, como no XmlDocument', () => {
  const doc = YttDocument.parse(ytt('<pen id="1" b="1" />', '<p>\n  <s p="1">a</s>\n  <s>b</s>\n</p>'));
  const [line] = doc.lines;
  assert.deepEqual(line.sections.map((s) => [s.text, s.bold]), [['a', true], ['b', false]]);
});

test('arquivo sem head ou com outro elemento raiz', () => {
  assert.equal(YttDocument.parse('<timedtext><body><p>a</p></body></timedtext>').lines.length, 1);
  assert.equal(YttDocument.parse('<outro><body><p>a</p></body></outro>').lines.length, 0);
  assert.equal(YttDocument.parse('<timedtext xmlns="urn:x"><body><p>a</p></body></timedtext>').lines.length, 0);
});

test('aceita BOM e bytes UTF-8', () => {
  const bytes = new TextEncoder().encode('﻿' + ytt('', '<p>ação</p>'));
  assert.equal(YttDocument.parse(bytes).lines[0].text, 'ação');
});

// ------------------------------------------------------------------ XML parser

test('parser XML: entidades, CDATA, comentários e normalização de quebras', () => {
  const root = parseXml('<?xml version="1.0"?><!-- c --><a x=\'1 &amp; 2\' y="a\tb"><b>&lt;&#x41;&#66;&gt;</b>t1<!--z-->t2<![CDATA[<c>]]>\r\nfim</a>');
  assert.equal(root.getAttribute('x'), '1 & 2');
  assert.equal(root.getAttribute('y'), 'a b');
  assert.equal(root.getAttribute('z'), null);
  assert.deepEqual(
    root.childNodes.map((n) => n.nodeType),
    [XmlNodeType.Element, XmlNodeType.Text, XmlNodeType.Comment, XmlNodeType.Text, XmlNodeType.CDATA, XmlNodeType.Text],
  );
  assert.equal(root.children[0].innerText, '<AB>');
  assert.equal(root.innerText, '<AB>t1t2<c>\nfim');
});

test('parser XML: documentos malformados geram erro', () => {
  for (const bad of ['', '<a>', '<a></b>', '<a x="1" x="2"/>', '<a>&foo;</a>', '<a/><b/>', 'texto', '<a x=1/>', '<p:a/>']) {
    assert.throws(() => parseXml(bad), undefined, bad);
  }
});
