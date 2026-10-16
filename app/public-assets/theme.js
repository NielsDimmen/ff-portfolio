(function () {
  var toggle = document.querySelector('[data-theme-toggle]');
  if (toggle) {
    toggle.addEventListener('click', function () {
      var next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem('theme', next);
      } catch (error) {
        /* private mode */
      }
      document.documentElement.dataset.theme = next;
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', next === 'dark' ? '#141413' : '#f4f4f1');
    });
  }

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (window.CSS && CSS.supports('animation-timeline', 'view()')) return;
  var nodes = document.querySelectorAll('[data-fade]');
  if (!nodes.length || !('IntersectionObserver' in window)) return;
  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.15 },
  );
  nodes.forEach(function (node) {
    node.classList.add('can-fade');
    observer.observe(node);
  });
})();
