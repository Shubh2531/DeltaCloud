import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * DeltaCloud orb. `marketDelta` (-1 to 1) pulls the glow inward when the market is falling;
 * `volatility` (0 to 1) speeds up the motion. Both are read through refs so the scene is
 * built once and then follows the latest values without being rebuilt.
 */
export default function MarketIntelligenceOrb({ size = 240, marketDelta = 0, volatility = 0.3 }) {
  const mountRef = useRef(null);
  const live = useRef({ marketDelta, volatility });

  useEffect(() => {
    live.current = { marketDelta, volatility };
  }, [marketDelta, volatility]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    } catch {
      return undefined; // no WebGL on this device: the card still works without the orb
    }
    renderer.setSize(size, size);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.z = 3;

    const orbMat = new THREE.ShaderMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      uniforms: {
        time: { value: 0 },
        collapse: { value: 0 },
        color: { value: new THREE.Color("#00ffd5") },
      },
      vertexShader: `
        varying vec3 vPos;
        varying vec3 vNormal;
        void main() {
          vPos = position;
          vNormal = normal;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform float collapse;
        uniform vec3 color;
        varying vec3 vPos;
        varying vec3 vNormal;
        float noise(vec3 p) {
          return sin(p.x * 4.0 + time) * sin(p.y * 4.0) * sin(p.z * 4.0);
        }
        void main() {
          float plasma = noise(vPos * 2.2);
          float rim = pow(1.0 - dot(normalize(vNormal), vec3(0.0, 0.0, 1.0)), 3.0);
          float pull = clamp(1.0 - collapse * length(vPos), 0.0, 1.0);
          vec3 glow = color * (plasma * 2.0 + rim * 2.8);
          gl_FragColor = vec4(glow * pull, clamp(plasma + rim, 0.0, 1.0));
        }
      `,
    });
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(0.92, 96, 96), orbMat));

    const core = new THREE.Mesh(
      new THREE.TetrahedronGeometry(0.26),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending })
    );
    scene.add(core);

    const satellites = Array.from({ length: 6 }, (_, i) => {
      const mesh = new THREE.Mesh(
        new THREE.TetrahedronGeometry(0.1),
        new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending })
      );
      scene.add(mesh);
      return { mesh, offset: i * Math.PI * 0.33 };
    });

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;

    const frame = () => {
      const t = performance.now() * 0.001;
      const { marketDelta: delta, volatility: vol } = live.current;

      orbMat.uniforms.time.value += 0.01 + vol * 0.03;
      orbMat.uniforms.collapse.value = Math.max(0, -delta);

      core.position.y = Math.sin(t * 2.2) * 0.12;
      core.rotation.x += 0.02;
      core.rotation.y += 0.028;
      satellites.forEach((s) => {
        s.mesh.position.x = Math.cos(t + s.offset) * 1.45;
        s.mesh.position.z = Math.sin(t + s.offset) * 1.45;
        s.mesh.rotation.y += 0.03;
      });

      renderer.render(scene, camera);
      if (!reduceMotion) raf = requestAnimationFrame(frame);
    };
    frame();

    return () => {
      cancelAnimationFrame(raf);
      scene.traverse((obj) => {
        obj.geometry?.dispose?.();
        const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
        mats.forEach((m) => m.dispose());
      });
      renderer.dispose();
      renderer.forceContextLoss?.();
      renderer.domElement.remove();
    };
  }, [size]);

  return <div ref={mountRef} style={{ width: size, height: size }} role="img" aria-label="Animated DeltaCloud orb" />;
}
