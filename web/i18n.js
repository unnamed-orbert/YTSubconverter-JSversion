// Textos da página em português, inglês, espanhol e francês.
// No HTML: data-i18n="chave" (texto), data-i18n-html="chave" (texto com <b>/<a>),
// data-i18n-title / data-i18n-aria-label (atributos). Em JS: t('chave', { nome: valor }).

export const LANGUAGES = {
  pt: 'Português',
  en: 'English',
  es: 'Español',
  fr: 'Français',
};

const STRINGS = {
  pt: {
    pageTitle: 'Conversor de legendas',
    heading: 'Conversor de legendas para o YouTube',
    intro:
      'Arraste uma legenda <b>.srt</b>, <b>.sbv</b>, <b>.ass</b> ou <b>.json3</b> (o formato que o YouTube serve) e baixe o <b>.ytt</b> pronto para enviar ao YouTube, ' +
      'ou solte um <b>.ytt</b> para ver como ele fica. O formato é reconhecido pelo conteúdo, então o arquivo pode vir sem extensão ou com a extensão errada. ' +
      'Tudo acontece no seu navegador: o arquivo não é enviado para lugar nenhum.',
    language: 'Idioma',
    dropBig: 'Solte os arquivos aqui',
    dropSmall: 'ou clique para escolher',
    convertTo: 'Converter para',
    optYtt: '.ytt (YouTube, com estilos)',
    optAss: '.ass (Aegisub, com estilos)',
    optSrt: '.srt (texto simples)',
    fadeTitle:
      'O YouTube não deixa a sombra/contorno ficar transparente (só a cor #222222), então no fade o texto some e o contorno fica, deixando um rastro. ' +
      'Com isto ligado, quando a opacidade do texto fica abaixo da porcentagem a sombra/contorno é removida e o texto some sozinho. ' +
      'Desligado, o resultado é igual ao YTSubConverter original.',
    fadeBefore: 'No fade, tirar sombra/contorno abaixo de',
    fadeAfter: '% de opacidade',
    dedupTitle:
      'Ao converter .json3/.ytt para .srt: um .json3/.ytt cheio de estilos e animação (fade, movimento, karaokê, várias sombras) repete a mesma frase em centenas de linhas, uma por quadro. ' +
      'Com isto ligado (o padrão), as repetições viram uma linha por frase, com os tempos acertados, igual à ferramenta YTT → SRT. Para saída .ytt/.ass não muda nada.',
    dedupLabel: 'Corrigir duplicação massiva (.json3/.ytt para .srt)',
    converting: 'Convertendo…',
    done: 'Pronto',
    viewPreview: 'Ver preview',
    downloadFile: 'Baixar {name}',
    error: 'Erro: {message}',
    errUnknownFormat: 'Não reconheci o formato desta legenda. Use .srt, .sbv, .ass, .ytt/.srv3 ou json3.',
    errNoSubtitles: 'Nenhuma legenda encontrada neste arquivo.',
    previewHeading: 'Preview:',
    play: 'Tocar',
    pause: 'Pausar',
    position: 'Posição',
    fullscreen: 'Tela cheia',
    exitFullscreen: 'Sair da tela cheia',
    fullscreenTitle: 'Tela cheia (F)',
    videoPick: 'Ver sobre um vídeo do seu computador:',
    previewNote: 'Aproximação de como o player do YouTube mostra a legenda. Confira no YouTube antes de publicar.',
    noScript: 'Esta página precisa de JavaScript.',
    fileWarn:
      'Abra esta página por um servidor (por exemplo o GitHub Pages); abrindo o arquivo direto do disco o navegador bloqueia os módulos JavaScript.',
    footer: 'Port em JavaScript do <a href="https://github.com/arcusmaximus/YTSubConverter">YTSubConverter</a>.',
  },

  en: {
    pageTitle: 'Subtitle converter',
    heading: 'Subtitle converter for YouTube',
    intro:
      'Drop a <b>.srt</b>, <b>.sbv</b>, <b>.ass</b> or <b>.json3</b> subtitle (the format YouTube serves) and download a <b>.ytt</b> ready to upload to YouTube, ' +
      'or drop a <b>.ytt</b> to see how it looks. The format is detected from the content, so the file can have no extension or the wrong one. ' +
      'Everything happens in your browser: the file is never uploaded anywhere.',
    language: 'Language',
    dropBig: 'Drop files here',
    dropSmall: 'or click to choose',
    convertTo: 'Convert to',
    optYtt: '.ytt (YouTube, with styles)',
    optAss: '.ass (Aegisub, with styles)',
    optSrt: '.srt (plain text)',
    fadeTitle:
      "YouTube doesn't let shadows/outlines be transparent (except the color #222222), so during a fade the text disappears but the outline stays, leaving a trail. " +
      'With this on, once the text opacity drops below the percentage, the shadow/outline is removed and the text fades out on its own. ' +
      'With it off, the result is the same as the original YTSubConverter.',
    fadeBefore: 'During fades, remove shadow/outline below',
    fadeAfter: '% opacity',
    dedupTitle:
      'When converting .json3/.ytt to .srt: a .json3/.ytt full of styles and animation (fade, movement, karaoke, multiple shadows) repeats the same sentence in hundreds of lines, one per frame. ' +
      'With this on (the default), the repeats become one line per sentence, with the timing fixed, like the YTT → SRT tool. It changes nothing for .ytt/.ass output.',
    dedupLabel: 'Fix massive duplication (.json3/.ytt to .srt)',
    converting: 'Converting…',
    done: 'Done',
    viewPreview: 'Preview',
    downloadFile: 'Download {name}',
    error: 'Error: {message}',
    errUnknownFormat: "Couldn't recognize this subtitle's format. Use .srt, .sbv, .ass, .ytt/.srv3 or json3.",
    errNoSubtitles: 'No subtitles found in this file.',
    previewHeading: 'Preview:',
    play: 'Play',
    pause: 'Pause',
    position: 'Position',
    fullscreen: 'Full screen',
    exitFullscreen: 'Exit full screen',
    fullscreenTitle: 'Full screen (F)',
    videoPick: 'Watch over a video from your computer:',
    previewNote: 'An approximation of how the YouTube player shows the subtitle. Check on YouTube before publishing.',
    noScript: 'This page needs JavaScript.',
    fileWarn:
      'Open this page through a server (for example GitHub Pages); when the file is opened straight from disk, the browser blocks JavaScript modules.',
    footer: 'JavaScript port of <a href="https://github.com/arcusmaximus/YTSubConverter">YTSubConverter</a>.',
  },

  es: {
    pageTitle: 'Conversor de subtítulos',
    heading: 'Conversor de subtítulos para YouTube',
    intro:
      'Arrastra un subtítulo <b>.srt</b>, <b>.sbv</b>, <b>.ass</b> o <b>.json3</b> (el formato que sirve YouTube) y descarga el <b>.ytt</b> listo para subir a YouTube, ' +
      'o suelta un <b>.ytt</b> para ver cómo queda. El formato se reconoce por el contenido, así que el archivo puede venir sin extensión o con la extensión equivocada. ' +
      'Todo ocurre en tu navegador: el archivo no se envía a ningún sitio.',
    language: 'Idioma',
    dropBig: 'Suelta los archivos aquí',
    dropSmall: 'o haz clic para elegir',
    convertTo: 'Convertir a',
    optYtt: '.ytt (YouTube, con estilos)',
    optAss: '.ass (Aegisub, con estilos)',
    optSrt: '.srt (texto simple)',
    fadeTitle:
      'YouTube no permite que la sombra/contorno sea transparente (salvo el color #222222), así que en un fundido el texto desaparece pero el contorno se queda, dejando un rastro. ' +
      'Con esto activado, cuando la opacidad del texto baja del porcentaje, se quita la sombra/contorno y el texto se desvanece solo. ' +
      'Desactivado, el resultado es igual al YTSubConverter original.',
    fadeBefore: 'En los fundidos, quitar sombra/contorno por debajo del',
    fadeAfter: '% de opacidad',
    dedupTitle:
      'Al convertir .json3/.ytt a .srt: un .json3/.ytt lleno de estilos y animación (fundido, movimiento, karaoke, varias sombras) repite la misma frase en cientos de líneas, una por fotograma. ' +
      'Con esto activado (por defecto), las repeticiones se convierten en una línea por frase, con los tiempos ajustados, como la herramienta YTT → SRT. Para salida .ytt/.ass no cambia nada.',
    dedupLabel: 'Corregir duplicación masiva (.json3/.ytt a .srt)',
    converting: 'Convirtiendo…',
    done: 'Listo',
    viewPreview: 'Vista previa',
    downloadFile: 'Descargar {name}',
    error: 'Error: {message}',
    errUnknownFormat: 'No se reconoció el formato de este subtítulo. Usa .srt, .sbv, .ass, .ytt/.srv3 o json3.',
    errNoSubtitles: 'No se encontraron subtítulos en este archivo.',
    previewHeading: 'Vista previa:',
    play: 'Reproducir',
    pause: 'Pausar',
    position: 'Posición',
    fullscreen: 'Pantalla completa',
    exitFullscreen: 'Salir de pantalla completa',
    fullscreenTitle: 'Pantalla completa (F)',
    videoPick: 'Ver sobre un video de tu computadora:',
    previewNote: 'Aproximación de cómo el reproductor de YouTube muestra el subtítulo. Compruébalo en YouTube antes de publicar.',
    noScript: 'Esta página necesita JavaScript.',
    fileWarn:
      'Abre esta página desde un servidor (por ejemplo GitHub Pages); si abres el archivo directamente del disco, el navegador bloquea los módulos JavaScript.',
    footer: 'Port a JavaScript de <a href="https://github.com/arcusmaximus/YTSubConverter">YTSubConverter</a>.',
  },

  fr: {
    pageTitle: 'Convertisseur de sous-titres',
    heading: 'Convertisseur de sous-titres pour YouTube',
    intro:
      'Glissez un sous-titre <b>.srt</b>, <b>.sbv</b>, <b>.ass</b> ou <b>.json3</b> (le format servi par YouTube) et téléchargez le <b>.ytt</b> prêt à être envoyé sur YouTube, ' +
      "ou déposez un <b>.ytt</b> pour voir son rendu. Le format est reconnu d'après le contenu : le fichier peut être sans extension ou avec une mauvaise extension. " +
      "Tout se passe dans votre navigateur : le fichier n'est envoyé nulle part.",
    language: 'Langue',
    dropBig: 'Déposez les fichiers ici',
    dropSmall: 'ou cliquez pour choisir',
    convertTo: 'Convertir en',
    optYtt: '.ytt (YouTube, avec styles)',
    optAss: '.ass (Aegisub, avec styles)',
    optSrt: '.srt (texte simple)',
    fadeTitle:
      "YouTube ne permet pas de rendre l'ombre/le contour transparent (sauf la couleur #222222) : pendant un fondu, le texte disparaît mais le contour reste et laisse une trace. " +
      "Avec cette option, quand l'opacité du texte passe sous le pourcentage, l'ombre/le contour est retiré et le texte s'efface seul. " +
      "Désactivée, le résultat est identique à celui du YTSubConverter d'origine.",
    fadeBefore: "Pendant les fondus, retirer l'ombre/le contour sous",
    fadeAfter: "% d'opacité",
    dedupTitle:
      'En convertissant un .json3/.ytt en .srt : un .json3/.ytt plein de styles et d’animations (fondu, mouvement, karaoké, plusieurs ombres) répète la même phrase sur des centaines de lignes, une par image. ' +
      "Avec cette option (par défaut), les répétitions deviennent une ligne par phrase, avec les temps corrigés, comme l'outil YTT → SRT. Pour une sortie .ytt/.ass, rien ne change.",
    dedupLabel: 'Corriger la duplication massive (.json3/.ytt vers .srt)',
    converting: 'Conversion…',
    done: 'Terminé',
    viewPreview: 'Aperçu',
    downloadFile: 'Télécharger {name}',
    error: 'Erreur : {message}',
    errUnknownFormat: "Format de sous-titre non reconnu. Utilisez .srt, .sbv, .ass, .ytt/.srv3 ou json3.",
    errNoSubtitles: 'Aucun sous-titre trouvé dans ce fichier.',
    previewHeading: 'Aperçu :',
    play: 'Lire',
    pause: 'Pause',
    position: 'Position',
    fullscreen: 'Plein écran',
    exitFullscreen: 'Quitter le plein écran',
    fullscreenTitle: 'Plein écran (F)',
    videoPick: 'Voir sur une vidéo de votre ordinateur :',
    previewNote: "Approximation de l'affichage du sous-titre dans le lecteur YouTube. Vérifiez sur YouTube avant de publier.",
    noScript: 'Cette page a besoin de JavaScript.',
    fileWarn:
      "Ouvrez cette page via un serveur (par exemple GitHub Pages) : en ouvrant le fichier directement depuis le disque, le navigateur bloque les modules JavaScript.",
    footer: 'Portage en JavaScript de <a href="https://github.com/arcusmaximus/YTSubConverter">YTSubConverter</a>.',
  },
};

const HTML_LANG = { pt: 'pt-BR', en: 'en', es: 'es', fr: 'fr' };
const STORAGE_KEY = 'ytsubconverter.lang';

let current = 'pt';
const listeners = [];

/** Idioma salvo, senão o primeiro idioma do navegador que tivermos, senão inglês. */
function initialLanguage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && STRINGS[saved]) return saved;
  } catch {
    // armazenamento bloqueado: segue sem lembrar
  }
  for (const tag of navigator.languages ?? [navigator.language]) {
    const code = String(tag ?? '').slice(0, 2).toLowerCase();
    if (STRINGS[code]) return code;
  }
  // Navegador em outro idioma: inglês é o mais provável de ser entendido.
  return 'en';
}

export function getLanguage() {
  return current;
}

/** Texto da chave no idioma atual, com {nome} trocado pelos valores (cai no português se faltar). */
export function t(key, params = {}) {
  const text = STRINGS[current][key] ?? STRINGS.pt[key] ?? key;
  // Um parâmetro {key: '...'} é outra chave, traduzida também (ex.: a mensagem dentro de "Erro: {message}").
  const value = (v) => (v && typeof v === 'object' && 'key' in v ? t(v.key) : String(v));
  return text.replace(/\{(\w+)\}/g, (m, name) => (name in params ? value(params[name]) : m));
}

/**
 * Coloca um texto traduzido num elemento e lembra a chave, para trocar junto quando o idioma mudar.
 * @param {HTMLElement} el
 */
export function setText(el, key, params) {
  el.dataset.i18n = key;
  if (params) el.dataset.i18nParams = JSON.stringify(params);
  else delete el.dataset.i18nParams;
  el.textContent = t(key, params);
}

/** Traduz tudo o que tem data-i18n* dentro de root. */
export function translate(root = document) {
  const params = (el) => (el.dataset.i18nParams ? JSON.parse(el.dataset.i18nParams) : undefined);
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n, params(el));
  // Só textos fixos do próprio arquivo de idiomas (sem dados do usuário) usam innerHTML.
  for (const el of root.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.dataset.i18nHtml);
  for (const el of root.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
  for (const el of root.querySelectorAll('[data-i18n-aria-label]')) el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel));
}

export function setLanguage(lang, { remember = true } = {}) {
  if (!STRINGS[lang]) return;
  current = lang;
  document.documentElement.lang = HTML_LANG[lang];
  document.title = t('pageTitle');
  translate();
  if (remember) {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // armazenamento bloqueado
    }
  }
  for (const fn of listeners) fn(lang);
}

/** Chamado depois de cada troca de idioma (para textos que dependem de estado, como Tocar/Pausar). */
export function onLanguageChange(fn) {
  listeners.push(fn);
}

/** Liga o seletor de idioma e aplica o idioma inicial. */
export function initI18n(select) {
  select.replaceChildren(
    ...Object.entries(LANGUAGES).map(([code, name]) => {
      const opt = document.createElement('option');
      opt.value = code;
      opt.textContent = name;
      return opt;
    }),
  );
  const lang = initialLanguage();
  select.value = lang;
  select.addEventListener('change', () => setLanguage(select.value));
  setLanguage(lang, { remember: false });
}
