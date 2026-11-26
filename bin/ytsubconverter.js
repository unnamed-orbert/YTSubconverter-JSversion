#!/usr/bin/env node
// Uso: ytsubconverter <entrada.(srt|sbv|ass|ytt|srv3|json3)> [saida.(ytt|srv3|srt|ass)]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { extname } from 'node:path';
import { loadDocument, convertDocument } from '../src/convert.js';

const args = process.argv.slice(2);
// --fade-sombras[=45]: no fade, tira sombra/contorno quando a opacidade do texto fica abaixo de 45% (ver YttDocument)
const fadeArg = args.find((a) => a === '--fade-sombras' || a.startsWith('--fade-sombras='));
const fadeShadowCutoff = fadeArg ? Number(fadeArg.split('=')[1] ?? 45) : null;
const [input, outputArg] = args.filter((a) => a !== fadeArg);
if (!input || input === '-h' || input === '--help') {
  console.error('Uso: ytsubconverter <entrada.(srt|sbv|ass|ytt|srv3|json3)> [saida.(ytt|srv3|srt|ass)] [--fade-sombras[=45]]');
  process.exit(input ? 0 : 1);
}

// Sem saída: .ytt/.srv3/.json3 viram .srt, o resto vira .ytt. "legenda.json3.txt" conta como .json3.
const base = input.replace(/\.txt$/i, '');
const inputExt = extname(base).toLowerCase();
const output = outputArg ?? base.slice(0, base.length - inputExt.length) + (['.ytt', '.srv3', '.json3'].includes(inputExt) ? '.srt' : '.ytt');

try {
  const doc = await loadDocument(input, readFileSync(input));
  const result = convertDocument(doc, extname(output), { fadeShadowCutoff });
  writeFileSync(output, result.save({ bom: true }), 'utf8');
  console.log(`${input} -> ${output}`);
} catch (err) {
  console.error(`Erro: ${err.message}`);
  process.exit(1);
}
