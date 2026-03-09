/** Inline script to set theme before paint to avoid flash. Must run in head. */
export default function ThemeScript() {
  const script = `(function(){
    var theme = localStorage.getItem('theme');
    if (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches) theme = 'dark';
    if (!theme) theme = 'light';
    document.documentElement.classList.toggle('dark', theme === 'dark');
  })();`
  return <script dangerouslySetInnerHTML={{ __html: script }} />
}
