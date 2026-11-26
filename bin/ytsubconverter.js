#!/usr/bin/env node
// Uso: ytsubconverter <entrada.(srt|sbv|ass)> [saida.(ytt|srv3|srt|ass)]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { extname } from 'node:path';
import { loadDocument, convertDocument } from '../src/convert.js';

const [input, outputArg] = process.argv.slice(2);
if (!input || input === '-h' || input === '--help') {
  console.error('Uso: ytsubconverter <entrada.(srt|sbv|ass)> [saida.(ytt|srv3|srt|ass)]');
  process.exit(input ? 0 : 1);
}

const output = outputArg ?? input.slice(0, input.length - extname(input).length) + (extname(input).toLowerCase() === '.ytt' ? '.srt' : '.ytt');

try {
  const doc = await loadDocument(input, readFileSync(input));
  const result = convertDocument(doc, extname(output));
  writeFileSync(output, result.save({ bom: true }), 'utf8');
  console.log(`${input} -> ${output}`);
} catch (err) {
  console.error(`Erro: ${err.message}`);
  process.exit(1);
}
