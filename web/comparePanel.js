// Comparação lado a lado: o .ytt original e o .ytt refeito a partir do .ass recuperado, tocando juntos.
// A barra de tempo mostra a semelhança a cada 100 ms e em que propriedade os dois diferem (texto, posição,
// cor, opacidade, linha a mais/a menos); embaixo, a lista do que difere no instante atual.

import { setText, t, onLanguageChange } from './i18n.js';
import { renderLine, formatTime } from './preview.js';
import { compareAt, compareDocuments, visibleLines } from '../src/compare/compareYtt.js';

const REF_HEIGHT = 720;
const BASE_FONT_PX = 30;
/** Linhas da barra: semelhança e depois uma por tipo de diferença (bits de compareDocuments). */
const ROWS = [
  { key: 'compareRowSimilarity', bit: 0 },
  { key: 'kindText', bit: 1 },
  { key: 'kindPosition', bit: 2 },
  { key: 'kindColor', bit: 4 },
  { key: 'kindOpacity', bit: 8 },
  { key: 'kindMissing', bit: 16 },
];
const KIND_COLORS = { 1: '#e8833a', 2: '#3a8ee8', 4: '#c04ad6', 8: '#8a8f99', 16: '#d63a3a' };
const ROW_H = 12;
const ROW_GAP = 3;
const MAX_DIFF_ROWS = 30;
const KIND_KEY = { text: 'kindText', position: 'kindPosition', color: 'kindColor', opacity: 'kindOpacity', missing: 'kindMissing' };

const hex2 = (v) => Math.round(v).toString(16).toUpperCase().padStart(2, '0');
const hex = (rgb) => (rgb ? `#${hex2(rgb[0])}${hex2(rgb[1])}${hex2(rgb[2])}` : '—');
const pct = (v) => (Math.round(v * 10) / 10).toLocaleString(undefined, { maximumFractionDigits: 1 });

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
}

/** Cor da nota (0-1): verde quando igual, amarelo, vermelho a partir de 50%. */
function scoreColor(score) {
  if (Number.isNaN(score)) return null;
  if (score >= 0.97) return '#2e9b55';
  const hue = 50 * Math.max(0, (score - 0.5) / 0.47);
  return `hsl(${hue}, 80%, 48%)`;
}

export class ComparePanel {
  /** @param {HTMLElement} root a seção #compare */
  constructor(root) {
    this.root = root;
    this.title = root.querySelector('.title');
    this.downloadLink = root.querySelector('.download');
    this.stages = [...root.querySelectorAll('.stage')];
    this.layers = this.stages.map((s) => s.querySelector('.cues'));
    this.playBtn = root.querySelector('.play');
    this.seek = root.querySelector('.seek');
    this.timeLabel = root.querySelector('.time');
    this.simLabel = root.querySelector('.cmp-sim');
    this.propsLabel = root.querySelector('.cmp-props');
    this.segsLabel = root.querySelector('.cmp-segs');
    this.nowLabel = root.querySelector('.cmp-now');
    this.diffList = root.querySelector('.cmp-diffs');
    this.canvas = root.querySelector('.cmp-bar');
    this.cursor = root.querySelector('.cmp-cursor');
    this.labels = root.querySelector('.cmp-labels');
    this.sides = [[], []];
    this.result = null;
    this.time = 0;
    this.duration = 0;
    this.playing = false;
    this.lastKeys = ['', ''];
    this.lastSample = -1;

    for (const stage of this.stages) {
      new ResizeObserver(() => {
        stage.style.fontSize = `${(stage.clientHeight / REF_HEIGHT) * BASE_FONT_PX}px`;
      }).observe(stage);
      stage.addEventListener('click', () => this.toggle());
    }
    new ResizeObserver(() => this.drawBar()).observe(this.canvas);
    this.labels.replaceChildren(...ROWS.map((r) => {
      const span = el('span');
      setText(span, r.key);
      if (r.bit) span.style.setProperty('--kind', KIND_COLORS[r.bit]);
      return span;
    }));

    this.playBtn.addEventListener('click', () => this.toggle());
    this.seek.addEventListener('input', () => this.setTime(Number(this.seek.value)));
    root.querySelector('.cmp-prev').addEventListener('click', () => this.jump(-1));
    root.querySelector('.cmp-next').addEventListener('click', () => this.jump(1));
    const seekFromBar = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.setTime(((e.clientX - rect.left) / rect.width) * this.duration);
    };
    this.canvas.addEventListener('pointerdown', (e) => {
      seekFromBar(e);
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (e.buttons) seekFromBar(e);
    });
    root.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' && e.target.type !== 'range') return;
      if (e.key === ' ') { e.preventDefault(); this.toggle(); }
    });
    onLanguageChange(() => this.refreshTexts());
  }

  /**
   * @param {import('../src/model.js').Line[]} original
   * @param {import('../src/model.js').Line[]} remade
   * @param {string} name
   * @param {{name: string, url: string} | null} download .ytt refeito
   */
  show(original, remade, name, download = null) {
    this.sides = [visibleLines(original), visibleLines(remade)];
    this.result = compareDocuments(this.sides[0], this.sides[1]);
    this.duration = Math.max(this.result.duration, 1000);
    this.seek.max = String(Math.ceil(this.duration));
    this.title.textContent = name;
    this.downloadLink.hidden = !download;
    if (download) {
      this.downloadLink.href = download.url;
      this.downloadLink.download = download.name;
      setText(this.downloadLink, 'downloadFile', { name: download.name });
    }
    this.lastKeys = ['', ''];
    this.lastSample = -1;
    this.root.hidden = false;
    this.refreshTexts();
    this.drawBar();
    const first = Math.min(...this.sides.flat().map((l) => l.start));
    // Começa na primeira diferença (ou logo antes da primeira legenda)
    const seg = this.result.segments[0];
    const start = seg ? seg.start + this.result.step / 2 : Number.isFinite(first) ? first - 500 : 0;
    this.setTime(Math.max(0, start));
    this.root.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return this.result;
  }

  refreshTexts() {
    const r = this.result;
    if (!r) return;
    setText(this.simLabel, 'compareSimilarity', { pct: pct(r.similarity) });
    setText(this.propsLabel, 'compareByProp', Object.fromEntries(Object.entries(r.byProperty).map(([k, v]) => [k, pct(v)])));
    setText(this.segsLabel, 'compareSegments', { n: r.segments.length });
    this.lastSample = -1;
    this.render();
  }

  /** Desenha a barra: uma coluna de pixels junta as amostras daquele trecho (a pior nota, todas as diferenças). */
  drawBar() {
    const r = this.result;
    const canvas = this.canvas;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const rowH = ROW_H * dpr;
    const gap = ROW_GAP * dpr;
    const h = Math.round(ROWS.length * rowH + (ROWS.length - 1) * gap);
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    const style = getComputedStyle(this.root);
    ctx.fillStyle = style.getPropertyValue('--line') || '#ccc';
    for (let row = 0; row < ROWS.length; row++) ctx.fillRect(0, row * (rowH + gap), w, rowH);
    if (!r) return;
    const n = r.samples.length;
    for (let x = 0; x < w; x++) {
      const k0 = Math.floor((x / w) * n);
      const k1 = Math.max(k0 + 1, Math.floor(((x + 1) / w) * n));
      let worst = NaN;
      let bits = 0;
      for (let k = k0; k < k1 && k < n; k++) {
        const s = r.samples[k];
        if (!Number.isNaN(s) && !(s >= worst)) worst = s;
        bits |= r.kinds[k];
      }
      const color = scoreColor(worst);
      if (color) {
        ctx.fillStyle = color;
        ctx.fillRect(x, 0, 1, rowH);
      }
      for (let row = 1; row < ROWS.length; row++) {
        const bit = ROWS[row].bit;
        if (bits & bit) {
          ctx.fillStyle = KIND_COLORS[bit];
          ctx.fillRect(x, row * (rowH + gap), 1, rowH);
        }
      }
    }
  }

  /** Vai para o começo do trecho diferente seguinte (dir = 1) ou anterior (dir = -1). */
  jump(dir) {
    const segs = this.result?.segments ?? [];
    if (!segs.length) return;
    const now = this.time;
    let target;
    if (dir > 0) target = segs.find((s) => s.start > now + 1) ?? segs[0];
    else target = [...segs].reverse().find((s) => s.start < now - 1 && !(now < s.end && now - s.start < 300)) ?? segs[segs.length - 1];
    this.setPlaying(false);
    this.setTime(target.start + this.result.step / 2);
  }

  setTime(ms) {
    this.time = Math.min(Math.max(0, ms), this.duration);
    this.clockOrigin = performance.now() - this.time;
    this.render();
  }

  toggle() {
    if (!this.playing && this.time >= this.duration) this.setTime(0);
    this.setPlaying(!this.playing);
  }

  setPlaying(playing) {
    if (this.playing === playing) return;
    this.playing = playing;
    setText(this.playBtn, playing ? 'pause' : 'play');
    this.clockOrigin = performance.now() - this.time;
    if (playing) requestAnimationFrame(() => this.tick());
  }

  tick() {
    if (!this.playing) return;
    this.time = performance.now() - this.clockOrigin;
    if (this.time >= this.duration) {
      this.time = this.duration;
      this.setPlaying(false);
    }
    this.render();
    requestAnimationFrame(() => this.tick());
  }

  render() {
    const time = this.time;
    this.seek.value = String(Math.round(time));
    this.timeLabel.textContent = `${formatTime(time)} / ${formatTime(this.duration)}`;
    this.cursor.style.left = `${(time / this.duration) * 100}%`;

    let changed = false;
    for (let side = 0; side < 2; side++) {
      const lines = this.sides[side];
      const active = [];
      const keys = [];
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (time >= line.start && time < line.end) {
          active.push(i);
          keys.push(`${i}:${line.sections.filter((s) => time >= line.start + s.startOffset).length}`);
        }
      }
      const key = keys.join(',');
      if (key === this.lastKeys[side]) continue;
      this.lastKeys[side] = key;
      changed = true;
      this.layers[side].replaceChildren(...active.map((i) => renderLine(lines[i], time, i)));
    }

    // A lista de diferenças acompanha as amostras (a cada 100 ms), não cada quadro de tela.
    const sample = this.result ? Math.floor(time / this.result.step) : -1;
    if (sample !== this.lastSample) {
      this.lastSample = sample;
      this.current = compareAt(this.sides[0], this.sides[1], time);
      this.renderDiffs();
      changed = true;
    }
    if (changed) this.applyMarks();
  }

  /** Contorno nas linhas que diferem (laranja) e nas que só existem de um lado (vermelho). */
  applyMarks() {
    const r = this.current;
    if (!r) return;
    const marks = [new Map(), new Map()];
    for (const p of r.pairs) {
      if (p.score < 0.999) {
        marks[0].set(p.a.index, 'cmp-diff');
        marks[1].set(p.b.index, 'cmp-diff');
      }
    }
    for (const a of r.onlyA) marks[0].set(a.index, 'cmp-only');
    for (const b of r.onlyB) marks[1].set(b.index, 'cmp-only');
    for (let side = 0; side < 2; side++) {
      for (const cue of this.layers[side].children) {
        const mark = marks[side].get(Number(cue.dataset.line));
        cue.classList.toggle('cmp-diff', mark === 'cmp-diff');
        cue.classList.toggle('cmp-only', mark === 'cmp-only');
      }
    }
  }

  renderDiffs() {
    const r = this.current;
    const rows = [];
    if (r.score === null) {
      setText(this.nowLabel, 'compareNowEmpty');
    } else {
      setText(this.nowLabel, 'compareNow', { pct: pct(r.score * 100) });
    }
    const quote = (s) => `“${s.key.length > 80 ? s.key.slice(0, 79) + '…' : s.key}”`;
    const diffPairs = r.pairs.filter((p) => p.score < 0.999).sort((x, y) => x.score - y.score);
    for (const p of diffPairs) {
      const li = el('li', 'cmp-pair');
      li.append(el('span', 'cmp-score', `${pct(p.score * 100)}%`));
      const text = el('span', 'cmp-text', p.a.key === p.b.key ? quote(p.a) : `${quote(p.a)} → ${quote(p.b)}`);
      li.append(text);
      const tags = el('span', 'cmp-tags');
      if (p.scores.text < 1) tags.append(this.tag('text', `${pct(p.scores.text * 100)}%`));
      if (p.scores.position < 1) tags.append(this.tag('position', t('compareDist', { px: Math.round(p.dist) })));
      if (p.scores.color < 1) tags.append(this.tag('color', `${hex(p.a.colors[0])} → ${hex(p.b.colors[0])}`));
      if (p.scores.opacity < 1) {
        tags.append(this.tag('opacity', `${Math.round((p.a.alpha / 255) * 100)}% → ${Math.round((p.b.alpha / 255) * 100)}%`));
      }
      li.append(tags);
      li.addEventListener('pointerenter', () => this.highlight(p.a.index, p.b.index));
      li.addEventListener('pointerleave', () => this.highlight(null, null));
      rows.push(li);
    }
    for (const [list, key, side] of [[r.onlyA, 'compareOnlyA', 0], [r.onlyB, 'compareOnlyB', 1]]) {
      for (const s of list) {
        const li = el('li', 'cmp-missing');
        const label = el('span', 'cmp-tag');
        label.style.setProperty('--kind', KIND_COLORS[16]);
        setText(label, key);
        li.append(label, el('span', 'cmp-text', quote(s)));
        li.addEventListener('pointerenter', () => this.highlight(side === 0 ? s.index : null, side === 1 ? s.index : null));
        li.addEventListener('pointerleave', () => this.highlight(null, null));
        rows.push(li);
      }
    }
    if (!rows.length && r.score !== null) {
      const li = el('li', 'cmp-same');
      setText(li, 'compareSame');
      rows.push(li);
    }
    // Cópias iguais (camadas de sombra, \ytchroma...) viram uma linha só, com "×N".
    const unique = new Map();
    for (const li of rows) {
      const key = li.className + li.textContent;
      const prev = unique.get(key);
      if (prev) prev.count++;
      else unique.set(key, { li, count: 1 });
    }
    for (const { li, count } of unique.values()) {
      if (count > 1) li.querySelector('.cmp-text')?.after(el('span', 'cmp-count', `×${count}`));
    }
    this.diffList.replaceChildren(...[...unique.values()].slice(0, MAX_DIFF_ROWS).map((u) => u.li));
  }

  tag(kind, detail) {
    const span = el('span', 'cmp-tag');
    span.style.setProperty('--kind', KIND_COLORS[{ text: 1, position: 2, color: 4, opacity: 8 }[kind]]);
    span.append(el('b', null, t(KIND_KEY[kind])), document.createTextNode(` ${detail}`));
    return span;
  }

  /** Destaca nos dois palcos as linhas apontadas na lista. */
  highlight(a, b) {
    const on = a !== null || b !== null;
    [a, b].forEach((index, side) => {
      const layer = this.layers[side];
      layer.classList.toggle('has-hl', on);
      for (const cue of layer.children) cue.classList.toggle('debug-hl', on && Number(cue.dataset.line) === index);
    });
  }
}

