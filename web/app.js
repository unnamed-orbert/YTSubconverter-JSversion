// Página do conversor: roda tudo no navegador com os mesmos módulos do port (sem servidor).
import { loadDocument, convertDocument, isExtensionSupported } from '../src/convert.js';

const drop = document.getElementById('drop');
const input = document.getElementById('file');
const format = document.getElementById('format');
const results = document.getElementById('results');

let assReaderAvailable; // verificado uma vez, só quando um .ass aparece

async function checkAssReader() {
  if (assReaderAvailable === undefined) {
    // O leitor de .ass usa as opções de estilo padrão do YTSubConverter quando nenhuma é passada.
    assReaderAvailable = await import('../src/formats/ass/index.js').then(() => true, () => false);
  }
  if (!assReaderAvailable) throw new Error('A leitura de .ass ainda não está disponível nesta versão.');
}

function extOf(name) {
  const i = name.lastIndexOf('.');
  return i < 0 ? '' : name.slice(i).toLowerCase();
}

async function convertFile(file, targetExt) {
  const ext = extOf(file.name);
  if (!isExtensionSupported(ext)) throw new Error(`Formato não suportado (${ext || 'sem extensão'}). Use .srt, .sbv ou .ass.`);
  if (ext === '.ass') await checkAssReader();
  const content = new Uint8Array(await file.arrayBuffer());
  const doc = await loadDocument(file.name, content);
  const text = convertDocument(doc, targetExt).save({ bom: true });
  const name = file.name.slice(0, file.name.length - ext.length) + targetExt;
  // O BOM vem como ﻿ no texto; o Blob grava em UTF-8.
  return { name, blob: new Blob([text], { type: 'text/plain;charset=utf-8' }) };
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

async function handleFiles(files) {
  const targetExt = format.value;
  for (const file of files) {
    const { li, status } = addRow(file.name);
    try {
      const { name, blob } = await convertFile(file, targetExt);
      status.className = 'ok';
      status.textContent = 'Pronto';
      const a = document.createElement('a');
      a.className = 'btn';
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.textContent = `Baixar ${name}`;
      li.append(a);
      if (files.length === 1) a.click();
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
