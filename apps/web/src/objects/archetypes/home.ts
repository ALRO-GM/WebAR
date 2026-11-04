import * as THREE from 'three';
import {
  bubbles,
  canvasTexture,
  emitter,
  glass,
  glowMat,
  halo,
  labelTexture,
  lathe,
  mat,
  mesh,
  metal,
  particles,
  roundedBox,
  seeded,
  taperedTube,
  tube,
  wave,
  type Kit,
  type Params,
} from '../kit';

// Arquetipos de casa, cuerpo y laboratorio: gemas, vidrio, frascos, tubos de
// ensayo, agua, comida, huesos, plantas, piscinas.

function sparkle(k: Kit, parent: THREE.Object3D, n: number, radius: number, color = '#ffffff'): void {
  const list = Array.from({ length: n }, () => {
    const s = halo(color, 0.3, 0);
    const d = new THREE.Vector3(k.rand() - 0.5, k.rand() - 0.3, k.rand() * 0.5 + 0.3).normalize().multiplyScalar(radius);
    s.position.copy(d);
    parent.add(s);
    return { s, ph: k.rand() * 3 };
  });
  k.animate((t) => {
    for (const q of list) {
      const c = ((t + q.ph) % 2.2) / 2.2;
      const v = c < 0.12 ? Math.sin((c / 0.12) * Math.PI) : 0;
      (q.s.material as THREE.SpriteMaterial).opacity = v;
      q.s.scale.setScalar(0.1 + v * 0.35);
    }
  });
}

function gemMat(color: string, o: { opacity?: number; iridescence?: number; emissive?: string } = {}): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0.05,
    roughness: 0.02,
    clearcoat: 1,
    clearcoatRoughness: 0,
    ior: 2.2,
    specularIntensity: 1,
    flatShading: true,
    transparent: (o.opacity ?? 0.82) < 1,
    opacity: o.opacity ?? 0.82,
    envMapIntensity: 2.2,
    iridescence: o.iridescence ?? 0,
    iridescenceIOR: 1.8,
  });
  if (o.emissive) {
    m.emissive = new THREE.Color(o.emissive);
    m.emissiveIntensity = 0.25;
  }
  return m;
}

/** Talla brillante (diamante, circonita, rubí). */
function brilliant(): THREE.LatheGeometry {
  return lathe([[0, -0.62], [0.68, 0.0], [0.7, 0.07], [0.42, 0.32], [0, 0.32]], 8);
}

/** Gemas y cristales: diamante (con lápiz), esmeralda, cuarzo, cristales, lente, bismuto, centelleador. */
export function gem(k: Kit, p: Params): void {
  const g = k.add(new THREE.Group());
  const v = p.variant ?? 'redondo';
  const color = p.color ?? '#ffffff';
  const spin = new THREE.Group();
  g.add(spin);
  if (v === 'diamante' || v === 'redondo') {
    const d = mesh(brilliant(), gemMat(color, { opacity: v === 'diamante' ? 0.9 : 0.85 }));
    spin.add(d);
    // Facetas interiores para que no parezca un cono liso.
    const inner = mesh(lathe([[0, -0.45], [0.45, 0.0], [0.3, 0.22], [0, 0.22]], 8), gemMat(new THREE.Color(color).multiplyScalar(0.55).getStyle(), { opacity: 0.6 }));
    inner.rotation.y = Math.PI / 8;
    spin.add(inner);
    sparkle(k, spin, 6, 0.6);
    if (p.color2) {
      // El lápiz: mina de grafito a la vista.
      spin.position.set(0.2, 0.25, 0);
      spin.scale.setScalar(0.9);
      const pencil = new THREE.Group();
      pencil.add(mesh(new THREE.CylinderGeometry(0.11, 0.11, 1.3, 6), mat(p.color2, { rough: 0.5, flat: true })));
      pencil.add(mesh(new THREE.ConeGeometry(0.11, 0.28, 6), mat('#e8c99a', { rough: 0.8, flat: true }), [0, -0.79, 0], [Math.PI, 0, 0]));
      pencil.add(mesh(new THREE.ConeGeometry(0.035, 0.09, 8), mat('#3a3d42', { metal: 0.6, rough: 0.35 }), [0, -0.9, 0], [Math.PI, 0, 0]));
      pencil.add(mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.12, 12), metal('#c9ced4', 0.3), [0, 0.7, 0]));
      pencil.add(mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.14, 12), mat('#f48fb1', { rough: 0.8 }), [0, 0.83, 0]));
      pencil.position.set(-0.35, -0.2, 0.1);
      pencil.rotation.z = -1.1;
      pencil.scale.setScalar(0.75);
      g.add(pencil);
      // Rayita de grafito que deja al escribir.
      const line = mesh(new THREE.BoxGeometry(0.6, 0.01, 0.03), mat('#555a60'), [-0.05, -0.75, 0.2]);
      g.add(line);
      k.animate((t) => {
        pencil.position.x = -0.35 + 0.08 * Math.sin(t * 2);
        line.scale.x = 0.5 + 0.5 * (0.5 + 0.5 * Math.sin(t * 2));
      });
    }
    k.animate((t) => {
      spin.rotation.y = t * 0.7;
      spin.rotation.x = 0.35;
    });
    return;
  }
  if (v === 'esmeralda') {
    const geo = lathe([[0, -0.35], [0.5, -0.22], [0.62, 0.05], [0.62, 0.12], [0.45, 0.32], [0, 0.32]], 8);
    const e = mesh(geo, gemMat(color, { opacity: 0.85 }));
    e.rotation.y = Math.PI / 8;
    e.scale.set(1.25, 1, 0.85);
    spin.add(e);
    sparkle(k, spin, 5, 0.55);
    k.animate((t) => {
      spin.rotation.y = t * 0.6;
      spin.rotation.x = 0.5;
    });
    return;
  }
  if (v === 'cuarzo' || v === 'cristales') {
    // Racimo de prismas con punta sobre una roca.
    const r = seeded(p.seed ?? 6);
    const crystal = gemMat(color, { opacity: v === 'cuarzo' ? 0.7 : 0.92 });
    if (v === 'cristales') {
      crystal.ior = 1.6;
      crystal.metalness = p.metal ?? 0.1;
    }
    g.add(mesh(new THREE.DodecahedronGeometry(0.45, 0), mat(p.color2 ?? '#8d8478', { rough: 0.9, flat: true }), [0, -0.65, 0]));
    const sides = v === 'cuarzo' ? 6 : 4;
    for (let i = 0; i < 7; i++) {
      const h = 0.5 + r() * 0.6;
      const w = 0.09 + r() * 0.08;
      const c = new THREE.Group();
      if (v === 'cuarzo') c.add(mesh(new THREE.CylinderGeometry(w, w, h, sides), crystal, [0, h / 2, 0]));
      if (v === 'cuarzo') c.add(mesh(new THREE.ConeGeometry(w, w * 2.2, sides), crystal, [0, h + w * 1.1, 0]));
      else {
        // Bipirámides, como los cristales de azufre.
        const bip = mesh(new THREE.OctahedronGeometry(w * 2.2, 0), crystal, [0, h * 0.5, 0]);
        bip.scale.set(0.8, 1.5, 0.6);
        c.add(bip);
      }
      c.position.set((r() - 0.5) * 0.4, -0.45, (r() - 0.5) * 0.3);
      c.rotation.set((r() - 0.5) * 1.1, r() * 3, (r() - 0.5) * 1.1);
      if (i === 0) c.rotation.set(0, 0, 0);
      g.add(c);
    }
    sparkle(k, g, 5, 0.6);
    if (p.glow) {
      // Vapor violeta (el yodo sublima).
      const vap = particles(30, p.glow, 0.3);
      (vap.material as THREE.PointsMaterial).opacity = 0.5;
      g.add(vap);
      emitter(k, vap, (_i, o, vel) => {
        o.set((k.rand() - 0.5) * 0.5, 0.0, (k.rand() - 0.5) * 0.4);
        vel.set((k.rand() - 0.5) * 0.15, 0.3, (k.rand() - 0.5) * 0.15);
      }, { life: 2.5 });
    }
    k.animate((t) => (g.rotation.y = t * 0.35));
    return;
  }
  if (v === 'lente') {
    const barrel = mat('#1d1f24', { rough: 0.4, metal: 0.4 });
    const lens = new THREE.Group();
    lens.add(mesh(new THREE.CylinderGeometry(0.55, 0.5, 0.9, 40), barrel));
    for (const y of [-0.2, 0.15]) lens.add(mesh(new THREE.CylinderGeometry(0.57, 0.57, 0.12, 40), mat('#2b2d33', { rough: 0.8 }), [0, y, 0]));
    lens.add(mesh(new THREE.TorusGeometry(0.5, 0.03, 8, 40), metal(p.color2 ?? '#e5484d', 0.3), [0, 0.42, 0], [Math.PI / 2, 0, 0]));
    const front = mesh(new THREE.SphereGeometry(0.62, 40, 16, 0, Math.PI * 2, 0, 0.75), gemMat(color, { opacity: 0.55, iridescence: 0.8 }), [0, 0.0, 0]);
    lens.add(front);
    lens.add(mesh(new THREE.CircleGeometry(0.44, 40), mat('#0b0d12', { rough: 0.1, metal: 0.5 }), [0, 0.4, 0], [-Math.PI / 2, 0, 0]));
    lens.rotation.x = 1.15;
    g.add(lens);
    const shine = halo('#ffffff', 0.4, 0.8);
    shine.position.set(0.15, 0.25, 0.45);
    g.add(shine);
    k.animate((t) => {
      lens.rotation.z = 0.35 * Math.sin(t * 0.5);
      shine.position.x = 0.15 + 0.15 * Math.sin(t * 0.9);
    });
    return;
  }
  if (v === 'tolva') {
    // Cristal de bismuto: marcos cuadrados en escalera con irisaciones.
    const m = new THREE.MeshPhysicalMaterial({ color: color, metalness: 1, roughness: 0.15, iridescence: 1, iridescenceIOR: 2.0, iridescenceThicknessRange: [200, 800], flatShading: true });
    // Cada escalón con su color de arcoíris (la capa de óxido cambia de grosor).
    const tiers = Array.from({ length: 7 }, (_, i) => new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL((0.12 + i * 0.13) % 1, 0.75, 0.6), metalness: 0.9, roughness: 0.2, flatShading: true }));
    for (let i = 0; i < 7; i++) {
      const s = 0.85 - i * 0.11;
      const y = -0.55 + i * 0.13;
      const frame = new THREE.Group();
      for (let j = 0; j < 4; j++) {
        const bar = mesh(new THREE.BoxGeometry(s, 0.1, 0.1), tiers[i]);
        const a = (j * Math.PI) / 2;
        bar.position.set(Math.cos(a) * s * 0.5, 0, Math.sin(a) * s * 0.5);
        bar.rotation.y = a + Math.PI / 2;
        frame.add(bar);
      }
      frame.position.y = y;
      frame.rotation.y = i * 0.08;
      spin.add(frame);
    }
    spin.add(mesh(new THREE.BoxGeometry(0.85, 0.05, 0.85), m, [0, -0.6, 0]));
    k.animate((t) => {
      spin.rotation.y = t * 0.4;
      m.iridescenceThicknessRange = [200 + 150 * Math.sin(t * 0.8), 800];
      tiers.forEach((tm, i) => tm.color.setHSL((0.12 + i * 0.13 + t * 0.05) % 1, 0.75, 0.6));
      spin.rotation.x = 0.35;
    });
    return;
  }
  // Centelleador: bloque transparente donde aparecen destellos.
  const block = mesh(roundedBox(0.7, 1.1, 0.7, 0.04), gemMat(color, { opacity: 0.55 }));
  spin.add(block);
  const flashes = Array.from({ length: 4 }, () => {
    const s = halo(p.glow ?? '#6fd3ff', 0.5, 0);
    spin.add(s);
    return s;
  });
  k.animate((t) => {
    flashes.forEach((s, i) => {
      const c = (t * 0.9 + i * 0.27) % 1;
      if (c < 0.02) s.position.set((k.rand() - 0.5) * 0.5, (k.rand() - 0.5) * 0.9, (k.rand() - 0.5) * 0.5);
      (s.material as THREE.SpriteMaterial).opacity = Math.max(0, 1 - c * 5);
    });
    spin.rotation.y = t * 0.4;
    spin.rotation.x = 0.3;
  });
}

/** Vidrio de colores: jarrón, jarra de laboratorio con algo caliente, vaso, tarrito o vaso grabado. */
export function vase(k: Kit, p: Params): void {
  const g = k.add(new THREE.Group());
  const v = p.variant ?? 'jarron';
  const color = p.color ?? '#1f4fd8';
  const colored = new THREE.MeshPhysicalMaterial({ color, metalness: 0, roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.82, side: THREE.DoubleSide, envMapIntensity: 1.6 });
  if (v === 'jarron') {
    g.add(mesh(lathe([[0, -0.85], [0.3, -0.85], [0.45, -0.55], [0.48, -0.2], [0.3, 0.3], [0.18, 0.55], [0.22, 0.75], [0.3, 0.85], [0.27, 0.86], [0.17, 0.62]], 40), colored));
  } else if (v === 'jarra') {
    g.add(mesh(lathe([[0, -0.8], [0.5, -0.8], [0.52, -0.75], [0.5, 0.55], [0.55, 0.62]], 40, ), glass('#eef8ff', 0.3)));
    g.add(mesh(tube([[0.48, 0.4, 0], [0.8, 0.35, 0], [0.8, -0.4, 0], [0.48, -0.45, 0]], 0.05, 24), glass('#eef8ff', 0.45)));
    for (let i = 0; i < 5; i++) g.add(mesh(new THREE.BoxGeometry(0.12, 0.012, 0.01), mat('#ffffff', { opacity: 0.8 }), [0, -0.55 + i * 0.2, 0.51]));
    const liquid = mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.8, 40), mat(p.color2 ?? '#c8743a', { opacity: 0.8, rough: 0.1 }), [0, -0.38, 0]);
    g.add(liquid);
    const steam = particles(20, '#ffffff', 0.3, false);
    (steam.material as THREE.PointsMaterial).opacity = 0.4;
    g.add(steam);
    emitter(k, steam, (_i, o, vel) => {
      o.set((k.rand() - 0.5) * 0.5, 0.05, (k.rand() - 0.5) * 0.5);
      vel.set((k.rand() - 0.5) * 0.1, 0.35, (k.rand() - 0.5) * 0.1);
    }, { life: 2 });
    k.animate((t) => (liquid.rotation.z = 0.02 * Math.sin(t * 2)));
  } else if (v === 'tarro') {
    g.add(mesh(lathe([[0, -0.5], [0.35, -0.5], [0.45, -0.25], [0.42, 0.1], [0.25, 0.25], [0.2, 0.35], [0.25, 0.4], [0.18, 0.4]], 32), mat(color, { rough: 0.3, metal: 0.1 })));
    g.add(mesh(new THREE.CylinderGeometry(0.03, 0.02, 0.9, 8), mat('#c9a979', { rough: 0.6 }), [0.05, 0.6, 0], [0, 0, -0.2]));
    g.add(mesh(new THREE.SphereGeometry(0.05, 10, 8), mat('#1a1a1a', { rough: 0.5 }), [-0.04, 0.17, 0]));
    // Decoración egipcia: banda dorada.
    g.add(mesh(new THREE.TorusGeometry(0.44, 0.025, 8, 40), metal('#d4af37', 0.3), [0, -0.1, 0], [Math.PI / 2, 0, 0]));
  } else {
    const etched = v === 'grabado';
    const tex = etched
      ? canvasTexture(256, 128, (gg, w, h) => {
          gg.clearRect(0, 0, w, h);
          gg.strokeStyle = 'rgba(255,255,255,0.95)';
          gg.lineWidth = 4;
          for (let i = 0; i < 6; i++) {
            const cx = 20 + i * 44;
            gg.beginPath();
            for (let a = 0; a < 6; a++) {
              const ang = (a / 6) * Math.PI * 2;
              gg.moveTo(cx, h / 2);
              gg.lineTo(cx + Math.cos(ang) * 18, h / 2 + Math.sin(ang) * 18);
            }
            gg.stroke();
          }
        })
      : null;
    g.add(mesh(lathe([[0, -0.75], [0.42, -0.75], [0.45, -0.7], [0.55, 0.7], [0.52, 0.72]], 40), etched ? glass('#f2fbff', 0.3) : colored));
    if (tex) g.add(mesh(new THREE.CylinderGeometry(0.515, 0.48, 0.5, 40, 1, true), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide }), [0, 0.1, 0]));
    g.add(mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.12, 40), etched ? glass('#ffffff', 0.5) : colored, [0, -0.69, 0]));
  }
  const shine = halo('#ffffff', 0.35, 0.7);
  g.add(shine);
  k.animate((t) => {
    g.rotation.y = t * 0.35;
    shine.position.set(0.3 * Math.cos(t * 0.7), 0.2 + 0.2 * Math.sin(t * 0.5), 0.5);
  });
}

/** Frascos y botellas, cada uno con su gesto: gotea, hace espuma, rocía, humea… */
export function bottle(k: Kit, p: Params): void {
  const g = k.add(new THREE.Group());
  const v = p.variant ?? 'marron';
  const color = p.color ?? '#7b4a1e';
  const liquid = p.color2 ?? '#8a3b12';
  type Spec = { profile: Array<[number, number]>; glass: boolean; cap: [number, number, number, string]; labelY: number; labelR: number; labelH: number };
  const specs: Record<string, Spec> = {
    gotero: { profile: [[0, -0.6], [0.36, -0.6], [0.4, -0.52], [0.4, 0.05], [0.25, 0.25], [0.13, 0.3], [0.13, 0.4]], glass: true, cap: [0.16, 0.14, 0.47, '#1d1f24'], labelY: -0.25, labelR: 0.405, labelH: 0.4 },
    marron: { profile: [[0, -0.85], [0.38, -0.85], [0.42, -0.78], [0.42, 0.25], [0.3, 0.45], [0.16, 0.55], [0.16, 0.65]], glass: false, cap: [0.19, 0.16, 0.72, '#f5f5f5'], labelY: -0.25, labelR: 0.425, labelH: 0.6 },
    pulverizador: { profile: [[0, -0.85], [0.35, -0.85], [0.42, -0.6], [0.42, 0.05], [0.3, 0.25], [0.14, 0.32], [0.14, 0.4]], glass: false, cap: [0.16, 0.12, 0.46, p.color2 ?? '#2e7dd8'], labelY: -0.35, labelR: 0.425, labelH: 0.5 },
    champu: { profile: [[0, -0.85], [0.3, -0.85], [0.42, -0.6], [0.44, 0.0], [0.38, 0.4], [0.2, 0.55], [0.15, 0.6]], glass: false, cap: [0.2, 0.18, 0.68, '#ffffff'], labelY: -0.15, labelR: 0.445, labelH: 0.6 },
    ampolla: { profile: [[0, -0.75], [0.3, -0.72], [0.5, -0.45], [0.52, -0.15], [0.35, 0.15], [0.12, 0.3], [0.12, 0.55]], glass: true, cap: [0.14, 0.18, 0.62, '#d9c9a8'], labelY: -0.3, labelR: 0, labelH: 0 },
    veneno: { profile: [[0, -0.8], [0.32, -0.8], [0.36, -0.7], [0.36, 0.15], [0.2, 0.35], [0.12, 0.45], [0.12, 0.6]], glass: true, cap: [0.14, 0.14, 0.66, '#3a2a1c'], labelY: -0.25, labelR: 0.365, labelH: 0.5 },
    tarro: { profile: [[0, -0.75], [0.5, -0.75], [0.52, -0.7], [0.52, 0.45], [0.46, 0.55], [0.46, 0.6]], glass: true, cap: [0.5, 0.12, 0.66, '#e5e7ea'], labelY: -0.45, labelR: 0.525, labelH: 0.25 },
    dosificador: { profile: [[0, -0.85], [0.38, -0.85], [0.42, -0.78], [0.42, 0.2], [0.35, 0.3], [0.13, 0.35], [0.13, 0.45]], glass: false, cap: [0.15, 0.12, 0.5, '#ffffff'], labelY: -0.3, labelR: 0.425, labelH: 0.45 },
    garrafa: { profile: [[0, -0.85], [0.45, -0.85], [0.48, -0.78], [0.48, 0.2], [0.32, 0.42], [0.15, 0.5], [0.15, 0.6]], glass: false, cap: [0.18, 0.14, 0.66, '#d32f2f'], labelY: -0.3, labelR: 0.485, labelH: 0.5 },
  };
  const s = specs[v] ?? specs.marron;
  const bodyMat = s.glass
    ? new THREE.MeshPhysicalMaterial({ color, metalness: 0, roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide })
    : mat(color, { rough: 0.35, metal: 0.05 });
  const body = mesh(lathe(s.profile, 36), bodyMat);
  g.add(body);
  let liq: THREE.Mesh | undefined;
  if (s.glass) {
    const inner = s.profile.filter(([, y]) => y < 0.0).map(([r, y]) => [Math.max(0, r - 0.03), y + 0.02] as [number, number]);
    inner.push([0, inner[inner.length - 1][1]]);
    liq = mesh(lathe(inner, 32), mat(liquid, { opacity: 0.9, rough: 0.1 }));
    g.add(liq);
  }
  const [cr, ch, cy, cc] = s.cap;
  g.add(mesh(new THREE.CylinderGeometry(cr, cr, ch, 28), mat(cc, { rough: 0.4 }), [0, cy, 0]));
  if (s.labelR > 0) {
    const lbl = labelTexture(p.label ?? '', p.glow && v === 'veneno' ? '#f2e7c9' : '#ffffff', v === 'veneno' ? '#222' : '#2b2d33', 256, 128, (gg, w, h) => {
      if (v === 'veneno') {
        // Calavera.
        gg.fillStyle = '#222';
        gg.beginPath();
        gg.arc(w * 0.22, h * 0.42, 26, 0, Math.PI * 2);
        gg.fill();
        gg.fillRect(w * 0.22 - 16, h * 0.55, 32, 22);
        gg.fillStyle = '#f2e7c9';
        gg.beginPath();
        gg.arc(w * 0.22 - 10, h * 0.42, 7, 0, Math.PI * 2);
        gg.arc(w * 0.22 + 10, h * 0.42, 7, 0, Math.PI * 2);
        gg.fill();
        gg.strokeStyle = '#222';
        gg.lineWidth = 8;
        gg.beginPath();
        gg.moveTo(w * 0.08, h * 0.9);
        gg.lineTo(w * 0.36, h * 0.72);
        gg.moveTo(w * 0.36, h * 0.9);
        gg.lineTo(w * 0.08, h * 0.72);
        gg.stroke();
      } else if (v === 'garrafa') {
        // Rombo de corrosivo.
        gg.save();
        gg.translate(w * 0.2, h / 2);
        gg.rotate(Math.PI / 4);
        gg.strokeStyle = '#d32f2f';
        gg.lineWidth = 6;
        gg.strokeRect(-30, -30, 60, 60);
        gg.restore();
      } else {
        gg.fillStyle = p.glow ?? '#e5484d';
        gg.fillRect(0, 0, w, h * 0.18);
        gg.fillRect(0, h * 0.82, w, h * 0.18);
      }
    });
    const lab = mesh(new THREE.CylinderGeometry(s.labelR, s.labelR, s.labelH, 36, 1, true, -1.2, 2.4), mat(lbl ? '#ffffff' : '#f5f5f5', { map: lbl, rough: 0.6, side: THREE.DoubleSide }), [0, s.labelY, 0]);
    g.add(lab);
  }
  // El gesto de cada frasco.
  if (v === 'gotero') {
    g.add(mesh(new THREE.CylinderGeometry(0.03, 0.06, 0.4, 12), glass('#ffffff', 0.5), [0, 0.15, 0]));
    const drop = mesh(new THREE.SphereGeometry(0.06, 12, 10), mat(liquid, { rough: 0.1, opacity: 0.9 }));
    g.add(drop);
    g.position.y = 0.15;
    k.animate((t) => {
      const c = (t / 1.6) % 1;
      drop.position.set(0.55, 0.6 - (c > 0.4 ? (c - 0.4) ** 2 * 4 : 0), 0);
      drop.scale.setScalar(0.4 + Math.min(1, c / 0.4) * 0.6);
      drop.visible = c < 0.85;
    });
    const tip = new THREE.Group();
    tip.add(mesh(new THREE.CylinderGeometry(0.02, 0.05, 0.35, 12), glass('#ffffff', 0.5), [0, 0.0, 0]));
    tip.add(mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.18, 12), mat('#1d1f24'), [0, 0.25, 0]));
    tip.position.set(0.55, 0.85, 0);
    g.add(tip);
  } else if (v === 'marron' || v === 'champu' || v === 'dosificador') {
    if (v === 'dosificador') {
      g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 10), mat('#ffffff'), [0, 0.63, 0]));
      g.add(mesh(roundedBox(0.35, 0.08, 0.1, 0.03), mat('#ffffff'), [0.1, 0.74, 0]));
    }
    const foamMat = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.1, transparent: true, opacity: 0.45, iridescence: 1, depthWrite: false });
    bubbles(k, g, 10, foamMat, { x: 0.35, z: 0.25, y0: v === 'dosificador' ? 0.7 : 0.45, y1: 1.0, r: [0.03, 0.09], speed: 0.4, center: [0.15, 0.1] });
  } else if (v === 'pulverizador') {
    g.add(mesh(roundedBox(0.4, 0.14, 0.16, 0.05), mat(p.color2 ?? '#2e7dd8', { rough: 0.4 }), [0.1, 0.58, 0]));
    g.add(mesh(roundedBox(0.08, 0.25, 0.1, 0.03), mat(p.color2 ?? '#2e7dd8', { rough: 0.4 }), [0.12, 0.4, 0], [0, 0, 0.3]));
    const mist = particles(26, '#cfe8ff', 0.12, false);
    (mist.material as THREE.PointsMaterial).opacity = 0.6;
    g.add(mist);
    emitter(k, mist, (_i, o, vel) => {
      o.set(0.32, 0.58, 0);
      vel.set(0.6 + k.rand() * 0.4, (k.rand() - 0.5) * 0.4, (k.rand() - 0.5) * 0.4);
    }, { life: 0.8, drag: 1.5 });
  } else if (v === 'ampolla') {
    const vap = particles(30, p.glow ?? '#c0502a', 0.3, false);
    (vap.material as THREE.PointsMaterial).opacity = 0.35;
    g.add(vap);
    emitter(k, vap, (_i, o, vel) => {
      const a = k.rand() * Math.PI * 2;
      o.set(Math.cos(a) * 0.3, -0.1, Math.sin(a) * 0.3);
      vel.set(-Math.sin(a) * 0.15, 0.08, Math.cos(a) * 0.15);
    }, { life: 2.2 });
  } else if (v === 'veneno') {
    const h = halo(p.glow ?? '#7dff6a', 1.2, 0.25);
    h.position.y = -0.3;
    g.add(h);
    k.animate((t) => ((h.material as THREE.SpriteMaterial).opacity = 0.18 + 0.1 * Math.sin(t * 1.5)));
  } else if (v === 'tarro') {
    // Una hoja conservada flotando dentro.
    const leaf = mesh(new THREE.SphereGeometry(0.2, 16, 8), mat('#7a9a5a', { rough: 0.5, side: THREE.DoubleSide }));
    leaf.scale.set(1.4, 0.15, 0.7);
    g.add(leaf);
    k.animate((t) => {
      leaf.position.set(0.05 * Math.sin(t * 0.7), -0.2 + 0.08 * Math.sin(t * 0.5), 0);
      leaf.rotation.set(0.3 * Math.sin(t * 0.6), t * 0.3, 0.5);
    });
  } else if (v === 'garrafa') {
    g.add(mesh(tube([[-0.38, 0.35, 0], [-0.62, 0.25, 0], [-0.62, -0.15, 0], [-0.46, -0.25, 0]], 0.06, 20), mat(color, { rough: 0.35 })));
    const fume = particles(14, '#e8f5e9', 0.2, false);
    (fume.material as THREE.PointsMaterial).opacity = 0.4;
    g.add(fume);
    emitter(k, fume, (_i, o, vel) => {
      o.set(0, 0.75, 0);
      vel.set((k.rand() - 0.5) * 0.15, 0.3, (k.rand() - 0.5) * 0.15);
    }, { life: 1.6 });
  }
  if (liq) {
    const l = liq;
    k.animate((t) => (l.rotation.z = 0.03 * Math.sin(t * 1.5)));
  }
  k.animate((t) => {
    body.parent!.rotation.y = 0.4 * Math.sin(t * 0.45);
  });
}

/** Tubo de ensayo en su soporte: humea, burbujea, se oscurece; o crisol al fuego. */
export function testTube(k: Kit, p: Params): void {
  const g = k.add(new THREE.Group());
  const v = p.variant ?? 'liquido';
  const liquidColor = p.color ?? '#cfe8ff';
  if (v === 'crisol') {
    // Trípode, rejilla, crisol de porcelana y mechero.
    const iron = metal('#3a3d42', 0.5);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      g.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.9, 8), iron, [Math.cos(a) * 0.45, -0.45, Math.sin(a) * 0.45], [Math.sin(a) * 0.15, 0, -Math.cos(a) * 0.15]));
    }
    g.add(mesh(new THREE.TorusGeometry(0.45, 0.03, 8, 32), iron, [0, 0.0, 0], [Math.PI / 2, 0, 0]));
    g.add(mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.02, 32), mat('#c9ced4', { rough: 0.8, metal: 0.3 }), [0, 0.02, 0]));
    g.add(mesh(lathe([[0, 0.03], [0.18, 0.03], [0.3, 0.15], [0.36, 0.45], [0.34, 0.46], [0.27, 0.18]], 32), mat('#f4f1ea', { rough: 0.35, side: THREE.DoubleSide })));
    const contentMat = mat(liquidColor, { rough: 0.9, emissive: p.glow ?? '#000000', emissiveIntensity: p.glow ? 0.6 : 0 });
    const content = mesh(new THREE.CylinderGeometry(0.29, 0.22, 0.12, 24), contentMat, [0, 0.25, 0]);
    g.add(content);
    if (p.glow) {
      const h = halo(p.glow, 0.9, 0.5);
      h.position.y = 0.35;
      g.add(h);
      k.animate((t) => ((h.material as THREE.SpriteMaterial).opacity = 0.35 + 0.2 * Math.sin(t * 2.2)));
    }
    g.add(mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.35, 20), metal('#b0b5ba'), [0, -0.8, 0]));
    const fl = new THREE.Group();
    fl.position.y = -0.6;
    fl.add(mesh(lathe([[0, 0], [0.08, 0.08], [0.06, 0.3], [0, 0.45]], 16), glowMat('#4b8dff', 0.7)));
    g.add(fl);
    k.animate((t) => {
      fl.scale.y = 1 + 0.15 * wave(t * 3, 4);
      g.rotation.y = t * 0.3;
    });
    return;
  }
  // Soporte de madera con el tubo.
  const wood = mat('#c99a63', { rough: 0.7 });
  g.add(mesh(roundedBox(1.1, 0.08, 0.45, 0.03), wood, [0, -0.85, 0]));
  g.add(mesh(roundedBox(1.1, 0.08, 0.45, 0.03), wood, [0, 0.05, 0]));
  for (const x of [-0.5, 0.5]) g.add(mesh(roundedBox(0.08, 0.9, 0.4, 0.02), wood, [x, -0.4, 0]));
  const tubeG = new THREE.Group();
  tubeG.add(mesh(lathe([[0, -0.75], [0.1, -0.72], [0.14, -0.6], [0.14, 0.75], [0.16, 0.78]], 28), glass('#f2fbff', 0.3)));
  const level = v === 'burbujas' ? 0.2 : 0.05;
  const liquidMat = mat(liquidColor, { opacity: 0.85, rough: 0.1 });
  tubeG.add(mesh(lathe([[0, -0.72], [0.08, -0.7], [0.12, -0.6], [0.12, level]], 24), liquidMat));
  tubeG.add(mesh(new THREE.CircleGeometry(0.12, 24), liquidMat, [0, level, 0], [-Math.PI / 2, 0, 0]));
  g.add(tubeG);
  // Un segundo tubo vacío, para que se lea «laboratorio».
  const t2 = mesh(lathe([[0, -0.75], [0.1, -0.72], [0.14, -0.6], [0.14, 0.75], [0.16, 0.78]], 28), glass('#f2fbff', 0.25), [0.3, 0, 0]);
  g.add(t2);
  if (v === 'humo') {
    const fume = particles(24, '#f5f5f5', 0.25, false);
    (fume.material as THREE.PointsMaterial).opacity = 0.55;
    g.add(fume);
    emitter(k, fume, (_i, o, vel) => {
      o.set((k.rand() - 0.5) * 0.1, 0.75, 0);
      vel.set((k.rand() - 0.5) * 0.2, 0.3, (k.rand() - 0.5) * 0.2);
    }, { life: 1.5, drag: 0.2 });
  } else if (v === 'burbujas') {
    // Trocitos de cinc al fondo y burbujas de hidrógeno.
    for (let i = 0; i < 3; i++) tubeG.add(mesh(new THREE.DodecahedronGeometry(0.05, 0), metal('#9aa3ad', 0.4, { flat: true }), [(i - 1) * 0.05, -0.62, 0]));
    const bm = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.05, transparent: true, opacity: 0.6, depthWrite: false });
    bubbles(k, tubeG, 14, bm, { x: 0.06, z: 0.06, y0: -0.6, y1: level, r: [0.015, 0.035], speed: 0.6, wobble: 0.01 });
  } else if (v === 'oscurece') {
    // Precipitado blanco que se oscurece con la luz.
    const pptMat = mat('#ffffff', { rough: 0.9 });
    tubeG.add(mesh(lathe([[0, -0.71], [0.08, -0.69], [0.115, -0.6], [0.115, -0.4], [0, -0.38]], 24), pptMat));
    const lamp = halo('#fff4c2', 0.9, 0.8);
    lamp.position.set(-0.4, 0.4, 0.3);
    g.add(lamp);
    k.animate((t) => {
      const c = 0.5 - 0.5 * Math.cos(t * 0.5);
      pptMat.color.setRGB(1 - c * 0.6, 1 - c * 0.62, 1 - c * 0.66);
      (lamp.material as THREE.SpriteMaterial).opacity = 0.5 + 0.4 * Math.sin(t * 0.5 + 1);
    });
  }
  k.animate((t) => (g.rotation.y = 0.5 * Math.sin(t * 0.4)));
}

/** Agua: gota que ondula y brilla, o un trozo de mar con olas. */
export function water(k: Kit, p: Params): void {
  const g = k.add(new THREE.Group());
  const color = p.color ?? '#3fa9f5';
  const wMat = new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0,
    roughness: 0.05,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    transparent: true,
    opacity: 0.78,
    envMapIntensity: 1.8,
    emissive: new THREE.Color(color).multiplyScalar(0.15),
    iridescence: 0.25,
  });
  if (p.variant === 'mar') {
    const n = 40;
    const geo = new THREE.CylinderGeometry(0.75, 0.75, 0.6, n, 1, false);
    // La tapa superior se mueve como olas; el resto, quieto.
    const top = new THREE.CircleGeometry(0.75, n, 0, Math.PI * 2);
    const plane = new THREE.PlaneGeometry(1.5, 1.5, 28, 28);
    plane.rotateX(-Math.PI / 2);
    const pos = plane.attributes.position as THREE.BufferAttribute;
    // Recorta la malla a un círculo aplastando lo de fuera hacia el borde.
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const r = Math.hypot(x, z);
      if (r > 0.75) pos.setXYZ(i, (x / r) * 0.75, 0, (z / r) * 0.75);
    }
    const base = Float32Array.from(pos.array);
    const side = mesh(geo, new THREE.MeshPhysicalMaterial({ color: new THREE.Color(color).multiplyScalar(0.7), roughness: 0.2, transparent: true, opacity: 0.85 }), [0, -0.3, 0]);
    g.add(side);
    const surface = mesh(plane, wMat, [0, 0, 0]);
    g.add(surface);
    top.dispose();
    const foam = particles(40, '#ffffff', 0.06, false);
    g.add(foam);
    const fpos = foam.geometry.attributes.position as THREE.BufferAttribute;
    const fr = seeded(3);
    const fbase = Array.from({ length: 40 }, () => [fr() * 1.2 - 0.6, fr() * 1.2 - 0.6]);
    g.rotation.x = 0.45;
    k.animate((t) => {
      const h = (x: number, z: number) => 0.06 * Math.sin(x * 6 + t * 2) + 0.04 * Math.sin(z * 5 - t * 1.6) + 0.02 * Math.sin((x + z) * 11 + t * 3);
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 3];
        const z = base[i * 3 + 2];
        pos.setY(i, h(x, z));
      }
      pos.needsUpdate = true;
      plane.computeVertexNormals();
      fbase.forEach(([x, z], i) => fpos.setXYZ(i, x, h(x, z) + 0.02, z));
      fpos.needsUpdate = true;
      g.rotation.y = t * 0.15;
    });
    return;
  }
  const geo = new THREE.SphereGeometry(0.6, 48, 32);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const base = Float32Array.from(pos.array);
  const drop = mesh(geo, wMat);
  g.add(drop);
  // Reflejos que dan vueltas y gotitas satélite.
  const shine = halo('#ffffff', 0.35, 0.9);
  g.add(shine);
  const mini = Array.from({ length: 3 }, (_, i) => {
    const m = mesh(new THREE.SphereGeometry(0.07 - i * 0.015, 16, 12), wMat);
    g.add(m);
    return m;
  });
  const vtx = new THREE.Vector3();
  k.animate((t) => {
    for (let i = 0; i < pos.count; i++) {
      vtx.set(base[i * 3], base[i * 3 + 1], base[i * 3 + 2]);
      const n = vtx.clone().normalize();
      const d = 0.025 * Math.sin(n.x * 4 + t * 2.2) + 0.02 * Math.sin(n.y * 5 - t * 1.7) + 0.015 * Math.sin(n.z * 6 + t * 2.9);
      vtx.addScaledVector(n, d);
      pos.setXYZ(i, vtx.x, vtx.y, vtx.z);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    shine.position.set(Math.cos(t * 0.6) * 0.25 - 0.1, 0.3 + Math.sin(t * 0.8) * 0.05, 0.55);
    mini.forEach((m, i) => {
      const a = t * (0.7 + i * 0.25) + i * 2;
      m.position.set(Math.cos(a) * (0.8 + i * 0.05), Math.sin(a * 1.3) * 0.25, Math.sin(a) * (0.8 + i * 0.05));
    });
    g.position.y = 0.03 * Math.sin(t * 1.2);
  });
}

/** Vaso de refresco con burbujas que suben, cubitos de hielo y pajita. */
export function soda(k: Kit, p: Params): void {
  const g = k.add(new THREE.Group());
  g.add(mesh(lathe([[0, -0.8], [0.4, -0.8], [0.43, -0.75], [0.52, 0.75], [0.5, 0.76]], 40), glass('#f2fbff', 0.28)));
  g.add(mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.08, 40), glass('#ffffff', 0.4), [0, -0.76, 0]));
  const liquidMat = mat(p.color ?? '#8a4a1c', { opacity: 0.75, rough: 0.05, metal: 0.1 });
  g.add(mesh(new THREE.CylinderGeometry(0.48, 0.41, 1.25, 40), liquidMat, [0, -0.1, 0]));
  const iceMat = new THREE.MeshPhysicalMaterial({ color: '#eaf8ff', roughness: 0.1, transparent: true, opacity: 0.7, clearcoat: 1 });
  const ice = [0, 1, 2].map((i) => {
    const c = mesh(roundedBox(0.22, 0.22, 0.22, 0.04), iceMat, [(i - 1) * 0.2, 0.5, (i % 2) * 0.1]);
    g.add(c);
    return c;
  });
  g.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.6, 12), mat(p.color2 ?? '#e5484d', { rough: 0.4 }), [0.18, 0.35, 0], [0, 0, -0.25]));
  const bm = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.05, transparent: true, opacity: 0.7, depthWrite: false });
  bubbles(k, g, 24, bm, { x: 0.32, z: 0.32, y0: -0.7, y1: 0.52, r: [0.015, 0.04], speed: 0.5 });
  // Chispitas que saltan por encima.
  const fizz = particles(16, '#ffffff', 0.04, false);
  g.add(fizz);
  emitter(k, fizz, (_i, o, v) => {
    o.set((k.rand() - 0.5) * 0.7, 0.55, (k.rand() - 0.5) * 0.7);
    v.set((k.rand() - 0.5) * 0.3, 0.4 + k.rand() * 0.3, (k.rand() - 0.5) * 0.3);
  }, { life: 0.5, gravity: 1.5 });
  k.animate((t) => {
    ice.forEach((c, i) => {
      c.position.y = 0.48 + 0.02 * Math.sin(t * 1.5 + i);
      c.rotation.set(0.2 * Math.sin(t + i), t * 0.2 + i, 0.1 * i);
    });
    g.rotation.y = t * 0.2;
  });
}

/** Sacos: de papel (cal, sal de carreteras, abono) o bolsa de patatas inflada. */
export function sack(k: Kit, p: Params): void {
  const g = k.add(new THREE.Group());
  if (p.variant === 'patatas') {
    // Bolsa: almohada brillante con los bordes rizados.
    const geo = new THREE.BoxGeometry(1.0, 1.45, 0.6, 16, 20, 4);
    const bp = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < bp.count; i++) {
      const x = bp.getX(i) / 0.5;
      const y = bp.getY(i) / 0.725;
      // Hinchada en el centro, plana en los bordes sellados.
      const puff = Math.sqrt(Math.max(0, 1 - x * x)) * Math.sqrt(Math.max(0, 1 - y ** 4));
      bp.setZ(i, bp.getZ(i) * (0.08 + 0.92 * puff));
    }
    geo.computeVertexNormals();
    const tex = canvasTexture(256, 256, (gg, w, h) => {
      gg.fillStyle = p.color ?? '#f6c026';
      gg.fillRect(0, 0, w, h);
      gg.fillStyle = '#e53935';
      gg.beginPath();
      gg.ellipse(w * 0.5, h * 0.42, 70, 40, 0, 0, Math.PI * 2);
      gg.fill();
      gg.fillStyle = '#f4d58d';
      for (let i = 0; i < 3; i++) {
        gg.beginPath();
        gg.ellipse(w * 0.5 + (i - 1) * 36, h * 0.7 + (i % 2) * 8, 28, 18, i, 0, Math.PI * 2);
        gg.fill();
      }
    });
    const bag = mesh(geo, mat(tex ? '#ffffff' : p.color ?? '#f6c026', { map: tex, metal: 0.5, rough: 0.25 }));
    g.add(bag);
    const crimp = metal('#d0d4d9', 0.3);
    for (const y of [-0.75, 0.75]) {
      const c = mesh(roundedBox(1.02, 0.1, 0.06, 0.02), crimp, [0, y * 0.95, 0]);
      g.add(c);
    }
    // Moléculas de N₂ alrededor.
    const molMat = mat('#3050f8', { rough: 0.3 });
    const ball = new THREE.SphereGeometry(0.05, 12, 8);
    const mols = Array.from({ length: 5 }, () => {
      const m = new THREE.Group();
      m.add(mesh(ball, molMat, [-0.045, 0, 0]), mesh(ball, molMat, [0.045, 0, 0]));
      g.add(m);
      return m;
    });
    g.rotation.y = -0.3;
    k.animate((t) => {
      const s = 1 + 0.04 * Math.sin(t * 1.4);
      bag.scale.set(s, 1, s);
      mols.forEach((m, i) => {
        const a = t * 0.6 + i * 1.25;
        m.position.set(Math.cos(a) * 0.75, Math.sin(a * 1.3) * 0.6, Math.sin(a) * 0.4);
        m.rotation.set(t + i, t * 1.3, 0);
      });
      g.rotation.y = -0.3 + 0.35 * Math.sin(t * 0.4);
    });
    return;
  }
  const paper = mat(p.color ?? '#e9dcc3', { rough: 0.85 });
  const geo = new THREE.BoxGeometry(1.0, 1.2, 0.55, 6, 6, 4);
  // Abombar el saco.
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const bulge = 1 + 0.15 * (1 - (y / 0.6) ** 2);
    pos.setXYZ(i, x * bulge * (1 - 0.1 * Math.max(0, y / 0.6)), y, z * bulge);
  }
  geo.computeVertexNormals();
  g.add(mesh(geo, paper, [0, -0.2, 0]));
  g.add(mesh(roundedBox(0.95, 0.12, 0.1, 0.03), paper, [0, 0.45, 0]));
  const lbl = labelTexture(p.label ?? '', p.color2 ?? '#2e7d32', '#ffffff', 256, 256, (gg, w, h) => {
    gg.fillStyle = 'rgba(255,255,255,0.25)';
    if (p.glow === 'nieve') {
      gg.strokeStyle = 'rgba(255,255,255,0.9)';
      gg.lineWidth = 6;
      for (let a = 0; a < 3; a++) {
        gg.save();
        gg.translate(w / 2, h * 0.2);
        gg.rotate((a * Math.PI) / 3);
        gg.beginPath();
        gg.moveTo(-34, 0);
        gg.lineTo(34, 0);
        gg.stroke();
        gg.restore();
      }
    } else if (p.glow === 'hoja') {
      gg.fillStyle = 'rgba(255,255,255,0.9)';
      gg.beginPath();
      gg.ellipse(w / 2, h * 0.2, 36, 18, -0.5, 0, Math.PI * 2);
      gg.fill();
    }
  });
  if (lbl) g.add(mesh(new THREE.PlaneGeometry(0.75, 0.75), mat('#ffffff', { map: lbl, rough: 0.8 }), [0, -0.15, 0.33]));
  // Montoncito de polvo derramado.
  const pile = mesh(new THREE.SphereGeometry(0.3, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(p.glow === 'hoja' ? '#f0f0e8' : '#ffffff', { rough: 1 }), [0.55, -0.8, 0.35]);
  pile.scale.y = 0.45;
  g.add(pile);
  const dust = particles(14, '#ffffff', 0.08, false);
  (dust.material as THREE.PointsMaterial).opacity = 0.6;
  g.add(dust);
  emitter(k, dust, (_i, o, v) => {
    o.set(0.55 + (k.rand() - 0.5) * 0.3, -0.75, 0.35 + (k.rand() - 0.5) * 0.3);
    v.set((k.rand() - 0.5) * 0.1, 0.2, (k.rand() - 0.5) * 0.1);
  }, { life: 1.5 });
  k.animate((t) => (g.rotation.y = 0.4 * Math.sin(t * 0.4) - 0.2));
}

/** Salero que se sacude y deja caer granos de sal. */
export function saltShaker(k: Kit, p: Params): void {
  const g = k.add(new THREE.Group());
  const shaker = new THREE.Group();
  shaker.add(mesh(lathe([[0, -0.6], [0.3, -0.6], [0.34, -0.55], [0.3, 0.1], [0.27, 0.3]], 32), glass('#f2fbff', 0.35)));
  shaker.add(mesh(lathe([[0, -0.57], [0.29, -0.57], [0.3, -0.3], [0.28, 0.0], [0, 0.0]], 24), mat('#ffffff', { rough: 0.95 })));
  const capTex = canvasTexture(128, 128, (gg, w) => {
    gg.fillStyle = '#c9ced4';
    gg.fillRect(0, 0, w, w);
    gg.fillStyle = '#2b2d33';
    for (const [x, y] of [[64, 64], [40, 50], [88, 50], [50, 86], [78, 86]]) {
      gg.beginPath();
      gg.arc(x, y, 7, 0, Math.PI * 2);
      gg.fill();
    }
  });
  const capColor = p.color ?? '#c9ced4';
  shaker.add(mesh(lathe([[0.28, 0.28], [0.3, 0.45], [0.22, 0.58], [0, 0.6]], 32), metal(capColor, 0.25)));
  if (capTex) shaker.add(mesh(new THREE.CircleGeometry(0.16, 24), mat('#ffffff', { map: capTex, metal: 0.6, rough: 0.3 }), [0, 0.6, 0], [-Math.PI / 2, 0, 0]));
  shaker.position.y = 0.1;
  g.add(shaker);
  // Granos de sal: cubitos diminutos.
  const grains = particles(40, '#ffffff', 0.05, false);
  g.add(grains);
  const pile = mesh(new THREE.ConeGeometry(0.35, 0.15, 24), mat('#ffffff', { rough: 1 }), [0.45, -0.85, 0]);
  g.add(pile);
  k.animate((t) => {
    const c = (t / 2.5) % 1;
    const shaking = c > 0.3 && c < 0.75;
    shaker.rotation.z = shaking ? 2.3 + 0.2 * Math.sin(t * 25) : c < 0.3 ? (c / 0.3) * 2.3 : 2.3 * (1 - (c - 0.75) / 0.25);
    shaker.position.set(shaker.rotation.z * 0.15, 0.1 + shaker.rotation.z * 0.12, 0);
    g.rotation.y = 0.3 * Math.sin(t * 0.4);
  });
  emitter(k, grains, (_i, o, v) => {
    const tilt = shaker.rotation.z;
    o.set(shaker.position.x - Math.sin(tilt) * 0.6, shaker.position.y + Math.cos(tilt) * 0.6, 0);
    v.set((k.rand() - 0.5) * 0.15, -0.2, (k.rand() - 0.5) * 0.15);
    if (tilt < 1.8) o.y = -10;
  }, { life: 0.9, gravity: 2.5 });
}

/** Pastilla de jabón con pompas irisadas. */
export function soap(k: Kit, p: Params): void {
  const g = k.add(new THREE.Group());
  const bar = mesh(roundedBox(1.3, 0.5, 0.85, 0.2, 4), mat(p.color ?? '#f7c6d9', { rough: 0.35 }), [0, -0.4, 0]);
  g.add(bar);
  const foam = new THREE.Group();
  for (let i = 0; i < 9; i++) foam.add(mesh(new THREE.SphereGeometry(0.05 + (i % 3) * 0.02, 14, 10), mat('#ffffff', { rough: 0.6 }), [(i - 4) * 0.07, -0.13, (i % 2) * 0.1 - 0.05]));
  g.add(foam);
  const bm = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.02, metalness: 0.1, transparent: true, opacity: 0.35, iridescence: 1, iridescenceIOR: 1.5, iridescenceThicknessRange: [100, 600], depthWrite: false, side: THREE.DoubleSide });
  bubbles(k, g, 8, bm, { x: 0.5, z: 0.3, y0: -0.2, y1: 0.95, r: [0.07, 0.17], speed: 0.18, wobble: 0.06 });
  g.rotation.x = 0.35;
  k.animate((t) => (g.rotation.y = t * 0.25));
}

/** Huevo: podrido (con su tufo verde) o cáscara rota que se balancea. */
export function egg(k: Kit, p: Params): void {
  const g = k.add(new THREE.Group());
  const shellColor = p.color ?? '#f4e3cf';
  const profile: Array<[number, number]> = [];
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * Math.PI;
    const y = -Math.cos(a) * 0.62;
    const r = Math.sin(a) * 0.45 * (1 - 0.15 * (y / 0.62));
    profile.push([Math.max(0.0001, r), y]);
  }
  profile[0][0] = 0;
  profile[16][0] = 0;
  if (p.variant === 'cascara') {
    // Dos medias cáscaras con borde dentado.
    const shellMat = mat(shellColor, { rough: 0.6, side: THREE.DoubleSide });
    const bottomHalf = profile.filter(([, y]) => y <= 0.05);
    const top = profile.filter(([, y]) => y >= 0.05);
    const zig = (pts: Array<[number, number]>) => {
      const geo = lathe(pts, 24);
      return geo;
    };
    const b = mesh(zig(bottomHalf), shellMat, [0, -0.3, 0]);
    g.add(b);
    const tHalf = mesh(zig(top), shellMat, [0.25, 0.3, 0], [0, 0, -0.7]);
    g.add(tHalf);
    // Dientes del borde.
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.add(mesh(new THREE.ConeGeometry(0.05, 0.1, 4), shellMat, [Math.cos(a) * 0.44, -0.22, Math.sin(a) * 0.44]));
    }
    k.animate((t) => {
      b.rotation.z = 0.12 * Math.sin(t * 1.6);
      tHalf.position.y = 0.3 + 0.05 * Math.sin(t * 1.6);
      g.rotation.y = t * 0.3;
    });
    return;
  }
  const e = mesh(lathe(profile, 32), mat(shellColor, { rough: 0.55 }), [0, -0.15, 0]);
  g.add(e);
  // Grieta.
  g.add(mesh(tube([[-0.2, 0.2, 0.39], [-0.08, 0.12, 0.43], [0.02, 0.22, 0.43], [0.15, 0.1, 0.4]], 0.012, 16), mat('#6b5a45')));
  // Tufo: líneas onduladas verdes que suben.
  const stinkMat = mat(p.glow ?? '#9ccc3c', { opacity: 0.75, emissive: p.glow ?? '#9ccc3c', emissiveIntensity: 0.3 });
  const wisps = [-0.25, 0, 0.25].map((x) => {
    const pts: Array<[number, number, number]> = [];
    for (let i = 0; i <= 12; i++) pts.push([x + Math.sin(i * 0.9) * 0.08, 0.5 + i * 0.04, 0]);
    const w = mesh(tube(pts, 0.025, 40), stinkMat);
    g.add(w);
    return w;
  });
  const fumes = particles(20, p.glow ?? '#b5e655', 0.22, false);
  (fumes.material as THREE.PointsMaterial).opacity = 0.4;
  g.add(fumes);
  emitter(k, fumes, (_i, o, v) => {
    o.set((k.rand() - 0.5) * 0.4, 0.45, (k.rand() - 0.5) * 0.3);
    v.set((k.rand() - 0.5) * 0.2, 0.3, (k.rand() - 0.5) * 0.1);
  }, { life: 1.6 });
  k.animate((t) => {
    wisps.forEach((w, i) => {
      const c = (t * 0.4 + i / 3) % 1;
      w.position.y = c * 0.25;
      w.scale.setScalar(0.6 + c * 0.4);
      stinkMat.opacity = 0.7;
    });
    e.rotation.z = 0.05 * Math.sin(t * 2);
  });
}

/** Fruta: plátano o manzana partida con sus pepitas. */
export function fruit(k: Kit, p: Params): void {
  const g = k.add(new THREE.Group());
  if (p.variant === 'manzana') {
    const skin = mat(p.color ?? '#d7263d', { rough: 0.35 });
    const flesh = mat('#fbf1d0', { rough: 0.7 });
    const profile: Array<[number, number]> = [[0, -0.42], [0.25, -0.45], [0.48, -0.3], [0.55, 0.0], [0.5, 0.3], [0.3, 0.45], [0.08, 0.4], [0, 0.32]];
    for (const side of [-1, 1]) {
      const half = new THREE.Group();
      half.add(mesh(lathe(profile, 24).rotateY(side > 0 ? 0 : Math.PI), skin));
      // Lathe de media vuelta: usamos phiLength.
      half.clear();
      const geo = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 24, side > 0 ? -Math.PI / 2 : Math.PI / 2, Math.PI);
      half.add(mesh(geo, skin));
      const cut = new THREE.Shape();
      cut.moveTo(0, -0.42);
      for (const [r, y] of profile) cut.lineTo(r, y);
      for (const [r, y] of [...profile].reverse()) cut.lineTo(-r, y);
      const face = mesh(new THREE.ShapeGeometry(cut), flesh, [0, 0, 0], [0, side > 0 ? -Math.PI / 2 : Math.PI / 2, 0]);
      face.position.x = side * 0.001;
      half.add(face);
      // Corazón y pepitas.
      if (side > 0) {
        for (const [y, dx] of [[0.08, -0.06], [0.08, 0.06], [-0.05, -0.05], [-0.05, 0.05]]) {
          const seed = mesh(new THREE.SphereGeometry(0.04, 10, 8), mat('#4e2a12', { rough: 0.3 }));
          seed.scale.set(0.6, 1, 0.4);
          seed.position.set(0.01, y, dx);
          half.add(seed);
        }
      }
      half.userData.side = side;
      g.add(half);
    }
    g.add(mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.25, 8), mat('#5d4037'), [0, 0.5, 0], [0, 0, 0.2]));
    const leaf = mesh(new THREE.SphereGeometry(0.12, 12, 8), mat('#4caf50', { rough: 0.5 }), [0.12, 0.58, 0]);
    leaf.scale.set(1.3, 0.2, 0.6);
    g.add(leaf);
    g.rotation.y = 0.9;
    k.animate((t) => {
      const open = 0.08 + 0.12 * (0.5 + 0.5 * Math.sin(t * 0.8));
      for (const c of g.children) if (c.userData.side) c.position.x = c.userData.side * open;
      g.rotation.y = 0.9 + 0.3 * Math.sin(t * 0.4);
    });
    return;
  }
  // Plátano: tubo curvo que se estrecha en las puntas, con cinco caras suaves.
  const pts: Array<[number, number, number]> = [];
  for (let i = 0; i <= 10; i++) {
    const a = -1.15 + (i / 10) * 2.3;
    pts.push([Math.sin(a) * 0.9, -Math.cos(a) * 0.75 + 0.3, 0]);
  }
  const geo = taperedTube(pts, (u) => 0.2 * Math.sin(Math.PI * Math.min(1, Math.max(0, u * 0.9 + 0.05))) ** 0.6 + 0.02, 40, 5);
  const banana = new THREE.Group();
  banana.add(mesh(geo, mat(p.color ?? '#ffd93b', { rough: 0.45, flat: false })));
  banana.add(mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.18, 6), mat('#6b8e23'), [pts[10][0] + 0.05, pts[10][1] + 0.05, 0], [0, 0, -0.9]));
  banana.add(mesh(new THREE.SphereGeometry(0.04, 8, 6), mat('#4e342e'), [pts[0][0], pts[0][1], 0]));
  g.add(banana);
  k.animate((t) => {
    banana.rotation.z = 0.15 * Math.sin(t * 1.2);
    g.rotation.y = 0.5 * Math.sin(t * 0.5);
  });
}

/** Hueso de dibujo animado, girando. */
export function bone(k: Kit, p: Params): void {
  const g = k.add(new THREE.Group());
  const ivory = mat(p.color ?? '#f6efe0', { rough: 0.45 });
  g.add(mesh(new THREE.CylinderGeometry(0.14, 0.14, 1.2, 20), ivory, [0, 0, 0], [0, 0, Math.PI / 2]));
  for (const x of [-0.65, 0.65]) for (const z of [-0.14, 0.14]) g.add(mesh(new THREE.SphereGeometry(0.22, 20, 14), ivory, [x, z, 0]));
  g.rotation.z = 0.4;
  const h = halo('#ffffff', 0.5, 0);
  g.add(h);
  k.animate((t) => {
    g.rotation.y = t * 0.6;
    g.position.y = 0.05 * Math.sin(t * 1.4);
    const c = (t % 3) / 3;
    (h.material as THREE.SpriteMaterial).opacity = c < 0.1 ? Math.sin((c / 0.1) * Math.PI) : 0;
    h.position.set(0.5, 0.2, 0.25);
  });
}

/** Ramita de planta acuática en un frasco de agua soltando burbujas de oxígeno. */
export function plant(k: Kit, p: Params): void {
  const g = k.add(new THREE.Group());
  g.add(mesh(lathe([[0, -0.85], [0.5, -0.85], [0.55, -0.8], [0.55, 0.6], [0.5, 0.7]], 40), glass('#f2fbff', 0.25)));
  const waterMat = mat('#9fd8ff', { opacity: 0.35, rough: 0.05 });
  g.add(mesh(new THREE.CylinderGeometry(0.52, 0.52, 1.3, 40), waterMat, [0, -0.17, 0]));
  const sun = halo('#ffd54f', 0.7, 0.9);
  sun.position.set(-0.75, 0.75, 0.2);
  g.add(sun);
  const leafMat = mat(p.color ?? '#43a047', { rough: 0.5, side: THREE.DoubleSide });
  const stems: THREE.Group[] = [];
  for (let s = 0; s < 3; s++) {
    const stem = new THREE.Group();
    stem.position.set((s - 1) * 0.18, -0.8, (s % 2) * 0.1);
    stem.rotation.z = (s - 1) * 0.15;
    stem.add(mesh(new THREE.CylinderGeometry(0.015, 0.02, 1.15, 6), mat('#2e7d32'), [0, 0.57, 0]));
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 3; j++) {
        const leaf = mesh(new THREE.SphereGeometry(0.07, 8, 6), leafMat);
        leaf.scale.set(1.6, 0.2, 0.5);
        const a = (j / 3) * Math.PI * 2 + i;
        leaf.position.set(Math.cos(a) * 0.08, 0.15 + i * 0.13, Math.sin(a) * 0.08);
        leaf.rotation.set(0, -a, 0.4);
        stem.add(leaf);
      }
    }
    g.add(stem);
    stems.push(stem);
  }
  const bm = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.05, transparent: true, opacity: 0.75, depthWrite: false });
  bubbles(k, g, 16, bm, { x: 0.25, z: 0.12, y0: -0.3, y1: 0.48, r: [0.02, 0.045], speed: 0.35 });
  k.animate((t) => {
    stems.forEach((s, i) => (s.rotation.z = (i - 1) * 0.15 + 0.05 * Math.sin(t * 1.1 + i)));
    g.rotation.y = 0.3 * Math.sin(t * 0.35);
  });
}

/** Piscina (con escalerilla) o jacuzzi burbujeante. */
export function pool(k: Kit, p: Params): void {
  const g = k.add(new THREE.Group());
  const round = p.variant === 'jacuzzi';
  const tiles = canvasTexture(128, 128, (gg, w) => {
    gg.fillStyle = '#e8f6ff';
    gg.fillRect(0, 0, w, w);
    gg.strokeStyle = '#9ccde8';
    gg.lineWidth = 2;
    for (let i = 0; i <= 8; i++) {
      gg.beginPath();
      gg.moveTo((i * w) / 8, 0);
      gg.lineTo((i * w) / 8, w);
      gg.moveTo(0, (i * w) / 8);
      gg.lineTo(w, (i * w) / 8);
      gg.stroke();
    }
  });
  if (tiles) {
    tiles.wrapS = tiles.wrapT = THREE.RepeatWrapping;
    tiles.repeat.set(3, 1);
  }
  const tileMat = mat('#ffffff', { map: tiles, rough: 0.4, side: THREE.DoubleSide });
  const deck = mat(p.color2 ?? '#efe6d6', { rough: 0.8 });
  let surface: THREE.Mesh;
  if (round) {
    g.add(mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.45, 40, 1, true), tileMat, [0, -0.35, 0]));
    g.add(mesh(new THREE.TorusGeometry(0.88, 0.07, 10, 48), deck, [0, -0.12, 0], [Math.PI / 2, 0, 0]));
    g.add(mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.02, 40), tileMat, [0, -0.57, 0]));
    g.add(mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.45, 40, 1, true), mat('#8d6e63', { rough: 0.7 }), [0, -0.35, 0]));
    surface = mesh(new THREE.CircleGeometry(0.85, 40), mat(p.color ?? '#4fc3f7', { opacity: 0.7, rough: 0.05, metal: 0.1 }), [0, -0.18, 0], [-Math.PI / 2, 0, 0]);
    const bm = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.05, transparent: true, opacity: 0.8, depthWrite: false });
    bubbles(k, g, 30, bm, { x: 0.6, z: 0.6, y0: -0.5, y1: -0.15, r: [0.02, 0.05], speed: 0.5 });
  } else {
    g.add(mesh(new THREE.BoxGeometry(1.5, 0.5, 1.0), tileMat, [0, -0.35, 0]));
    for (const [x, z, w, d] of [[0, 0.58, 1.7, 0.16], [0, -0.58, 1.7, 0.16], [0.83, 0, 0.16, 1.0], [-0.83, 0, 0.16, 1.0]] as const) g.add(mesh(roundedBox(w, 0.1, d, 0.03), deck, [x, -0.07, z]));
    surface = mesh(new THREE.PlaneGeometry(1.5, 1.0, 24, 16), mat(p.color ?? '#29b6f6', { opacity: 0.8, rough: 0.05, metal: 0.1, emissive: p.color ?? '#29b6f6', emissiveIntensity: 0.2 }), [0, -0.15, 0], [-Math.PI / 2, 0, 0]);
    // Escalerilla cromada.
    const chrome = metal('#eef2f6', 0.05);
    for (const z of [-0.15, 0.15]) g.add(mesh(tube([[0.95, -0.02, z], [0.95, 0.25, z], [0.8, 0.3, z], [0.68, 0.15, z], [0.68, -0.5, z]], 0.025, 24), chrome));
    for (const y of [-0.2, -0.38]) g.add(mesh(new THREE.BoxGeometry(0.04, 0.02, 0.3), chrome, [0.68, y, 0]));
    // Flotador salvavidas rojo y blanco, y el dosificador de cloro.
    const buoy = new THREE.Group();
    for (let i = 0; i < 8; i++) buoy.add(mesh(new THREE.TorusGeometry(0.2, 0.07, 10, 8, Math.PI / 4), mat(i % 2 ? '#ffffff' : '#e53935', { rough: 0.4 }), [0, 0, 0], [0, 0, (i * Math.PI) / 4]));
    buoy.rotation.x = -Math.PI / 2;
    g.add(buoy);
    const floater = new THREE.Group();
    floater.add(mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.07, 20), mat('#ffffff', { rough: 0.4 })));
    floater.add(mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.09, 16), mat('#2e7dd8', { rough: 0.4 }), [0, 0.07, 0]));
    g.add(floater);
    k.animate((t) => {
      buoy.position.set(-0.35 + 0.12 * Math.sin(t * 0.4), -0.12 + 0.015 * Math.sin(t * 2), 0.1 * Math.cos(t * 0.3));
      buoy.rotation.z = t * 0.2;
      floater.position.set(0.3 + 0.08 * Math.cos(t * 0.5), -0.13 + 0.015 * Math.sin(t * 2.3), -0.25);
    });
  }
  g.add(surface);
  const pos = surface.geometry.attributes.position as THREE.BufferAttribute;
  const base = Float32Array.from(pos.array);
  g.rotation.x = 0.5;
  k.animate((t) => {
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3];
      const y = base[i * 3 + 1];
      pos.setZ(i, 0.015 * Math.sin(x * 7 + t * 2) + 0.012 * Math.sin(y * 9 - t * 2.5) + (round ? 0.015 * Math.sin(Math.hypot(x, y) * 14 - t * 5) : 0));
    }
    pos.needsUpdate = true;
    surface.geometry.computeVertexNormals();
    g.rotation.y = 0.3 * Math.sin(t * 0.35);
  });
}

/** Tubo que se aprieta: pintura, pasta de dientes o crema solar. */
export function squeezeTube(k: Kit, p: Params): void {
  const g = k.add(new THREE.Group());
  const v = p.variant ?? 'pasta';
  const color = p.color ?? '#ffffff';
  const geo = new THREE.CylinderGeometry(0.3, 0.3, 1.2, 32, 12);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  // El extremo de abajo se aplana como un tubo de verdad.
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const f = Math.max(0, (-y + 0.1) / 0.7);
    pos.setX(i, pos.getX(i) * (1 + 0.45 * f));
    pos.setZ(i, pos.getZ(i) * (1 - 0.92 * f));
  }
  geo.computeVertexNormals();
  const tex = labelTexture(p.label ?? '', color, p.color2 ?? '#1e88e5', 256, 256, (gg, w, h) => {
    gg.fillStyle = p.color2 ?? '#1e88e5';
    if (v === 'crema') {
      gg.fillStyle = '#ffb300';
      gg.beginPath();
      gg.arc(w * 0.5, h * 0.28, 34, 0, Math.PI * 2);
      gg.fill();
      gg.strokeStyle = '#ffb300';
      gg.lineWidth = 6;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        gg.beginPath();
        gg.moveTo(w * 0.5 + Math.cos(a) * 44, h * 0.28 + Math.sin(a) * 44);
        gg.lineTo(w * 0.5 + Math.cos(a) * 60, h * 0.28 + Math.sin(a) * 60);
        gg.stroke();
      }
    } else if (v === 'pintura') {
      gg.fillRect(0, h * 0.6, w, h * 0.4);
    } else {
      gg.fillRect(0, h * 0.15, w, h * 0.12);
      gg.fillRect(0, h * 0.75, w, h * 0.12);
    }
  });
  const body = new THREE.Group();
  body.add(mesh(geo, v === 'pintura' ? metal(tex ? '#ffffff' : color, 0.35, { map: tex }) : mat(tex ? '#ffffff' : color, { map: tex, rough: 0.35 })));
  body.add(mesh(new THREE.BoxGeometry(0.9, 0.1, 0.06), v === 'pintura' ? metal('#c9ced4', 0.3) : mat(color, { rough: 0.4 }), [0, -0.62, 0]));
  body.add(mesh(new THREE.CylinderGeometry(0.3, 0.12, 0.15, 32), v === 'pintura' ? metal('#c9ced4', 0.3) : mat(color, { rough: 0.35 }), [0, 0.67, 0]));
  body.add(mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.18, 24), mat(v === 'pintura' ? '#1d1f24' : p.color2 ?? '#1e88e5', { rough: 0.4 }), [0, 0.83, 0]));
  body.rotation.z = -1.25;
  body.position.set(-0.15, 0.15, 0);
  g.add(body);
  // El chorrito que sale enrollándose.
  const pasteColor = p.glow ?? color;
  const pasteMat = mat(pasteColor, { rough: v === 'pintura' ? 0.15 : 0.35 });
  const pts: Array<[number, number, number]> = [];
  for (let i = 0; i <= 20; i++) {
    const u = i / 20;
    pts.push([0.75 + Math.sin(u * 5) * 0.12 * u, 0.4 - u * 0.95, Math.cos(u * 5) * 0.12 * u]);
  }
  const paste = mesh(taperedTube(pts, () => 0.08, 40, 10), pasteMat);
  g.add(paste);
  if (v === 'pasta') {
    // Raya azul de la pasta de dientes.
    const stripe = mesh(taperedTube(pts.map(([x, y, z]) => [x, y, z + 0.06] as [number, number, number]), () => 0.035, 40, 6), mat(p.color2 ?? '#1e88e5', { rough: 0.35 }));
    paste.add(stripe);
  }
  k.animate((t) => {
    const c = 0.5 + 0.5 * Math.sin(t * 0.8);
    paste.scale.set(1, 0.3 + 0.7 * c, 1);
    paste.position.y = 0.4 * (1 - (0.3 + 0.7 * c));
    body.scale.set(1, 1, 1 - 0.1 * c);
    g.rotation.y = 0.4 * Math.sin(t * 0.4);
  });
}

