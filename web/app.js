// Página do conversor: roda tudo no navegador com os mesmos módulos do port (sem servidor).
import { loadDocument, convertDocument, getInputFormat } from '../src/convert.js';
import { InputFormat } from '../src/detect.js';
import { YttDocument } from '../src/formats/ytt.js';
import { YttPreview } from './preview.js';

const drop = document.getElementById('drop');
const input = document.getElementById('file');
const format = document.getElementById('format');
const fadeShadows = document.getElementById('fadeShadows');
const fadeCutoff = document.getElementById('fadeCutoff');
const results = document.getElementById('results');
const preview = new YttPreview(document.getElementById('preview'));

const YTT_EXTENSIONS = ['.ytt', '.srv3'];

/** Nome sem a extensão ("legenda.json3.txt" -> "legenda"; sem extensão fica como está). */
function baseName(name) {
  return name.replace(/\.txt$/i, '').replace(/\.[a-z0-9]{1,5}$/i, '') || name;
}

/**
 * Converte um arquivo. Devolve o arquivo para baixar e o .ytt usado no preview.
 * O formato de entrada é reconhecido pelo conteúdo (a extensão só é usada se o conteúdo não for reconhecido).
 * O preview sempre existe: se o destino não é .ytt, gera um .ytt só para mostrar.
 * @returns {Promise<{download: {name: string, blob: Blob}, ytt: string | Uint8Array}>}
 */
async function convertFile(file, targetExt) {
  const cutoff = Number(fadeCutoff.value);
  const options = { fadeShadowCutoff: fadeShadows.checked && cutoff > 0 ? Math.min(cutoff, 100) : null };
  const content = new Uint8Array(await file.arrayBuffer());
  const format = getInputFormat(file.name, content);
  if (!format) throw new Error('Não reconheci o formato desta legenda. Use .srt, .sbv, .ass, .ytt/.srv3 ou json3.');
  const isYtt = format === InputFormat.Ytt;
  const name = baseName(file.name) + targetExt;

  // Um .ytt com destino .ytt não precisa de conversão: o arquivo baixado é o próprio (a não ser que a opção do fade
  // esteja ligada, que muda as sombras).
  if (isYtt && YTT_EXTENSIONS.includes(targetExt) && options.fadeShadowCutoff == null) {
    return { download: { name, blob: file }, ytt: content };
  }

  const doc = await loadDocument(file.name, content);
  if (doc.lines.length === 0) throw new Error('Nenhuma legenda encontrada neste arquivo.');
  const text = convertDocument(doc, targetExt, options).save({ bom: true });
  // O BOM vem como \uFEFF no texto; o Blob grava em UTF-8.
  const download = { name, blob: new Blob([text], { type: 'text/plain;charset=utf-8' }) };

  let ytt;
  if (YTT_EXTENSIONS.includes(targetExt)) ytt = text;
  else if (isYtt) ytt = content;
  // save() altera o documento, então o .ytt do preview sai de uma leitura nova.
  else ytt = convertDocument(await loadDocument(file.name, content), '.ytt', options).save();
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
