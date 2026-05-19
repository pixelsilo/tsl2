//---3D VISTA RELOPEN
window.addEventListener("message", ({data}) => {
if(data && data.type === 'relopen') {
window.location.assign(`${window.location.origin}${data.pathname}`);
}
}, false);

//--- PRICE FORMATTING
(() => {
  const SEL = '[format="price"]';

  const format = (el) => {
    if (el.dataset.priced) return;

    const n = parseInt(el.textContent.replace(/\D/g, ''), 10);
    if (!Number.isInteger(n)) return;

    el.textContent = '£' + n.toLocaleString('en-GB');
    el.dataset.priced = '1';
  };

  const scan = (root = document) => {
    // If root itself is a price node
    if (root.matches?.(SEL)) format(root);

    // Any price nodes inside root
    root.querySelectorAll?.(SEL).forEach(format);
  };

  let scheduled = false;
  const scheduleScan = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      scan(document);
    });
  };

  document.addEventListener('DOMContentLoaded', () => {
    scan(document);

    new MutationObserver(() => scheduleScan()).observe(document.body, {
      childList: true,
      subtree: true
    });
  });
})();