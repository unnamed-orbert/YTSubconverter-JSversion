// Página do conversor: roda tudo no navegador com os mesmos módulos do port (sem servidor).
import { loadDocument, convertDocument, getInputFormat } from '../src/convert.js';
import { InputFormat } from '../src/detect.js';
import { YttDocument } from '../src/formats/ytt.js';
import { YttPreview } from './preview.js';
import { canFixMassiveDuplication, fixMassiveDuplication } from '../src/dedup.js';
import { initI18n, setText, t } from './i18n.js';
import { recoverTags } from '../src/recover/recoverTags.js';
import { remakeYtt } from '../src/compare/remake.js';
import { ComparePanel } from './comparePanel.js';

initI18n(document.getElementById('lang'));

/** Erro com mensagem traduzível (chave em i18n.js). */
class PageError extends Error {
  constructor(key) {
    super(key);
    this.i18nKey = key;
  }
}

const drop = document.getElementById('drop');
const input = document.getElementById('file');
const format = document.getElementById('format');
const fadeShadows = document.getElementById('fadeShadows');
const fadeCutoff = document.getElementById('fadeCutoff');
const fixDuplication = document.getElementById('fixDuplication');
const results = document.getElementById('results');
const preview = new YttPreview(document.getElementById('preview'));
const compare = new ComparePanel(document.getElementById('compare'));

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
  // Corrigir duplicação massiva: só no caminho .ytt/.json3 -> .srt (para .ytt/.ass a legenda fica como está).
  const dedup = targetExt === '.srt' && fixDuplication.checked;
  const content = new Uint8Array(await file.arrayBuffer());
  const format = getInputFormat(file.name, content);
  if (!format) throw new PageError('errUnknownFormat');
  const isYtt = format === InputFormat.Ytt;
  const name = baseName(file.name) + targetExt;

  // Um .ytt com destino .ytt não precisa de conversão: o arquivo baixado é o próprio (a não ser que a opção do fade
  // esteja ligada, que muda as sombras).
  if (isYtt && YTT_EXTENSIONS.includes(targetExt) && options.fadeShadowCutoff == null) {
    return { download: { name, blob: file }, ytt: content };
  }

  const doc = await load(file.name, content, dedup, true);
  if (doc.lines.length === 0) throw new PageError('errNoSubtitles');
  const text = convertDocument(doc, targetExt, options).save({ bom: true });
  // O BOM vem como \uFEFF no texto; o Blob grava em UTF-8.
  const download = { name, blob: new Blob([text], { type: 'text/plain;charset=utf-8' }) };

  let ytt;
  if (YTT_EXTENSIONS.includes(targetExt)) ytt = text;
  else if (isYtt && !dedup) ytt = content;
  // save() altera o documento, então o .ytt do preview sai de uma leitura nova.
  // Com a correção, o preview mostra as frases já juntas, mas com as cores e posições.
  else ytt = convertDocument(await load(file.name, content, dedup, false), '.ytt', options).save();
  return { download, ytt };
}

/** Lê o arquivo e, se pedido e a entrada for .ytt/.json3, junta as cópias quadro a quadro. */
async function load(fileName, content, dedup, plainText) {
  const doc = await loadDocument(fileName, content);
  if (dedup && canFixMassiveDuplication(doc)) fixMassiveDuplication(doc, { plainText });
  return doc;
}

// A correção de duplicação só vale para a saída .srt.
function updateDedupState() {
  fixDuplication.disabled = format.value !== '.srt';
  fixDuplication.closest('label').classList.toggle('disabled', fixDuplication.disabled);
}
format.addEventListener('change', updateDedupState);
updateDedupState();

function addRow(fileName) {
  const li = document.createElement('li');
  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = fileName;
  const status = document.createElement('span');
  setText(status, 'converting');
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
      setText(status, 'done');
      const dl = { name: download.name, url: URL.createObjectURL(download.blob) };
      const open = () => showPreview(ytt, file.name, dl);

      const btn = document.createElement('button');
      btn.type = 'button';
      setText(btn, 'viewPreview');
      btn.addEventListener('click', open);
      const a = document.createElement('a');
      a.className = 'btn';
      a.href = dl.url;
      a.download = dl.name;
      setText(a, 'downloadFile', { name: dl.name });
      li.append(btn, a);
      await addRecoverButton(li, file);

      if (files.length === 1) open();
    } catch (err) {
      console.error(err);
      status.className = 'err';
      // Erros da própria página são traduzidos; os da conversão aparecem como vieram.
      setText(status, 'error', { message: err.i18nKey ? { key: err.i18nKey } : err.message });
    }
  }
}

/**
 * Botão "Tentar recuperar tags originais (heurística)": só para .ytt/.srv3/.json3. Gera o .ass com as tags
 * deduzidas dos quadros (src/recover/recoverTags.js) e, se houver estilos com várias sombras, o StyleOptions.xml.
 */
async function addRecoverButton(li, file) {
  const content = new Uint8Array(await file.arrayBuffer());
  const format = getInputFormat(file.name, content);
  if (format !== InputFormat.Ytt && format !== InputFormat.Json3) return;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'recover';
  setText(btn, 'recoverBtn');
  btn.dataset.i18nTitle = 'recoverTitle';
  btn.title = t('recoverTitle');
  const info = document.createElement('span');
  info.className = 'recover-info';
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    setText(info, 'recovering');
    try {
      // Deixa o navegador desenhar o "Recuperando…" antes do trabalho pesado
      await new Promise((r) => setTimeout(r, 20));
      const doc = await loadDocument(file.name, content);
      const result = recoverTags({ lines: doc.lines, videoDimensions: doc.videoDimensions });
      const name = baseName(file.name) + '.recuperado.ass';
      const a = document.createElement('a');
      a.className = 'btn';
      a.href = URL.createObjectURL(new Blob(['\uFEFF' + result.ass], { type: 'text/plain;charset=utf-8' }));
      a.download = name;
      setText(a, 'downloadFile', { name });
      const tags = Object.entries(result.summary).map(([tag, n]) => `\\${tag} ×${n}`).join(', ');
      setText(info, 'recoverDone', { lines: result.events.length, tags: tags || { key: 'recoverNoTags' } });
      const extra = [a];
      if (result.styles.some((st) => st.shadowTypes.length > 1)) {
        const x = document.createElement('a');
        x.className = 'btn';
        x.href = URL.createObjectURL(new Blob([result.styleOptionsXml], { type: 'application/xml' }));
        x.download = 'StyleOptions.xml';
        setText(x, 'recoverStyleOptions');
        extra.push(x);
      }
      extra.push(compareButton(file, content, result));
      btn.replaceWith(...extra);
      a.click();
    } catch (err) {
      console.error(err);
      btn.disabled = false;
      setText(info, 'error', { message: err.message });
    }
  });
  li.append(btn, info);
}

/**
 * Botão "Comparar original × refeito": converte o .ass recuperado de volta para .ytt (com o próprio port) e
 * mostra os dois lado a lado, com a semelhança medida a cada 100 ms (src/compare/compareYtt.js).
 */
function compareButton(file, content, recovered) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'compare-btn';
  setText(btn, 'compareBtn');
  btn.dataset.i18nTitle = 'compareTitle';
  btn.title = t('compareTitle');
  let ready = null;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    setText(btn, 'comparing');
    try {
      await new Promise((r) => setTimeout(r, 20));
      if (!ready) {
        // Leitura nova do original: a recuperação pode ter mexido nas linhas da primeira.
        const original = await loadDocument(file.name, content);
        const { ytt, doc } = await remakeYtt(recovered);
        const name = baseName(file.name) + '.refeito.ytt';
        const url = URL.createObjectURL(new Blob(['\uFEFF' + ytt], { type: 'text/plain;charset=utf-8' }));
        ready = { original: original.lines, remade: doc.lines, download: { name, url } };
      }
      compare.show(ready.original, ready.remade, file.name, ready.download);
    } catch (err) {
      console.error(err);
      setText(btn, 'error', { message: err.message });
      btn.disabled = false;
      return;
    }
    setText(btn, 'compareBtn');
    btn.disabled = false;
  });
  return btn;
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
