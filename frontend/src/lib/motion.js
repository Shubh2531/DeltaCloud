// A single IntersectionObserver watches every page and reveals children as they come
// into view. Nothing to add to each page — the layout wraps a container with [data-stage]
// and everything inside animates in order. Honors prefers-reduced-motion.

const SHOWN = "motion-in";
const STAGE_SEL = "[data-stage]";
const CARD_SEL = ".card, .fd-tile, .intel-tech-item, .passkey-list li, .settings-nav-item";

let observer = null;
let mutations = null;
let tiltCleanup = null;

function reveal(el) {
  if (el.classList.contains(SHOWN)) return;
  el.classList.add(SHOWN);
}

function prepare(stage) {
  // Give every direct child of the stage a stagger index, so they ripple in.
  const kids = Array.from(stage.children);
  kids.forEach((kid, i) => {
    if (!kid.hasAttribute("data-motion")) kid.setAttribute("data-motion", "up");
    if (!kid.style.getPropertyValue("--motion-delay")) {
      kid.style.setProperty("--motion-delay", `${Math.min(i * 60, 480)}ms`);
    }
  });
  // Watch every direct child + any grid cell inside .cols-even that showed up later.
  const toWatch = stage.querySelectorAll("[data-motion], .card");
  toWatch.forEach((el) => observer?.observe(el));
}

// Subtle 3D tilt following the pointer: cards feel like glass sheets, not stickers.
// Pointer-coarse (touch) devices skip it, since there's no hover.
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
    // Show everything right away; no watcher, no tilt.
    document.documentElement.classList.add("motion-reduce");
    return;
  }
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          reveal(entry.target);
          observer.unobserve(entry.target);
        }
      }
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.01 }
  );
  // Watch stages that already exist and any that get added later (SPA navigation).
  document.querySelectorAll(STAGE_SEL).forEach(prepare);
  mutations = new MutationObserver((list) => {
    for (const m of list) {
      for (const node of m.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.matches?.(STAGE_SEL)) prepare(node);
        node.querySelectorAll?.(STAGE_SEL).forEach(prepare);
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
