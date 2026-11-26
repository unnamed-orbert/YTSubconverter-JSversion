// Public entry point of the .ass reader.

import { AssDocument } from './assDocument.js';
import { loadStyleOptionsFromString } from './assModel.js';
import { DEFAULT_STYLE_OPTIONS_XML } from './defaultStyleOptions.js';

export { AssDocument } from './assDocument.js';
export { AssLine, AssSection, AssStyle, AssStyleOptions, getAlignment, getAnchorPoint } from './assModel.js';
export { CursorKaraokeType, FadeKaraokeType, GlitchKaraokeType, SimpleKaraokeType } from './karaokeTypes.js';

/** Reads a StyleOptions.xml document (AssStyleOptionsList.LoadFromString). */
export function loadStyleOptions(xml) {
  return loadStyleOptionsFromString(xml);
}

/** The style options built into YTSubConverter (Resources.DefaultStyleOptions). */
export function getDefaultStyleOptions() {
  return loadStyleOptionsFromString(DEFAULT_STYLE_OPTIONS_XML);
}

/**
 * Loads an .ass file.
 * @param {string | Uint8Array | ArrayBuffer} content
 * @param {{ styleOptions?: import('./assModel.js').AssStyleOptions[] | null }} [options]
 *   When styleOptions is omitted, the built-in defaults are used (like SubtitleDocument.Load in C#,
 *   which appends them to the user's StyleOptions.xml). Pass null to use no style options at all.
 */
export function loadAssDocument(content, { styleOptions } = {}) {
  if (styleOptions === undefined) styleOptions = getDefaultStyleOptions();
  return new AssDocument(content, styleOptions);
}
