(function () {
  'use strict';
  const button = document.getElementById('mobileMenuToggle');
  const header = document.querySelector('.topbar');
  const home = document.getElementById('homeView');
  if (!button || !header || !home) return;

  function placeMenu() {
    const intro = document.body.classList.contains('home-active') &&
      !home.classList.contains('hidden') ? home.querySelector('.home-intro') : null;
    const heading = intro && intro.querySelector('h1');
    if (heading) {
      if (button.parentElement !== intro || button.previousElementSibling !== heading) {
        heading.after(button);
      }
    } else if (button.previousElementSibling !== header) {
      header.after(button);
    }
  }

  new MutationObserver(placeMenu).observe(home, { childList: true });
  new MutationObserver(placeMenu).observe(document.body, {
    attributes: true, attributeFilter: ['class']
  });
  placeMenu();
})();
