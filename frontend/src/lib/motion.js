// Cards get a subtle 3D tilt following the pointer. Everything else reveals as it
// scrolls into view and hides again once it scrolls back out — motion.css hides
// these elements by default (opacity 0, shifted down) as a CSS default, painted
// before any JS runs, so there is no flash and no race with the observer below.
// The IntersectionObserver here toggles ".dc-in" every time an element crosses in
// or out of the viewport (it never stops watching), which is what plays the CSS
// transition both ways: scroll down, it rises in; scroll back up past it, it
// fades back out; scroll down to it again, it rises in again. Works the same on
// phone, tablet or desktop — IntersectionObserver measures against the real
// browser viewport, whatever size that is, on every engine that supports it
// (every current mobile and desktop browser, including in-app WebViews).

const CARD_SEL = ".card, .fd-tile, .intel-tech-item, .passkey-list li, .settings-nav-item";

const REVEAL_SEL = [
  ".page > *",
  ".page .cols-even > *",
  ".page .fd-charts > *",
  ".page .fd-tiles > *",
  ".page .intel-grid > *",
  ".page .intel-top > *",
  ".page .settings-cards > *",
  ".page .cols-2 > *",
  ".page .story",
  ".page .journal-table tr",
  ".page .stories > *",
  ".page .table tbody tr",
  ".lp > main > *",
].join(", ");

let tiltCleanup = null;
let revealObserver = null;
let domWatcher = null;
const seen = new WeakSet();

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

// Pulls in every matching element under `root` that hasn't been handed to the
// observer yet. Safe to call repeatedly — already-seen elements are skipped.
function scanForReveals(root) {
  if (!revealObserver) return;
  const scope = root || document;
  const nodes = typeof scope.querySelectorAll === "function" ? scope.querySelectorAll(REVEAL_SEL) : [];
  nodes.forEach((el) => {
    if (seen.has(el)) return;
    seen.add(el);
    revealObserver.observe(el);
  });
}

function startReveal() {
  // Very old browsers (no IntersectionObserver at all) just see everything —
  // better than content that never appears.
  if (typeof IntersectionObserver === "undefined") {
    document.documentElement.classList.add("motion-reduce");
    return;
  }

  revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        entry.target.classList.toggle("dc-in", entry.isIntersecting);
      });
    },
    // A band trimmed in from both viewport edges, so an element reveals a little
    // before it's fully on screen and hides again once it's mostly off screen —
    // in either scroll direction, at any viewport size.
    { threshold: 0.08, rootMargin: "-6% 0px -10% 0px" }
  );

  scanForReveals(document);

  // The app is a single page: React swaps whole page subtrees in and out as the
  // person navigates. A MutationObserver on the whole document catches every new
  // page (and every card lazily rendered inside one) the moment it's in the DOM.
  domWatcher = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach((node) => {
        if (node.nodeType !== 1) return;
        if (node.matches?.(REVEAL_SEL) && !seen.has(node)) {
          seen.add(node);
          revealObserver.observe(node);
        }
        scanForReveals(node);
      });
    }
  });
  domWatcher.observe(document.body, { childList: true, subtree: true });
}

function stopReveal() {
  revealObserver?.disconnect();
  domWatcher?.disconnect();
  revealObserver = null;
  domWatcher = null;
}

export function startMotion() {
  if (tiltCleanup || revealObserver) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) {
    document.documentElement.classList.add("motion-reduce");
    return;
  }
  tiltCleanup = startTilt();
  startReveal();
}

export function stopMotion() {
  tiltCleanup?.();
  tiltCleanup = null;
  stopReveal();
}
