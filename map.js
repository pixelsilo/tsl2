document.addEventListener("DOMContentLoaded", () => {
  // Wrap the entire map initialization logic inside this listener
  (function loadGoogleMapsOnce() {
    const KEY = "AIzaSyDt16hwV-O4m70V1HQws6mUO09VLsfgS2I";
    const ID  = "google-maps-js";

    // Queue for anything that wants to run once Maps is ready
    window.__gmapsCallbacks = window.__gmapsCallbacks || [];
    window.__gmapsLoaded = window.__gmapsLoaded || false;

    window.__gmapsRun = function (fn) {
      if (window.__gmapsLoaded && window.google && window.google.maps) fn();
      else window.__gmapsCallbacks.push(fn);
    };

    // This MUST exist before Google loads, so the callback never misses.
    window.initGoogleMap = function () {
      window.__gmapsLoaded = true;
      const cbs = (window.__gmapsCallbacks || []).splice(0);
      cbs.forEach(cb => { try { cb(); } catch(e) { console.error(e); } });
    };

    if (document.getElementById(ID)) return;

    const s = document.createElement("script");
    s.id = ID;
    s.async = true;
    s.defer = true;
    s.src = "https://maps.googleapis.com/maps/api/js?key=" + encodeURIComponent(KEY) + "&callback=initGoogleMap";
    document.head.appendChild(s);
  })();

  //-- Map Functions
  //--BODY SCRIPT (Option A + Click-to-open InfoWindow)
  //--Desktop: InfoWindow opens ONLY on pin click or card click
  //--Desktop hover: NO InfoWindow
  //--Mobile: tap pin scrolls list + highlights card (NO InfoWindow)

  (function () {
    // ===== Selectors (your DOM) =====
    const MAP_EL_SEL        = ".google-map";
    const LIST_WRAP_SEL     = '[fs-list-element="list"]';
    const ITEM_SEL          = ".location_ci";
    const CARD_SEL          = ".location-card";
    const PIN_HOLDER_SEL    = ".pin-holder";
    const ICON_HOLDER_SEL   = ".pin-icon-holder";
    const LAT_SEL           = '[axis="latitude"]';
    const LNG_SEL           = '[axis="longitude"]';
    const LEFT_SCROLLER_SEL = ".left-scroller";

    // ===== Config =====
    const MAP_ID = "a46b5c8b7744f234a9c71367";
    const DEBOUNCE_MS = 120;
    const INFO_GAP_PX = 10;
    const FOCUS_ZOOM_DESKTOP = 15;
    const FOCUS_ZOOM_MOBILE  = 15;

    // ===== Helpers =====
    const isMobileLayout = () =>
      window.matchMedia && window.matchMedia("(max-width: 991px)").matches;

    const toNum = (txt) => {
      const n = Number(String(txt || "").trim());
      return Number.isFinite(n) ? n : null;
    };

    const isVisible = (el) => {
      if (!el || el.nodeType !== 1) return false;
      if (!el.isConnected) return false;
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") return false;
      if (el.offsetParent === null && cs.position !== "fixed") return false;
      return true;
    };

    const debounce = (fn, ms) => {
      let t;
      return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
    };

    // ===== Highlight flash (on .location-card) =====
    const FLASH_CLASS = "is-map-flash";

    function ensureFlashCSS() {
      if (document.getElementById("map-flash-css")) return;
      const s = document.createElement("style");
      s.id = "map-flash-css";
      s.textContent = `
        ${CARD_SEL}.${FLASH_CLASS} {
          outline: 2px solid currentColor;
          outline-offset: 4px;
        }
      `;
      document.head.appendChild(s);
    }

    function flashCard(item) {
      const card = item?.querySelector(CARD_SEL);
      if (!card) return;
      ensureFlashCSS();
      card.classList.add(FLASH_CLASS);
      setTimeout(() => card.classList.remove(FLASH_CLASS), 900);
    }

    function scrollItemIntoViewMobileOnly(item) {
      if (!item) return;
      if (!isMobileLayout()) return; // mobile only

      const scroller = document.querySelector(LEFT_SCROLLER_SEL);
      if (scroller && scroller.contains(item)) {
        const r = item.getBoundingClientRect();
        const sr = scroller.getBoundingClientRect();
        const target = scroller.scrollTop + (r.top - sr.top) - 24;
        scroller.scrollTo({ top: target, behavior: "smooth" });
      } else {
        item.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }

    function getItemLatLng(item) {
      const holder = item.querySelector(PIN_HOLDER_SEL);
      if (!holder) return null;

      const lat = toNum(holder.querySelector(LAT_SEL)?.textContent);
      const lng = toNum(holder.querySelector(LNG_SEL)?.textContent);
      if (lat === null || lng === null) return null;

      return { lat, lng };
    }

    function getCardHTML(item) {
      const card = item.querySelector(CARD_SEL);
      return card ? card.cloneNode(true).outerHTML : null;
    }

    function getIconNode(item) {
      const iconHolder = item.querySelector(`${PIN_HOLDER_SEL} ${ICON_HOLDER_SEL}`);
      if (!iconHolder) return null;

      const clone = iconHolder.cloneNode(true);
      clone.style.display = "block";
      clone.style.pointerEvents = "auto";
      return clone;
    }

    // ===== State =====
    let map, infoWindow, overlays = [];
    let itemToOverlay = new WeakMap();

    function clearOverlays() {
      overlays.forEach(o => o.setMap(null));
      overlays = [];
      itemToOverlay = new WeakMap();
    }

    function fitToOverlays() {
      if (!overlays.length) return;
      const bounds = new google.maps.LatLngBounds();
      overlays.forEach(o => bounds.extend(o.getPosition()));
      map.fitBounds(bounds, 56);
    }

    // InfoWindow above top of pin (dynamic height)
    function openInfoAbovePin(item, position, wrapEl) {
      const html = getCardHTML(item);
      if (!html) return;

      const h = wrapEl ? wrapEl.getBoundingClientRect().height : 0;
      const yOffset = -Math.round(h + INFO_GAP_PX);

      infoWindow.setOptions({
        pixelOffset: new google.maps.Size(0, yOffset)
      });

      infoWindow.setContent(html);
      infoWindow.setPosition(position);
      infoWindow.open({ map });
    }

    function focusMapOnItem(item, { openInfo = true } = {}) {
      const overlay = itemToOverlay.get(item);
      if (!overlay) return;

      const pos = overlay.getPosition();
      map.panTo(pos);

      const targetZoom = isMobileLayout() ? FOCUS_ZOOM_MOBILE : FOCUS_ZOOM_DESKTOP;
      if (typeof map.getZoom === "function" && map.getZoom() < targetZoom) {
        map.setZoom(targetZoom);
      }

      if (openInfo) {
        openInfoAbovePin(item, pos, overlay.__wrapEl || null);
      }

      flashCard(item);
    }

    // ===== Custom Overlay (DOM pin anchored bottom-centre) =====
    // Option A stacking: top of list = highest z-index
    function createPinOverlay(item, position, baseZ) {
      const iconNode = getIconNode(item);
      if (!iconNode) return null;

      const wrap = document.createElement("div");
      wrap.className = "gmap-dom-pin";
      wrap.style.position = "absolute";
      wrap.style.transform = "translate(-50%, -100%)";
      wrap.style.cursor = "pointer";
      wrap.style.pointerEvents = "auto";
      wrap.style.zIndex = String(baseZ || 10);
      wrap.appendChild(iconNode);

      // Desktop: click opens InfoWindow + flash (NO hover)
      // Mobile: tap scrolls + flash (NO InfoWindow)
      wrap.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (isMobileLayout()) {
          infoWindow && infoWindow.close();
          scrollItemIntoViewMobileOnly(item);
          flashCard(item);
          return;
        }

        // desktop
        openInfoAbovePin(item, position, wrap);
        flashCard(item);
      });

      function PinOverlay() {
        this.position = position;
        this.el = wrap;
        this.__wrapEl = wrap;
      }
      PinOverlay.prototype = new google.maps.OverlayView();

      PinOverlay.prototype.onAdd = function () {
        const panes = this.getPanes();
        panes.overlayMouseTarget.appendChild(this.el);
      };

      PinOverlay.prototype.draw = function () {
        const proj = this.getProjection();
        if (!proj) return;
        const p = proj.fromLatLngToDivPixel(this.position);
        if (!p) return;
        this.el.style.left = p.x + "px";
        this.el.style.top  = p.y + "px";
      };

      PinOverlay.prototype.onRemove = function () {
        if (this.el && this.el.parentNode) this.el.parentNode.removeChild(this.el);
      };

      PinOverlay.prototype.getPosition = function () {
        return this.position;
      };

      return new PinOverlay();
    }

    function rebuildOverlays({ shouldFit = false } = {}) {
      const mapEl = document.querySelector(MAP_EL_SEL);
      const listWrap = document.querySelector(LIST_WRAP_SEL);
      if (!mapEl || !listWrap || !map) return;

      const items = Array.from(listWrap.querySelectorAll(ITEM_SEL)).filter(isVisible);

      clearOverlays();

      if (!items.length) {
        infoWindow && infoWindow.close();
        return;
      }

      const n = items.length;

      items.forEach((item, idx) => {
        const ll = getItemLatLng(item);
        if (!ll) return;

        const pos = new google.maps.LatLng(ll.lat, ll.lng);

        // Top of list should be on top:
        const z = (n - idx);

        const ov = createPinOverlay(item, pos, z);
        if (!ov) return;

        ov.setMap(map);
        overlays.push(ov);
        itemToOverlay.set(item, ov);
      });

      if (shouldFit) fitToOverlays();
    }

    function attachObservers() {
      const listWrap = document.querySelector(LIST_WRAP_SEL);
      if (!listWrap) return;

      const debounced = debounce(() => {
        rebuildOverlays({ shouldFit: true }); // only on list/filter changes
      }, DEBOUNCE_MS);

      const mo = new MutationObserver(() => debounced());

      mo.observe(listWrap, {
        childList: true,
        subtree: true,
        attributes: true,
        // no class watching (prevents auto-fit on highlight flash)
        attributeFilter: ["style", "hidden", "aria-hidden"]
      });

      window.addEventListener("resize", debounced, { passive: true });
      map.addListener("click", () => infoWindow && infoWindow.close());

      window.rebuildGoogleMapPins = () => rebuildOverlays({ shouldFit: true });
      window.__gmapListObserver = mo;
    }

    // Clicking cards focuses map + opens info (desktop + mobile)
    function attachCardClick() {
      document.addEventListener("click", (e) => {
        const card = e.target.closest(CARD_SEL);
        if (!card) return;

        // Allow real links/buttons inside cards to work
        if (e.target.closest("a, button")) return;

        const item = card.closest(ITEM_SEL);
        if (!item) return;

        e.preventDefault();
        e.stopPropagation();

        focusMapOnItem(item, { openInfo: true });
      }, true);
    }

    function init() {
      const mapEl = document.querySelector(MAP_EL_SEL);
      if (!mapEl) return;

      if (mapEl.offsetHeight < 10) {
        setTimeout(init, 60);
        return;
      }

      map = new google.maps.Map(mapEl, {
        center: { lat: 54.5, lng: -2.5 },
        zoom: 6,
        mapTypeId: "roadmap",
        mapTypeControl: true,
        mapTypeControlOptions: {
          style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
          position: google.maps.ControlPosition.TOP_RIGHT,
          mapTypeIds: ["roadmap", "satellite"]
        },
        streetViewControl: true,
        streetViewControlOptions: {
          position: google.maps.ControlPosition.TOP_RIGHT
        },
        fullscreenControl: false,
        mapId: MAP_ID
      });

      infoWindow = new google.maps.InfoWindow({ maxWidth: 360 });

      attachCardClick();

      const start = Date.now();
      const t = setInterval(() => {
        const listWrap = document.querySelector(LIST_WRAP_SEL);
        const anyItems = listWrap && listWrap.querySelector(ITEM_SEL);

        if (listWrap && anyItems) {
          clearInterval(t);
          rebuildOverlays({ shouldFit: true }); // initial fit
          attachObservers();
        }

        if (Date.now() - start > 10000) {
          clearInterval(t);
          rebuildOverlays({ shouldFit: true });
          attachObservers();
        }
      }, 80);
    }

    // Use your head loader queue
    if (typeof window.__gmapsRun === "function") {
      window.__gmapsRun(init);
    } else {
      const poll = setInterval(() => {
        if (window.google && window.google.maps) {
          clearInterval(poll);
          init();
        }
      }, 50);
      setTimeout(() => clearInterval(poll), 15000);
    }

  })();
});