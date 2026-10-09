// Cards get a subtle 3D tilt following the pointer. The reveal animations are pure CSS.
// Pointer-coarse (touch) devices skip tilt.

const CARD_SEL = ".card, .fd-tile, .intel-tech-item, .passkey-list li, .settings-nav-item";

let tiltCleanup = null;

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
  if (tiltCleanup) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) {
    document.documentElement.classList.add("motion-reduce");
    return;
  }
  tiltCleanup = startTilt();
}

export function stopMotion() {
  tiltCleanup?.();
  tiltCleanup = null;
}
