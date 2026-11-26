import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseXml, XmlNodeType } from '../src/util/xml.js';
import { YttDocument } from '../src/formats/ytt.js';
import { Json3Document, json3ToSrv3, looksLikeJson3 } from '../src/formats/json3.js';
import { loadDocument, convertDocument } from '../src/convert.js';
import { ShadowType } from '../src/enums.js';

const filesDir = fileURLToPath(new URL('./files/ass/', import.meta.url));

// Faz o caminho que o YouTube faz (srv3 enviado -> json3 servido), para testar com os arquivos do original.
const PEN = { b: 'bAttr', i: 'iAttr', u: 'uAttr', fs: 'fsFontStyle', sz: 'szPenSize', of: 'ofOffset', fc: 'fcForeColor', fo: 'foForeAlpha', bc: 'bcBackColor', bo: 'boBackAlpha', et: 'etEdgeType', ec: 'ecEdgeColor', rb: 'rbRuby', hg: 'hgHorizGroup' };
const WS = { ju: 'juJustifCode', pd: 'pdPrintDir', sd: 'sdScrollDir' };
const WP = { ap: 'apPoint', ah: 'ahHorPos', av: 'avVerPos' };
const P = { t: 'tStartMs', d: 'dDurationMs', wp: 'wpWinPosId', ws: 'wsWinStyleId', p: 'pPenId' };
const S = { p: 'pPenId', t: 'tOffsetMs' };

function toObject(elem, fields) {
  const obj = {};
  for (const [attr, key] of Object.entries(fields)) {
    const v = elem.getAttribute(attr);
    if (v == null) continue;
    obj[key] = v.startsWith('#') ? parseInt(v.slice(1), 16) : Number(v);
  }
  return obj;
}

function srv3ToJson3(xmlText) {
  const root = parseXml(xmlText);
  const head = root.children.find((e) => e.name === 'head');
  const body = root.children.find((e) => e.name === 'body');
  const json = { wireMagic: 'pb3', pens: [], wsWinStyles: [], wpWinPositions: [], events: [] };
  const lists = { pen: [json.pens, PEN], ws: [json.wsWinStyles, WS], wp: [json.wpWinPositions, WP] };
  for (const e of head?.children ?? []) {
    const [list, fields] = lists[e.name];
    const id = Number(e.getAttribute('id'));
    while (list.length <= id) list.push({});
    list[id] = toObject(e, fields);
  }
  for (const p of body.children.filter((e) => e.name === 'p')) {
    const event = { ...toObject(p, P), segs: [] };
    for (const node of p.childNodes) {
      if (node.nodeType === XmlNodeType.Element) event.segs.push({ utf8: node.innerText, ...toObject(node, S) });
      else if (node.nodeType !== XmlNodeType.Comment) event.segs.push({ utf8: node.value });
    }
    json.events.push(event);
  }
  return JSON.stringify(json);
}

for (const file of readdirSync(filesDir).filter((f) => f.endsWith('.ytt'))) {
  test(`json3: ${file} passado para json3 e lido de volta gera o mesmo .ytt`, () => {
    const original = readFileSync(filesDir + file, 'utf8').replace(/^\uFEFF/, '');
    const fromJson3 = new YttDocument(Json3Document.parse(srv3ToJson3(original))).save();
    const fromYtt = new YttDocument(YttDocument.parse(original)).save();
    assert.equal(fromJson3, fromYtt);
  });
}

test('json3: campos de pen, janela e karaokê', () => {
  const json = {
    wireMagic: 'pb3',
    pens: [{}, { bAttr: 1, iAttr: 1, szPenSize: 100, fcForeColor: 0xff0000, foForeAlpha: 254, boBackAlpha: 0, etEdgeType: 3, ecEdgeColor: 0x0000ff }],
    wsWinStyles: [{}, { juJustifCode: 2, pdPrintDir: 0, sdScrollDir: 0 }],
    wpWinPositions: [{}, { apPoint: 7, ahHorPos: 50, avVerPos: 100 }],
    events: [
      { tStartMs: 0, dDurationMs: 0, id: 1, wpWinPosId: 1, wsWinStyleId: 1 }, // só define janela
      { tStartMs: 1000, dDurationMs: 2000, wpWinPosId: 1, wsWinStyleId: 1, segs: [{ utf8: 'A & <b>', pPenId: 1 }, { utf8: ' ka', pPenId: 1, tOffsetMs: 500 }] },
    ],
  };
  const doc = Json3Document.parse(JSON.stringify(json));
  assert.equal(doc.lines.length, 1);
  const [line] = doc.lines;
  assert.equal(line.start, 1000);
  assert.equal(line.end, 3000);
  assert.equal(line.sections.length, 2);
  const [a, b] = line.sections;
  assert.equal(a.text, 'A & <b>');
  assert.ok(a.bold && a.italic);
  assert.equal(a.foreColor.r, 255);
  assert.equal(a.foreColor.g, 0);
  assert.equal(a.backColor.a, 0);
  assert.equal(a.shadowColors.get(ShadowType.Glow).b, 255);
  assert.equal(b.startOffset, 500);
});

test('json3: erros claros para conteúdo inválido', () => {
  assert.throws(() => json3ToSrv3('não é json'), /json3 inválido/);
  assert.throws(() => json3ToSrv3('{"pens": []}'), /events/);
});

test('json3: loadDocument reconhece .json3 e também pelo conteúdo (legenda.json3.txt)', async () => {
  const text = JSON.stringify({ wireMagic: 'pb3', events: [{ tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: 'oi' }] }] });
  assert.ok(looksLikeJson3(text));
  for (const name of ['x.json3', 'x.json', 'x.json3.txt']) {
    const doc = await loadDocument(name, new TextEncoder().encode(text));
    assert.equal(doc.lines[0].text, 'oi');
    assert.match(convertDocument(doc, '.srt').save(), /oi/);
  }
});
