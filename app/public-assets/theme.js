(function () {
  var slides = document.querySelectorAll('.slides img');
  var captions = document.querySelectorAll('.bg-cap');
  if (slides.length > 1 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    var current = 0;
    window.setInterval(function () {
      slides[current].classList.remove('on');
      if (captions[current]) {
        captions[current].classList.remove('on');
        captions[current].setAttribute('aria-hidden', 'true');
      }
      current = (current + 1) % slides.length;
      slides[current].classList.add('on');
      if (captions[current]) {
        captions[current].classList.add('on');
        captions[current].removeAttribute('aria-hidden');
      }
    }, 7000);
  }

  var button = document.querySelector('[data-menu-toggle]');
  var menu = document.getElementById('menu');
  if (!button || !menu) return;
  var openLabel = button.getAttribute('data-open-label') || 'Open menu';
  var closeLabel = button.getAttribute('data-close-label') || 'Close menu';

  function setOpen(open) {
    menu.classList.toggle('open', open);
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
    button.setAttribute('aria-label', open ? closeLabel : openLabel);
    document.documentElement.classList.toggle('menu-open', open);
  }

  button.addEventListener('click', function () {
    setOpen(button.getAttribute('aria-expanded') !== 'true');
  });

  menu.addEventListener('click', function (event) {
    var target = event.target;
    if (target && target.closest && target.closest('a')) setOpen(false);
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') setOpen(false);
  });
})();
