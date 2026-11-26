// Reconhece o formato de uma legenda pelo conteúdo, sem depender da extensão do arquivo
// (arquivos baixados da internet muitas vezes vêm sem extensão ou com uma extensão errada).

import { looksLikeJson3 } from './formats/json3.js';
import { decodeText } from './util/misc.js';

/** Formatos de entrada reconhecidos, com a extensão usada internamente para cada um. */
export const InputFormat = Object.freeze({
  Json3: '.json3',
  Ytt: '.ytt',
  Ass: '.ass',
  Srt: '.srt',
  Sbv: '.sbv',
});

// Só o começo do arquivo é examinado (o cabeçalho e as primeiras legendas bastam).
const SAMPLE_SIZE = 64 * 1024;

const SRT_TIMES = /^\s*\d+:\d{1,2}:\d{1,2}[.,]\d+\s*-->\s*\d+:\d{1,2}:\d{1,2}[.,]\d+/m;
const SBV_TIMES = /^\s*\d+:\d{1,2}:\d{1,2}[.,]\d+,\d+:\d{1,2}:\d{1,2}[.,]\d+\s*$/m;
const ASS_SECTION = /^\s*\[(Script Info|V4\+? Styles|Events)\]\s*$/im;
const ASS_DIALOGUE = /^\s*(Dialogue|Comment|Style)\s*:/im;

/**
 * Descobre o formato pelo conteúdo.
 * @param {string | Uint8Array | ArrayBuffer} content
 * @returns {string | null} uma das extensões de InputFormat, ou null se não reconhecer
 */
export function detectFormat(content) {
  let text = typeof content === 'string' ? content.replace(/^﻿/, '') : decodeText(sample(content));
  text = text.slice(0, SAMPLE_SIZE);

  if (looksLikeJson3(text)) return InputFormat.Json3;
  // srv3/ytt: XML cuja raiz é <timedtext> (pode haver declaração, comentários ou espaços antes).
  if (/^\s*(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)*<timedtext[\s>]/.test(text)) return InputFormat.Ytt;
  if (ASS_SECTION.test(text) && ASS_DIALOGUE.test(text)) return InputFormat.Ass;
  if (SRT_TIMES.test(text)) return InputFormat.Srt;
  if (SBV_TIMES.test(text)) return InputFormat.Sbv;
  return null;
}

function sample(content) {
  const bytes = content instanceof Uint8Array ? content : new Uint8Array(content);
  // Não corta no meio de um caractere de 2 bytes (UTF-16): tamanho par.
  return bytes.length > SAMPLE_SIZE ? bytes.subarray(0, SAMPLE_SIZE) : bytes;
}
