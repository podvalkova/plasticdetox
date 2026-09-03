// Node building helpers.
//
// Everything on screen is built with createElement and textContent. A product
// title arrives from a barcode database we do not control, so it is never
// allowed to become markup. Same discipline as the extension.

export function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

export function frag(...nodes) {
  const f = document.createDocumentFragment();
  for (const n of nodes) if (n) f.appendChild(n);
  return f;
}

export function icon(path, size = 20) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", size);
  svg.setAttribute("height", size);
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  const p = document.createElementNS(ns, "path");
  p.setAttribute("d", path);
  svg.appendChild(p);
  return svg;
}

export const ICONS = {
  scan: "M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 8v8M11 8v8M15 8v8",
  search: "M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM21 21l-4.35-4.35",
  // A shield for the check tab, a basket for the shop.
  check: "M12 3l7 3v6c0 4.5-3 8.3-7 9-4-.7-7-4.5-7-9V6l7-3zM9 12l2 2 4-4",
  shop: "M6 7h12l1.5 12a2 2 0 0 1-2 2H6.5a2 2 0 0 1-2-2L6 7zM9 7V5a3 3 0 0 1 6 0v2",
};

let toastTimer = null;
export function toast(message) {
  const old = document.querySelector(".toast");
  if (old) old.remove();
  clearTimeout(toastTimer);
  const t = el("div", "toast", message);
  document.body.appendChild(t);
  toastTimer = setTimeout(() => t.remove(), 2600);
}

/**
 * Split a front note into the finding and its scope.
 *
 * Most of our notes end with an aside naming what the finding is actually
 * about ("(Recorded for Tampax as a whole rather than this product
 * specifically.)"). Glued to the end of a sentence, sometimes after an ellipsis
 * where the finding was truncated, it reads as a fragment. It is worth keeping
 * and worth setting apart, so it goes on its own quieter line.
 */
export function splitNote(text) {
  const raw = (text || "").trim();
  if (!raw) return null;
  const m = raw.match(/^([\s\S]*?)\s*\(([A-Z][^)]*)\)$/);
  const main = (m ? m[1] : raw).trim();
  // Notes are written as sentence fragments about half the time. On a card
  // they read as sentences, so they start like one.
  return {
    main: main ? main[0].toUpperCase() + main.slice(1) : "",
    scope: m ? m[2].trim() : "",
  };
}
