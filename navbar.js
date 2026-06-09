document.addEventListener("DOMContentLoaded", function () {
  const elements = document.querySelectorAll(
    ".navbar, .nav_logo_link, .nav_link, .nav_button, .menu_lottie, .fs_nav, .navbar_static_background"
  );

  const path = window.location.pathname;

  // Paths that should ALWAYS have .scrolled
  const forcedPaths = [
    /^\/XYZ\/.+/,        // /XYZ/*
    /^\/XYZ$/     // exactly /XYZ
  ];

  const isForced = forcedPaths.some(regex => regex.test(path));

  function applyScrolled(state) {
    elements.forEach(el => el.classList.toggle("scrolled", state));
  }

  // If path is forced → apply once and exit
  if (isForced) {
    applyScrolled(true);
    return;
  }

  // Otherwise → normal scroll behaviour
  function toggleScrolledClass() {
    applyScrolled(window.scrollY > 5);
  }

  toggleScrolledClass();
  window.addEventListener("scroll", toggleScrolledClass);
});
