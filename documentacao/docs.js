// Página de documentação: o conteúdo de cada idioma é um <article data-lang>; o seletor é o mesmo da página
// principal (web/i18n.js), então o idioma escolhido vale para todas as páginas. O título vem de data-title-key no <body>.
import { initI18n, onLanguageChange, t } from '../web/i18n.js';
import { initTheme } from '../web/theme.js';

onLanguageChange((lang) => {
  for (const article of document.querySelectorAll('article[data-lang]')) article.hidden = article.dataset.lang !== lang;
  document.title = t(document.body.dataset.titleKey ?? 'docsTitle');
});
initI18n(document.getElementById('lang'));
initTheme(document.getElementById('theme'));
