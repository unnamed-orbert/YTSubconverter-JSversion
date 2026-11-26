// Página de documentação: o conteúdo de cada idioma é um <article data-lang>; o seletor é o mesmo da página
// principal (web/i18n.js), então o idioma escolhido vale para as duas páginas.
import { initI18n, onLanguageChange, t } from '../web/i18n.js';

onLanguageChange((lang) => {
  for (const article of document.querySelectorAll('article[data-lang]')) article.hidden = article.dataset.lang !== lang;
  document.title = t('docsTitle');
});
initI18n(document.getElementById('lang'));
