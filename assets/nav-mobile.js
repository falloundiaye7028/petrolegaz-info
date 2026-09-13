(function () {
  const nav = document.getElementById('navLinks');
  const button = document.querySelector('.menu-toggle');
  if (!nav || !button) return;

  function closeMenu() {
    nav.classList.remove('mobile-open');
    button.setAttribute('aria-expanded', 'false');
  }

  window.toggleMenu = function () {
    const isOpen = nav.classList.toggle('mobile-open');
    button.setAttribute('aria-expanded', String(isOpen));
  };

  document.addEventListener('click', function (event) {
    if (!nav.contains(event.target) && !button.contains(event.target)) closeMenu();
  });

  nav.querySelectorAll('a').forEach(function (link) {
    link.addEventListener('click', closeMenu);
  });
})();
