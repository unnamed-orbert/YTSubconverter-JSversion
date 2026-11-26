// Refaz o .ytt a partir do .ass recuperado (src/recover/recoverTags.js), para comparar com o original.

import { loadDocument, convertDocument } from '../convert.js';
import { YttDocument } from '../formats/ytt.js';
import { loadStyleOptions } from '../formats/ass/index.js';
import { recoverTags } from '../recover/recoverTags.js';

/**
 * Converte o .ass recuperado para .ytt com o próprio port e lê esse .ytt de volta.
 * @param {{ass: string, styleOptionsXml?: string, styles?: {shadowTypes: string[]}[]}} recovered resultado de recoverTags
 * @param {object} [options] opções da escrita .ytt (ex.: fadeShadowCutoff)
 * @returns {Promise<{ytt: string, doc: YttDocument}>}
 */
export async function remakeYtt(recovered, options = {}) {
  const styleOptions = recovered.styleOptionsXml && recovered.styles?.some((s) => s.shadowTypes.length > 1)
    ? loadStyleOptions(recovered.styleOptionsXml)
    : undefined;
  const assDoc = await loadDocument('recuperado.ass', recovered.ass, styleOptions ? { styleOptions } : {});
  const ytt = convertDocument(assDoc, '.ytt', options).save();
  return { ytt, doc: YttDocument.parse(ytt) };
}

/**
 * Atalho: lê a legenda original (.ytt/.srv3/.json3), recupera as tags e refaz o .ytt.
 * @returns {Promise<{original: object, recovered: object, remade: YttDocument, ytt: string}>}
 */
export async function recoverAndRemake(fileName, content) {
  const original = await loadDocument(fileName, content);
  const recovered = recoverTags({ lines: original.lines, videoDimensions: original.videoDimensions });
  // recoverTags pode mexer nas linhas: o original da comparação sai de uma leitura nova.
  const fresh = await loadDocument(fileName, content);
  const { ytt, doc } = await remakeYtt(recovered);
  return { original: fresh, recovered, remade: doc, ytt };
}
