(() => {
  // =========================
  // Shared helpers
  // =========================
  const ready = (fn) => {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
      fn();
    }
  };

  const debounce = (fn, ms) => {
    let t;
    return () => {
      clearTimeout(t);
      t = setTimeout(fn, ms);
    };
  };

  const norm = (s) => (s || "").trim().replace(/\s+/g, " ");

  const isHoverDevice = () =>
    window.matchMedia &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  const isMobileLayout = () =>
    window.matchMedia && window.matchMedia("(max-width: 991px)").matches;

  // =========================
  // Config / selectors
  // =========================
  const MAP_FLEX_SEL = ".map-flex";
  const MAP_SEL = ".map";
  const MAP_CONTAINER_SEL = ".m-container";

  const LIST_SEL = '[pin="list"], [pins="list"]';
  const ITEM_SEL = ".plot_ci";
  const CARD_SEL = ".plot-card";

  const PIN_HOLDER_SEL = ".pin-holder";
  const PIN_SEL = ".pin";
  const PIN_WRAP_SEL = ".map-pin";
  const X_SEL = '[axis="x"]';
  const Y_SEL = '[axis="y"]';

  const DEBOUNCE_MS = 80;
  const GAP = -4;
  const HOME_INITIAL_ZOOM = 1.5;
  const HOME_INITIAL_VERTICAL_OFFSET = -0.2;
  const APARTMENT_INITIAL_ZOOM = 0.8;
  const APARTMENT_INITIAL_VERTICAL_OFFSET = 0;

  const isApartmentPage = () => /\/apartment(?:\/|$)/i.test(window.location.pathname || "");

  const getInitialMapView = () =>
    isApartmentPage()
      ? {
          zoom: APARTMENT_INITIAL_ZOOM,
          verticalOffset: APARTMENT_INITIAL_VERTICAL_OFFSET
        }
      : {
          zoom: HOME_INITIAL_ZOOM,
          verticalOffset: HOME_INITIAL_VERTICAL_OFFSET
        };

  // =========================
  // Panzoom init
  // =========================
  function initPanZoom() {
    const mapFlex = document.querySelector(MAP_FLEX_SEL);
    if (!mapFlex) return null;

    if (typeof panzoom !== "function") {
      console.warn("[panzoom] panzoom() not found. Is the library loaded before this script?");
      return null;
    }

    const pz = panzoom(mapFlex, {
      maxZoom: 8,
      minZoom: 0.1,
      bounds: false,
      boundsPadding: 0.5
    });

    // Start slightly zoomed in and nudge the map upward on load
    requestAnimationFrame(() => {
      const content = mapFlex.querySelector(MAP_CONTAINER_SEL);
      if (content) {
        const { zoom, verticalOffset } = getInitialMapView();

        // Measure the viewport (mapFlex) vs the actual square content (m-container)
        const vW = mapFlex.clientWidth;
        const vH = mapFlex.clientHeight;
        const mW = content.offsetWidth;
        const mH = content.offsetHeight;

        pz.zoomAbs(vW / 2, vH / 2, zoom);

        const targetX = (vW - mW * zoom) / 2;
        const targetY = (vH - mH * zoom) / 2 + vH * verticalOffset;
        pz.moveTo(targetX, targetY);
      }
    });

    // Prevent <a> inside the map from triggering pan/drag
    const stopPanOnAnchors = (e) => {
      if (e.target && e.target.closest && e.target.closest("a")) {
        // Keep link clicks working, just stop panzoom from treating it as a drag start.
        e.stopImmediatePropagation();
      }
    };

    // pointer events cover modern browsers; keep mouse/touch for legacy handlers
    mapFlex.addEventListener("pointerdown", stopPanOnAnchors, true);
    mapFlex.addEventListener("mousedown", stopPanOnAnchors, true);
    mapFlex.addEventListener("touchstart", stopPanOnAnchors, { capture: true, passive: true });

    // Debug handle (kept)
    window.mapPz = pz;

    return pz;
  }

  // =========================
  // Pins: build + inverse scale
  // =========================
  function numberFromEl(el) {
    if (!el) return null;
    const val = (el.textContent || "").trim().replace("%", "");
    const num = Number(val);
    return Number.isFinite(num) ? num : null;
  }

  function getAllLists() {
    return Array.from(document.querySelectorAll(LIST_SEL));
  }

  function getAllItemsFromLists(lists) {
    return lists.flatMap((list) => Array.from(list.querySelectorAll(ITEM_SEL)));
  }

  function applyInversePinScale() {
    const pz = window.mapPz;
    if (!pz || typeof pz.getTransform !== "function") return;

    const tr = pz.getTransform();
    const inv = 1 / (tr.scale || 1);

    document.querySelectorAll(`${MAP_CONTAINER_SEL} ${PIN_WRAP_SEL}`).forEach((pin) => {
      // Always include translate so pins remain centered
      pin.style.transform = `translate(-50%, -50%) scale(${inv})`;
    });
  }

  function buildPins() {
    const mapContainer = document.querySelector(MAP_CONTAINER_SEL);
    const lists = getAllLists();

    if (!mapContainer || !lists.length) return false;

    const items = getAllItemsFromLists(lists);
    if (!items.length) return false;

    // Clear existing pins
    mapContainer.querySelectorAll(PIN_WRAP_SEL).forEach((el) => el.remove());

    let added = 0;

    items.forEach((item) => {
      const holder = item.querySelector(PIN_HOLDER_SEL);
      if (!holder) return;

      const pin = holder.querySelector(PIN_SEL);
      const xEl = holder.querySelector(X_SEL);
      const yEl = holder.querySelector(Y_SEL);
      if (!pin || !xEl || !yEl) return;

      const x = numberFromEl(xEl);
      const y = numberFromEl(yEl);
      if (x === null || y === null) return;

      const wrap = document.createElement("div");
      wrap.className = "map-pin";
      wrap.style.position = "absolute";
      wrap.style.left = `${x}%`;
      wrap.style.top = `${y}%`;
      wrap.style.transform = "translate(-50%, -50%)"; // scale applied after build
      wrap.style.zIndex = "10";

      wrap.appendChild(pin.cloneNode(true));
      mapContainer.appendChild(wrap);
      added++;
    });

    // Re-apply inverse scaling after rebuild
    applyInversePinScale();

    if (added) console.log(`[map pins] Added ${added} pins (from ${lists.length} list(s))`);
    return !!added;
  }

  // Observe lists (including lists inserted later)
  function initPinObservers() {
    const debouncedRebuild = debounce(buildPins, DEBOUNCE_MS);

    const attached = new WeakSet();
    const listObservers = new Map();

    function attachToList(listEl) {
      if (!listEl || attached.has(listEl)) return;
      attached.add(listEl);

      const mo = new MutationObserver((mutations) => {
        const relevant = mutations.some((m) => {
          const added = Array.from(m.addedNodes || []).some(
            (n) => n.nodeType === 1 && (n.matches?.(ITEM_SEL) || n.querySelector?.(ITEM_SEL))
          );
          const removed = Array.from(m.removedNodes || []).some(
            (n) => n.nodeType === 1 && (n.matches?.(ITEM_SEL) || n.querySelector?.(ITEM_SEL))
          );
          return added || removed;
        });

        if (relevant) debouncedRebuild();
      });

      mo.observe(listEl, { childList: true, subtree: true });
      listObservers.set(listEl, mo);
    }

    function scanAndAttach() {
      getAllLists().forEach(attachToList);
    }

    // Initial attach + initial build
    scanAndAttach();
    debouncedRebuild();

    // If lists appear/disappear later (tabs/filters/etc.), attach and rebuild.
    // Optimized to only fire when list wrappers are added/removed, avoiding pin rebuild loops.
    const moLists = new MutationObserver((mutations) => {
      const hasListChange = mutations.some(m => 
        Array.from(m.addedNodes).some(n => n.nodeType === 1 && (n.matches?.(LIST_SEL) || n.querySelector?.(LIST_SEL))) ||
        Array.from(m.removedNodes).some(n => n.nodeType === 1 && (n.matches?.(LIST_SEL) || n.querySelector?.(LIST_SEL)))
      );

      if (hasListChange) {
        scanAndAttach();
        debouncedRebuild();
      }
    });
    moLists.observe(document.body, { childList: true, subtree: true });

    // Debug handles (kept)
    window.rebuildMapPins = buildPins;
    window.__mapPinsListObserver = moLists;
    window.__mapPinsObservers = () => Array.from(listObservers.values());
  }

  // Keep pins scaled on zoom (single hookup; removed your duplicate script)
  function initInverseScalingListener() {
    const pz = window.mapPz;
    if (!pz || typeof pz.on !== "function") return;
    applyInversePinScale();
    pz.on("zoom", applyInversePinScale);
  }

  // =========================
  // Tooltip / mobile scroll behaviour
  // =========================
  function initTooltipAndTapBehaviour() {
    const map = document.querySelector(MAP_SEL);
    const mapContainer = document.querySelector(MAP_CONTAINER_SEL);
    if (!map || !mapContainer) return;

    // Ensure .map can anchor absolute tooltip
    const mapStyle = getComputedStyle(map);
    if (mapStyle.position === "static") map.style.position = "relative";

    // One shared tooltip (desktop only)
    const tip = document.createElement("div");
    tip.className = "map-tooltip";
    tip.style.position = "absolute";
    tip.style.zIndex = "9999";
    tip.style.display = "none";
    tip.style.pointerEvents = "auto";
    tip.style.userSelect = "auto";
    map.appendChild(tip);

    if (!document.getElementById("map-tooltip-css")) {
      const s = document.createElement("style");
      s.id = "map-tooltip-css";
      s.textContent = `
        .map-tooltip { display:none; }
        .map-tooltip.is-open { display:block; }
        .map-tooltip .plot-card { 
          max-width: 340px; 
          pointer-events: auto !important; 
          cursor: pointer; 
          -webkit-tap-highlight-color: transparent;
        }
        .plot_ci.is-pin-target { outline: 2px solid currentColor; outline-offset: 4px; }
        .pin > * { pointer-events: none; }
      `;
      document.head.appendChild(s);
    }

    let activePin = null;
    let closeTimer = null;

    const stopCloseTimer = () => {
      if (closeTimer) clearTimeout(closeTimer);
      closeTimer = null;
    };

    const closeTooltip = () => {
      stopCloseTimer();
      activePin = null;
      tip.classList.remove("is-open");
      tip.style.display = "none";
      tip.innerHTML = "";
    };

    function findItemForPin(pinWrap) {
      const pinLabel = norm(pinWrap.querySelector(".pin")?.textContent);
      if (!pinLabel) return null;

      const items = getAllItemsFromLists(getAllLists());
      for (const item of items) {
        const holderLabel = norm(item.querySelector(".pin-holder .pin")?.textContent);
        if (holderLabel === pinLabel) return item;
      }
      return null;
    }

    function scrollToItem(item) {
      if (!item) return;
      item.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });

      item.classList.add("is-pin-target");
      setTimeout(() => item.classList.remove("is-pin-target"), 1200);
    }

    function findCardForPin(pinWrap) {
      const item = findItemForPin(pinWrap);
      return item ? item.querySelector(CARD_SEL) : null;
    }

    function positionTooltip(pinWrap) {
      if (!pinWrap || !pinWrap.isConnected) return;

      const pinRect = pinWrap.getBoundingClientRect();
      const mapRect = map.getBoundingClientRect();

      const tipRectNow = tip.getBoundingClientRect();
      const tipW = tipRectNow.width;
      const tipH = tipRectNow.height;

      const mapW = mapRect.width;
      const mapH = mapRect.height;

      const xRight = (pinRect.right - mapRect.left) + GAP;
      const xLeft  = (pinRect.left - mapRect.left) - GAP - tipW;

      const yTop    = (pinRect.top - mapRect.top) - GAP - tipH;
      const yBottom = (pinRect.bottom - mapRect.top) + GAP;

      // Default: bottom + right
      let x = xRight;
      let y = yBottom;

      if (xRight + tipW > mapW) x = xLeft;
      if (yBottom + tipH > mapH) y = yTop;

      x = Math.max(0, Math.min(x, mapW - tipW));
      y = Math.max(0, Math.min(y, mapH - tipH));

      tip.style.left = `${x}px`;
      tip.style.top = `${y}px`;
      tip.style.transform = "none";
    }

    function openTooltip(pinWrap) {
      stopCloseTimer();

      const isOpen = tip.classList.contains("is-open");

      // If the tooltip for this pin is already open, do nothing. 
      // This ensures smooth hover even if sub-elements trigger events.
      if (activePin === pinWrap && isOpen) {
        return;
      }

      // If another pin is open, clear it first
      if (isOpen) {
        closeTooltip();
      }

      const card = findCardForPin(pinWrap);
      if (!card) return;

      activePin = pinWrap;

      tip.innerHTML = "";
      tip.appendChild(card.cloneNode(true));
      tip.style.display = "block";

      // Use requestAnimationFrame to ensure the browser has computed 
      // the dimensions of the newly added card before positioning.
      requestAnimationFrame(() => {
        if (activePin !== pinWrap) return;
        tip.classList.add("is-open");
        positionTooltip(pinWrap);
      });
    }

    // Keep tooltip clickable and isolate from map/panzoom interactions.
    // Using bubble phase (false) ensures that links/buttons inside the tooltip
    // receive events before propagation is stopped.
    const isolate = (e) => e.stopPropagation();
    ["pointerdown", "pointerup", "mousedown", "mouseup", "touchstart", "touchend", "click"].forEach(ev => {
      tip.addEventListener(ev, isolate, false);
    });

    // Click off map closes tooltip (desktop)
    map.addEventListener("click", (e) => {
      if (e.target.closest(".map-tooltip")) return;
      if (e.target.closest(PIN_WRAP_SEL)) return;
      closeTooltip();
    });

    // Reposition on pan/zoom
    const pz = window.mapPz;
    if (pz && typeof pz.on === "function") {
      const sync = () => { if (activePin) positionTooltip(activePin); };
      pz.on("zoom", sync);
      pz.on("pan", sync);
    }

    // ===== Interaction mode switch =====
    if (!isMobileLayout()) {
      // Desktop/Tablet (Large Screen): Tooltips

      // Mouse Hover Support
      mapContainer.addEventListener("pointerover", (e) => {
        if (e.pointerType !== "mouse") return;
        const pinWrap = e.target.closest(PIN_WRAP_SEL);
        if (pinWrap) openTooltip(pinWrap);
      });

      mapContainer.addEventListener("pointerout", (e) => {
        if (e.pointerType !== "mouse") return;
        const leavingPin = e.target.closest(PIN_WRAP_SEL);
        if (!leavingPin) return;

        const toEl = e.relatedTarget;
        if (toEl && (toEl.closest(PIN_WRAP_SEL) || toEl.closest(".map-tooltip"))) return;

        stopCloseTimer();
        closeTimer = setTimeout(closeTooltip, 80);
      });

      // Touch / Tap Support (Desktop Touchscreen)
      let down = null;
      mapContainer.addEventListener("pointerdown", (e) => {
        if (e.pointerType === "mouse") return;
        const pinWrap = e.target.closest(PIN_WRAP_SEL);
        if (!pinWrap) return;

        down = { pinWrap, x: e.clientX, y: e.clientY };
        // Prevent panzoom from dragging when starting a tap on a pin
        e.preventDefault();
        e.stopPropagation();
      }, true);

      mapContainer.addEventListener("pointerup", (e) => {
        if (!down) return;

        const dx = Math.abs(e.clientX - down.x);
        const dy = Math.abs(e.clientY - down.y);
        const pinWrap = down.pinWrap;
        down = null;

        if (dx > 8 || dy > 8) return; // ignore if panned

        e.preventDefault();
        e.stopPropagation();

        // For touch/tap, handle the "toggle" behavior (close if tapping the same pin).
        if (activePin === pinWrap && tip.classList.contains("is-open")) {
          closeTooltip();
        } else {
          openTooltip(pinWrap);
        }
      }, true);

      tip.addEventListener("pointerenter", stopCloseTimer);
      tip.addEventListener("pointerleave", (e) => {
        if (e.pointerType !== "mouse") return;
        stopCloseTimer();
        closeTimer = setTimeout(closeTooltip, 80);
      });
    } else {
      // Mobile Layout: tap pin -> scroll list to item (no tooltip)
      let down = null;

      mapContainer.addEventListener(
        "pointerdown",
        (e) => {
          const pinWrap = e.target.closest(PIN_WRAP_SEL);
          if (!pinWrap) return;

          down = { pinWrap, x: e.clientX, y: e.clientY };

          // avoid panzoom swallowing the tap
          e.preventDefault();
          e.stopPropagation();
        },
        true
      );

      mapContainer.addEventListener(
        "pointerup",
        (e) => {
          if (!down) return;

          const dx = Math.abs(e.clientX - down.x);
          const dy = Math.abs(e.clientY - down.y);
          const pinWrap = down.pinWrap;
          down = null;

          if (dx > 8 || dy > 8) return; // pan, not tap

          e.preventDefault();
          e.stopPropagation();

          closeTooltip();
          const item = findItemForPin(pinWrap);
          scrollToItem(item);
        },
        true
      );
    }

    window.closeMapTooltip = closeTooltip;
  }

  // =========================
  // Boot
  // =========================
  ready(() => {
    initPanZoom();
    initPinObservers();
    initInverseScalingListener();

    // Wait until pins + at least one list exist (same approach, but shorter)
    const start = Date.now();
    const t = setInterval(() => {
      const pins = document.querySelectorAll(`${MAP_CONTAINER_SEL} ${PIN_WRAP_SEL}`).length;
      const lists = document.querySelectorAll(LIST_SEL).length;

      if (pins && lists) {
        clearInterval(t);
        initTooltipAndTapBehaviour();
      }

      if (Date.now() - start > 8000) {
        clearInterval(t);
        console.warn("[map tooltip] Timed out waiting for pins/lists");
      }
    }, 60);
  });
})();