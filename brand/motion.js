// FF DIMMEN motion helpers. No dependencies. Load with <script src="/brand/motion.js" defer></script>
(function () {
  var root = document.documentElement;
  root.classList.add('ffd-js');
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Reveal on scroll: <section data-dim-in> ... </section>
  function initReveal() {
    var els = document.querySelectorAll('[data-dim-in]');
    if (reduce || !('IntersectionObserver' in window)) { els.forEach(function (el) { el.classList.add('is-lit'); }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('is-lit'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.05 });
    els.forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.top < window.innerHeight) el.classList.add('is-lit'); else io.observe(el);
    });
  }

  // Theme: podium (default) or papier. Remembers the choice.
  function setTheme(t) {
    root.classList.add('ffd-theme-fading');
    root.setAttribute('data-theme', t);
    try { localStorage.setItem('ffd-theme', t); } catch (e) {}
    setTimeout(function () { root.classList.remove('ffd-theme-fading'); }, 700);
  }
  try { var saved = localStorage.getItem('ffd-theme'); if (saved) root.setAttribute('data-theme', saved); } catch (e) {}
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-theme-toggle]');
    if (!btn) return;
    setTheme(root.getAttribute('data-theme') === 'papier' ? 'podium' : 'papier');
  });

  // Logo replay: FFDimmen.dimLogo(svg, 'up' | 'down') returns a Promise when done
  function dimLogo(svg, dir) {
    return new Promise(function (resolve) {
      svg.classList.remove('ffd-logo--dim-up', 'ffd-logo--dim-down');
      void svg.getBoundingClientRect();
      svg.classList.add(dir === 'down' ? 'ffd-logo--dim-down' : 'ffd-logo--dim-up');
      var total = reduce ? 0 : 1400 + 7 * 170;
      setTimeout(resolve, total);
    });
  }
  window.FFDimmen = { dimLogo: dimLogo, setTheme: setTheme };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initReveal); else initReveal();
})();
