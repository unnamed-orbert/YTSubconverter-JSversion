#!/usr/bin/env node
// Uso: ytsubconverter <entrada.(srt|sbv|ass|ytt|srv3|json3)> [saida.(ytt|srv3|srt|ass)]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { extname } from 'node:path';
import { loadDocument, convertDocument, getInputFormat } from '../src/convert.js';
import { InputFormat } from '../src/detect.js';
import { canFixMassiveDuplication, fixMassiveDuplication } from '../src/dedup.js';
import { recoverTags } from '../src/recover/recoverTags.js';

const args = process.argv.slice(2);
// --fade-sombras[=45]: no fade, tira sombra/contorno quando a opacidade do texto fica abaixo de 45% (ver YttDocument)
const fadeArg = args.find((a) => a === '--fade-sombras' || a.startsWith('--fade-sombras='));
const fadeShadowCutoff = fadeArg ? Number(fadeArg.split('=')[1] ?? 45) : null;
// Corrigir duplicação massiva (src/dedup.js): de .ytt/.json3 para .srt é automático, como na ferramenta YTT → SRT.
// --manter-duplicacao desliga; --corrigir-duplicacao aplica também na saída .ytt/.ass.
const DEDUP_FLAG = '--corrigir-duplicacao';
const KEEP_DUP_FLAG = '--manter-duplicacao';
const forceDedup = args.includes(DEDUP_FLAG);
const keepDuplication = args.includes(KEEP_DUP_FLAG);
// --recuperar-tags: .ytt/.json3 -> .ass tentando reconstruir as tags originais (src/recover/recoverTags.js)
const RECOVER_FLAG = '--recuperar-tags';
const recover = args.includes(RECOVER_FLAG);
const [input, outputArg] = args.filter((a) => a !== fadeArg && a !== DEDUP_FLAG && a !== KEEP_DUP_FLAG && a !== RECOVER_FLAG);
if (!input || input === '-h' || input === '--help') {
  console.error('Uso: ytsubconverter <entrada.(srt|sbv|ass|ytt|srv3|json3)> [saida.(ytt|srv3|srt|ass)] [--fade-sombras[=45]] [--manter-duplicacao | --corrigir-duplicacao] [--recuperar-tags]');
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
const isYttLike = [InputFormat.Ytt, InputFormat.Json3].includes(inputFormat);
if (recover && !isYttLike) {
  console.error('Erro: --recuperar-tags só vale para entrada .ytt/.srv3/.json3.');
  process.exit(1);
}
const defaultExt = recover ? '.recuperado.ass' : isYttLike ? '.srt' : '.ytt';
// Nunca sobrescreve a entrada (ex.: um .ytt salvo como "legenda.srt" convertido para .srt).
const output = outputArg ?? (base + defaultExt === input ? `${base}.convertido${defaultExt}` : base + defaultExt);

try {
  const doc = await loadDocument(input, content);
  if (recover) {
    if (extname(output).toLowerCase() !== '.ass') throw new Error('--recuperar-tags gera .ass: use uma saída .ass.');
    const result = recoverTags({ lines: doc.lines, videoDimensions: doc.videoDimensions });
    writeFileSync(output, '\uFEFF' + result.ass, 'utf8');
    console.log(`${input} -> ${output} (${result.events.length} linhas)`);
    const tags = Object.entries(result.summary).map(([tag, n]) => `\\${tag} ×${n}`).join(', ');
    console.log(`Tags recuperadas: ${tags || 'nenhuma'}`);
    if (result.styles.some((st) => st.shadowTypes.length > 1)) {
      const xml = output.replace(/\.ass$/i, '') + '.StyleOptions.xml';
      writeFileSync(xml, result.styleOptionsXml, 'utf8');
      console.log(`Estilos com várias sombras: ${xml} (StyleOptions.xml para o YTSubConverter original)`);
    }
    process.exit(0);
  }
  const outputExt = extname(output).toLowerCase();
  const toSrt = outputExt === '.srt';
  if ((forceDedup || (toSrt && !keepDuplication)) && canFixMassiveDuplication(doc)) fixMassiveDuplication(doc, { plainText: toSrt });
  const result = convertDocument(doc, outputExt, { fadeShadowCutoff });
  writeFileSync(output, result.save({ bom: true }), 'utf8');
  console.log(`${input} -> ${output}`);
} catch (err) {
  console.error(`Erro: ${err.message}`);
  process.exit(1);
}
