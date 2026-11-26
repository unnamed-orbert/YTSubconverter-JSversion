// Leitura do formato "json3" do YouTube (o que o player baixa em /api/timedtext?fmt=json3).
//
// Não existe no YTSubConverter original. O json3 é o mesmo modelo do srv3/.ytt, só que em JSON:
//   pens[]           -> <pen>  (o índice no array é o id)
//   wsWinStyles[]    -> <ws>
//   wpWinPositions[] -> <wp>
//   events[]         -> <p>, e cada item de segs[] -> <s>
// Por isso o leitor traduz o JSON para srv3 e reaproveita o leitor de .ytt, que já desfaz os truques
// da escrita (espaços de preenchimento, cópia invisível para texto escuro no Android, karaokê etc.).

import { decodeText } from '../util/misc.js';
import { YttDocument } from './ytt.js';

// Nome do campo no json3 -> atributo no srv3
const PEN_FIELDS = {
  bAttr: 'b',
  iAttr: 'i',
  uAttr: 'u',
  fsFontStyle: 'fs',
  szPenSize: 'sz',
  ofOffset: 'of',
  fcForeColor: 'fc',
  foForeAlpha: 'fo',
  bcBackColor: 'bc',
  boBackAlpha: 'bo',
  etEdgeType: 'et',
  ecEdgeColor: 'ec',
  rbRuby: 'rb',
  hgHorizGroup: 'hg',
};
const COLOR_FIELDS = new Set(['fcForeColor', 'bcBackColor', 'ecEdgeColor']);
const WINDOW_STYLE_FIELDS = { juJustifCode: 'ju', pdPrintDir: 'pd', sdScrollDir: 'sd' };
const WINDOW_POSITION_FIELDS = { apPoint: 'ap', ahHorPos: 'ah', avVerPos: 'av' };
const EVENT_FIELDS = { tStartMs: 't', dDurationMs: 'd', wpWinPosId: 'wp', wsWinStyleId: 'ws', pPenId: 'p' };
const SEGMENT_FIELDS = { pPenId: 'p', tOffsetMs: 't' };

export class Json3Document extends YttDocument {
  /**
   * Lê um arquivo .json3.
   * @param {string | Uint8Array} content
   * @returns {Json3Document}
   */
  static parse(content) {
    const doc = new Json3Document();
    doc.load(json3ToSrv3(decodeText(content)));
    return doc;
  }
}

/** Diz se o texto parece um json3 (objeto JSON com "events"), para quando a extensão não ajuda. */
export function looksLikeJson3(text) {
  return /^\s*\{/.test(text) && /"(events|wireMagic)"\s*:/.test(text.slice(0, 4096));
}

/**
 * Converte o texto de um json3 para o XML srv3 equivalente.
 * @param {string | object} json texto do arquivo ou o objeto já lido
 * @returns {string}
 */
export function json3ToSrv3(json) {
  let data = json;
  if (typeof json === 'string') {
    try {
      data = JSON.parse(json);
    } catch (err) {
      throw new Error(`json3 inválido: ${err.message}`);
    }
  }
  if (data == null || typeof data !== 'object' || !Array.isArray(data.events))
    throw new Error('json3 inválido: falta a lista "events".');

  const out = ['<?xml version="1.0" encoding="utf-8"?><timedtext format="3"><head>'];
  (data.pens ?? []).forEach((pen, id) => out.push(element('pen', id, pen, PEN_FIELDS)));
  (data.wsWinStyles ?? []).forEach((ws, id) => out.push(element('ws', id, ws, WINDOW_STYLE_FIELDS)));
  (data.wpWinPositions ?? []).forEach((wp, id) => out.push(element('wp', id, wp, WINDOW_POSITION_FIELDS)));
  out.push('</head><body>');

  for (const event of data.events) {
    // Eventos sem segs só definem janelas (legendas automáticas); não têm texto.
    if (!Array.isArray(event?.segs) || event.segs.length === 0) continue;
    out.push(`<p${attributes(event, EVENT_FIELDS)}>`);
    for (const seg of event.segs) out.push(`<s${attributes(seg, SEGMENT_FIELDS)}>${escapeText(seg?.utf8 ?? '')}</s>`);
    out.push('</p>');
  }
  out.push('</body></timedtext>');
  return out.join('');
}

function element(name, id, obj, fields) {
  return `<${name} id="${id}"${attributes(obj, fields)}/>`;
}

function attributes(obj, fields) {
  let s = '';
  if (obj == null || typeof obj !== 'object') return s;
  for (const [key, attr] of Object.entries(fields)) {
    const value = obj[key];
    if (value == null) continue;
    s += ` ${attr}="${COLOR_FIELDS.has(key) ? toHtmlColor(value) : escapeAttr(String(value))}"`;
  }
  return s;
}

/** O json3 guarda as cores como inteiro 0xRRGGBB. */
function toHtmlColor(value) {
  if (typeof value === 'string') return escapeAttr(value);
  return '#' + (Number(value) & 0xffffff).toString(16).toUpperCase().padStart(6, '0');
}

// Caracteres que o XML 1.0 não aceita; o srv3 nunca os teria.
const INVALID_XML_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

function escapeText(s) {
  return String(s).replace(INVALID_XML_CHARS, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r/g, '&#13;');
}

function escapeAttr(s) {
  return escapeText(s).replace(/"/g, '&quot;');
}
