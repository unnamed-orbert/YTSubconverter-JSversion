// Página do conversor: roda tudo no navegador com os mesmos módulos do port (sem servidor).
import { loadDocument, convertDocument, getInputFormat } from '../src/convert.js';
import { InputFormat } from '../src/detect.js';
import { YttDocument } from '../src/formats/ytt.js';
import { YttPreview } from './preview.js';
import { canFixMassiveDuplication, fixMassiveDuplication } from '../src/dedup.js';
import { initI18n, setText, t } from './i18n.js';
import { initTheme } from './theme.js';
import { recoverTags } from '../src/recover/recoverTags.js';
import { remakeYtt } from '../src/compare/remake.js';
import { ComparePanel } from './comparePanel.js';

initI18n(document.getElementById('lang'));
initTheme(document.getElementById('theme'));

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
const tagHierarchy = document.getElementById('tagHierarchy');
const noWrapPadding = document.getElementById('noWrapPadding');
const captureRadius = document.getElementById('captureRadius');
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
  const options = {
    // Com a hierarquia, a porcentagem é sempre o ponto em que o contorno sai e o texto some sozinho.
    fadeShadowCutoff: (fadeShadows.checked || tagHierarchy.checked) && cutoff > 0 ? Math.min(cutoff, 100) : null,
    tagHierarchy: tagHierarchy.checked,
    noWrapPadding: noWrapPadding.checked,
  };
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
  const doc = await loadDocument(fileName, content, { tagHierarchy: tagHierarchy.checked });
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

/**
 * Arquivos carregados. Cada um guarda a linha da lista e o que está aberto dele, para ser convertido de novo quando
 * uma opção que muda a saída muda (ou no botão "Atualizar arquivos"), sem precisar soltar o arquivo outra vez.
 * @typedef {{file: File, li: HTMLLIElement, status: HTMLElement, actions: HTMLElement, urls: string[],
 *   recovered: boolean, run: number}} Entry
 * @type {Entry[]}
 */
const entries = [];
/** Arquivo mostrado no preview e no comparador (para reabrir no mesmo ponto depois de atualizar). */
let previewEntry = null;
let compareEntry = null;

function addEntry(file) {
  const li = document.createElement('li');
  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = file.name;
  const status = document.createElement('span');
  const actions = document.createElement('span');
  actions.className = 'actions';
  li.append(name, status, actions);
  results.prepend(li);
  const entry = { file, li, status, actions, urls: [], recovered: false, run: 0 };
  entries.push(entry);
  updateRefreshState();
  return entry;
}

function objectUrl(entry, blob) {
  const url = URL.createObjectURL(blob);
  entry.urls.push(url);
  return url;
}

/**
 * Converte (ou reconverte) um arquivo com as opções atuais e refaz os botões da linha.
 * @param {Entry} entry
 * @param {{open?: boolean, refresh?: boolean}} opts open: abrir o preview; refresh: é uma atualização
 */
async function processEntry(entry, { open = false, refresh = false } = {}) {
  const run = ++entry.run;
  const stale = () => run !== entry.run;
  const { file, status } = entry;
  // Os botões novos são montados fora da página e trocados de uma vez, para a lista não pular durante a atualização.
  const next = document.createElement('span');
  next.className = 'actions';
  const swap = () => {
    entry.actions.replaceWith(next);
    entry.actions = next;
  };
  status.className = '';
  setText(status, refresh ? 'refreshing' : 'converting');
  const oldUrls = entry.urls;
  entry.urls = [];
  try {
    const { download, ytt } = await convertFile(file, format.value);
    if (stale()) return;
    const dl = { name: download.name, url: objectUrl(entry, download.blob) };
    const show = (keepTime = false) => {
      previewEntry = entry;
      preview.captureRadius = Number(captureRadius.value);
      showPreview(ytt, file.name, dl, keepTime);
    };

    const btn = document.createElement('button');
    btn.type = 'button';
    setText(btn, 'viewPreview');
    btn.addEventListener('click', () => show());
    const a = document.createElement('a');
    a.className = 'btn';
    a.href = dl.url;
    a.download = dl.name;
    setText(a, 'downloadFile', { name: dl.name });
    next.append(btn, a);
    await addRecoverButton(entry, next);
    if (stale()) return;
    swap();
    status.className = 'ok';
    setText(status, 'done');

    if (open) show();
    else if (refresh && previewEntry === entry && !preview.root.hidden) show(true);
  } catch (err) {
    if (stale()) return;
    console.error(err);
    status.className = 'err';
    // Erros da própria página são traduzidos; os da conversão aparecem como vieram.
    setText(status, 'error', { message: err.i18nKey ? { key: err.i18nKey } : err.message });
    swap();
    // O preview pode estar mostrando a conversão anterior: os links dela continuam valendo.
    entry.urls.push(...oldUrls.splice(0));
    // A recuperação de tags lê o .ytt/.json3 por conta própria: um erro na conversão não pode esconder o botão.
    await addRecoverButton(entry, next).catch((e) => console.error(e));
  } finally {
    // Os links antigos só são liberados depois que os novos estão na página.
    if (!stale()) for (const url of oldUrls) URL.revokeObjectURL(url);
  }
}

async function handleFiles(files) {
  for (const file of files) {
    await processEntry(addEntry(file), { open: files.length === 1 });
  }
}

/** Reconverte todos os arquivos carregados, mantendo o preview e o comparador abertos no mesmo ponto. */
async function refreshAll() {
  for (const entry of [...entries]) await processEntry(entry, { refresh: true });
}

const refreshBtn = document.getElementById('refresh');
function updateRefreshState() {
  refreshBtn.hidden = entries.length === 0;
}
refreshBtn.addEventListener('click', () => refreshAll());

// Qualquer opção que muda a saída reconverte os arquivos já carregados (com uma pequena espera, para não
// reconverter a cada tecla no campo de número).
let refreshTimer = null;
function scheduleRefresh() {
  clearTimeout(refreshTimer);
  if (entries.length) refreshTimer = setTimeout(refreshAll, 400);
}
for (const el of [format, fadeShadows, fadeCutoff, tagHierarchy, noWrapPadding, captureRadius, fixDuplication]) {
  el.addEventListener('change', scheduleRefresh);
  if (el.type === 'number') el.addEventListener('input', scheduleRefresh);
}

function showPreview(ytt, name, download, keepTime) {
  // O preview lê o .ytt gerado (o mesmo arquivo que vai para o YouTube).
  preview.show(YttDocument.parse(ytt), name, download, { keepTime });
}

/**
 * Botão "Tentar recuperar tags originais (heurística)": só para .ytt/.srv3/.json3. Gera o .ass com as tags
 * deduzidas dos quadros (src/recover/recoverTags.js) e, se houver estilos com várias sombras, o StyleOptions.xml.
 * Numa atualização, se a recuperação já tinha sido feita, ela é refeita sozinha (sem baixar de novo).
 * @param {Entry} entry
 * @param {HTMLElement} actions onde ficam os botões
 */
async function addRecoverButton(entry, actions) {
  const { file } = entry;
  const run = entry.run;
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
  const recover = async ({ auto = false } = {}) => {
    btn.disabled = true;
    setText(info, 'recovering');
    try {
      // Deixa o navegador desenhar o "Recuperando…" antes do trabalho pesado
      await new Promise((r) => setTimeout(r, 20));
      const doc = await loadDocument(file.name, content);
      const result = recoverTags({ lines: doc.lines, videoDimensions: doc.videoDimensions }, { captureRadius: Number(captureRadius.value) });
      if (run !== entry.run) return;
      entry.recovered = true;
      const name = baseName(file.name) + '.recuperado.ass';
      const a = document.createElement('a');
      a.className = 'btn';
      a.href = objectUrl(entry, new Blob(['﻿' + result.ass], { type: 'text/plain;charset=utf-8' }));
      a.download = name;
      setText(a, 'downloadFile', { name });
      const tags = Object.entries(result.summary).map(([tag, n]) => `\\${tag} ×${n}`).join(', ');
      setText(info, 'recoverDone', { lines: result.events.length, tags: tags || { key: 'recoverNoTags' } });
      const extra = [a];
      if (result.styles.some((st) => st.shadowTypes.length > 1)) {
        const x = document.createElement('a');
        x.className = 'btn';
        x.href = objectUrl(entry, new Blob([result.styleOptionsXml], { type: 'application/xml' }));
        x.download = 'StyleOptions.xml';
        setText(x, 'recoverStyleOptions');
        extra.push(x);
      }
      const cmp = compareButton(entry, content, result);
      extra.push(cmp.btn);
      btn.replaceWith(...extra);
      if (!auto) a.click();
      // O comparador aberto com este arquivo é refeito com a recuperação nova, no mesmo ponto.
      else if (compareEntry === entry && !compare.root.hidden) await cmp.open(true);
    } catch (err) {
      console.error(err);
      btn.disabled = false;
      setText(info, 'error', { message: err.message });
    }
  };
  btn.addEventListener('click', () => recover());
  actions.append(btn, info);
  if (entry.recovered) await recover({ auto: true });
}

/**
 * Botão "Comparar original × refeito": converte o .ass recuperado de volta para .ytt (com o próprio port) e
 * mostra os dois lado a lado, com a semelhança medida a cada 100 ms (src/compare/compareYtt.js).
 */
function compareButton(entry, content, recovered) {
  const { file } = entry;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'compare-btn';
  setText(btn, 'compareBtn');
  btn.dataset.i18nTitle = 'compareTitle';
  btn.title = t('compareTitle');
  let ready = null;
  const open = async (keepTime = false) => {
    btn.disabled = true;
    setText(btn, 'comparing');
    try {
      await new Promise((r) => setTimeout(r, 20));
      if (!ready) {
        // Leitura nova do original: a recuperação pode ter mexido nas linhas da primeira.
        const original = await loadDocument(file.name, content);
        const { ytt, doc } = await remakeYtt(recovered);
        const name = baseName(file.name) + '.refeito.ytt';
        const url = objectUrl(entry, new Blob(['﻿' + ytt], { type: 'text/plain;charset=utf-8' }));
        ready = { original: original.lines, remade: doc.lines, download: { name, url } };
      }
      compareEntry = entry;
      compare.show(ready.original, ready.remade, file.name, ready.download, { keepTime });
    } catch (err) {
      console.error(err);
      setText(btn, 'error', { message: err.message });
      btn.disabled = false;
      return;
    }
    setText(btn, 'compareBtn');
    btn.disabled = false;
  };
  btn.addEventListener('click', () => open());
  return { btn, open };
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
