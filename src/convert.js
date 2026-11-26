// SubtitleDocument.Load / SubtitleDocument.Convert

import { SbvDocument, SrtDocument } from './formats/srt.js';
import { YttDocument } from './formats/ytt.js';
import { AssDocument } from './formats/ass/assDocument.js';
import { Json3Document, looksLikeJson3 } from './formats/json3.js';
import { decodeText } from './util/misc.js';

/**
 * Loads a subtitle file by extension.
 * @param {string} fileName used only for its extension
 * @param {string | Uint8Array} content
 * @param {object} [options] passed to the format loader (e.g. styleOptions for .ass)
 */
export async function loadDocument(fileName, content, options = {}) {
  const ext = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();
  switch (ext) {
    case '.srt':
      return SrtDocument.parse(content);
    case '.sbv':
      return SbvDocument.parse(content);
    case '.srv3':
    case '.ytt':
      return YttDocument.parse(content);
    case '.json3':
    case '.json':
      return Json3Document.parse(content);
    case '.ass': {
      // The .ass reader is developed separately; load it lazily so the rest works without it.
      const { loadAssDocument } = await import('./formats/ass/index.js');
      return loadAssDocument(content, options);
    }
    default: {
      // Extensão desconhecida (ex.: legenda.json3.txt): tenta reconhecer pelo conteúdo.
      const text = decodeText(content);
      if (looksLikeJson3(text)) return Json3Document.parse(text);
      if (/^\s*<\?xml[^>]*>\s*<timedtext\b|^\s*<timedtext\b/.test(text)) return YttDocument.parse(text);
      throw new Error(`Formato de entrada não suportado: ${ext}`);
    }
  }
}

export function isExtensionSupported(ext) {
  return ['.srt', '.sbv', '.ass', '.ytt', '.srv3', '.json3', '.json'].includes(ext.toLowerCase());
}

/**
 * Converts a document to the format of the given extension.
 * @param {object} [options] for .ytt/.srv3: {fadeShadowCutoff} (see YttDocument)
 */
export function convertDocument(doc, newExtension, options = {}) {
  switch (newExtension?.toLowerCase()) {
    case '.ass':
      // VisualizingAssDocument (visual = true in C#) is not ported
      return AssDocument.fromSubtitleDocument(doc);
    case '.srt':
      return new SrtDocument(doc);
    case '.ytt':
    case '.srv3':
      return new YttDocument(doc, options);
    default:
      throw new Error(`Formato de destino não suportado: ${newExtension}`);
  }
}
