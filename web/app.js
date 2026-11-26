// Página do conversor: roda tudo no navegador com os mesmos módulos do port (sem servidor).
import { loadDocument, convertDocument, isExtensionSupported } from '../src/convert.js';
import { YttDocument } from '../src/formats/ytt.js';
import { YttPreview } from './preview.js';

const drop = document.getElementById('drop');
const input = document.getElementById('file');
const format = document.getElementById('format');
const results = document.getElementById('results');
const preview = new YttPreview(document.getElementById('preview'));

const YTT_EXTENSIONS = ['.ytt', '.srv3'];

/** Extensão do arquivo; "legenda.json3.txt" conta como ".json3.txt" (o .txt é ignorado se o de antes for conhecido). */
function extOf(name) {
  const i = name.lastIndexOf('.');
  if (i < 0) return '';
  const ext = name.slice(i).toLowerCase();
  if (ext === '.txt') {
    const j = name.lastIndexOf('.', i - 1);
    if (j >= 0 && isExtensionSupported(name.slice(j, i))) return name.slice(j).toLowerCase();
  }
  return ext;
}

/**
 * Converte um arquivo. Devolve o arquivo para baixar (se houver conversão) e o texto .ytt usado no preview.
 * @returns {Promise<{download: {name: string, blob: Blob} | null, ytt: string | null}>}
 */
async function convertFile(file, targetExt) {
  const fullExt = extOf(file.name);
  const ext = fullExt.replace(/\.txt$/, '') || fullExt;
  // Um .txt qualquer ainda pode ser json3 ou .ytt: loadDocument reconhece pelo conteúdo.
  if (!isExtensionSupported(ext) && ext !== '.txt') throw new Error(`Formato não suportado (${ext || 'sem extensão'}). Use .srt, .sbv, .ass, .ytt ou .json3.`);
  const content = new Uint8Array(await file.arrayBuffer());

  // Um .ytt com destino .ytt não precisa de conversão: só preview.
  if (YTT_EXTENSIONS.includes(ext) && YTT_EXTENSIONS.includes(targetExt)) {
    return { download: null, ytt: content };
  }

  const doc = await loadDocument('x' + ext, content);
  const text = convertDocument(doc, targetExt).save({ bom: true });
  const name = file.name.slice(0, file.name.length - fullExt.length) + targetExt;
  // O BOM vem como ﻿ no texto; o Blob grava em UTF-8.
  const download = { name, blob: new Blob([text], { type: 'text/plain;charset=utf-8' }) };
  const ytt = YTT_EXTENSIONS.includes(targetExt) ? text : YTT_EXTENSIONS.includes(ext) ? content : null;
  return { download, ytt };
}

function addRow(fileName) {
  const li = document.createElement('li');
  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = fileName;
  const status = document.createElement('span');
  status.textContent = 'Convertendo…';
  li.append(name, status);
  results.prepend(li);
  return { li, status };
}

function showPreview(ytt, name) {
  // O preview lê o .ytt gerado (o mesmo arquivo que vai para o YouTube).
  preview.show(YttDocument.parse(ytt), name);
}

async function handleFiles(files) {
  const targetExt = format.value;
  for (const file of files) {
    const { li, status } = addRow(file.name);
    try {
      const { download, ytt } = await convertFile(file, targetExt);
      status.className = 'ok';
      status.textContent = 'Pronto';
      const previewName = download && YTT_EXTENSIONS.includes(targetExt) ? download.name : file.name;
      if (ytt) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = 'Ver preview';
        btn.addEventListener('click', () => showPreview(ytt, previewName));
        li.append(btn);
      }
      if (download) {
        const a = document.createElement('a');
        a.className = 'btn';
        a.href = URL.createObjectURL(download.blob);
        a.download = download.name;
        a.textContent = `Baixar ${download.name}`;
        li.append(a);
        if (files.length === 1) a.click();
      }
      if (ytt && files.length === 1) showPreview(ytt, previewName);
    } catch (err) {
      console.error(err);
      status.className = 'err';
      status.textContent = `Erro: ${err.message}`;
    }
  }
}

input.addEventListener('change', () => {
  handleFiles([...input.files]);
  input.value = '';
});
drop.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
});
for (const t of ['dragenter', 'dragover']) {
  drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('over'); });
}
for (const t of ['dragleave', 'drop']) {
  drop.addEventListener(t, () => drop.classList.remove('over'));
}
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  handleFiles([...e.dataTransfer.files]);
});
// Evita que soltar fora da área abra o arquivo no navegador.
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());
