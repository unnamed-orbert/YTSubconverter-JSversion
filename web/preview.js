// Preview de .ytt: desenha as legendas (já lidas por YttDocument) sobre uma área 16:9, imitando o
// player do YouTube: posição, alinhamento, fonte, tamanho, cores, fundo, contorno/sombra, karaokê
// (trechos com startOffset), sub/sobrescrito, ruby e texto vertical. É uma aproximação: o resultado
// final depende do player do YouTube.

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

function styleSpan(span, section) {
  const s = span.style;
  s.color = css(section.foreColor, '#fff');
  s.backgroundColor = css(section.backColor, 'rgba(8, 8, 8, 0.75)');
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

function makeSpan(section, visible) {
  const span = document.createElement('span');
  span.textContent = section.text.replace(/\r\n|\r/g, '\n');
  styleSpan(span, section);
  if (!visible) span.style.visibility = 'hidden';
  return span;
}

function renderLine(line, time) {
  const box = document.createElement('div');
  box.className = 'cue';
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

  const sections = line.sections;
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const visible = time >= line.start + section.startOffset;
    // Ruby: base, parêntese, texto, parêntese
    if (section.rubyPart === RubyPart.Base && i + 2 < sections.length) {
      const text = sections[i + 2];
      const ruby = document.createElement('ruby');
      if (text.rubyPart === RubyPart.TextAfter) ruby.style.rubyPosition = 'under';
      ruby.append(makeSpan(section, visible));
      const rt = document.createElement('rt');
      rt.append(makeSpan(text, visible));
      ruby.append(rt);
      box.append(ruby);
      i += sections[i + 3]?.rubyPart === RubyPart.Parenthesis ? 3 : 2;
      continue;
    }
    box.append(makeSpan(section, visible));
  }
  return box;
}

function formatTime(ms) {
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
    this.lines = [];
    this.duration = 0;
    this.time = 0;
    this.playing = false;
    this.lastKey = null;

    new ResizeObserver(() => {
      this.stage.style.fontSize = `${(this.stage.clientHeight / REF_HEIGHT) * BASE_FONT_PX}px`;
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
    root.addEventListener('keydown', (e) => {
      if (e.key === ' ' && e.target.tagName !== 'INPUT') { e.preventDefault(); this.toggle(); }
    });
  }

  get hasVideo() {
    return Boolean(this.video.src);
  }

  /** @param {import('../src/formats/ytt.js').YttDocument} doc */
  show(doc, name) {
    this.lines = doc.lines.filter((l) => l.end > l.start && l.text.trim() !== '');
    this.title.textContent = name;
    this.lastKey = null;
    this.root.hidden = false;
    this.updateDuration();
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
    this.playBtn.textContent = playing ? 'Pausar' : 'Tocar';
    this.clockOrigin = performance.now() - this.time;
    if (playing) requestAnimationFrame(() => this.tick());
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
    for (let i = 0; i < this.lines.length; i++) {
      const line = this.lines[i];
      if (t >= line.start && t < line.end) {
        const shown = line.sections.filter((s) => t >= line.start + s.startOffset).length;
        active.push(`${i}:${shown}`);
      }
    }
    const key = active.join(',');
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.layer.replaceChildren(...active.map((a) => renderLine(this.lines[Number(a.split(':')[0])], t)));
  }
}
