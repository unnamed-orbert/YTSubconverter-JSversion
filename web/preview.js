// Preview de .ytt: desenha as legendas (já lidas por YttDocument) sobre uma área 16:9, imitando o
// player do YouTube: posição, alinhamento, fonte, tamanho, cores, fundo, contorno/sombra, karaokê
// (trechos com startOffset), sub/sobrescrito, ruby e texto vertical. É uma aproximação: o resultado
// final depende do player do YouTube.

import { setText } from './i18n.js';
import { DebugPanel } from './debugPanel.js';
import { AnchorPoint, HorizontalTextDirection, OffsetType, RubyPart, ShadowType, VerticalTextType } from '../src/enums.js';

// Coordenadas dos .ytt lidos pelo port estão nesta resolução de referência.
const REF_WIDTH = 1280;
const REF_HEIGHT = 720;
// Tamanho do texto a 100% num vídeo de 720 px de altura (aproximação do player do YouTube).
const BASE_FONT_PX = 30;

const FONT_FAMILIES = {
  'Roboto': '"YouTube Noto", Roboto, Arial, Helvetica, Verdana, "PT Sans Caption", sans-serif',
  'Courier New': '"Courier New", Courier, "Nimbus Mono L", "Cutive Mono", monospace',
  'Times New Roman': '"Times New Roman", Times, Georgia, Cambria, "PT Serif Caption", serif',
  'Lucida Console': '"Deja Vu Sans Mono", "Lucida Console", Monaco, Consolas, "PT Mono", monospace',
  'Comic Sans Ms': '"Comic Sans MS", Impact, Handlee, fantasy',
  'Monotype Corsiva': '"Monotype Corsiva", "URW Chancery L", "Apple Chancery", "Dancing Script", cursive',
  'Carrois Gothic Sc': 'Arial, Helvetica, Verdana, "Marcellus SC", sans-serif',
};

const ANCHOR = {
  [AnchorPoint.TopLeft]: [0, 0], [AnchorPoint.TopCenter]: [50, 0], [AnchorPoint.TopRight]: [100, 0],
  [AnchorPoint.MiddleLeft]: [0, 50], [AnchorPoint.Center]: [50, 50], [AnchorPoint.MiddleRight]: [100, 50],
  [AnchorPoint.BottomLeft]: [0, 100], [AnchorPoint.BottomCenter]: [50, 100], [AnchorPoint.BottomRight]: [100, 100],
};

function css(color, fallback) {
  if (!color || color.isEmpty) return fallback;
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${(color.a / 255).toFixed(3)})`;
}

/** text-shadow para cada tipo de borda do YouTube (medidas em em, para acompanhar o tamanho). */
function shadowCss(shadowColors) {
  const parts = [];
  for (const [type, color] of shadowColors) {
    const c = css(color, 'rgba(34, 34, 34, 1)');
    switch (type) {
      case ShadowType.Glow:
        parts.push(`0 0 0.06em ${c}`, `0 0 0.06em ${c}`, `0 0 0.06em ${c}`, `0 0 0.06em ${c}`);
        break;
      case ShadowType.HardShadow:
        parts.push(`0.03em 0.03em 0 ${c}`, `0.06em 0.06em 0 ${c}`, `0.09em 0.09em 0 ${c}`);
        break;
      case ShadowType.SoftShadow:
        parts.push(`0.04em 0.04em 0.06em ${c}`, `0.06em 0.06em 0.1em ${c}`, `0.08em 0.08em 0.14em ${c}`);
        break;
      case ShadowType.Bevel:
        parts.push(`0.03em 0.03em 0 ${c}`, `-0.03em -0.03em 0 ${c}`);
        break;
    }
  }
  return parts.join(', ');
}

const DEFAULT_BACK = 'rgba(8, 8, 8, 0.75)';

function styleSpan(span, section, withBackground) {
  const s = span.style;
  s.color = css(section.foreColor, '#fff');
  if (withBackground) s.backgroundColor = css(section.backColor, DEFAULT_BACK);
  s.fontFamily = FONT_FAMILIES[section.font] ?? FONT_FAMILIES.Roboto;
  if (section.font === 'Carrois Gothic Sc') s.fontVariant = 'small-caps';
  let scale = section.scale || 1;
  if (section.offset !== OffsetType.Regular) {
    scale *= 0.6;
    s.verticalAlign = section.offset === OffsetType.Subscript ? 'sub' : 'super';
  }
  s.fontSize = `${scale}em`;
  if (section.bold) s.fontWeight = 'bold';
  if (section.italic) s.fontStyle = 'italic';
  if (section.underline) s.textDecoration = 'underline';
  const shadow = shadowCss(section.shadowColors);
  if (shadow) s.textShadow = shadow;
}

function makeSpan(section, visible, withBackground = true) {
  const span = document.createElement('span');
  span.textContent = section.text.replace(/\r\n|\r/g, '\n');
  styleSpan(span, section, withBackground);
  if (!visible) span.style.visibility = 'hidden';
  return span;
}

export function renderLine(line, time, index) {
  const box = document.createElement('div');
  box.className = 'cue';
  box.dataset.line = String(index);
  const [ax, ay] = ANCHOR[line.anchorPoint] ?? ANCHOR[AnchorPoint.BottomCenter];
  const pos = line.position ?? { x: REF_WIDTH * (0.02 + 0.0096 * ax), y: REF_HEIGHT * (0.02 + 0.0096 * ay) };
  box.style.left = `${(pos.x / REF_WIDTH) * 100}%`;
  box.style.top = `${(pos.y / REF_HEIGHT) * 100}%`;
  box.style.transform = `translate(${-ax}%, ${-ay}%)`;
  box.style.textAlign = ax === 0 ? 'left' : ax === 100 ? 'right' : 'center';

  const rtl = line.horizontalTextDirection === HorizontalTextDirection.RightToLeft;
  if (line.verticalTextType !== VerticalTextType.None) {
    box.style.writingMode = rtl ? 'vertical-rl' : 'vertical-lr';
    box.style.textOrientation = line.verticalTextType === VerticalTextType.Rotated ? 'sideways' : 'upright';
  } else if (rtl) {
    box.style.direction = 'rtl';
  }

  // Os trechos ficam colados (karaokê costuma vir sílaba por sílaba). A folga do fundo nas bordas fica num
  // único elemento em volta da linha, que repete a folga em cada linha quebrada (box-decoration-break).
  const text = document.createElement('span');
  text.className = 'cue-text';
  const sections = line.sections;
  const backs = new Set(sections.map((s) => css(s.backColor, DEFAULT_BACK)));
  // Fundo único só quando todos os trechos já apareceram; senão o fundo cobriria sílabas ainda escondidas.
  const allVisible = sections.every((s) => time >= line.start + s.startOffset);
  const sharedBack = backs.size === 1 && allVisible ? [...backs][0] : null;
  if (sharedBack) text.style.backgroundColor = sharedBack;
  const span = (section, visible) => makeSpan(section, visible, !sharedBack);

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const visible = time >= line.start + section.startOffset;
    // Ruby: base, parêntese, texto, parêntese
    if (section.rubyPart === RubyPart.Base && i + 2 < sections.length) {
      const rubyText = sections[i + 2];
      const ruby = document.createElement('ruby');
      if (rubyText.rubyPart === RubyPart.TextAfter) ruby.style.rubyPosition = 'under';
      ruby.append(span(section, visible));
      const rt = document.createElement('rt');
      rt.append(span(rubyText, visible));
      ruby.append(rt);
      text.append(ruby);
      i += sections[i + 3]?.rubyPart === RubyPart.Parenthesis ? 3 : 2;
      continue;
    }
    text.append(span(section, visible));
  }
  box.append(text);
  return box;
}

// ---------------------------------------------------------------- simulação do player atual do YouTube

/** Tamanho da fonte do YouTube: 16 px a cada 360 px de altura do player (captions.js). */
const YT_FONT_PX_PER_360 = 16;

/**
 * Desenha a linha como o captions.js atual: cada trecho é um bloco (inline-block, pre-wrap) que pode ir para a
 * linha de baixo, cada linha do texto é um bloco ("caption-visual-line"), linha 1.375 e folga de .25em no primeiro e
 * no último trecho de cada linha. A posição é aplicada depois, por layoutYouTubeCue, que precisa do elemento na tela.
 */
export function renderLineYouTube(line, time, index) {
  const box = document.createElement('div');
  box.className = 'cue yt-cue';
  box.dataset.line = String(index);
  const [ax] = ANCHOR[line.anchorPoint] ?? ANCHOR[AnchorPoint.BottomCenter];
  box.style.textAlign = ax === 0 ? 'left' : ax === 100 ? 'right' : 'center';
  const rtl = line.horizontalTextDirection === HorizontalTextDirection.RightToLeft;
  if (rtl) box.style.direction = 'rtl';

  const text = document.createElement('span');
  text.className = 'captions-text';
  let visual = null;
  const newVisualLine = () => {
    visual = document.createElement('span');
    visual.className = 'caption-visual-line';
    text.append(visual);
  };
  newVisualLine();
  for (const section of line.sections) {
    const visible = time >= line.start + section.startOffset;
    const pieces = section.text.replace(/\r\n|\r/g, '\n').split('\n');
    pieces.forEach((piece, i) => {
      if (i > 0) newVisualLine();
      if (piece === '') return;
      const span = makeSpan({ ...section, text: piece, shadowColors: section.shadowColors, foreColor: section.foreColor, backColor: section.backColor }, visible);
      span.className = 'ytp-caption-segment';
      visual.append(span);
    });
  }
  box.append(text);
  return box;
}

/**
 * Posiciona uma legenda já inserida na tela com as regras do captions.js atual (método de layout da janela):
 * 1. janela com max-width 96%; mede a largura e, nas âncoras do meio (\\an4/5/6), a altura;
 * 2. âncora no centro: width = largura medida + 1 px e margin-left = -width/2; no meio: height = altura medida
 *    e margin-top = -height/2 (a altura fica travada);
 * 3. só então aplica a largura máxima pelo espaço até a borda (l = ah * 0.96 + 2):
 *    esquerda 98 - l, direita l - 2, centro 2 * min(l - 2, 98 - l).
 * Se o texto quebra no passo 3, ele cresce além da altura travada (o \\an5 "desce").
 */
export function layoutYouTubeCue(box, line) {
  const id = ANCHOR_IDS.indexOf(line.anchorPoint);
  const col = id >= 0 ? id % 3 : 1;
  const row = id >= 0 ? Math.floor(id / 3) : 2;
  const pos = line.position ?? null;
  const l = pos ? (pos.x / REF_WIDTH) * 100 : 50;
  const d = pos ? (pos.y / REF_HEIGHT) * 100 : 98;
  const st = box.style;
  Object.assign(st, { top: '0', left: '0', right: '', bottom: '', width: '', height: '', maxWidth: '96%', maxHeight: '96%', margin: '', transform: '' });
  const measuredWidth = box.offsetWidth;
  const measuredHeight = box.clientHeight;
  Object.assign(st, { top: '', left: '', maxHeight: '' });
  if (col === 0) st.left = `${l}%`;
  else if (col === 1) {
    st.left = `${l}%`;
    const w = measuredWidth + 1;
    st.width = `${w}px`;
    st.marginLeft = `${-w / 2}px`;
  } else st.right = `${100 - l}%`;
  if (row === 0) st.top = `${d}%`;
  else if (row === 1) {
    st.top = `${d}%`;
    st.height = `${measuredHeight}px`;
    st.marginTop = `${-measuredHeight / 2}px`;
  } else st.bottom = `${100 - d}%`;
  const max = col === 0 ? 98 - l : col === 2 ? l - 2 : 2 * Math.min(l - 2, 98 - l);
  st.maxWidth = `${Math.max(0, max)}%`;
}

const ANCHOR_IDS = [
  AnchorPoint.TopLeft, AnchorPoint.TopCenter, AnchorPoint.TopRight,
  AnchorPoint.MiddleLeft, AnchorPoint.Center, AnchorPoint.MiddleRight,
  AnchorPoint.BottomLeft, AnchorPoint.BottomCenter, AnchorPoint.BottomRight,
];

export function formatTime(ms) {
  ms = Math.max(0, Math.round(ms));
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

export class YttPreview {
  /** @param {HTMLElement} root elemento com .stage, .play, .seek, .time, .video-input, .title */
  constructor(root) {
    this.root = root;
    this.stage = root.querySelector('.stage');
    this.layer = root.querySelector('.cues');
    this.video = root.querySelector('video');
    this.playBtn = root.querySelector('.play');
    this.seek = root.querySelector('.seek');
    this.timeLabel = root.querySelector('.time');
    this.title = root.querySelector('.title');
    this.downloadLink = root.querySelector('.download');
    this.player = root.querySelector('.player');
    this.fsBtn = root.querySelector('.fs');
    this.lines = [];
    this.duration = 0;
    this.time = 0;
    this.playing = false;
    this.lastKey = null;
    this.active = [];
    /** @type {Set<number> | null} linhas destacadas pela tabela de debug */
    this.highlight = null;
    const debugRoot = root.querySelector('.debug');
    this.debug = debugRoot ? new DebugPanel(debugRoot, root.querySelector('.debug-check'), this) : null;

    /** Simular o layout do player atual do YouTube (renderLineYouTube / layoutYouTubeCue). */
    this.youtubeLayout = false;
    const ytCheck = root.querySelector('.yt-layout-check');
    if (ytCheck) {
      try { ytCheck.checked = localStorage.getItem('ytLayout') === '1'; } catch { /* sem storage */ }
      this.youtubeLayout = ytCheck.checked;
      ytCheck.addEventListener('change', () => {
        this.youtubeLayout = ytCheck.checked;
        try { localStorage.setItem('ytLayout', ytCheck.checked ? '1' : '0'); } catch { /* sem storage */ }
        this.updateFontSize();
        this.lastKey = null;
        this.render();
      });
    }

    new ResizeObserver(() => {
      this.updateFontSize();
      if (this.youtubeLayout) { this.lastKey = null; this.render(); }
    }).observe(this.stage);

    this.playBtn.addEventListener('click', () => this.toggle());
    this.seek.addEventListener('input', () => this.setTime(Number(this.seek.value)));
    root.querySelector('.video-input').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) this.setVideo(file);
    });
    this.video.addEventListener('loadedmetadata', () => this.updateDuration());
    this.video.addEventListener('play', () => this.setPlaying(true));
    this.video.addEventListener('pause', () => this.setPlaying(false));
    this.stage.addEventListener('click', () => this.toggle());
    this.stage.addEventListener('dblclick', () => this.toggleFullscreen());
    this.fsBtn.addEventListener('click', () => this.toggleFullscreen());
    document.addEventListener('fullscreenchange', () => this.onFullscreenChange());
    document.addEventListener('webkitfullscreenchange', () => this.onFullscreenChange());
    root.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' && e.target.type !== 'range') return;
      if (e.key === ' ') { e.preventDefault(); this.toggle(); }
      else if (e.key === 'f' || e.key === 'F') { e.preventDefault(); this.toggleFullscreen(); }
      else if (e.key === 'Escape' && this.player.classList.contains('fake-fs')) this.toggleFullscreen();
    });
    // Em tela cheia, os controles somem depois de um tempo parado e voltam ao mexer o mouse ou tocar.
    for (const t of ['pointermove', 'pointerdown', 'keydown']) {
      this.player.addEventListener(t, () => this.showControls());
    }
  }

  updateFontSize() {
    const h = this.stage.clientHeight;
    this.stage.style.fontSize = this.youtubeLayout
      ? `${(h / 360) * YT_FONT_PX_PER_360}px`
      : `${(h / REF_HEIGHT) * BASE_FONT_PX}px`;
    this.stage.classList.toggle('yt-layout', this.youtubeLayout);
  }

  get isFullscreen() {
    const el = document.fullscreenElement ?? document.webkitFullscreenElement;
    return el === this.player || this.player.classList.contains('fake-fs');
  }

  toggleFullscreen() {
    const el = document.fullscreenElement ?? document.webkitFullscreenElement;
    if (el) {
      (document.exitFullscreen ?? document.webkitExitFullscreen).call(document);
    } else if (this.player.classList.contains('fake-fs')) {
      this.player.classList.remove('fake-fs');
      this.onFullscreenChange();
    } else {
      const request = this.player.requestFullscreen ?? this.player.webkitRequestFullscreen;
      if (request) {
        // Com tela cheia de verdade, a legenda continua por cima do vídeo (o elemento inteiro vai para a tela).
        Promise.resolve(request.call(this.player)).catch(() => this.fakeFullscreen());
      } else {
        // iPhone: sem tela cheia para elementos; ocupa a janela inteira.
        this.fakeFullscreen();
      }
    }
  }

  fakeFullscreen() {
    this.player.classList.add('fake-fs');
    this.onFullscreenChange();
  }

  onFullscreenChange() {
    const fs = this.isFullscreen;
    this.player.classList.toggle('is-fs', fs);
    setText(this.fsBtn, fs ? 'exitFullscreen' : 'fullscreen');
    this.showControls();
  }

  showControls() {
    this.player.classList.remove('idle');
    clearTimeout(this.idleTimer);
    if (this.isFullscreen && this.playing) {
      this.idleTimer = setTimeout(() => this.player.classList.add('idle'), 2500);
    }
  }

  get hasVideo() {
    return Boolean(this.video.src);
  }

  /**
   * @param {import('../src/formats/ytt.js').YttDocument} doc
   * @param {string} name
   * @param {{name: string, url: string} | null} [download] arquivo convertido, oferecido ao lado do preview
   * @param {{keepTime?: boolean}} [opts] keepTime: o mesmo arquivo reconvertido (opção mudada): fica no mesmo ponto,
   *   tocando ou não, e sem rolar a página
   */
  show(doc, name, download = null, { keepTime = false, raw = null } = {}) {
    this.lines = doc.lines.filter((l) => l.end > l.start && l.text.trim() !== '');
    // Simulação do YouTube: as mesmas legendas, mas com os trechos como estão no .ytt (preenchimento incluído).
    // Lido só quando a simulação é ligada (raw é uma função).
    this.rawSource = raw;
    this.rawLines = null;
    this.title.textContent = name;
    this.downloadLink.hidden = !download;
    if (download) {
      this.downloadLink.href = download.url;
      this.downloadLink.download = download.name;
      setText(this.downloadLink, 'downloadFile', { name: download.name });
    }
    this.lastKey = null;
    this.debug?.reset();
    this.root.hidden = false;
    this.updateDuration();
    if (keepTime) {
      // Com vídeo, o tempo é o do vídeo: só redesenha.
      if (this.hasVideo) this.render();
      else this.setTime(this.time);
      return;
    }
    // Começa logo antes da primeira legenda
    this.setTime(this.lines.length ? Math.max(0, Math.min(...this.lines.map((l) => l.start)) - 500) : 0);
    this.root.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  setVideo(file) {
    if (this.video.src) URL.revokeObjectURL(this.video.src);
    this.setPlaying(false);
    this.video.src = URL.createObjectURL(file);
    this.video.hidden = false;
    this.stage.classList.add('has-video');
    this.video.currentTime = this.time / 1000;
  }

  updateDuration() {
    const subsEnd = this.lines.reduce((max, l) => Math.max(max, l.end), 0);
    const videoMs = this.hasVideo && Number.isFinite(this.video.duration) ? this.video.duration * 1000 : 0;
    this.duration = Math.max(subsEnd + 1000, videoMs);
    this.seek.max = String(Math.ceil(this.duration));
    this.render();
  }

  setTime(ms) {
    this.time = Math.min(Math.max(0, ms), this.duration);
    if (this.hasVideo) this.video.currentTime = this.time / 1000;
    this.clockOrigin = performance.now() - this.time;
    this.render();
  }

  toggle() {
    if (this.hasVideo) {
      if (this.video.paused) this.video.play(); else this.video.pause();
    } else {
      if (!this.playing && this.time >= this.duration) this.setTime(0);
      this.setPlaying(!this.playing);
    }
  }

  setPlaying(playing) {
    if (this.playing === playing) return;
    this.playing = playing;
    setText(this.playBtn, playing ? 'pause' : 'play');
    this.clockOrigin = performance.now() - this.time;
    if (playing) requestAnimationFrame(() => this.tick());
    this.showControls();
  }

  tick() {
    if (!this.playing) return;
    if (this.hasVideo) {
      this.time = this.video.currentTime * 1000;
    } else {
      this.time = performance.now() - this.clockOrigin;
      if (this.time >= this.duration) {
        this.time = this.duration;
        this.setPlaying(false);
      }
    }
    this.render();
    requestAnimationFrame(() => this.tick());
  }

  render() {
    const t = this.time;
    this.seek.value = String(Math.round(t));
    this.timeLabel.textContent = `${formatTime(t)} / ${formatTime(this.duration)}`;

    const active = [];
    const keys = [];
    for (let i = 0; i < this.lines.length; i++) {
      const line = this.lines[i];
      if (t >= line.start && t < line.end) {
        const shown = line.sections.filter((s) => t >= line.start + s.startOffset).length;
        active.push(i);
        keys.push(`${i}:${shown}`);
      }
    }
    const key = keys.join(',');
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.active = active;
    const raw = this.youtubeLayout ? this.getRawLines() : null;
    if (raw) {
      // Os índices continuam os de this.lines (tabela de debug); as linhas desenhadas são as do .ytt cru.
      const shownRaw = raw.filter((l) => t >= l.start && t < l.end);
      const boxes = shownRaw.map((l) => renderLineYouTube(l, t, -1));
      this.layer.replaceChildren(...boxes);
      boxes.forEach((box, k) => layoutYouTubeCue(box, shownRaw[k]));
    } else {
      this.layer.replaceChildren(...active.map((i) => renderLine(this.lines[i], t, i)));
    }
    this.applyHighlight();
    this.debug?.schedule();
  }

  /** Linhas do .ytt com os truques do escritor (para simular o YouTube), lidas uma vez. */
  getRawLines() {
    if (!this.rawLines && this.rawSource) {
      this.rawLines = this.rawSource().lines.filter((l) => l.end > l.start);
    }
    return this.rawLines;
  }

  /** Índices (em this.lines) das linhas na tela agora. */
  activeLines() {
    return this.active;
  }

  /** Destaca na tela as linhas que o mouse está apontando na tabela de debug. */
  setHighlight(indices) {
    this.highlight = indices ? new Set(indices) : null;
    this.applyHighlight();
  }

  applyHighlight() {
    for (const cue of this.layer.children) {
      cue.classList.toggle('debug-hl', Boolean(this.highlight?.has(Number(cue.dataset.line))));
    }
    this.layer.classList.toggle('has-hl', Boolean(this.highlight));
  }
}
