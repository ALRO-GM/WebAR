import * as THREE from 'three';
import {
  canvasTexture,
  drawBolt,
  glass,
  glowMat,
  halo,
  labelTexture,
  lathe,
  mat,
  mesh,
  metal,
  particles,
  emitter,
  roundedBox,
  seeded,
  spotsTexture,
  tube,
  type Kit,
  type Params,
} from '../kit';

// Arquetipos de metal: monedas, lingotes, cables, herramientas, latas, pilas, imanes.

/** Destello en estrella que aparece y se va (brillo de metal pulido). */
function glint(k: Kit, parent: THREE.Object3D, pos: [number, number, number], period = 2.4, size = 0.5): void {
  const s = halo('#ffffff', size, 0);
  s.position.set(...pos);
  parent.add(s);
  const ph = k.rand() * period;
  k.animate((t) => {
    const c = ((t + ph) % period) / period;
    const v = c < 0.15 ? Math.sin((c / 0.15) * Math.PI) : 0;
    (s.material as THREE.SpriteMaterial).opacity = v;
    s.scale.setScalar(size * (0.4 + v));
    s.material.rotation = t;
  });
}

/** Cara de moneda pintada: relieve sencillo (cruz, castillo o número). */
function coinFace(base: string, dark: string, kind: string): THREE.CanvasTexture | null {
  return canvasTexture(256, 256, (g, w) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, w);
    g.strokeStyle = dark;
    g.fillStyle = dark;
    g.lineWidth = 6;
    g.beginPath();
    g.arc(w / 2, w / 2, w * 0.42, 0, Math.PI * 2);
    g.stroke();
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      g.beginPath();
      g.arc(w / 2 + Math.cos(a) * w * 0.46, w / 2 + Math.sin(a) * w * 0.46, 3.5, 0, Math.PI * 2);
      g.fill();
    }
    if (kind === 'cruz') {
      // Cruz de Jerusalén como la de los doblones.
      const c = w / 2;
      g.fillRect(c - 10, c - 70, 20, 140);
      g.fillRect(c - 70, c - 10, 140, 20);
      for (const [dx, dy] of [[-40, -40], [40, -40], [-40, 40], [40, 40]]) {
        g.fillRect(c + dx - 5, c + dy - 14, 10, 28);
        g.fillRect(c + dx - 14, c + dy - 5, 28, 10);
      }
    } else if (kind === 'estrellas') {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        g.font = 'bold 26px sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('★', w / 2 + Math.cos(a) * w * 0.33, w / 2 + Math.sin(a) * w * 0.33);
      }
      g.font = 'bold 90px sans-serif';
      g.fillText('1', w / 2, w / 2 + 4);
    } else {
      g.beginPath();
      g.moveTo(w / 2, w * 0.25);
      for (let i = 1; i <= 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 ? w * 0.12 : w * 0.25;
        g.lineTo(w / 2 + Math.cos(a) * r, w / 2 + Math.sin(a) * r);
      }
      g.fill();
    }
  });
}

/** Moneda que gira y destella (doblón, euro bimetálico o medalla con cinta). */
export function coin(k: Kit, p: Params): void {
  const color = p.color ?? '#f2c14e';
  const g = k.add(new THREE.Group());
  const spin = new THREE.Group();
  g.add(spin);
  const v = p.variant ?? 'doblon';
  const r = 0.62;
  const edge = metal(color, 0.25);
  if (v === 'euro') {
    const inner = p.color2 ?? '#d7dade';
    spin.add(mesh(new THREE.CylinderGeometry(r, r, 0.1, 48), metal(color, 0.3), [0, 0, 0], [Math.PI / 2, 0, 0]));
    const face = coinFace(inner, '#9aa0a6', 'estrellas');
    const fm = metal(face ? '#ffffff' : inner, 0.3, { map: face });
    for (const s of [-1, 1]) spin.add(mesh(new THREE.CircleGeometry(r * 0.66, 40), fm, [0, 0, s * 0.052], [0, s > 0 ? 0 : Math.PI, 0]));
    spin.add(mesh(new THREE.TorusGeometry(r * 0.66, 0.012, 6, 48), metal('#b8a050', 0.3), [0, 0, 0.05]));
  } else {
    const face = coinFace(color, new THREE.Color(color).multiplyScalar(0.62).getStyle(), v === 'doblon' ? 'cruz' : 'estrella');
    const fm = metal(face ? '#ffffff' : color, 0.22, { map: face, ...(face ? { } : {}) });
    if (face) fm.bumpMap = face;
    spin.add(mesh(new THREE.CylinderGeometry(r, r, 0.09, v === 'doblon' ? 20 : 48), edge, [0, 0, 0], [Math.PI / 2, 0, 0]));
    for (const s of [-1, 1]) spin.add(mesh(new THREE.CircleGeometry(r * 0.97, v === 'doblon' ? 20 : 48), fm, [0, 0, s * 0.047], [0, s > 0 ? 0 : Math.PI, 0]));
    spin.add(mesh(new THREE.TorusGeometry(r * 0.97, 0.03, 8, 48), edge, [0, 0, 0]));
  }
  if (v === 'medalla') {
    spin.position.y = -0.3;
    const ribbon = new THREE.Group();
    const c1 = mat(p.color2 ?? '#2f6fd8', { rough: 0.7, side: THREE.DoubleSide });
    for (const s of [-1, 1]) {
      const strip = mesh(new THREE.PlaneGeometry(0.22, 0.75), c1, [s * 0.16, 0.6, 0], [0, 0, s * 0.35]);
      ribbon.add(strip);
    }
    ribbon.add(mesh(new THREE.TorusGeometry(0.08, 0.02, 8, 16), edge, [0, 0.36, 0]));
    g.add(ribbon);
    k.animate((t) => {
      g.rotation.z = 0.12 * Math.sin(t * 1.3);
      spin.rotation.y = 0.6 * Math.sin(t * 0.9);
    });
  } else {
    k.animate((t) => {
      spin.rotation.y = t * 1.4;
      g.position.y = 0.04 * Math.sin(t * 1.5);
      g.rotation.x = -0.15;
    });
  }
  glint(k, g, [0.35, 0.3, 0.2], 2.2, 0.55);
}

/** Lingote con su sello (o el kilogramo patrón bajo su campana). */
export function ingot(k: Kit, p: Params): void {
  const color = p.color ?? '#d9dde2';
  const g = k.add(new THREE.Group());
  if (p.variant === 'kilogramo') {
    g.add(mesh(new THREE.CylinderGeometry(0.75, 0.8, 0.12, 40), mat('#3b2f2a', { rough: 0.5 }), [0, -0.78, 0]));
    g.add(mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.06, 32), metal('#c0c4c9', 0.3), [0, -0.69, 0]));
    g.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.44, 40), metal(color, 0.12), [0, -0.44, 0]));
    g.add(mesh(lathe([[0.6, -0.72], [0.6, 0.2], [0.55, 0.45], [0.35, 0.6], [0, 0.65]], 40), glass('#eaf6ff', 0.2)));
    g.add(mesh(new THREE.SphereGeometry(0.06, 16, 12), glass('#eaf6ff', 0.5), [0, 0.7, 0]));
    // Segunda campana, como el original.
    g.add(mesh(lathe([[0.45, -0.66], [0.45, 0.0], [0.4, 0.2], [0.25, 0.3], [0, 0.33]], 40), glass('#eaf6ff', 0.15)));
    glint(k, g, [0.15, -0.3, 0.25], 2.8, 0.45);
    k.animate((t) => (g.rotation.y = t * 0.3));
    return;
  }
  const bar = mesh(new THREE.CylinderGeometry(0.55, 0.72, 0.42, 4, 1), metal(color, p.rough ?? 0.32, { flat: true }));
  bar.rotation.y = Math.PI / 4;
  bar.scale.set(1.25, 1, 0.62);
  const holder = new THREE.Group();
  holder.add(bar);
  const label = labelTexture(p.label ?? '', 'rgba(0,0,0,0)', new THREE.Color(color).multiplyScalar(0.55).getStyle(), 256, 128, (gg, w, h) => {
    gg.strokeStyle = new THREE.Color(color).multiplyScalar(0.6).getStyle();
    gg.lineWidth = 6;
    gg.strokeRect(10, 10, w - 20, h - 20);
  });
  if (label) {
    const plate = mesh(new THREE.PlaneGeometry(0.85, 0.36), new THREE.MeshStandardMaterial({ map: label, transparent: true, metalness: 1, roughness: 0.3, color, depthWrite: false }), [0, 0.215, 0], [-Math.PI / 2, 0, 0]);
    holder.add(plate);
  }
  // Otro lingote debajo, de lado: un montoncito.
  const bar2 = bar.clone();
  bar2.position.set(0.15, -0.45, -0.1);
  bar2.rotation.y = Math.PI / 4 + 0.35;
  holder.add(bar2);
  holder.position.y = 0.2;
  g.add(holder);
  glint(k, holder, [0.4, 0.25, 0.1], 2.5, 0.5);
  glint(k, holder, [-0.3, -0.25, 0.3], 3.1, 0.4);
  k.animate((t) => {
    g.rotation.y = 0.5 * Math.sin(t * 0.5);
    g.rotation.x = 0.35;
  });
}

/** Anillo con piedrecita que gira y destella. */
export function ring(k: Kit, p: Params): void {
  const g = k.add(new THREE.Group());
  const band = metal(p.color ?? '#e4e6ea', 0.12);
  g.add(mesh(new THREE.TorusGeometry(0.5, 0.09, 20, 64), band));
  g.add(mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.12, 6), band, [0, 0.6, 0]));
  const stone = mesh(lathe([[0, -0.12], [0.16, 0.02], [0.17, 0.05], [0.1, 0.12], [0, 0.12]], 8), new THREE.MeshPhysicalMaterial({ color: p.color2 ?? '#ffffff', metalness: 0.1, roughness: 0, clearcoat: 1, flatShading: true, transparent: true, opacity: 0.9 }), [0, 0.72, 0]);
  g.add(stone);
  glint(k, g, [0.05, 0.8, 0.1], 1.8, 0.5);
  glint(k, g, [-0.45, 0.1, 0.1], 2.7, 0.35);
  k.animate((t) => {
    g.rotation.y = t * 0.8;
    g.position.y = -0.1 + 0.04 * Math.sin(t * 1.2);
  });
}

/** Cable: bobina de cobre, cable de fibra óptica o hilo ennegrecido. */
export function cable(k: Kit, p: Params): void {
  const g = k.add(new THREE.Group());
  if (p.variant === 'fibra') {
    // Manguera negra que se abre en hilos con la luz viajando.
    g.add(mesh(tube([[-1, -0.6, 0], [-0.6, -0.5, 0], [-0.3, -0.25, 0]], 0.1, 20), mat('#22262c', { rough: 0.5 })));
    g.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.12, 20), mat(p.color ?? '#f2a900', { rough: 0.4 }), [-0.3, -0.25, 0], [0, 0, -0.9]));
    const glow = p.glow ?? '#ff4fa3';
    const pulses: Array<{ c: THREE.CatmullRomCurve3; s: THREE.Sprite; ph: number }> = [];
    const fibMat = mat('#e9f3ff', { opacity: 0.5, rough: 0.1, emissive: glow, emissiveIntensity: 0.25 });
    const r = seeded(2);
    for (let i = 0; i < 9; i++) {
      const a = -0.6 + (i / 8) * 1.4;
      const end = new THREE.Vector3(-0.2 + Math.cos(a) * 1.0, -0.2 + Math.sin(a) * 0.95, (r() - 0.5) * 0.5);
      const pts = [new THREE.Vector3(-0.25, -0.22, 0), new THREE.Vector3(0.0, -0.05 + (end.y + 0.2) * 0.2, end.z * 0.3), end];
      const c = new THREE.CatmullRomCurve3(pts);
      g.add(mesh(new THREE.TubeGeometry(c, 24, 0.012, 5), fibMat));
      const tip = halo(glow, 0.22, 0.9);
      tip.position.copy(end);
      g.add(tip);
      const s = halo(glow, 0.18, 0.95);
      g.add(s);
      pulses.push({ c, s, ph: r() });
    }
    k.animate((t) => {
      for (const pu of pulses) {
        const u = (t * 0.6 + pu.ph) % 1;
        pu.c.getPointAt(u, pu.s.position);
      }
      g.rotation.y = 0.3 * Math.sin(t * 0.5);
    });
    return;
  }
  const color = p.color ?? '#d9822b';
  const tex = p.variant === 'ennegrecido' ? spotsTexture('#2b2421', ['#5a3a2a', '#14110f', '#7a4a2c'], 40, 4) : null;
  const wireMat = metal(tex ? '#ffffff' : color, p.variant === 'ennegrecido' ? 0.6 : 0.22, { map: tex });
  const pts: Array<[number, number, number]> = [[-0.9, -0.75, 0.3], [-0.55, -0.65, 0.42]];
  const turns = 6;
  for (let i = 0; i <= turns * 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    pts.push([Math.cos(a) * 0.45, -0.55 + (i / (turns * 24)) * 1.0, Math.sin(a) * 0.45]);
  }
  pts.push([0.45, 0.62, 0.0], [0.8, 0.75, -0.1]);
  const coil = new THREE.Group();
  coil.add(mesh(tube(pts, 0.05, 520), wireMat));
  // Puntas peladas con un poco de funda.
  coil.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.18, 12), mat('#e5484d', { rough: 0.5 }), [-0.82, -0.72, 0.33], [0, 0, 1.3]));
  g.add(coil);
  if (p.variant !== 'ennegrecido') {
    glint(k, coil, [0.3, 0.2, 0.4], 1.9, 0.4);
    glint(k, coil, [-0.4, -0.2, 0.3], 2.6, 0.35);
    // Corriente: chispitas que recorren el hilo.
    const curve = new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(...q)));
    const sp = Array.from({ length: 4 }, () => {
      const s = halo('#fff2b0', 0.16, 0.9);
      coil.add(s);
      return s;
    });
    k.animate((t) => sp.forEach((s, i) => curve.getPointAt((t * 0.12 + i / sp.length) % 1, s.position)));
  } else {
    const h = halo('#ff6a2a', 1.2, 0.25);
    h.position.y = -0.7;
    g.add(h);
    k.animate((t) => ((h.material as THREE.SpriteMaterial).opacity = 0.2 + 0.1 * Math.sin(t * 2)));
  }
  k.animate((t) => (coil.rotation.y = t * 0.35));
}

/** Óxido pintado: manchas naranjas y pardas sobre el metal. */
function rustTexture(seed: number): THREE.CanvasTexture | null {
  return spotsTexture('#8d8f93', ['#a8431b', '#c96a2b', '#6e2a12', '#d98a3a', '#7b3a1a'], 70, seed);
}

/** Ferretería: clavo, candado oxidado, llave inglesa o broca. */
export function ironware(k: Kit, p: Params): void {
  const g = k.add(new THREE.Group());
  const v = p.variant ?? 'clavo';
  const steel = metal(p.color ?? '#a9b0b8', p.rough ?? 0.28);
  if (v === 'clavo') {
    const nail = new THREE.Group();
    nail.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 32), steel, [0, 0.75, 0]));
    nail.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.25, 16), steel, [0, 0.1, 0]));
    nail.add(mesh(new THREE.ConeGeometry(0.06, 0.2, 16), steel, [0, -0.62, 0], [Math.PI, 0, 0]));
    nail.rotation.z = 0.5;
    g.add(nail);
    glint(k, nail, [0.0, 0.3, 0.07], 2.3, 0.4);
    // Un segundo clavo tumbado.
    const n2 = nail.clone();
    n2.rotation.set(Math.PI / 2, 0, -0.9);
    n2.position.set(0.25, -0.55, 0.2);
    n2.scale.setScalar(0.8);
    g.add(n2);
    k.animate((t) => (g.rotation.y = t * 0.4));
  } else if (v === 'candado') {
    const tex = rustTexture(p.seed ?? 21);
    const rust = mat(tex ? '#ffffff' : '#a8431b', { map: tex, metal: 0.4, rough: 0.85 });
    const lock = new THREE.Group();
    lock.add(mesh(roundedBox(0.95, 0.75, 0.38, 0.12), rust, [0, -0.3, 0]));
    const shackleMat = mat(tex ? '#ffffff' : '#b5562a', { map: rustTexture(5), metal: 0.6, rough: 0.7 });
    lock.add(mesh(new THREE.TorusGeometry(0.3, 0.07, 12, 32, Math.PI), shackleMat, [0, 0.28, 0]));
    for (const x of [-0.3, 0.3]) lock.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.25, 12), shackleMat, [x, 0.17, 0]));
    lock.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.04, 16), mat('#2a1a12'), [0, -0.35, 0.2], [Math.PI / 2, 0, 0]));
    lock.add(mesh(new THREE.BoxGeometry(0.035, 0.13, 0.04), mat('#2a1a12'), [0, -0.44, 0.2]));
    g.add(lock);
    // Escamas de óxido que se desprenden.
    const flakes = particles(24, '#b24a1d', 0.05, false);
    g.add(flakes);
    emitter(k, flakes, (_i, o, vel) => {
      o.set((k.rand() - 0.5) * 0.9, -0.3 + (k.rand() - 0.5) * 0.6, 0.2);
      vel.set((k.rand() - 0.5) * 0.1, -0.1, 0.05);
    }, { life: 2.5, gravity: 0.25 });
    k.animate((t) => {
      lock.rotation.z = 0.12 * Math.sin(t * 1.1);
      g.rotation.y = 0.4 * Math.sin(t * 0.4);
    });
  } else if (v === 'llave') {
    const shape = new THREE.Shape();
    // Mango con una boca abierta en un extremo.
    shape.moveTo(-0.08, -0.9);
    shape.lineTo(0.08, -0.9);
    shape.lineTo(0.09, 0.35);
    shape.absarc(0, 0.55, 0.26, -Math.PI / 2 + 0.35, Math.PI * 0.22, false);
    shape.lineTo(0.06, 0.6);
    shape.lineTo(0.06, 0.5);
    shape.lineTo(-0.06, 0.5);
    shape.lineTo(-0.06, 0.6);
    shape.absarc(0, 0.55, 0.26, Math.PI * 0.78, Math.PI * 1.5 - 0.35, false);
    shape.lineTo(-0.08, -0.9);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2, curveSegments: 16 });
    geo.translate(0, 0, -0.04);
    const w = mesh(geo, metal(p.color ?? '#b9c0c8', 0.22));
    w.rotation.z = -0.6;
    g.add(w);
    const ring2 = mesh(new THREE.TorusGeometry(0.06, 0.02, 8, 16), metal('#9aa0a6'), [0, -0.78, 0.0]);
    w.add(ring2);
    glint(k, w, [0, 0, 0.1], 2.2, 0.4);
    k.animate((t) => (g.rotation.y = t * 0.6));
  } else {
    // Broca: espiral retorcida que gira rápido.
    const bit = new THREE.Group();
    const geo = new THREE.BoxGeometry(0.22, 1.1, 0.07, 1, 40, 1);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const a = y * 9;
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setXYZ(i, x * Math.cos(a) - z * Math.sin(a), y, x * Math.sin(a) + z * Math.cos(a));
    }
    geo.computeVertexNormals();
    bit.add(mesh(geo, metal(p.color ?? '#8f969e', 0.3), [0, 0.15, 0]));
    bit.add(mesh(new THREE.ConeGeometry(0.11, 0.2, 16), metal(p.color ?? '#8f969e', 0.3), [0, -0.5, 0], [Math.PI, 0, 0]));
    bit.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.5, 16), metal('#c8a24a', 0.3), [0, 0.95, 0]));
    bit.rotation.z = 0.35;
    g.add(bit);
    const chips = particles(30, '#c9ced4', 0.05, false);
    g.add(chips);
    emitter(k, chips, (_i, o, vel) => {
      o.set(0.2, -0.55, 0);
      vel.set((k.rand() - 0.5) * 0.8, k.rand() * 0.5, (k.rand() - 0.5) * 0.8);
    }, { life: 0.8, gravity: 1.5 });
    k.animate((t) => (bit.rotation.y = t * 8));
  }
}

/** Sartén antiadherente con un huevo que resbala sin pegarse. */
export function pan(k: Kit, p: Params): void {
  const g = k.add(new THREE.Group());
  g.rotation.x = 0.55;
  g.add(mesh(lathe([[0, -0.1], [0.6, -0.1], [0.66, -0.06], [0.75, 0.12], [0.73, 0.13], [0.62, -0.04], [0, -0.04]], 48), mat(p.color ?? '#d8463c', { rough: 0.4, metal: 0.2 })));
  g.add(mesh(new THREE.CircleGeometry(0.62, 48), mat('#26282c', { rough: 0.35, metal: 0.3 }), [0, -0.035, 0], [-Math.PI / 2, 0, 0]));
  g.add(mesh(roundedBox(0.75, 0.07, 0.14, 0.035), mat('#1c1d20', { rough: 0.6 }), [1.05, 0.08, 0], [0, 0, 0.12]));
  const egg = new THREE.Group();
  const white = mesh(new THREE.SphereGeometry(0.26, 24, 12), mat('#fbfbf6', { rough: 0.3 }));
  white.scale.set(1, 0.12, 0.85);
  egg.add(white);
  const yolk = mesh(new THREE.SphereGeometry(0.1, 20, 14), mat('#ffb300', { rough: 0.2 }), [0.04, 0.03, 0]);
  yolk.scale.y = 0.7;
  egg.add(yolk);
  egg.position.y = -0.01;
  g.add(egg);
  const steam = particles(12, '#ffffff', 0.18, false);
  (steam.material as THREE.PointsMaterial).opacity = 0.35;
  g.add(steam);
  emitter(k, steam, (_i, o, v) => {
    o.set((k.rand() - 0.5) * 0.6, 0.05, (k.rand() - 0.5) * 0.6);
    v.set(0, 0.35, 0);
  }, { life: 1.6 });
  k.animate((t) => {
    egg.position.x = Math.sin(t * 0.9) * 0.25;
    egg.position.z = Math.sin(t * 0.7) * 0.15;
    egg.rotation.y = t * 0.3;
    g.rotation.z = 0.08 * Math.sin(t * 0.9);
  });
}

/** Grifo cromado que gotea. */
export function tap(k: Kit, p: Params): void {
  const g = k.add(new THREE.Group());
  const chrome = metal(p.color ?? '#eef2f6', 0.04);
  g.add(mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.1, 32), chrome, [-0.3, -0.85, 0]));
  g.add(mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.85, 24), chrome, [-0.3, -0.4, 0]));
  g.add(mesh(tube([[-0.3, 0.0, 0], [-0.3, 0.35, 0], [-0.1, 0.6, 0], [0.25, 0.55, 0], [0.4, 0.3, 0], [0.42, 0.18, 0]], 0.07, 48), chrome));
  g.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 16), chrome, [0.42, 0.15, 0]));
  g.add(mesh(roundedBox(0.08, 0.06, 0.45, 0.03), chrome, [-0.3, 0.12, 0.2], [0.3, 0, 0]));
  const dropMat = mat('#8fd3ff', { rough: 0.05, opacity: 0.8 });
  const drop = mesh(new THREE.SphereGeometry(0.05, 14, 10), dropMat);
  drop.scale.y = 1.3;
  g.add(drop);
  const splash = mesh(new THREE.TorusGeometry(0.1, 0.012, 6, 24), dropMat, [0.42, -0.88, 0], [Math.PI / 2, 0, 0]);
  g.add(splash);
  glint(k, g, [-0.1, 0.6, 0.08], 2, 0.45);
  glint(k, g, [-0.3, -0.5, 0.13], 2.9, 0.35);
  k.animate((t) => {
    const c = (t / 1.4) % 1;
    const grow = Math.min(1, c / 0.4);
    const fall = Math.max(0, (c - 0.4) / 0.4);
    drop.scale.setScalar(0.4 + 0.6 * grow);
    drop.scale.y *= 1.3;
    drop.position.set(0.42, 0.08 - fall * fall * 0.95, 0);
    drop.visible = c < 0.8;
    splash.visible = c >= 0.8;
    splash.scale.setScalar(0.3 + (c - 0.8) * 5);
    g.rotation.y = 0.5 * Math.sin(t * 0.4) - 0.3;
  });
}

/** Latas: de refresco, de conservas o cubo. */
export function can(k: Kit, p: Params): void {
  const g = k.add(new THREE.Group());
  const v = p.variant ?? 'refresco';
  if (v === 'cubo') {
    const tex = spotsTexture('#b9c0c7', ['#d8dde2', '#9aa2aa', '#e6eaee'], 120, 6);
    const zinc = mat(tex ? '#ffffff' : '#b9c0c7', { metal: 0, rough: 0.55, map: tex, side: THREE.DoubleSide });
    g.add(mesh(lathe([[0, -0.6], [0.45, -0.6], [0.48, -0.55], [0.62, 0.45], [0.66, 0.48]], 40), zinc));
    g.add(mesh(new THREE.TorusGeometry(0.64, 0.025, 8, 48), zinc, [0, 0.47, 0], [Math.PI / 2, 0, 0]));
    const handle = mesh(new THREE.TorusGeometry(0.62, 0.018, 6, 40, Math.PI), metal('#8b939b', 0.4), [0, 0.45, 0]);
    g.add(handle);
    if (p.color2) {
      g.add(mesh(new THREE.CircleGeometry(0.6, 40), mat(p.color2, { rough: 0.8 }), [0, 0.32, 0], [-Math.PI / 2, 0, 0]));
      // Brocha de encalar.
      const brush = new THREE.Group();
      brush.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.8, 10), mat('#b07a45', { rough: 0.6 }), [0, 0.4, 0]));
      brush.add(mesh(roundedBox(0.3, 0.22, 0.12, 0.04), mat('#f2f0ea', { rough: 1 }), [0, -0.02, 0]));
      brush.position.set(0.15, 0.32, 0);
      brush.rotation.z = -0.4;
      g.add(brush);
      k.animate((t) => (brush.rotation.z = -0.4 + 0.15 * Math.sin(t * 1.5)));
    }
    g.rotation.x = 0.35;
    k.animate((t) => {
      handle.rotation.y = 0.3 * Math.sin(t * 1.2);
      g.rotation.y = t * 0.3;
    });
    return;
  }
  const tex =
    v === 'refresco'
      ? canvasTexture(256, 128, (gg, w, h) => {
          gg.fillStyle = p.color ?? '#e53935';
          gg.fillRect(0, 0, w, h);
          gg.strokeStyle = '#ffffff';
          gg.lineWidth = 10;
          gg.beginPath();
          for (let x = 0; x <= w; x += 4) gg.lineTo(x, h * 0.55 + Math.sin((x / w) * Math.PI * 4) * h * 0.12);
          gg.stroke();
          gg.fillStyle = '#ffffff';
          for (let i = 0; i < 4; i++) {
            gg.beginPath();
            gg.arc(30 + i * 64, h * 0.25, 7, 0, Math.PI * 2);
            gg.fill();
          }
        })
      : labelTexture('', p.color ?? '#3f9a4a', '#fff', 256, 128, (gg, w, h) => {
          gg.fillStyle = '#f9e9b8';
          gg.fillRect(0, h * 0.25, w, h * 0.5);
          gg.fillStyle = '#e8743b';
          for (let i = 0; i < 4; i++) {
            gg.beginPath();
            gg.arc(32 + i * 64, h / 2, 18, 0, Math.PI * 2);
            gg.fill();
          }
        });
  const sides = mat(tex ? '#ffffff' : p.color ?? '#e53935', { map: tex, metal: 0.45, rough: 0.3 });
  const alu = metal(v === 'refresco' ? '#d5d9de' : '#c3c8ce', 0.25);
  const body = new THREE.Group();
  if (v === 'refresco') {
    body.add(mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.15, 40, 1, true), sides));
    body.add(mesh(lathe([[0, -0.72], [0.28, -0.72], [0.4, -0.58]], 40), alu));
    body.add(mesh(lathe([[0.4, 0.575], [0.33, 0.69], [0.34, 0.72], [0.3, 0.7], [0, 0.69]], 40), alu));
    body.add(mesh(roundedBox(0.16, 0.015, 0.08, 0.007), alu, [0, 0.705, 0.08]));
  } else {
    body.add(mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.75, 40, 1, true), sides));
    // Aros de la hojalata, arriba y abajo.
    for (const y of [-0.5, -0.43, 0.43, 0.5]) body.add(mesh(new THREE.TorusGeometry(0.475, 0.02, 6, 40), alu, [y > 0 ? 0 : 0, y, 0], [Math.PI / 2, 0, 0]));
    body.add(mesh(new THREE.CylinderGeometry(0.475, 0.475, 0.16, 40, 1, true), alu, [0, -0.46, 0]));
    body.add(mesh(new THREE.CylinderGeometry(0.475, 0.475, 0.16, 40, 1, true), alu, [0, 0.46, 0]));
    body.add(mesh(new THREE.CircleGeometry(0.47, 40), alu, [0, 0.54, 0], [-Math.PI / 2, 0, 0]));
    body.add(mesh(new THREE.CircleGeometry(0.47, 40), alu, [0, -0.54, 0], [Math.PI / 2, 0, 0]));
    for (const r of [0.15, 0.3]) body.add(mesh(new THREE.TorusGeometry(r, 0.012, 6, 40), alu, [0, 0.545, 0], [Math.PI / 2, 0, 0]));
  }
  g.add(body);
  glint(k, body, [0.25, 0.3, 0.33], 2.4, 0.4);
  k.animate((t) => {
    body.rotation.y = t * 0.6;
    g.rotation.z = 0.1 * Math.sin(t * 0.8);
    g.position.y = 0.03 * Math.sin(t * 1.3);
  });
}

/** Baterías: la del móvil, una pila AA o la batería del coche. Con su carga animada. */
export function battery(k: Kit, p: Params): void {
  const g = k.add(new THREE.Group());
  const v = p.variant ?? 'movil';
  const charge: THREE.Mesh[] = [];
  const glow = p.glow ?? '#5cf27a';
  if (v === 'movil') {
    const tex = labelTexture('', p.color ?? '#1f3b73', '#fff', 256, 384, (gg, w, h) => {
      gg.fillStyle = 'rgba(255,255,255,0.12)';
      gg.fillRect(0, h * 0.62, w, h * 0.2);
      drawBolt(gg, w / 2, h * 0.35, 120, '#ffd23f');
      gg.fillStyle = '#ffffff';
      gg.font = 'bold 54px system-ui, sans-serif';
      gg.textAlign = 'center';
      gg.fillText(p.label ?? 'Li', w / 2, h * 0.75);
    });
    g.add(mesh(roundedBox(0.95, 1.4, 0.12, 0.06), mat(p.color ?? '#1f3b73', { rough: 0.35, metal: 0.3 })));
    if (tex) g.add(mesh(new THREE.PlaneGeometry(0.85, 1.28), mat('#ffffff', { map: tex, rough: 0.4 }), [0, 0, 0.062]));
    g.add(mesh(roundedBox(0.3, 0.08, 0.06, 0.02), metal('#d4af37', 0.3), [0, 0.72, 0]));
    // Indicador de carga encima.
    for (let i = 0; i < 4; i++) {
      const c = mesh(roundedBox(0.15, 0.08, 0.04, 0.015), glowMat(glow), [-0.27 + i * 0.18, -0.5, 0.09]);
      g.add(c);
      charge.push(c);
    }
    g.rotation.x = -0.25;
  } else if (v === 'aa') {
    const tex = labelTexture('', p.color ?? '#202124', '#fff', 256, 128, (gg, w, h) => {
      gg.fillStyle = p.color2 ?? '#d4a017';
      gg.fillRect(0, 0, w * 0.35, h);
      gg.fillStyle = '#ffffff';
      gg.font = 'bold 64px system-ui, sans-serif';
      gg.textAlign = 'center';
      gg.textBaseline = 'middle';
      gg.fillText('+', w * 0.17, h / 2);
      gg.fillText(p.label ?? '', w * 0.68, h / 2);
    });
    const cell = new THREE.Group();
    cell.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.4, 40), mat(tex ? '#ffffff' : p.color ?? '#202124', { map: tex, rough: 0.3, metal: 0.4 }), [0, 0, 0], [0, 0, 0]));
    if (tex) tex.rotation = Math.PI / 2;
    cell.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.08, 20), metal('#d0d4d9', 0.2), [0, 0.74, 0]));
    cell.add(mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.02, 32), metal('#d0d4d9', 0.2), [0, -0.71, 0]));
    cell.rotation.z = Math.PI / 2 - 0.3;
    g.add(cell);
    for (let i = 0; i < 3; i++) {
      const c = mesh(new THREE.TorusGeometry(0.33, 0.015, 6, 32), glowMat(glow, 0.8), [0, -0.4 + i * 0.4, 0], [Math.PI / 2, 0, 0]);
      cell.add(c);
      charge.push(c);
    }
  } else {
    // Batería de coche: caja negra con bornes rojo y negro.
    g.add(mesh(roundedBox(1.5, 0.85, 0.85, 0.06), mat(p.color ?? '#2a2d33', { rough: 0.5 }), [0, -0.2, 0]));
    g.add(mesh(roundedBox(1.52, 0.12, 0.87, 0.04), mat('#3a3e45', { rough: 0.5 }), [0, 0.27, 0]));
    const tex = labelTexture('', '#f2c230', '#222', 256, 96, (gg, w, h) => {
      drawBolt(gg, w * 0.2, h / 2, 70, '#222');
      gg.fillStyle = '#222';
      gg.font = 'bold 48px system-ui, sans-serif';
      gg.textAlign = 'center';
      gg.textBaseline = 'middle';
      gg.fillText(p.label ?? '', w * 0.62, h / 2);
    });
    if (tex) g.add(mesh(new THREE.PlaneGeometry(1.0, 0.36), mat('#ffffff', { map: tex }), [0, -0.2, 0.43]));
    for (const [x, c] of [[-0.5, '#d32f2f'], [0.5, '#222']] as const) {
      g.add(mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.15, 16), metal('#b0b4b8', 0.4), [x, 0.4, 0]));
      g.add(mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.05, 16), mat(c), [x, 0.35, 0]));
    }
    const plus = mesh(new THREE.SphereGeometry(0.05, 10, 8), glowMat(glow), [-0.5, 0.5, 0]);
    g.add(plus);
    charge.push(plus);
    g.rotation.x = 0.3;
  }
  k.animate((t) => {
    const level = (t * 0.6) % (charge.length + 1);
    charge.forEach((c, i) => (c.visible = k.calm || i < level));
    g.rotation.y = 0.4 * Math.sin(t * 0.5);
  });
}

/** Imanes: herradura, discos de neodimio, resonancia magnética o motor eléctrico. */
export function magnet(k: Kit, p: Params): void {
  const g = k.add(new THREE.Group());
  const v = p.variant ?? 'herradura';
  const dots = particles(60, p.glow ?? '#8fd0ff', 0.05);
  if (v === 'herradura') {
    const red = mat(p.color ?? '#d93a3a', { rough: 0.35, metal: 0.2 });
    g.add(mesh(new THREE.TorusGeometry(0.4, 0.15, 16, 32, Math.PI), red, [0, -0.05, 0], [0, 0, Math.PI]));
    for (const x of [-0.4, 0.4]) {
      g.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.35, 16), red, [x, 0.12, 0]));
      g.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.2, 16), metal('#cfd4da', 0.25), [x, 0.4, 0]));
    }
    g.add(dots);
    // Líneas de campo: puntos que viajan de un polo al otro por arcos.
    const pos = dots.geometry.attributes.position as THREE.BufferAttribute;
    k.animate((t) => {
      for (let i = 0; i < pos.count; i++) {
        const arc = (i % 4) + 1;
        const u = (t * 0.25 + i / pos.count * 4) % 1;
        const a = Math.PI * u;
        const r = 0.4 + arc * 0.12;
        pos.setXYZ(i, -Math.cos(a) * r, 0.5 + Math.sin(a) * (0.1 + arc * 0.1), 0);
      }
      pos.needsUpdate = true;
      g.rotation.y = 0.5 * Math.sin(t * 0.5);
    });
    // Un clip que se acerca y se pega.
    const clip = mesh(tube([[-0.05, 0, 0], [0.12, 0, 0], [0.12, 0.08, 0], [-0.08, 0.08, 0], [-0.08, 0.02, 0], [0.08, 0.02, 0]], 0.012, 40), metal('#c0c6cc', 0.3));
    g.add(clip);
    k.animate((t) => {
      const c = (t / 3) % 1;
      const y = c < 0.6 ? 0.95 - c * 0.5 : 0.55;
      clip.position.set(0.4, y, 0);
      clip.rotation.z = c < 0.6 ? Math.sin(t * 4) * 0.3 : 0;
    });
  } else if (v === 'discos') {
    const nickel = metal(p.color ?? '#c9ced6', 0.15);
    const stack = new THREE.Group();
    for (let i = 0; i < 4; i++) stack.add(mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.13, 40), nickel, [0, -0.55 + i * 0.14, 0]));
    g.add(stack);
    const top = mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.13, 40), nickel);
    g.add(top);
    glint(k, g, [0.25, -0.1, 0.35], 2.2, 0.4);
    g.add(dots);
    const pos = dots.geometry.attributes.position as THREE.BufferAttribute;
    k.animate((t) => {
      const c = (t / 2.2) % 1;
      // Sube flotando y «clac»: se pega de golpe.
      top.position.y = c < 0.7 ? 0.0 + 0.45 * Math.sin((c / 0.7) * Math.PI * 0.5) : 0.45 - ((c - 0.7) / 0.3) ** 2 * 0.45;
      top.position.y = Math.max(-0.0, top.position.y);
      for (let i = 0; i < pos.count; i++) {
        const arc = (i % 5) + 1;
        const side = i % 2 ? 1 : -1;
        const u = (t * 0.3 + i / pos.count * 5) % 1;
        const a = Math.PI * u;
        pos.setXYZ(i, side * Math.sin(a) * (0.45 + arc * 0.08), -0.35 + Math.cos(a) * (0.3 + arc * 0.08), 0);
      }
      pos.needsUpdate = true;
      g.rotation.y = t * 0.3;
    });
    g.rotation.x = 0.3;
  } else if (v === 'resonancia') {
    const white = mat('#f3f5f8', { rough: 0.3 });
    const ringG = new THREE.Group();
    ringG.add(mesh(new THREE.TorusGeometry(0.55, 0.25, 20, 48), white));
    ringG.add(mesh(new THREE.TorusGeometry(0.42, 0.03, 8, 48), glowMat(p.glow ?? '#4fc3f7'), [0, 0, 0.18]));
    ringG.position.y = 0.1;
    g.add(ringG);
    g.add(mesh(roundedBox(0.5, 0.25, 0.4, 0.05), white, [0, -0.5, 0]));
    const bed = mesh(roundedBox(0.36, 0.06, 1.5, 0.03), mat('#9fb7cf', { rough: 0.4 }), [0, -0.12, 0.5]);
    g.add(bed);
    g.rotation.y = -0.6;
    k.animate((t) => {
      bed.position.z = 0.4 + 0.35 * Math.sin(t * 0.6);
      g.rotation.y = -0.6 + 0.2 * Math.sin(t * 0.3);
    });
  } else {
    // Motor eléctrico abierto: carcasa, bobinas de cobre y rotor con imanes.
    const housing = mat(p.color ?? '#4b5563', { metal: 0.6, rough: 0.35, side: THREE.DoubleSide });
    g.add(mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.7, 36, 1, true, 0, Math.PI * 1.5), housing, [0, 0, 0], [Math.PI / 2, 0, 0]));
    g.add(mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.05, 36), housing, [0, 0, -0.35], [Math.PI / 2, 0, 0]));
    const copper = metal('#d9822b', 0.3);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.add(mesh(new THREE.TorusGeometry(0.1, 0.05, 8, 16), copper, [Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0], [0, Math.PI / 2, a]));
    }
    const rotor = new THREE.Group();
    rotor.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.6, 24), metal('#9aa3ad', 0.3), [0, 0, 0], [Math.PI / 2, 0, 0]));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      rotor.add(mesh(roundedBox(0.12, 0.2, 0.62, 0.03), mat(i % 2 ? '#d93a3a' : '#2f6fd8', { rough: 0.4 }), [Math.cos(a) * 0.3, Math.sin(a) * 0.3, 0], [0, 0, a]));
    }
    rotor.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.3, 12), metal('#d0d4d9', 0.2), [0, 0, 0.3], [Math.PI / 2, 0, 0]));
    g.add(rotor);
    g.rotation.set(0.3, -0.6, 0);
    k.animate((t) => (rotor.rotation.z = t * 4));
  }
}

/** Implante dental: muela blanca sobre un tornillo de titanio, en la encía. */
export function implant(k: Kit, p: Params): void {
  const g = k.add(new THREE.Group());
  const tooth = mesh(lathe([[0, 0.05], [0.32, 0.05], [0.4, 0.2], [0.42, 0.4], [0.36, 0.52], [0.2, 0.58], [0, 0.55]], 32), mat('#fbfaf5', { rough: 0.25 }));
  tooth.position.y = 0.2;
  g.add(tooth);
  // Cúspides de la muela.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    g.add(mesh(new THREE.SphereGeometry(0.13, 14, 10), mat('#fbfaf5', { rough: 0.25 }), [Math.cos(a) * 0.18, 0.74, Math.sin(a) * 0.18]));
  }
  const ti = metal(p.color ?? '#a9b2bd', 0.3);
  g.add(mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.2, 20), ti, [0, 0.15, 0]));
  g.add(mesh(new THREE.CylinderGeometry(0.14, 0.08, 0.75, 20), ti, [0, -0.35, 0]));
  const pts: Array<[number, number, number]> = [];
  for (let i = 0; i <= 160; i++) {
    const a = (i / 20) * Math.PI;
    const y = 0.0 - (i / 160) * 0.68;
    const r = 0.14 - (i / 160) * 0.05;
    pts.push([Math.cos(a) * r, y, Math.sin(a) * r]);
  }
  g.add(mesh(tube(pts, 0.03, 320), ti));
  const gum = mesh(new THREE.SphereGeometry(0.55, 32, 16), mat('#f08a9b', { rough: 0.5, opacity: 0.6 }), [0, -0.28, 0]);
  gum.scale.y = 0.35;
  g.add(gum);
  glint(k, g, [0.15, 0.6, 0.35], 2.2, 0.45);
  k.animate((t) => {
    g.rotation.y = t * 0.5;
    g.position.y = 0.03 * Math.sin(t * 1.4);
  });
}

/** Motor de avión con el ventilador girando. */
export function turbine(k: Kit, p: Params): void {
  const g = k.add(new THREE.Group());
  g.rotation.y = -0.55;
  const cowl = mat(p.color ?? '#eef1f5', { rough: 0.3, metal: 0.3, side: THREE.DoubleSide });
  const nac = mesh(lathe([[0.55, -0.7], [0.62, -0.4], [0.66, 0.1], [0.66, 0.45], [0.6, 0.6], [0.55, 0.62], [0.52, 0.55]], 40), cowl);
  nac.rotation.x = Math.PI / 2;
  g.add(nac);
  g.add(mesh(new THREE.TorusGeometry(0.58, 0.05, 10, 40), metal('#c3c9d0', 0.25), [0, 0, 0.6]));
  const fan = new THREE.Group();
  fan.position.z = 0.35;
  fan.add(mesh(new THREE.ConeGeometry(0.15, 0.3, 24), metal('#d9dde2', 0.2), [0, 0, 0.15], [Math.PI / 2, 0, 0]));
  const blade = metal(p.color2 ?? '#8a929c', 0.3, { side: THREE.DoubleSide });
  for (let i = 0; i < 14; i++) {
    const b = mesh(new THREE.BoxGeometry(0.1, 0.45, 0.01), blade);
    const a = (i / 14) * Math.PI * 2;
    b.position.set(Math.cos(a) * 0.32, Math.sin(a) * 0.32, 0);
    b.rotation.set(0, 0.6, a - Math.PI / 2);
    fan.add(b);
  }
  g.add(fan);
  g.add(mesh(new THREE.CircleGeometry(0.55, 32), mat('#1d2026'), [0, 0, 0.0]));
  const exhaust = halo(p.glow ?? '#ff9d4a', 0.9, 0.5);
  exhaust.position.z = -0.75;
  g.add(exhaust);
  g.add(mesh(new THREE.ConeGeometry(0.2, 0.35, 24), metal('#6d747c', 0.4), [0, 0, -0.8], [-Math.PI / 2, 0, 0]));
  k.animate((t) => {
    fan.rotation.z = -t * 9;
    (exhaust.material as THREE.SpriteMaterial).opacity = 0.4 + 0.15 * Math.sin(t * 7);
    g.rotation.y = -0.55 + 0.25 * Math.sin(t * 0.4);
  });
}
