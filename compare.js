//--- Compare scoller padding ---
document.addEventListener("DOMContentLoaded", () => {
  const scroller = document.querySelector(".compare-container");
  const compMenu = document.querySelector(".comp-menu");
  if (!scroller || !compMenu) return;

  let raf = 0;
  let last = null;

  const hasHScroll = (el) => el.scrollWidth > el.clientWidth + 1;
  const hScrollbar = (el) => Math.max(0, el.offsetHeight - el.clientHeight);

  const apply = () => {
    raf = 0;
    const pad = hasHScroll(scroller) ? hScrollbar(scroller) : 0;

    if (pad !== last) {
      compMenu.style.paddingBottom = pad ? `${pad}px` : "0px";
      last = pad;
    }
  };

  const schedule = () => {
    if (raf) return;
    raf = requestAnimationFrame(apply);
  };

  new MutationObserver(schedule).observe(scroller, { childList: true, subtree: true });

  if ("ResizeObserver" in window) {
    new ResizeObserver(schedule).observe(scroller);
  } else {
    window.addEventListener("resize", schedule, { passive: true });
  }

  schedule();
  setTimeout(schedule, 0);
});

//--- Re order
(() => {
  const ITEM_SEL = '.compare_ci.w-dyn-item[fav="compare"]';
  const LIST_SEL = '.compare-cl[fav-list="compare"]';
  const ARROW_SEL = 'img[move="left"], img[move="right"]';
  const DURATION_MS = 280;

  document.addEventListener("click", (e) => {
    const arrow = e.target.closest(ARROW_SEL);
    if (!arrow) return;

    const dir = arrow.getAttribute("move"); // left | right
    const item = arrow.closest(ITEM_SEL);
    const list = item?.closest(LIST_SEL);
    if (!item || !list) return;

    // Use DIRECT children order (true visual order)
    const itemsBefore = Array.from(list.children).filter(el => el.matches(ITEM_SEL));
    const i = itemsBefore.indexOf(item);
    if (i === -1) return;

    if (dir === "left" && i === 0) return;
    if (dir === "right" && i === itemsBefore.length - 1) return;

    // If user clicks quickly, kill any previous transition state
    itemsBefore.forEach(el => {
      el.style.transition = "none";
      el.style.transform = "";
    });

    // FLIP: capture FIRST positions
    const first = new Map(itemsBefore.map(el => [el, el.getBoundingClientRect()]));

    // Reorder DOM
    if (dir === "left") {
      list.insertBefore(item, itemsBefore[i - 1]);
    } else {
      // swap with next
      list.insertBefore(itemsBefore[i + 1], item);
    }

    // Rebuild list AFTER reorder (so we animate the right elements)
    const itemsAfter = Array.from(list.children).filter(el => el.matches(ITEM_SEL));

    // Apply inverted transforms immediately (no transition)
    itemsAfter.forEach(el => {
      const a = first.get(el);
      if (!a) return; // (shouldn't happen, but safe)
      const b = el.getBoundingClientRect();
      const dx = a.left - b.left;
      const dy = a.top - b.top;

      if (dx || dy) {
        el.style.transform = `translate(${dx}px, ${dy}px)`;
      }
    });

    // Then animate to zero transform
    requestAnimationFrame(() => {
      itemsAfter.forEach(el => {
        if (!el.style.transform) return;
        el.style.transition = `transform ${DURATION_MS}ms ease`;
        el.style.transform = "";
      });
    });
  });
})();

//--- Toggle Floorplans
document.addEventListener("click", function (e) {
  const toggleBtn = e.target.closest('[toggle="floorplan"]');
  if (!toggleBtn) return;

  // Toggle on the button itself
  toggleBtn.classList.toggle("is-on");

  // Toggle on the switch inside it
  const switchEl = toggleBtn.querySelector(".toggle-switch");
  if (switchEl) {
    switchEl.classList.toggle("is-on");
  }

  // Toggle on ALL floorplan overlays
  document.querySelectorAll(".compare_floorplan-overlay")
    .forEach(el => el.classList.toggle("is-on"));
});