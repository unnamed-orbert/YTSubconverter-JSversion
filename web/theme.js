// Tema da página: Automático (segue o sistema), Claro ou Escuro. A escolha fica salva no navegador e vale para
// todas as páginas. Um script no <head> de cada página aplica o tema salvo antes de desenhar (sem piscar).
const STORAGE_KEY = 'ytsubconverter.theme';
const THEMES = ['auto', 'light', 'dark'];

function apply(theme) {
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}

/** Liga o seletor de tema (as opções têm data-i18n e são traduzidas junto com a página). */
export function initTheme(select) {
  let theme = 'auto';
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (THEMES.includes(saved)) theme = saved;
  } catch {
    // armazenamento bloqueado: fica no automático
  }
  select.value = theme;
  apply(theme);
  select.addEventListener('change', () => {
    apply(select.value);
    try {
      if (select.value === 'auto') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, select.value);
    } catch {
      // armazenamento bloqueado: vale só até fechar a página
    }
  });
}
