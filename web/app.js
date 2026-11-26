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
 * Converte um arquivo. Devolve o arquivo para baixar e o .ytt usado no preview.
 * O preview sempre existe: se o destino não é .ytt, gera um .ytt só para mostrar.
 * @returns {Promise<{download: {name: string, blob: Blob}, ytt: string | Uint8Array}>}
 */
async function convertFile(file, targetExt) {
  const fullExt = extOf(file.name);
  const ext = fullExt.replace(/\.txt$/, '') || fullExt;
  // Um .txt qualquer ainda pode ser json3 ou .ytt: loadDocument reconhece pelo conteúdo.
  if (!isExtensionSupported(ext) && ext !== '.txt') throw new Error(`Formato não suportado (${ext || 'sem extensão'}). Use .srt, .sbv, .ass, .ytt ou .json3.`);
  const content = new Uint8Array(await file.arrayBuffer());
  const isYtt = YTT_EXTENSIONS.includes(ext);

  // Um .ytt com destino .ytt não precisa de conversão: o arquivo baixado é o próprio.
  if (isYtt && YTT_EXTENSIONS.includes(targetExt)) {
    return { download: { name: file.name, blob: file }, ytt: content };
  }

  const name = file.name.slice(0, file.name.length - fullExt.length) + targetExt;
  const text = convertDocument(await loadDocument('x' + ext, content), targetExt).save({ bom: true });
  // O BOM vem como \uFEFF no texto; o Blob grava em UTF-8.
  const download = { name, blob: new Blob([text], { type: 'text/plain;charset=utf-8' }) };

  let ytt;
  if (YTT_EXTENSIONS.includes(targetExt)) ytt = text;
  else if (isYtt) ytt = content;
  // save() altera o documento, então o .ytt do preview sai de uma leitura nova.
  else ytt = convertDocument(await loadDocument('x' + ext, content), '.ytt').save();
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

function showPreview(ytt, name, download) {
  // O preview lê o .ytt gerado (o mesmo arquivo que vai para o YouTube).
  preview.show(YttDocument.parse(ytt), name, download);
}

async function handleFiles(files) {
  const targetExt = format.value;
  for (const file of files) {
    const { li, status } = addRow(file.name);
    try {
      const { download, ytt } = await convertFile(file, targetExt);
      status.className = 'ok';
      status.textContent = 'Pronto';
      const dl = { name: download.name, url: URL.createObjectURL(download.blob) };
      const open = () => showPreview(ytt, file.name, dl);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Ver preview';
      btn.addEventListener('click', open);
      const a = document.createElement('a');
      a.className = 'btn';
      a.href = dl.url;
      a.download = dl.name;
      a.textContent = `Baixar ${dl.name}`;
      li.append(btn, a);

      if (files.length === 1) open();
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
