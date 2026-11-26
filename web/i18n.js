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
    docsLink: 'Documentação',
    docsTitle: 'Documentação · Conversor de legendas',
    docsBack: '← Voltar ao conversor',
    diffLink: 'Diferenças em relação ao original',
    diffTitle: 'Diferenças em relação ao original · Conversor de legendas',
    diffBack: '← Documentação',
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
    hierarchyLabel: 'Hierarquia de tags (fade + karaokê + chroma, contorno vai para a cor do texto no fade)',
    hierarchyTitle: 'O .ytt não tem opacidade de sombra/contorno, então no YTSubConverter original o fade e o karaokê \\ytkt(Fade) deixam o contorno opaco enquanto o texto some ou aparece. Com isto ligado, as tags compõem (o fade vale para o texto e para as sombras, o karaokê continua sob o fade e o chroma): no fade a cor do contorno vai até a cor do texto e, abaixo da porcentagem ao lado (40%), o contorno sai e o texto some sozinho, como no libass. Desligado, o resultado é igual ao original.',
    fadeBefore: 'No fade, tirar sombra/contorno abaixo de',
    fadeAfter: '% de opacidade',
    captureLabel: 'Raio de captura do \\ytchroma (recuperar tags)',
    captureTitle: 'Na recuperação de tags: até quantos px do texto as cópias coloridas do \\ytchroma são capturadas e ligadas a ele. Aumente se o chroma sair picado em várias linhas soltas.',
    dedupTitle:
      'Ao converter .json3/.ytt para .srt: um .json3/.ytt cheio de estilos e animação (fade, movimento, karaokê, várias sombras) repete a mesma frase em centenas de linhas, uma por quadro. ' +
      'Com isto ligado (o padrão), as repetições viram uma linha por frase, com os tempos acertados, igual à ferramenta YTT → SRT. Para saída .ytt/.ass não muda nada.',
    dedupLabel: 'Corrigir duplicação massiva (.json3/.ytt para .srt)',
    converting: 'Convertendo…',
    done: 'Pronto',
    viewPreview: 'Ver preview',
    refreshing: 'Atualizando…',
    refreshBtn: 'Atualizar arquivos',
    refreshTitle: 'Converte de novo os arquivos já carregados com as opções atuais. Acontece sozinho quando uma opção muda.',
    downloadFile: 'Baixar {name}',
    recoverBtn: 'Tentar recuperar tags originais (heurística)',
    recoverTitle:
      'Monta um .ass com as tags que provavelmente geraram este .ytt/.json3: \\fad, \\move, \\k, \\t, \\ytshake, \\ytchroma, estilos com várias sombras. ' +
      'Junta os quadros de cada animação numa linha só. Tempos e posições saem aproximados.',
    recovering: 'Recuperando tags…',
    recoverDone: '{lines} linhas, tags: {tags}',
    recoverNoTags: 'nenhuma',
    recoverStyleOptions: 'Baixar StyleOptions.xml (para o YTSubConverter original)',
    compareBtn: "Comparar original × refeito",
    compareRowSimilarity: "semelhança",
    compareTitle: "Refaz o .ytt a partir do .ass recuperado e mostra os dois lado a lado, tocando juntos e marcando onde diferem.",
    comparing: "Comparando…",
    compareHeading: "Comparação:",
    compareOriginal: "Original",
    compareRemade: "Refeito a partir do .ass recuperado",
    compareSimilarity: "Semelhança: {pct}%",
    compareByProp: "texto {text}% · posição {position}% · cor {color}% · opacidade {opacity}%",
    compareSegments: "{n} trechos com diferença",
    comparePrev: "◀ Diferença anterior",
    compareNext: "Próxima diferença ▶",
    compareNow: "Agora: {pct}% parecido",
    compareNowEmpty: "Agora: nada na tela",
    compareSame: "Neste instante os dois lados estão iguais.",
    compareOnlyA: "Só no original",
    compareOnlyB: "Só no refeito",
    compareDownloadYtt: "Baixar .ytt refeito",
    compareNote: "A cada 100 ms as linhas na tela dos dois lados são emparelhadas pelo texto e pela posição e comparadas. A barra de cima mostra a semelhança (verde = igual, vermelho = diferente); as de baixo, em que propriedade diferem. Clique nas barras para ir até o ponto. Contorno laranja: linha que difere; vermelho: linha que só existe de um lado.",
    kindText: "texto",
    kindPosition: "posição",
    kindColor: "cor",
    kindOpacity: "opacidade",
    kindMissing: "linha a mais/a menos",
    compareDist: "{px} px de distância",
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
    debugToggle: "Mostrar tabela de debug",
    debugToggleTitle: "Mostra, no tempo atual, cada linha na tela e o que cada trecho desenha, com os efeitos percebidos e as tags .ass prováveis.",
    debugNote: "O .ytt não guarda as tags do .ass: cada animação vira uma linha por quadro. A tabela junta os quadros seguidos com o mesmo texto e adivinha o efeito (fade, movimento, cor) e as tags .ass. Passe o mouse numa linha da tabela para destacá-la no vídeo.",
    debugSummary: "{time}: {lines} linhas na tela, {groups} grupos",
    debugEmpty: "Nenhuma legenda na tela neste momento.",
    debugMore: "+{n} grupos não mostrados",
    debugCopy: "Copiar tabela",
    debugCopied: "Copiado",
    colLine: "Linha",
    colTime: "Tempo",
    colPos: "Posição",
    colText: "Texto",
    colFont: "Fonte",
    colColor: "Cor do texto",
    colBack: "Fundo",
    colShadow: "Contorno/sombra",
    colExtra: "Karaokê, ruby, outros",
    colEffects: "Efeitos (heurística)",
    dbgAssGuess: ".ass provável:",
    dbgAssRecovered: ".ass recuperado (linha inteira):",
    dbgDefaultPos: "padrão",
    dbgStatic: "sem animação",
    dbgHiddenUntil: "aparece em {ms} ms",
    dbgKaraokeAt: "karaokê: +{ms} ms",
    dbgRuby: "ruby: {part}",
    rubyBase: "base",
    rubyParenthesis: "parêntese",
    rubyTextBefore: "texto em cima",
    rubyTextAfter: "texto embaixo",
    dbgSub: "subscrito",
    dbgSup: "sobrescrito",
    dbgPacked: "junto (hg)",
    dbgVertical: "vertical",
    dbgRtl: "direita para esquerda",
    shGlow: "contorno",
    shSoftShadow: "sombra suave",
    shHardShadow: "sombra dura",
    shBevel: "relevo",
    dbgFrames: "quadro {i} de {n} de uma animação ({ms} ms)",
    dbgFadeIn: "fade-in de {ms} ms",
    dbgFadeOut: "fade-out de {ms} ms",
    dbgOpacityNow: "opacidade agora {now}% (pico {max}%)",
    dbgAlphaSteps: "opacidade muda de trecho em trecho ({from}% → {to}% em {n} trechos): fade letra por letra ou palavra por palavra (no .ass, provavelmente \\t com \\alpha e atraso crescente em cada trecho)",
    dbgMove: "movimento ({x1}, {y1}) → ({x2}, {y2})",
    dbgColorAnim: "cor muda {from} → {to}",
    dbgScaleAnim: "tamanho muda {from}% → {to}%",
    dbgShadowAnim: "cor do contorno/sombra muda",
    dbgLayers: "{n} camadas sobrepostas (uma por tipo de sombra)",
    dbgKaraoke: "karaokê em {n} trechos",
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
    docsLink: 'Documentation',
    docsTitle: 'Documentation · Subtitle converter',
    docsBack: '← Back to the converter',
    diffLink: 'Differences from the original',
    diffTitle: 'Differences from the original · Subtitle converter',
    diffBack: '← Documentation',
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
    hierarchyLabel: 'Tag hierarchy (fade + karaoke + chroma, outline turns into the text color while fading)',
    hierarchyTitle: 'The .ytt format has no shadow/outline opacity, so in the original YTSubConverter fades and \\ytkt(Fade) karaoke leave the outline opaque while the text fades. When on, the tags compose (the fade applies to the text and its shadows, karaoke keeps going under fades and chroma): during a fade the outline color moves to the text color and, below the percentage next to it (40%), the outline is removed and the text fades alone, like in libass. When off, the result is the same as the original.',
    fadeBefore: 'During fades, remove shadow/outline below',
    fadeAfter: '% opacity',
    captureLabel: '\\ytchroma capture radius (recover tags)',
    captureTitle: 'When recovering tags: how many px away from the text the colored \\ytchroma copies are captured and attached to it. Increase it if the chroma comes out split into loose lines.',
    dedupTitle:
      'When converting .json3/.ytt to .srt: a .json3/.ytt full of styles and animation (fade, movement, karaoke, multiple shadows) repeats the same sentence in hundreds of lines, one per frame. ' +
      'With this on (the default), the repeats become one line per sentence, with the timing fixed, like the YTT → SRT tool. It changes nothing for .ytt/.ass output.',
    dedupLabel: 'Fix massive duplication (.json3/.ytt to .srt)',
    converting: 'Converting…',
    done: 'Done',
    viewPreview: 'Preview',
    refreshing: 'Updating…',
    refreshBtn: 'Update files',
    refreshTitle: 'Converts the files already loaded again with the current options. Happens on its own when an option changes.',
    downloadFile: 'Download {name}',
    recoverBtn: 'Try to recover the original tags (heuristic)',
    recoverTitle:
      'Builds an .ass with the tags that probably produced this .ytt/.json3: \\fad, \\move, \\k, \\t, \\ytshake, \\ytchroma, styles with several shadows. ' +
      'The frames of each animation are joined into a single line. Times and positions are approximate.',
    recovering: 'Recovering tags…',
    recoverDone: '{lines} lines, tags: {tags}',
    recoverNoTags: 'none',
    recoverStyleOptions: 'Download StyleOptions.xml (for the original YTSubConverter)',
    compareBtn: "Compare original × remade",
    compareRowSimilarity: "similarity",
    compareTitle: "Rebuilds the .ytt from the recovered .ass and shows both side by side, playing together and marking where they differ.",
    comparing: "Comparing…",
    compareHeading: "Comparison:",
    compareOriginal: "Original",
    compareRemade: "Remade from the recovered .ass",
    compareSimilarity: "Similarity: {pct}%",
    compareByProp: "text {text}% · position {position}% · color {color}% · opacity {opacity}%",
    compareSegments: "{n} stretches with differences",
    comparePrev: "◀ Previous difference",
    compareNext: "Next difference ▶",
    compareNow: "Now: {pct}% alike",
    compareNowEmpty: "Now: nothing on screen",
    compareSame: "At this moment both sides are the same.",
    compareOnlyA: "Only in the original",
    compareOnlyB: "Only in the remade",
    compareDownloadYtt: "Download remade .ytt",
    compareNote: "Every 100 ms the lines on screen on both sides are paired by text and position and compared. The top bar shows the similarity (green = same, red = different); the bars below show which property differs. Click the bars to jump there. Orange outline: a line that differs; red: a line that only exists on one side.",
    kindText: "text",
    kindPosition: "position",
    kindColor: "color",
    kindOpacity: "opacity",
    kindMissing: "extra/missing line",
    compareDist: "{px} px apart",
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
    debugToggle: "Show debug table",
    debugToggleTitle: "Shows, at the current time, each line on screen and what each section draws, with the detected effects and the likely .ass tags.",
    debugNote: "A .ytt doesn't keep the .ass tags: each animation becomes one line per frame. The table joins consecutive frames with the same text and guesses the effect (fade, movement, color) and the .ass tags. Hover a row to highlight it on the video.",
    debugSummary: "{time}: {lines} lines on screen, {groups} groups",
    debugEmpty: "No subtitle on screen right now.",
    debugMore: "+{n} groups not shown",
    debugCopy: "Copy table",
    debugCopied: "Copied",
    colLine: "Line",
    colTime: "Time",
    colPos: "Position",
    colText: "Text",
    colFont: "Font",
    colColor: "Text color",
    colBack: "Background",
    colShadow: "Outline/shadow",
    colExtra: "Karaoke, ruby, other",
    colEffects: "Effects (heuristic)",
    dbgAssGuess: "Likely .ass:",
    dbgAssRecovered: "Recovered .ass (whole line):",
    dbgDefaultPos: "default",
    dbgStatic: "no animation",
    dbgHiddenUntil: "appears in {ms} ms",
    dbgKaraokeAt: "karaoke: +{ms} ms",
    dbgRuby: "ruby: {part}",
    rubyBase: "base",
    rubyParenthesis: "parenthesis",
    rubyTextBefore: "text above",
    rubyTextAfter: "text below",
    dbgSub: "subscript",
    dbgSup: "superscript",
    dbgPacked: "packed (hg)",
    dbgVertical: "vertical",
    dbgRtl: "right to left",
    shGlow: "outline",
    shSoftShadow: "soft shadow",
    shHardShadow: "hard shadow",
    shBevel: "bevel",
    dbgFrames: "frame {i} of {n} of an animation ({ms} ms)",
    dbgFadeIn: "{ms} ms fade-in",
    dbgFadeOut: "{ms} ms fade-out",
    dbgOpacityNow: "opacity now {now}% (peak {max}%)",
    dbgAlphaSteps: "opacity changes from section to section ({from}% → {to}% over {n} sections): letter-by-letter or word-by-word fade (in the .ass, probably \\t with \\alpha and a growing delay on each section)",
    dbgMove: "movement ({x1}, {y1}) → ({x2}, {y2})",
    dbgColorAnim: "color changes {from} → {to}",
    dbgScaleAnim: "size changes {from}% → {to}%",
    dbgShadowAnim: "outline/shadow color changes",
    dbgLayers: "{n} stacked layers (one per shadow type)",
    dbgKaraoke: "karaoke over {n} sections",
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
    docsLink: 'Documentación',
    docsTitle: 'Documentación · Conversor de subtítulos',
    docsBack: '← Volver al conversor',
    diffLink: 'Diferencias con el original',
    diffTitle: 'Diferencias con el original · Conversor de subtítulos',
    diffBack: '← Documentación',
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
    hierarchyLabel: 'Jerarquía de etiquetas (fundido + karaoke + chroma, el contorno toma el color del texto en el fundido)',
    hierarchyTitle: 'El .ytt no tiene opacidad de sombra/contorno, así que en el YTSubConverter original el fundido y el karaoke \\ytkt(Fade) dejan el contorno opaco mientras el texto desaparece. Activado, las etiquetas se combinan (el fundido vale para el texto y sus sombras, el karaoke sigue bajo el fundido y el chroma): en el fundido el color del contorno va hacia el color del texto y, por debajo del porcentaje de al lado (40%), el contorno se quita y el texto desaparece solo, como en libass. Desactivado, el resultado es igual al original.',
    fadeBefore: 'En los fundidos, quitar sombra/contorno por debajo del',
    fadeAfter: '% de opacidad',
    captureLabel: 'Radio de captura del \\ytchroma (recuperar etiquetas)',
    captureTitle: 'Al recuperar etiquetas: hasta cuántos px del texto se capturan las copias de color del \\ytchroma y se unen a él. Auméntalo si el chroma sale partido en varias líneas sueltas.',
    dedupTitle:
      'Al convertir .json3/.ytt a .srt: un .json3/.ytt lleno de estilos y animación (fundido, movimiento, karaoke, varias sombras) repite la misma frase en cientos de líneas, una por fotograma. ' +
      'Con esto activado (por defecto), las repeticiones se convierten en una línea por frase, con los tiempos ajustados, como la herramienta YTT → SRT. Para salida .ytt/.ass no cambia nada.',
    dedupLabel: 'Corregir duplicación masiva (.json3/.ytt a .srt)',
    converting: 'Convirtiendo…',
    done: 'Listo',
    viewPreview: 'Vista previa',
    refreshing: 'Actualizando…',
    refreshBtn: 'Actualizar archivos',
    refreshTitle: 'Vuelve a convertir los archivos ya cargados con las opciones actuales. Ocurre solo cuando cambia una opción.',
    downloadFile: 'Descargar {name}',
    recoverBtn: 'Intentar recuperar las etiquetas originales (heurística)',
    recoverTitle:
      'Arma un .ass con las etiquetas que probablemente generaron este .ytt/.json3: \\fad, \\move, \\k, \\t, \\ytshake, \\ytchroma, estilos con varias sombras. ' +
      'Junta los cuadros de cada animación en una sola línea. Los tiempos y las posiciones son aproximados.',
    recovering: 'Recuperando etiquetas…',
    recoverDone: '{lines} líneas, etiquetas: {tags}',
    recoverNoTags: 'ninguna',
    recoverStyleOptions: 'Descargar StyleOptions.xml (para el YTSubConverter original)',
    compareBtn: "Comparar original × rehecho",
    compareRowSimilarity: "semejanza",
    compareTitle: "Rehace el .ytt a partir del .ass recuperado y muestra los dos lado a lado, reproduciéndose juntos y marcando dónde difieren.",
    comparing: "Comparando…",
    compareHeading: "Comparación:",
    compareOriginal: "Original",
    compareRemade: "Rehecho a partir del .ass recuperado",
    compareSimilarity: "Semejanza: {pct}%",
    compareByProp: "texto {text}% · posición {position}% · color {color}% · opacidad {opacity}%",
    compareSegments: "{n} tramos con diferencias",
    comparePrev: "◀ Diferencia anterior",
    compareNext: "Siguiente diferencia ▶",
    compareNow: "Ahora: {pct}% parecido",
    compareNowEmpty: "Ahora: nada en pantalla",
    compareSame: "En este instante los dos lados son iguales.",
    compareOnlyA: "Solo en el original",
    compareOnlyB: "Solo en el rehecho",
    compareDownloadYtt: "Descargar .ytt rehecho",
    compareNote: "Cada 100 ms las líneas en pantalla de los dos lados se emparejan por texto y posición y se comparan. La barra de arriba muestra la semejanza (verde = igual, rojo = diferente); las de abajo, en qué propiedad difieren. Haz clic en las barras para ir a ese punto. Contorno naranja: línea que difiere; rojo: línea que solo existe en un lado.",
    kindText: "texto",
    kindPosition: "posición",
    kindColor: "color",
    kindOpacity: "opacidad",
    kindMissing: "línea de más/de menos",
    compareDist: "{px} px de distancia",
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
    debugToggle: "Mostrar tabla de depuración",
    debugToggleTitle: "Muestra, en el tiempo actual, cada línea en pantalla y lo que dibuja cada fragmento, con los efectos detectados y las etiquetas .ass probables.",
    debugNote: "El .ytt no guarda las etiquetas del .ass: cada animación se convierte en una línea por fotograma. La tabla junta los fotogramas seguidos con el mismo texto y adivina el efecto (fundido, movimiento, color) y las etiquetas .ass. Pasa el ratón por una fila para resaltarla en el vídeo.",
    debugSummary: "{time}: {lines} líneas en pantalla, {groups} grupos",
    debugEmpty: "No hay subtítulos en pantalla en este momento.",
    debugMore: "+{n} grupos no mostrados",
    debugCopy: "Copiar tabla",
    debugCopied: "Copiado",
    colLine: "Línea",
    colTime: "Tiempo",
    colPos: "Posición",
    colText: "Texto",
    colFont: "Fuente",
    colColor: "Color del texto",
    colBack: "Fondo",
    colShadow: "Contorno/sombra",
    colExtra: "Karaoke, ruby, otros",
    colEffects: "Efectos (heurística)",
    dbgAssGuess: ".ass probable:",
    dbgAssRecovered: ".ass recuperado (línea entera):",
    dbgDefaultPos: "predeterminada",
    dbgStatic: "sin animación",
    dbgHiddenUntil: "aparece en {ms} ms",
    dbgKaraokeAt: "karaoke: +{ms} ms",
    dbgRuby: "ruby: {part}",
    rubyBase: "base",
    rubyParenthesis: "paréntesis",
    rubyTextBefore: "texto arriba",
    rubyTextAfter: "texto abajo",
    dbgSub: "subíndice",
    dbgSup: "superíndice",
    dbgPacked: "junto (hg)",
    dbgVertical: "vertical",
    dbgRtl: "de derecha a izquierda",
    shGlow: "contorno",
    shSoftShadow: "sombra suave",
    shHardShadow: "sombra dura",
    shBevel: "relieve",
    dbgFrames: "fotograma {i} de {n} de una animación ({ms} ms)",
    dbgFadeIn: "fundido de entrada de {ms} ms",
    dbgFadeOut: "fundido de salida de {ms} ms",
    dbgOpacityNow: "opacidad ahora {now}% (pico {max}%)",
    dbgAlphaSteps: "la opacidad cambia de fragmento en fragmento ({from}% → {to}% en {n} fragmentos): fundido letra por letra o palabra por palabra (en el .ass, probablemente \\t con \\alpha y un retraso creciente en cada fragmento)",
    dbgMove: "movimiento ({x1}, {y1}) → ({x2}, {y2})",
    dbgColorAnim: "el color cambia {from} → {to}",
    dbgScaleAnim: "el tamaño cambia {from}% → {to}%",
    dbgShadowAnim: "cambia el color del contorno/sombra",
    dbgLayers: "{n} capas superpuestas (una por tipo de sombra)",
    dbgKaraoke: "karaoke en {n} fragmentos",
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
    docsLink: 'Documentation',
    docsTitle: 'Documentation · Convertisseur de sous-titres',
    docsBack: '← Retour au convertisseur',
    diffLink: "Différences avec l'original",
    diffTitle: "Différences avec l'original · Convertisseur de sous-titres",
    diffBack: '← Documentation',
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
    hierarchyLabel: 'Hiérarchie des balises (fondu + karaoké + chroma, le contour prend la couleur du texte pendant le fondu)',
    hierarchyTitle: "Le .ytt n'a pas d'opacité d'ombre/contour : dans le YTSubConverter original, les fondus et le karaoké \\ytkt(Fade) laissent le contour opaque pendant que le texte disparaît. Activé, les balises se combinent (le fondu s'applique au texte et à ses ombres, le karaoké continue sous le fondu et le chroma) : pendant le fondu la couleur du contour va vers celle du texte et, sous le pourcentage indiqué (40 %), le contour est retiré et le texte disparaît seul, comme avec libass. Désactivé, le résultat est identique à l'original.",
    fadeBefore: "Pendant les fondus, retirer l'ombre/le contour sous",
    fadeAfter: "% d'opacité",
    captureLabel: 'Rayon de capture du \\ytchroma (récupérer les balises)',
    captureTitle: 'Lors de la récupération des balises : à combien de px du texte les copies colorées du \\ytchroma sont capturées et rattachées. Augmentez-le si le chroma sort découpé en lignes isolées.',
    dedupTitle:
      'En convertissant un .json3/.ytt en .srt : un .json3/.ytt plein de styles et d’animations (fondu, mouvement, karaoké, plusieurs ombres) répète la même phrase sur des centaines de lignes, une par image. ' +
      "Avec cette option (par défaut), les répétitions deviennent une ligne par phrase, avec les temps corrigés, comme l'outil YTT → SRT. Pour une sortie .ytt/.ass, rien ne change.",
    dedupLabel: 'Corriger la duplication massive (.json3/.ytt vers .srt)',
    converting: 'Conversion…',
    done: 'Terminé',
    viewPreview: 'Aperçu',
    refreshing: 'Mise à jour…',
    refreshBtn: 'Mettre à jour les fichiers',
    refreshTitle: 'Reconvertit les fichiers déjà chargés avec les options actuelles. Se fait tout seul quand une option change.',
    downloadFile: 'Télécharger {name}',
    recoverBtn: 'Essayer de récupérer les balises d’origine (heuristique)',
    recoverTitle:
      'Construit un .ass avec les balises qui ont probablement produit ce .ytt/.json3 : \\fad, \\move, \\k, \\t, \\ytshake, \\ytchroma, styles à plusieurs ombres. ' +
      'Les images de chaque animation sont réunies en une seule ligne. Les temps et les positions sont approximatifs.',
    recovering: 'Récupération des balises…',
    recoverDone: '{lines} lignes, balises : {tags}',
    recoverNoTags: 'aucune',
    recoverStyleOptions: 'Télécharger StyleOptions.xml (pour le YTSubConverter d’origine)',
    compareBtn: "Comparer original × refait",
    compareRowSimilarity: "ressemblance",
    compareTitle: "Refait le .ytt à partir du .ass récupéré et affiche les deux côte à côte, lus ensemble, en marquant où ils diffèrent.",
    comparing: "Comparaison…",
    compareHeading: "Comparaison :",
    compareOriginal: "Original",
    compareRemade: "Refait à partir du .ass récupéré",
    compareSimilarity: "Ressemblance : {pct} %",
    compareByProp: "texte {text} % · position {position} % · couleur {color} % · opacité {opacity} %",
    compareSegments: "{n} passages avec des différences",
    comparePrev: "◀ Différence précédente",
    compareNext: "Différence suivante ▶",
    compareNow: "Maintenant : {pct} % semblable",
    compareNowEmpty: "Maintenant : rien à l’écran",
    compareSame: "À cet instant les deux côtés sont identiques.",
    compareOnlyA: "Seulement dans l’original",
    compareOnlyB: "Seulement dans le refait",
    compareDownloadYtt: "Télécharger le .ytt refait",
    compareNote: "Toutes les 100 ms, les lignes à l’écran des deux côtés sont appariées par texte et position puis comparées. La barre du haut montre la ressemblance (vert = identique, rouge = différent) ; celles du bas, la propriété qui diffère. Cliquez sur les barres pour y aller. Contour orange : ligne qui diffère ; rouge : ligne qui n’existe que d’un côté.",
    kindText: "texte",
    kindPosition: "position",
    kindColor: "couleur",
    kindOpacity: "opacité",
    kindMissing: "ligne en trop/manquante",
    compareDist: "{px} px d’écart",
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
    debugToggle: "Afficher le tableau de débogage",
    debugToggleTitle: "Affiche, au temps actuel, chaque ligne à l'écran et ce que dessine chaque segment, avec les effets détectés et les balises .ass probables.",
    debugNote: "Le .ytt ne garde pas les balises du .ass : chaque animation devient une ligne par image. Le tableau regroupe les images successives au même texte et devine l'effet (fondu, mouvement, couleur) et les balises .ass. Survolez une ligne pour la mettre en évidence sur la vidéo.",
    debugSummary: "{time} : {lines} lignes à l'écran, {groups} groupes",
    debugEmpty: "Aucun sous-titre à l'écran en ce moment.",
    debugMore: "+{n} groupes non affichés",
    debugCopy: "Copier le tableau",
    debugCopied: "Copié",
    colLine: "Ligne",
    colTime: "Temps",
    colPos: "Position",
    colText: "Texte",
    colFont: "Police",
    colColor: "Couleur du texte",
    colBack: "Fond",
    colShadow: "Contour/ombre",
    colExtra: "Karaoké, ruby, autres",
    colEffects: "Effets (heuristique)",
    dbgAssGuess: ".ass probable :",
    dbgAssRecovered: ".ass récupéré (ligne entière) :",
    dbgDefaultPos: "par défaut",
    dbgStatic: "sans animation",
    dbgHiddenUntil: "apparaît dans {ms} ms",
    dbgKaraokeAt: "karaoké : +{ms} ms",
    dbgRuby: "ruby : {part}",
    rubyBase: "base",
    rubyParenthesis: "parenthèse",
    rubyTextBefore: "texte au-dessus",
    rubyTextAfter: "texte en dessous",
    dbgSub: "indice",
    dbgSup: "exposant",
    dbgPacked: "serré (hg)",
    dbgVertical: "vertical",
    dbgRtl: "de droite à gauche",
    shGlow: "contour",
    shSoftShadow: "ombre douce",
    shHardShadow: "ombre dure",
    shBevel: "relief",
    dbgFrames: "image {i} sur {n} d'une animation ({ms} ms)",
    dbgFadeIn: "fondu entrant de {ms} ms",
    dbgFadeOut: "fondu sortant de {ms} ms",
    dbgOpacityNow: "opacité actuelle {now} % (pic {max} %)",
    dbgAlphaSteps: "l'opacité change d'un segment à l'autre ({from} % → {to} % sur {n} segments) : fondu lettre par lettre ou mot par mot (dans le .ass, probablement \\t avec \\alpha et un délai croissant sur chaque segment)",
    dbgMove: "mouvement ({x1}, {y1}) → ({x2}, {y2})",
    dbgColorAnim: "la couleur change {from} → {to}",
    dbgScaleAnim: "la taille change {from} % → {to} %",
    dbgShadowAnim: "la couleur du contour/de l'ombre change",
    dbgLayers: "{n} calques superposés (un par type d'ombre)",
    dbgKaraoke: "karaoké sur {n} segments",
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
