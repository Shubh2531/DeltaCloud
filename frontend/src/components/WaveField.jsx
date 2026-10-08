import { useEffect, useRef } from "react";

// Slow flowing price-like waves and drifting particles behind the landing hero.
// It pauses when the tab is hidden and draws a single still frame if the visitor prefers reduced motion.
export default function WaveField() {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return undefined;
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let w = 0, h = 0, raf = 0, t = 0, dpr = 1;
    const dots = Array.from({ length: 46 }, (_, i) => ({ x: (i * 97) % 100 / 100, y: (i * 53) % 100 / 100, s: 0.4 + ((i * 29) % 10) / 14, v: 0.02 + ((i * 17) % 10) / 400 }));

    const size = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      const waves = [
        { amp: 0.07, len: 1.6, spd: 0.5, y: 0.62, c: "0,229,180", a: 0.34 },
        { amp: 0.09, len: 1.1, spd: 0.35, y: 0.7, c: "91,124,250", a: 0.28 },
        { amp: 0.05, len: 2.2, spd: 0.7, y: 0.78, c: "0,229,180", a: 0.16 },
      ];
      for (const wv of waves) {
        ctx.beginPath();
        for (let x = 0; x <= w; x += 6) {
          const k = x / w;
          const y = h * wv.y + Math.sin(k * Math.PI * 2 * wv.len + t * wv.spd) * h * wv.amp + Math.sin(k * 9 + t * 0.9) * h * 0.012;
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(${wv.c},${wv.a})`; ctx.lineWidth = 1.6; ctx.stroke();
      }
      for (const d of dots) {
        const x = ((d.x + (still ? 0 : t * d.v * 0.2)) % 1) * w;
        const y = (d.y + Math.sin(t * 0.4 + d.x * 10) * 0.01) * h;
        ctx.beginPath(); ctx.arc(x, y, d.s, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(180,200,255,0.35)"; ctx.fill();
      }
    };

    const loop = () => { t += 0.012; draw(); raf = requestAnimationFrame(loop); };
    const onVis = () => { cancelAnimationFrame(raf); if (!document.hidden && !still) raf = requestAnimationFrame(loop); };

    size(); draw();
    if (!still) raf = requestAnimationFrame(loop);
    window.addEventListener("resize", size);
    document.addEventListener("visibilitychange", onVis);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", size); document.removeEventListener("visibilitychange", onVis); };
  }, []);

  return <canvas ref={ref} className="lp-waves" aria-hidden="true" />;
}
