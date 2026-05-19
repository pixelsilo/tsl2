(() => {
  const STORAGE_KEY = "plot_favs_v1";

  const SEL = {
    holder: '.fav-holder[fav-id]',
    iconNot: '[fav="is-not"]',
    iconIs: '[fav="is"]',
    filter: '[fav="filter"]',
    favListWrap: '[fav-list]',          // e.g. <div fav-list="card">
    remoteCard: (type) => `[fav="${type}"]` // on /plots/{slug}: [fav="card"] or [fav="compare"]
  };

  // ---------- storage (ALWAYS STRINGS) ----------
  const getFavs = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.map(String) : [];
    } catch {
      return [];
    }
  };

  const setFavs = (arr) => {
    const out = Array.isArray(arr) ? arr.map(String) : [];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(out));
  };

  const toggleFav = (id) => {
    id = String(id);
    const favs = getFavs();
    const idx = favs.indexOf(id);
    if (idx >= 0) favs.splice(idx, 1);
    else favs.push(id);
    setFavs(favs);
    return favs;
  };

  // ---------- hearts ----------
  const setHolderUI = (holderEl, favOn) => {
    const iconNot = holderEl.querySelector(SEL.iconNot);
    const iconIs  = holderEl.querySelector(SEL.iconIs);

    if (iconNot) iconNot.style.display = favOn ? "none" : "block";
    if (iconIs)  iconIs.style.display  = favOn ? "block" : "none";

    holderEl.setAttribute("data-fav", favOn ? "1" : "0");
  };

  const syncAllHearts = () => {
    const favSet = new Set(getFavs());
    document.querySelectorAll(SEL.holder).forEach(h => {
      const id = String(h.getAttribute("fav-id") || "");
      if (!id) return;
      setHolderUI(h, favSet.has(id));
    });
  };

  const syncHeartsById = (id, favOn) => {
    id = String(id);
    document
      .querySelectorAll(`.fav-holder[fav-id="${CSS.escape(id)}"]`)
      .forEach(el => setHolderUI(el, favOn));
  };

  // ---------- filter lists (load-all then hide) ----------
  const applyFilterLists = () => {
    const favSet = new Set(getFavs());
    document.querySelectorAll(SEL.filter).forEach(list => {
      list.querySelectorAll(".w-dyn-item").forEach(item => {
        const holder = item.querySelector(SEL.holder);
        const id = holder ? String(holder.getAttribute("fav-id") || "") : "";
        item.style.display = (id && favSet.has(id)) ? "" : "none";
      });
    });
  };

  // ---------- favourites lists that fetch from plot pages ----------
  // Supports multiple wrappers:
  // <div fav-list="card" class="plot_cl"></div>
  // <div fav-list="compare" class="plot_cl"></div>
  // Each wrapper pulls [fav="card"] or [fav="compare"] from /plots/{id}
  const fetchWithConcurrency = async (ids, limit, worker) => {
    const out = new Array(ids.length);
    let cursor = 0;

    const runners = Array.from({ length: Math.min(limit, ids.length) }, async () => {
      while (cursor < ids.length) {
        const i = cursor++;
        out[i] = await worker(ids[i]).catch(() => null);
      }
    });

    await Promise.all(runners);
    return out;
  };

  let currentAbort = null;

  const fetchItemFromPlotPage = async (id, type, signal) => {
    id = String(id);

    const res = await fetch(`/plot/${encodeURIComponent(id)}`, {
      credentials: "same-origin",
      signal
    });
    if (!res.ok) return null;

    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, "text/html");

    const el = doc.querySelector(SEL.remoteCard(type));
    if (!el) return null;

    const node = document.importNode(el, true);

    // Ensure heart UI reflects local state
    const favOn = new Set(getFavs()).has(id);
    node.querySelectorAll(SEL.holder).forEach(h => setHolderUI(h, favOn));

    // Remove "current page" class from plot template markup
    node.querySelectorAll(".w--current").forEach(x => x.classList.remove("w--current"));

    return node;
  };

  const rebuildFavListsFromPages = async () => {
    const wraps = Array.from(document.querySelectorAll(SEL.favListWrap));
    if (!wraps.length) return;

    const favs = getFavs();
    // Clear all wraps first (so UI updates quickly)
    wraps.forEach(w => (w.innerHTML = ""));
    if (!favs.length) return;

    // Abort any in-flight build (e.g. user clicks quickly)
    if (currentAbort) currentAbort.abort();
    currentAbort = new AbortController();

    // Build each wrap sequentially (only 5–10 favs, so this is fine and avoids doubling concurrency)
    for (const wrap of wraps) {
      const type = String(wrap.getAttribute("fav-list") || "").trim();
      if (!type) continue;

      const nodes = await fetchWithConcurrency(
        favs,
        3, // concurrency
        (id) => fetchItemFromPlotPage(id, type, currentAbort.signal)
      );

      if (currentAbort.signal.aborted) return;

      nodes.forEach(n => { if (n) wrap.appendChild(n); });
    }

    syncAllHearts();
  };

  // ---------- schedule rebuild ----------
  let t = null;
  const schedule = (delay = 100) => {
    clearTimeout(t);
    t = setTimeout(() => {
      syncAllHearts();
      applyFilterLists();
      if (document.querySelector(SEL.favListWrap)) rebuildFavListsFromPages();
    }, delay);
  };

  // ---------- init ----------
  const init = () => {
    schedule(0);

    document.addEventListener("click", (e) => {
      const holder = e.target.closest(SEL.holder);
      if (!holder) return;

      // Prevent card link navigation
      e.preventDefault();
      e.stopPropagation();

      const id = String(holder.getAttribute("fav-id") || "");
      if (!id) return;

      const favs = toggleFav(id);
      const favOn = favs.includes(id);

      syncHeartsById(id, favOn);
      applyFilterLists();

      // If this page has any fav-list wrappers, rebuild them
      if (document.querySelector(SEL.favListWrap)) schedule(50);
    }, { passive: false });

    // Multi-tab sync
    window.addEventListener("storage", (ev) => {
      if (ev.key === STORAGE_KEY) schedule(0);
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();