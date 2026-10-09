// Global motion engine. On every page, every section rises up slowly as it scrolls into
// view. Cards tilt subtly to the pointer. Honors prefers-reduced-motion.
//
// Timing matters here. We must give the browser a chance to paint the initial off-stage
// state BEFORE the IntersectionObserver fires, otherwise the "transition" happens too
// fast to see. So:
//   1. Mark the element with data-motion (initial state, kept via a frame).
//   2. requestAnimationFrame → requestAnimationFrame → observer.observe(el).
// Two frames guarantee at least one paint of the hidden state first.

const SHOWN = "motion-in";
const CARD_SEL = ".card, .fd-tile, .intel-tech-item, .passkey-list li, .settings-nav-item";
const GRID_SEL = ".cols-even, .fd-charts, .fd-tiles, .intel-grid, .settings-cards, .intel-top";

let observer = null;
let mutations = null;
let tiltCleanup = null;

function later(fn) {
  requestAnimationFrame(() => requestAnimationFrame(fn));
}

function stage(el, delay) {
  if (!el || el.hasAttribute("data-motion") || el.classList.contains("ticker")) return;
  el.setAttribute("data-motion", "up");
  el.style.setProperty("--motion-delay", `${Math.min(delay, 1200)}ms`);
  // Defer the first intersection callback until after the browser has painted the hidden
  // state once; otherwise the opacity-0→1 transition is skipped on fresh page loads.
  later(() => observer?.observe(el));
}

function stagePage(page) {
  const kids = Array.from(page.children);
  kids.forEach((kid, i) => {
    const base = i * 180;
    if (kid.matches?.(GRID_SEL)) {
      // Grid wrappers don't animate themselves; their cells ripple in with a nested stagger.
      Array.from(kid.children).forEach((cell, j) => stage(cell, base + j * 140));
    } else {
      stage(kid, base);
    }
  });
}

function prepare(root) {
  if (!root || !root.matches) return;
  if (root.matches(".page")) {
    stagePage(root);
    return;
  }
  const pages = root.querySelectorAll?.(".page");
  if (pages && pages.length) {
    pages.forEach(stagePage);
    return;
  }
  if (root.matches("[data-stage]")) {
    // Landing / sign-in: no .page inside, animate direct children.
    Array.from(root.children).forEach((kid, i) => stage(kid, i * 200));
  }
}

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
    // Lower threshold + a small negative bottom margin: elements must actually come into
    // view before they reveal, so content below the fold waits until you scroll.
    { rootMargin: "0px 0px -12% 0px", threshold: 0.08 }
  );

  const preparePresent = () => document.querySelectorAll(".page, [data-stage]").forEach(prepare);
  preparePresent();

  mutations = new MutationObserver((list) => {
    for (const m of list) {
      for (const node of m.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.matches?.(".page") || node.matches?.("[data-stage]")) {
          prepare(node);
          continue;
        }
        const nested = node.querySelectorAll?.(".page, [data-stage]");
        if (nested && nested.length) nested.forEach(prepare);
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
