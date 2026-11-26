// SubtitleDocument.Load / SubtitleDocument.Convert

import { SbvDocument, SrtDocument } from './formats/srt.js';
import { YttDocument } from './formats/ytt.js';

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
    case '.ass': {
      // The .ass reader is developed separately; load it lazily so the rest works without it.
      const { loadAssDocument } = await import('./formats/ass/index.js');
      return loadAssDocument(content, options);
    }
    default:
      throw new Error(`Formato de entrada não suportado: ${ext}`);
  }
}

export function isExtensionSupported(ext) {
  return ['.srt', '.sbv', '.ass', '.ytt', '.srv3'].includes(ext.toLowerCase());
}

/** Converts a document to the format of the given extension. */
export function convertDocument(doc, newExtension) {
  switch (newExtension?.toLowerCase()) {
    case '.srt':
      return new SrtDocument(doc);
    case '.ytt':
    case '.srv3':
      return new YttDocument(doc);
    default:
      throw new Error(`Formato de destino não suportado: ${newExtension}`);
  }
}
