// Applies the saved theme before the app renders, so a dark page never flashes light. Mirrors src/lib/theme.ts.
;(() => {
  let theme = null
  try {
    theme = window.localStorage.getItem('study-plan:theme')
  } catch {
    // Storage blocked: follow the system setting.
  }
  if (theme !== 'light' && theme !== 'dark') {
    theme = window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.documentElement.style.colorScheme = theme
})()
