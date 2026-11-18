document.querySelectorAll('.copy').forEach(b => b.addEventListener('click', async () => {
  const code = b.parentElement.querySelector('code').innerText;
  try { await navigator.clipboard.writeText(code); b.textContent = 'Copied'; }
  catch (e) { b.textContent = 'Select & copy'; }
  setTimeout(() => (b.textContent = 'Copy'), 1500);
}));
const root = document.documentElement;
document.querySelector('.theme').addEventListener('click', () => {
  const dark = root.dataset.theme ? root.dataset.theme === 'dark'
    : matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = dark ? 'light' : 'dark';
  try { localStorage.setItem('guide-theme', root.dataset.theme); } catch (e) {}
});
const menu = document.querySelector('.menu');
menu.addEventListener('click', () => {
  const open = document.body.classList.toggle('nav-open');
  menu.setAttribute('aria-expanded', open);
});
document.querySelectorAll('.side a').forEach(a => a.addEventListener('click', () => document.body.classList.remove('nav-open')));
// Opening a link to an anchor inside a folded block unfolds it.
function reveal() {
  const el = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
  const d = el && el.closest('details'); if (d) { d.open = true; el.scrollIntoView(); }
}
addEventListener('hashchange', reveal); reveal();
// Highlight the current section in "On this page".
const links = [...document.querySelectorAll('.toc a')];
if (links.length) {
  const heads = links.map(a => document.getElementById(a.hash.slice(1)));
  const spy = () => {
    let i = 0; heads.forEach((h, j) => { if (h && h.getBoundingClientRect().top < 120) i = j; });
    links.forEach((a, j) => a.classList.toggle('on', j === i));
  };
  addEventListener('scroll', spy, { passive: true }); spy();
}
