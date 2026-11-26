// Tabela de debug do preview: no tempo atual, as linhas na tela e o que cada trecho desenha (posição, fonte,
// cores e opacidades, contorno/sombra, karaokê, ruby...), mais os efeitos percebidos (fade, movimento...) e um
// palpite das tags .ass que produziriam aquilo.

import { t, onLanguageChange } from './i18n.js';
import { HorizontalTextDirection, OffsetType, RubyPart, VerticalTextType } from '../src/enums.js';
import {
  anNumber, buildTracks, describeEffects, groupLayers, groupShadows, guessAssTags, hexColor, opacityPercent,
} from './debugInfo.js';
import { recoverTags } from '../src/recover/recoverTags.js';

const STORAGE_KEY = 'ytsub-debug';
/** Grupos mostrados no máximo (arquivos com muitas camadas podem ter dezenas de linhas ao mesmo tempo). */
const MAX_GROUPS = 40;
/** Intervalo mínimo entre atualizações enquanto toca (ms). */
const PLAYING_INTERVAL = 150;

const COLUMNS = ['colLine', 'colTime', 'colPos', 'colText', 'colFont', 'colColor', 'colBack', 'colShadow', 'colExtra', 'colEffects'];

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
}

function formatTime(ms) {
  ms = Math.max(0, Math.round(ms));
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}:${String(s).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
}

/** Amostra de cor + #RRGGBB + opacidade. */
function colorCell(color) {
  const td = el('td');
  if (!color || color.isEmpty) {
    td.textContent = '—';
    return td;
  }
  td.append(swatch(color), `${hexColor(color)} ${opacityPercent(color.a)}%`);
  return td;
}

function swatch(color) {
  const s = el('span', 'swatch');
  s.style.boxShadow = `inset 0 0 0 1em rgba(${color.r}, ${color.g}, ${color.b}, ${(color.a / 255).toFixed(3)})`;
  return s;
}

const RUBY_KEYS = {
  [RubyPart.Base]: 'rubyBase', [RubyPart.Parenthesis]: 'rubyParenthesis',
  [RubyPart.TextBefore]: 'rubyTextBefore', [RubyPart.TextAfter]: 'rubyTextAfter',
};

export class DebugPanel {
  /**
   * @param {HTMLElement} root elemento .debug (com .debug-summary, .debug-copy, .debug-table)
   * @param {HTMLInputElement} toggle caixa que liga/desliga
   * @param {import('./preview.js').YttPreview} preview
   */
  constructor(root, toggle, preview) {
    this.root = root;
    this.toggle = toggle;
    this.preview = preview;
    this.summary = root.querySelector('.debug-summary');
    this.table = root.querySelector('.debug-table');
    this.copyBtn = root.querySelector('.debug-copy');
    this.tracks = null;
    /** @type {Map<number, object> | null} linha -> evento recuperado (src/recover/recoverTags.js) */
    this.recovered = null;
    this.timer = null;
    this.lastUpdate = 0;

    try {
      toggle.checked = localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      // armazenamento bloqueado
    }
    root.hidden = !toggle.checked;
    toggle.addEventListener('change', () => {
      root.hidden = !toggle.checked;
      try {
        localStorage.setItem(STORAGE_KEY, toggle.checked ? '1' : '0');
      } catch {
        // armazenamento bloqueado
      }
      if (toggle.checked) this.refresh();
      else this.preview.setHighlight(null);
    });
    this.copyBtn.addEventListener('click', () => this.copy());
    onLanguageChange(() => this.refresh());
  }

  get enabled() {
    return this.toggle.checked;
  }

  /** Arquivo novo no preview: as trilhas são calculadas de novo quando a tabela for usada. */
  reset() {
    this.tracks = null;
    this.recovered = null;
  }

  /** Tags recuperadas pela mesma heurística do botão "Tentar recuperar tags originais" (por linha). */
  recoveredFor(lineIndex) {
    if (!this.recovered) {
      this.recovered = new Map();
      try {
        for (const event of recoverTags({ lines: this.preview.lines }).events) {
          for (const i of event.sourceLines) this.recovered.set(i, event);
        }
      } catch (err) {
        console.error(err);
      }
    }
    return this.recovered.get(lineIndex) ?? null;
  }

  /** Chamado pelo preview quando muda o que está na tela. */
  schedule() {
    if (!this.enabled) return;
    clearTimeout(this.timer);
    const wait = this.preview.playing ? PLAYING_INTERVAL - (performance.now() - this.lastUpdate) : 0;
    if (wait <= 0) this.refresh();
    else this.timer = setTimeout(() => this.refresh(), wait);
  }

  refresh() {
    if (!this.enabled) return;
    clearTimeout(this.timer);
    this.lastUpdate = performance.now();
    const { lines, time } = this.preview;
    if (!this.tracks) this.tracks = buildTracks(lines);
    const active = this.preview.activeLines();
    const groups = groupLayers(lines, active);

    this.summary.textContent = t('debugSummary', { time: formatTime(time), lines: active.length, groups: groups.length });
    this.table.replaceChildren();
    if (groups.length === 0) {
      const tr = el('tr');
      const td = el('td', 'debug-empty', t('debugEmpty'));
      td.colSpan = COLUMNS.length;
      tr.append(td);
      this.table.append(tr);
      return;
    }

    const thead = el('thead');
    const hr = el('tr');
    for (const key of COLUMNS) hr.append(el('th', null, t(key)));
    thead.append(hr);
    this.table.append(thead);

    for (const group of groups.slice(0, MAX_GROUPS)) this.table.append(this.groupBody(group, time));
    if (groups.length > MAX_GROUPS) {
      const tr = el('tr');
      const td = el('td', 'debug-empty', t('debugMore', { n: groups.length - MAX_GROUPS }));
      td.colSpan = COLUMNS.length;
      tr.append(td);
      this.table.append(tr);
    }
  }

  groupBody(group, time) {
    const { lines } = this.preview;
    const line = lines[group[0]];
    const track = this.tracks.tracks[this.tracks.trackOf[group[0]]];
    const tbody = el('tbody', 'debug-group');
    tbody.addEventListener('mouseenter', () => this.preview.setHighlight(group));
    tbody.addEventListener('mouseleave', () => this.preview.setHighlight(null));

    const n = line.sections.length;
    const span = (td) => {
      td.rowSpan = n;
      return td;
    };

    // Colunas da linha inteira
    const lineCell = span(el('td', 'mono', `#${group[0] + 1}` + (group.length > 1 ? ` ×${group.length}` : '')));
    lineCell.title = group.map((i) => `#${i + 1}`).join(' ');
    const timeCell = span(el('td', 'mono'));
    timeCell.append(`${formatTime(line.start)} →`, el('br'), `${formatTime(line.end)}`, el('br'), `(${line.end - line.start} ms)`);
    const posCell = span(el('td', 'mono'));
    posCell.append(`\\an${anNumber(line.anchorPoint)}`, el('br'),
      line.position ? `${Math.round(line.position.x * 10) / 10}, ${Math.round(line.position.y * 10) / 10}` : t('dbgDefaultPos'));
    const effCell = span(el('td', 'effects'));
    const recoveredEvent = this.recoveredFor(group[0]);
    if (recoveredEvent) {
      // Os efeitos da recuperação de tags (a mesma do botão), que olha a linha inteira e cada sílaba
      if (recoveredEvent.tags.length === 0) effCell.textContent = t('dbgStatic');
      for (const tag of recoveredEvent.tags) effCell.append(el('div', null, tag.text));
    } else {
      const effects = describeEffects(lines, group, track);
      if (effects.length === 0) effCell.textContent = t('dbgStatic');
      for (const e of effects) effCell.append(el('div', null, t(e.key, e.params)));
    }

    line.sections.forEach((s, i) => {
      const tr = el('tr');
      if (i === 0) tr.append(lineCell, timeCell, posCell);

      const shownAt = line.start + s.startOffset;
      const textCell = el('td', 'text');
      textCell.append(el('span', 'sample', s.text.replace(/\r?\n/g, '⏎')));
      if (time < shownAt) {
        textCell.classList.add('not-yet');
        textCell.append(el('div', 'hint', t('dbgHiddenUntil', { ms: shownAt - Math.round(time) })));
      }
      tr.append(textCell);

      const style = [s.font ?? 'Roboto', `${Math.round((s.scale || 1) * 100)}%`];
      if (s.bold) style.push('B');
      if (s.italic) style.push('I');
      if (s.underline) style.push('U');
      tr.append(el('td', null, style.join(' ')), colorCell(s.foreColor), colorCell(s.backColor));

      const shadowCell = el('td');
      const shadows = groupShadows(lines, group, i);
      if (shadows.size === 0) shadowCell.textContent = '—';
      for (const [type, color] of shadows) {
        const d = el('div');
        d.append(swatch(color), `${t('sh' + type)} ${hexColor(color)} ${opacityPercent(color.a)}%`);
        shadowCell.append(d);
      }
      tr.append(shadowCell);

      const extra = [];
      if (s.startOffset > 0) extra.push(t('dbgKaraokeAt', { ms: s.startOffset }));
      if (s.rubyPart !== RubyPart.None) extra.push(t('dbgRuby', { part: { key: RUBY_KEYS[s.rubyPart] } }));
      if (s.offset === OffsetType.Subscript) extra.push(t('dbgSub'));
      if (s.offset === OffsetType.Superscript) extra.push(t('dbgSup'));
      if (s.packed) extra.push(t('dbgPacked'));
      if (i === 0 && line.verticalTextType !== VerticalTextType.None) extra.push(t('dbgVertical'));
      if (i === 0 && line.horizontalTextDirection === HorizontalTextDirection.RightToLeft) extra.push(t('dbgRtl'));
      const extraCell = el('td');
      if (extra.length === 0) extraCell.textContent = '—';
      for (const x of extra) extraCell.append(el('div', null, x));
      tr.append(extraCell);

      if (i === 0) tr.append(effCell);
      tbody.append(tr);
    });

    const tagRow = el('tr', 'tags');
    const tagCell = el('td');
    tagCell.colSpan = COLUMNS.length;
    const recovered = recoveredEvent;
    if (recovered) {
      // Mesma heurística da recuperação do .ass: a linha inteira (todos os quadros) e o motivo de cada tag
      tagCell.append(el('span', 'tags-label', t('dbgAssRecovered')), ' ',
        el('code', null, `${formatTime(recovered.start)} → ${formatTime(recovered.end)} ${recovered.style}: ${recovered.assText}`));
      for (const tag of recovered.tags) tagCell.append(el('div', 'hint', `${tag.text}: ${tag.reason}`));
    } else {
      tagCell.append(el('span', 'tags-label', t('dbgAssGuess')), ' ', el('code', null, guessAssTags(lines, group, track?.info)));
    }
    tagRow.append(tagCell);
    tbody.append(tagRow);
    return tbody;
  }

  async copy() {
    // Texto separado por tabulação: cola direto numa planilha ou numa conversa.
    const rows = [this.summary.textContent];
    for (const tr of this.table.querySelectorAll('tr')) {
      rows.push([...tr.cells].map((c) => c.innerText.replace(/\s*\n\s*/g, ' ').trim()).join('\t'));
    }
    const text = rows.join('\n');
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = el('textarea');
      area.value = text;
      document.body.append(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    this.copyBtn.textContent = t('debugCopied');
    setTimeout(() => (this.copyBtn.textContent = t('debugCopy')), 1500);
  }
}
