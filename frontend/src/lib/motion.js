// Global motion engine: every page's sections ripple in as they scroll into view, cards
// get a 3D tilt following the pointer, and new pages auto-stage on route change.
// Honors prefers-reduced-motion.

const SHOWN = "motion-in";
const CARD_SEL = ".card, .fd-tile, .intel-tech-item, .passkey-list li, .settings-nav-item";

// Grid wrappers whose own box shouldn't animate — their CELLS do, with a nested stagger.
// This stops a grid of cards from double-animating (wrapper + cards).
const GRID_SEL = ".cols-even, .fd-charts, .fd-tiles, .intel-grid, .settings-cards, .intel-top, .fd-plot";

let observer = null;
let mutations = null;
let tiltCleanup = null;

function stage(el, kind, delay) {
  if (!el || el.hasAttribute("data-motion") || el.classList.contains("ticker")) return;
  el.setAttribute("data-motion", kind || "up");
  if (!el.style.getPropertyValue("--motion-delay")) {
    el.style.setProperty("--motion-delay", `${Math.min(delay, 900)}ms`);
  }
  observer?.observe(el);
}

function stagePage(page) {
  const kids = Array.from(page.children);
  kids.forEach((kid, i) => {
    const base = i * 110;
    if (kid.matches?.(GRID_SEL)) {
      // The grid wrapper itself is transparent; its cells ripple with a nested stagger.
      Array.from(kid.children).forEach((cell, j) => stage(cell, "up", base + j * 90));
    } else {
      stage(kid, "up", base);
    }
  });
}

// Find pages inside a root and stage them. Also stages the root if it IS a page.
function prepare(root) {
  const pages = root.matches?.(".page, [data-stage] > .page")
    ? [root]
    : Array.from(root.querySelectorAll?.(".page") || []);
  if (pages.length === 0 && root.matches?.("[data-stage]")) {
    // Non-page stage (e.g. landing page main): stage its own direct children.
    const kids = Array.from(root.children);
    kids.forEach((kid, i) => stage(kid, "up", i * 120));
    return;
  }
  pages.forEach(stagePage);
}

// Subtle 3D tilt following the pointer: cards feel like glass sheets, not stickers.
function startTilt() {
  const canTilt = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  if (!canTilt) return () => {};
  const onMove = (e) => {
    const card = e.target.closest(CARD_SEL);
    if (!card || !card.isConnected) return;
    const r = card.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    card.style.setProperty("--tx", `${(-py * 4).toFixed(2)}deg`);
    card.style.setProperty("--ty", `${(px * 4).toFixed(2)}deg`);
    card.style.setProperty("--mx", `${(px * 100 + 50).toFixed(1)}%`);
    card.style.setProperty("--my", `${(py * 100 + 50).toFixed(1)}%`);
    card.classList.add("tilt-on");
  };
  const onLeave = (e) => {
    const card = e.target.closest(CARD_SEL);
    if (!card) return;
    card.style.removeProperty("--tx");
    card.style.removeProperty("--ty");
    card.classList.remove("tilt-on");
  };
  document.addEventListener("pointermove", onMove, { passive: true });
  document.addEventListener("pointerleave", onLeave, true);
  return () => {
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerleave", onLeave, true);
  };
}

export function startMotion() {
  if (observer) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) {
    document.documentElement.classList.add("motion-reduce");
    return;
  }
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add(SHOWN);
          observer.unobserve(entry.target);
        }
      }
    },
    { rootMargin: "0px 0px -6% 0px", threshold: 0.01 }
  );
  // Prepare anything already in the DOM.
  document.querySelectorAll(".page, [data-stage]").forEach(prepare);
  // SPA navigation: when a new page is swapped in, stage it the same way.
  mutations = new MutationObserver((list) => {
    for (const m of list) {
      for (const node of m.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.matches?.(".page") || node.matches?.("[data-stage]")) prepare(node);
        node.querySelectorAll?.(".page, [data-stage]").forEach(prepare);
      }
    }
  });
  mutations.observe(document.body, { childList: true, subtree: true });
  tiltCleanup = startTilt();
}

export function stopMotion() {
  observer?.disconnect();
  mutations?.disconnect();
  tiltCleanup?.();
  observer = null;
  mutations = null;
  tiltCleanup = null;
}
