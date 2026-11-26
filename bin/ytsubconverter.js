#!/usr/bin/env node
// Uso: ytsubconverter <entrada.(srt|sbv|ass|ytt|srv3|json3)> [saida.(ytt|srv3|srt|ass)]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { extname } from 'node:path';
import { loadDocument, convertDocument } from '../src/convert.js';
import { canFixMassiveDuplication, fixMassiveDuplication } from '../src/dedup.js';

// --corrigir-duplicacao: entrada .ytt/.json3 com a mesma frase repetida quadro a quadro vira uma linha por frase
const DEDUP_FLAG = '--corrigir-duplicacao';
const argv = process.argv.slice(2);
const fixDuplication = argv.includes(DEDUP_FLAG);
const [input, outputArg] = argv.filter((a) => a !== DEDUP_FLAG);
if (!input || input === '-h' || input === '--help') {
  console.error('Uso: ytsubconverter <entrada.(srt|sbv|ass|ytt|srv3|json3)> [saida.(ytt|srv3|srt|ass)] [--corrigir-duplicacao]');
  process.exit(input ? 0 : 1);
}

// Sem saída: .ytt/.srv3/.json3 viram .srt, o resto vira .ytt. "legenda.json3.txt" conta como .json3.
const base = input.replace(/\.txt$/i, '');
const inputExt = extname(base).toLowerCase();
const output = outputArg ?? base.slice(0, base.length - inputExt.length) + (['.ytt', '.srv3', '.json3'].includes(inputExt) ? '.srt' : '.ytt');

try {
  const doc = await loadDocument(input, readFileSync(input));
  if (fixDuplication && canFixMassiveDuplication(doc)) fixMassiveDuplication(doc);
  const result = convertDocument(doc, extname(output));
  writeFileSync(output, result.save({ bom: true }), 'utf8');
  console.log(`${input} -> ${output}`);
} catch (err) {
  console.error(`Erro: ${err.message}`);
  process.exit(1);
}
