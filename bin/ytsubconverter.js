#!/usr/bin/env node
// Uso: ytsubconverter <entrada.(srt|sbv|ass|ytt|srv3|json3)> [saida.(ytt|srv3|srt|ass)]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { extname } from 'node:path';
import { loadDocument, convertDocument, getInputFormat } from '../src/convert.js';
import { InputFormat } from '../src/detect.js';

const args = process.argv.slice(2);
// --fade-sombras[=45]: no fade, tira sombra/contorno quando a opacidade do texto fica abaixo de 45% (ver YttDocument)
const fadeArg = args.find((a) => a === '--fade-sombras' || a.startsWith('--fade-sombras='));
const fadeShadowCutoff = fadeArg ? Number(fadeArg.split('=')[1] ?? 45) : null;
const [input, outputArg] = args.filter((a) => a !== fadeArg);
if (!input || input === '-h' || input === '--help') {
  console.error('Uso: ytsubconverter <entrada.(srt|sbv|ass|ytt|srv3|json3)> [saida.(ytt|srv3|srt|ass)] [--fade-sombras[=45]]');
  process.exit(input ? 0 : 1);
}

// O formato de entrada é reconhecido pelo conteúdo; a extensão só é usada se o conteúdo não for reconhecido.
let content;
try {
  content = readFileSync(input);
} catch (err) {
  console.error(`Erro: ${err.message}`);
  process.exit(1);
}
const inputFormat = getInputFormat(input, content);
// Sem saída: .ytt/.srv3/json3 viram .srt, o resto vira .ytt, com o nome da entrada sem a extensão.
const base = input.replace(/\.txt$/i, '').replace(/\.[a-z0-9]{1,5}$/i, '') || input;
const defaultExt = [InputFormat.Ytt, InputFormat.Json3].includes(inputFormat) ? '.srt' : '.ytt';
// Nunca sobrescreve a entrada (ex.: um .ytt salvo como "legenda.srt" convertido para .srt).
const output = outputArg ?? (base + defaultExt === input ? `${base}.convertido${defaultExt}` : base + defaultExt);

try {
  const doc = await loadDocument(input, content);
  const result = convertDocument(doc, extname(output), { fadeShadowCutoff });
  writeFileSync(output, result.save({ bom: true }), 'utf8');
  console.log(`${input} -> ${output}`);
} catch (err) {
  console.error(`Erro: ${err.message}`);
  process.exit(1);
}
