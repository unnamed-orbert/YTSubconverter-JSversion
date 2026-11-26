// SubtitleDocument.Load / SubtitleDocument.Convert

import { SbvDocument, SrtDocument } from './formats/srt.js';
import { YttDocument } from './formats/ytt.js';
import { AssDocument } from './formats/ass/assDocument.js';
import { Json3Document } from './formats/json3.js';
import { detectFormat, InputFormat } from './detect.js';

const EXTENSION_FORMATS = {
  '.srt': InputFormat.Srt,
  '.sbv': InputFormat.Sbv,
  '.ytt': InputFormat.Ytt,
  '.srv3': InputFormat.Ytt,
  '.json3': InputFormat.Json3,
  '.json': InputFormat.Json3,
  '.ass': InputFormat.Ass,
};

/**
 * Descobre o formato de um arquivo: primeiro pelo conteúdo e, se ele não for reconhecido, pela extensão.
 * @param {string} fileName pode não ter extensão
 * @param {string | Uint8Array} content
 * @returns {string | null} extensão interna do formato (InputFormat) ou null
 */
export function getInputFormat(fileName, content) {
  const dot = fileName.lastIndexOf('.');
  const ext = dot < 0 ? '' : fileName.slice(dot).toLowerCase();
  return detectFormat(content) ?? EXTENSION_FORMATS[ext] ?? null;
}

/**
 * Loads a subtitle file. The format is recognized by the content (see detect.js); the file name's
 * extension is only used when the content isn't recognized.
 * @param {string} fileName
 * @param {string | Uint8Array} content
 * @param {object} [options] passed to the format loader (e.g. styleOptions and tagHierarchy for .ass)
 */
export async function loadDocument(fileName, content, options = {}) {
  const format = getInputFormat(fileName, content);
  switch (format) {
    case InputFormat.Srt:
      return SrtDocument.parse(content);
    case InputFormat.Sbv:
      return SbvDocument.parse(content);
    case InputFormat.Ytt:
      return YttDocument.parse(content);
    case InputFormat.Json3:
      return Json3Document.parse(content);
    case InputFormat.Ass: {
      const { loadAssDocument } = await import('./formats/ass/index.js');
      return loadAssDocument(content, options);
    }
    default:
      throw new Error('Formato de legenda não reconhecido. Use .srt, .sbv, .ass, .ytt/.srv3 ou json3.');
  }
}

export function isExtensionSupported(ext) {
  return ['.srt', '.sbv', '.ass', '.ytt', '.srv3', '.json3', '.json'].includes(ext.toLowerCase());
}

/**
 * Converts a document to the format of the given extension.
 * @param {object} [options] for .ytt/.srv3: {fadeShadowCutoff, tagHierarchy} (see YttDocument)
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
