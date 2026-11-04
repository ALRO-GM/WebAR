import * as THREE from 'three';
import {
  canvasTexture,
  emitter,
  glass,
  glowMat,
  halo,
  lathe,
  mat,
  mesh,
  metal,
  particles,
  roundedBox,
  seeded,
  spotsTexture,
  tube,
  wave,
  type Kit,
  type Params,
} from '../kit';

// Arquetipos de luz, fuego y cielo: estrellas, lámparas, llamas, nubes, cohetes.

/** El Sol: bola incandescente con granulación, corona que respira y protuberancias. */
export function star(k: Kit, p: Params): void {
  const glow = p.glow ?? '#ffb02e';
  const tex = canvasTexture(256, 128, (g, w, h) => {
    const r = seeded(p.seed ?? 3);
    g.fillStyle = p.color ?? '#ff9a1f';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {
      const x = r() * w;
      const y = r() * h;
      const rad = 3 + r() * 9;
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      grd.addColorStop(0, r() > 0.5 ? 'rgba(255,240,150,0.9)' : 'rgba(255,110,0,0.7)');
      grd.addColorStop(1, 'rgba(255,150,0,0)');
      g.fillStyle = grd;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  });
  const body = k.add(mesh(new THREE.SphereGeometry(0.6, 40, 28), new THREE.MeshBasicMaterial({ color: '#ffffff', map: tex, toneMapped: false })));
  if (!tex) (body.material as THREE.MeshBasicMaterial).color.set(p.color ?? '#ffa726');
  const corona = k.add(halo(glow, 2.0, 0.85));
  const corona2 = k.add(halo('#fff2b0', 1.45, 0.7));
  // Corona visible también sobre fondo claro: capa translúcida y rayos que laten.
  const shellMat = new THREE.MeshBasicMaterial({ color: '#ffb52e', transparent: true, opacity: 0.28, depthWrite: false, toneMapped: false });
  const shell = k.add(mesh(new THREE.SphereGeometry(0.68, 32, 20), shellMat));
  const rayMat = glowMat('#ffc93a', 0.9);
  const rays: THREE.Mesh[] = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const ray = mesh(new THREE.ConeGeometry(0.06, 0.22, 8), rayMat, [Math.cos(a) * 0.8, Math.sin(a) * 0.8, -0.1], [0, 0, a - Math.PI / 2]);
    k.add(ray);
    rays.push(ray);
  }
  // Protuberancias: arcos de plasma que crecen y menguan.
  const arcMat = glowMat('#ff5a1a', 0.95);
  const arcs: Array<{ g: THREE.Group; ph: number; sp: number }> = [];
  const r = seeded(11);
  for (let i = 0; i < 9; i++) {
    const g = new THREE.Group();
    const dir = new THREE.Vector3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1).normalize();
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    g.rotateY(r() * Math.PI);
    const arc = mesh(new THREE.TorusGeometry(0.1 + r() * 0.06, 0.022, 6, 18, Math.PI), arcMat);
    arc.position.y = 0.55;
    g.add(arc);
    body.add(g);
    arcs.push({ g: arc as unknown as THREE.Group, ph: r() * 6, sp: 0.8 + r() * 0.8 });
  }
  k.animate((t) => {
    body.rotation.y = t * 0.15;
    const s = 1 + 0.06 * Math.sin(t * 1.3) + 0.03 * wave(t, 1);
    corona.scale.setScalar(2.0 * s);
    corona2.scale.setScalar(1.45 * (1 + 0.04 * Math.sin(t * 2.1)));
    shell.scale.setScalar(s);
    shellMat.opacity = 0.22 + 0.08 * Math.sin(t * 1.7);
    rays.forEach((ray, i) => ray.scale.set(1, 0.7 + 0.45 * (0.5 + 0.5 * Math.sin(t * 2 + i * 1.3)), 1));
    for (const a of arcs) {
      const v = 0.5 + 0.5 * Math.sin(t * a.sp + a.ph);
      a.g.scale.set(1, 0.3 + v * 1.4, 1);
    }
  });
}

/** Globos: dirigible plateado o globo de fiesta con su cuerda. Flotan. */
export function balloon(k: Kit, p: Params): void {
  const g = k.add(new THREE.Group());
  const color = p.color ?? '#dfe5ec';
  if (p.variant === 'dirigible') {
    const hull = mesh(new THREE.SphereGeometry(0.5, 32, 20), mat(color, { metal: 0.6, rough: 0.35 }));
    hull.scale.set(1.75, 0.62, 0.62);
    g.add(hull);
    // Costillas del armazón.
    const ribMat = mat('#b9c2cc', { metal: 0.7, rough: 0.4 });
    for (let i = -3; i <= 3; i++) {
      const x = i * 0.2;
      const rr = 0.31 * Math.sqrt(Math.max(0, 1 - (x / 0.875) ** 2));
      g.add(mesh(new THREE.TorusGeometry(rr + 0.003, 0.006, 4, 32), ribMat, [x, 0, 0], [0, Math.PI / 2, 0]));
    }
    const finMat = mat(p.color2 ?? '#e5484d', { rough: 0.5 });
    for (let i = 0; i < 4; i++) {
      const fin = mesh(roundedBox(0.28, 0.2, 0.025, 0.01), finMat);
      const a = (i * Math.PI) / 2;
      fin.position.set(-0.74, Math.cos(a) * 0.17, Math.sin(a) * 0.17);
      fin.rotation.x = a;
      g.add(fin);
    }
    const gondola = mesh(roundedBox(0.3, 0.08, 0.1, 0.03), mat('#6b5b4b', { rough: 0.6 }), [0.05, -0.36, 0]);
    g.add(gondola);
    const windows = mesh(roundedBox(0.24, 0.025, 0.105, 0.01), glowMat('#ffe9a8'), [0.05, -0.355, 0]);
    g.add(windows);
    const prop = new THREE.Group();
    prop.position.set(-0.13, -0.36, 0);
    for (let i = 0; i < 3; i++) prop.add(mesh(roundedBox(0.012, 0.11, 0.025, 0.005), mat('#333'), [0, 0, 0], [(i * Math.PI * 2) / 3, 0, 0]));
    g.add(prop);
    g.rotation.y = -0.5;
    k.animate((t) => {
      g.position.y = 0.06 * Math.sin(t * 0.9);
      g.rotation.z = 0.05 * Math.sin(t * 0.7);
      prop.rotation.x = t * 14;
    });
    return;
  }
  // Globo de fiesta.
  const ball = mesh(lathe([[0, -0.55], [0.08, -0.5], [0.33, -0.32], [0.45, 0], [0.43, 0.22], [0.3, 0.42], [0, 0.5]], 32), mat(color, { rough: 0.15, metal: 0.05 }));
  ball.position.y = 0.3;
  g.add(ball);
  g.add(mesh(new THREE.ConeGeometry(0.05, 0.06, 12), mat(color), [0, -0.28, 0]));
  const string = mesh(tube([[0, -0.3, 0], [0.05, -0.5, 0.02], [-0.04, -0.7, 0], [0.02, -0.95, 0]], 0.006, 24), mat('#888'));
  g.add(string);
  k.animate((t) => {
    g.position.y = 0.05 * Math.sin(t * 1.1);
    g.rotation.z = 0.08 * Math.sin(t * 0.8);
  });
}

/** Letrero de neón (corazón) que zumba y parpadea un poco, o tubo de descarga. */
export function neon(k: Kit, p: Params): void {
  const glow = p.glow ?? '#ff5a36';
  const coreMat = glowMat(new THREE.Color(glow).lerp(new THREE.Color('#ffffff'), 0.55));
  const outerMat = new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.45, depthWrite: false, toneMapped: false });
  const g = k.add(new THREE.Group());
  let light: THREE.Sprite;
  if (p.variant === 'tubo') {
    // Tubo de descarga: cristal con electrodos y el gas brillando dentro.
    g.rotation.z = Math.PI / 2.4;
    g.add(mesh(new THREE.CylinderGeometry(0.11, 0.11, 1.45, 24, 1, true), glass('#ffffff', 0.25)));
    g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.3, 16), coreMat));
    g.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.3, 16), outerMat));
    for (const s of [-1, 1]) {
      g.add(mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.16, 24), metal('#c9ced6', 0.3), [0, s * 0.78, 0]));
      g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.18, 8), metal('#8a8f96'), [0, s * 0.92, 0]));
    }
    light = halo(glow, 1.0, 0.35);
    g.add(light);
  } else {
    // Corazón de neón sobre una placa oscura.
    const pts: Array<[number, number, number]> = [];
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const x = 16 * Math.sin(a) ** 3;
      const y = 13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a);
      pts.push([x * 0.042, y * 0.042 + 0.08, 0.06]);
    }
    g.add(mesh(tube(pts, 0.035, 160, true), coreMat));
    g.add(mesh(tube(pts, 0.075, 120, true), outerMat));
    g.add(mesh(roundedBox(1.6, 1.4, 0.06, 0.06), mat('#1d2230', { rough: 0.6 }), [0, 0.05, -0.04]));
    for (const [x, y] of [[-0.6, 0.6], [0.6, 0.6], [-0.6, -0.5], [0.6, -0.5]]) g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.1, 8), metal('#aaa'), [x, y, 0.02], [Math.PI / 2, 0, 0]));
    light = halo(glow, 2.2, 0.55);
    light.position.z = 0.1;
    g.add(light);
    g.rotation.x = -0.15;
  }
  // Parpadeo suave (≤ 3 cortes por segundo, nunca a oscuras del todo); en calma, fijo.
  k.animate((t) => {
    let on = 0.9 + 0.1 * Math.sin(t * 9);
    if (!k.calm) {
      const cycle = t % 4;
      if (cycle > 3.2 && cycle < 3.3) on = 0.35;
      else if (cycle > 3.45 && cycle < 3.52) on = 0.5;
    }
    outerMat.opacity = 0.45 * on;
    (light.material as THREE.SpriteMaterial).opacity = 0.6 * on;
    coreMat.color.set(glow).lerp(new THREE.Color('#ffffff'), 0.55 * on);
    g.rotation.y = 0.25 * Math.sin(t * 0.4);
  });
}

/** Bombillas: de filamento, de bajo consumo (espiral) o faro de xenón. */
export function bulb(k: Kit, p: Params): void {
  const glow = p.glow ?? '#ffb347';
  const g = k.add(new THREE.Group());
  if (p.variant === 'faro') {
    // Faro de coche: carcasa, reflector y un haz azulado.
    g.rotation.y = -0.6;
    g.add(mesh(roundedBox(1.2, 0.75, 0.5, 0.15), mat('#2a2f38', { rough: 0.4, metal: 0.3 }), [0, 0, -0.15]));
    for (const x of [-0.27, 0.27]) {
      const refl = mesh(lathe([[0.02, -0.15], [0.12, -0.12], [0.22, -0.02], [0.26, 0.1]], 28), metal('#e8edf2', 0.08, { side: THREE.DoubleSide }));
      refl.rotation.x = Math.PI / 2;
      refl.position.set(x, 0, 0.0);
      g.add(refl);
      g.add(mesh(new THREE.SphereGeometry(0.07, 16, 12), glowMat('#f2f8ff'), [x, 0, 0]));
      const h = halo(glow, 0.9, 0.9);
      h.position.set(x, 0, 0.12);
      g.add(h);
    }
    g.add(mesh(roundedBox(1.15, 0.7, 0.04, 0.12), glass('#dcefff', 0.2), [0, 0, 0.12]));
    const beam = mesh(new THREE.ConeGeometry(0.45, 1.0, 24, 1, true), new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    beam.rotation.x = -Math.PI / 2;
    beam.position.set(0, 0, 0.62);
    g.add(beam);
    k.animate((t) => {
      (beam.material as THREE.MeshBasicMaterial).opacity = 0.15 + 0.05 * Math.sin(t * 2);
      g.rotation.y = -0.6 + 0.25 * Math.sin(t * 0.5);
    });
    return;
  }
  const base = new THREE.Group();
  base.position.y = -0.5;
  g.add(base);
  // Casquillo de rosca.
  const screw = metal('#c9b88f', 0.3);
  base.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.3, 24), screw, [0, 0, 0]));
  for (let i = 0; i < 4; i++) base.add(mesh(new THREE.TorusGeometry(0.2, 0.02, 6, 24), screw, [0, -0.11 + i * 0.07, 0], [Math.PI / 2, 0, 0]));
  base.add(mesh(new THREE.SphereGeometry(0.08, 12, 8), mat('#222'), [0, -0.17, 0]));
  let pulse: THREE.MeshBasicMaterial;
  if (p.variant === 'espiral') {
    base.add(mesh(new THREE.CylinderGeometry(0.24, 0.21, 0.22, 24), mat('#f4f4f4', { rough: 0.4 }), [0, 0.25, 0]));
    const pts: Array<[number, number, number]> = [];
    for (let i = 0; i <= 120; i++) {
      const a = (i / 120) * Math.PI * 2 * 4;
      pts.push([Math.cos(a) * 0.2, -0.1 + (i / 120) * 0.95, Math.sin(a) * 0.2]);
    }
    pulse = glowMat('#f3fff0');
    g.add(mesh(tube(pts, 0.055, 240), pulse));
    const h = halo(glow, 0.9, 0.3);
    h.position.y = 0.35;
    g.add(h);
  } else {
    const bulbGlass = mesh(lathe([[0.16, -0.32], [0.18, -0.2], [0.42, 0.1], [0.45, 0.3], [0.38, 0.55], [0.2, 0.68], [0, 0.72]], 32), glass('#fff8e6', 0.22));
    g.add(bulbGlass);
    // Soportes y filamento en zigzag.
    const wire = metal('#9aa0a6', 0.4);
    g.add(mesh(new THREE.CylinderGeometry(0.03, 0.06, 0.3, 12), glass('#ffffff', 0.4), [0, -0.18, 0]));
    for (const x of [-0.15, 0.15]) g.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.5, 6), wire, [x * 0.8, 0.0, 0], [0, 0, x > 0 ? -0.25 : 0.25]));
    const pts: Array<[number, number, number]> = [];
    for (let i = 0; i <= 10; i++) pts.push([-0.18 + i * 0.036, 0.25 + (i % 2 ? 0.05 : -0.02), 0]);
    pulse = glowMat('#fff0c0');
    g.add(mesh(tube(pts, 0.014, 80), pulse));
    const h = halo(glow, 1.5, 0.75);
    h.position.y = 0.25;
    g.add(h);
  }
  const hal = g.children.find((c) => c instanceof THREE.Sprite) as THREE.Sprite;
  const haloBase = (hal.material as THREE.SpriteMaterial).opacity;
  k.animate((t) => {
    const s = 0.85 + 0.15 * Math.sin(t * 1.6);
    (hal.material as THREE.SpriteMaterial).opacity = haloBase * s;
    pulse.color.setRGB(1, 0.9 + 0.1 * s, 0.75 + 0.25 * s);
    g.rotation.y = t * 0.3;
  });
}

/** Farola de sodio, foco de estadio o farol de camping. */
export function lamp(k: Kit, p: Params): void {
  const glow = p.glow ?? '#ff9d2e';
  const g = k.add(new THREE.Group());
  const pole = mat(p.color ?? '#3d4a5c', { metal: 0.5, rough: 0.45 });
  let halos: THREE.Sprite[] = [];
  if (p.variant === 'farol') {
    g.add(mesh(new THREE.CylinderGeometry(0.35, 0.4, 0.2, 24), mat(p.color ?? '#2e7d4f', { rough: 0.4 }), [0, -0.68, 0]));
    g.add(mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.7, 24, 1, true), glass('#ffffff', 0.25), [0, -0.23, 0]));
    // La camisa incandescente.
    const mantle = mesh(new THREE.SphereGeometry(0.11, 16, 12), glowMat('#fffdf2'), [0, -0.2, 0]);
    mantle.scale.y = 1.4;
    g.add(mantle);
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      g.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.7, 6), pole, [Math.cos(a) * 0.29, -0.23, Math.sin(a) * 0.29]));
    }
    g.add(mesh(new THREE.ConeGeometry(0.38, 0.22, 24), mat(p.color ?? '#2e7d4f', { rough: 0.4 }), [0, 0.23, 0]));
    g.add(mesh(new THREE.TorusGeometry(0.22, 0.02, 8, 24, Math.PI), metal('#999'), [0, 0.38, 0]));
    const h = halo(glow, 1.6, 0.8);
    h.position.y = -0.2;
    g.add(h);
    halos = [h];
  } else if (p.variant === 'estadio') {
    g.add(mesh(new THREE.CylinderGeometry(0.04, 0.07, 1.4, 12), pole, [0, -0.3, 0]));
    g.add(mesh(roundedBox(1.0, 0.62, 0.1, 0.03), pole, [0, 0.55, -0.02]));
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 4; c++) {
        const x = -0.36 + c * 0.24;
        const y = 0.36 + r * 0.19;
        g.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 16), glowMat('#fbfdff'), [x, y, 0.05], [Math.PI / 2, 0, 0]));
        const h = halo(glow, 0.45, 0.7);
        h.position.set(x, y, 0.1);
        g.add(h);
        halos.push(h);
      }
    g.rotation.x = 0.25;
  } else {
    // Farola: poste, brazo curvo y cabeza con luz naranja.
    g.add(mesh(new THREE.CylinderGeometry(0.035, 0.06, 1.6, 12), pole, [-0.35, -0.15, 0]));
    g.add(mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.1, 16), pole, [-0.35, -0.92, 0]));
    g.add(mesh(tube([[-0.35, 0.6, 0], [-0.3, 0.78, 0], [-0.1, 0.84, 0], [0.25, 0.8, 0]], 0.03, 32), pole));
    g.add(mesh(lathe([[0, 0.06], [0.2, 0.04], [0.25, -0.04], [0.2, -0.06]], 24), pole, [0.3, 0.76, 0]));
    g.add(mesh(new THREE.SphereGeometry(0.15, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), glowMat('#ffd27a'), [0.3, 0.72, 0]));
    const cone = mesh(new THREE.ConeGeometry(0.55, 1.4, 24, 1, true), new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }), [0.3, 0.02, 0]);
    g.add(cone);
    const h = halo(glow, 1.3, 0.85);
    h.position.set(0.3, 0.68, 0);
    g.add(h);
    halos = [h];
    const pool = mesh(new THREE.CircleGeometry(0.5, 32), new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.25, depthWrite: false, toneMapped: false }), [0.3, -0.96, 0], [-Math.PI / 2, 0, 0]);
    g.add(pool);
  }
  k.animate((t) => {
    for (const [i, h] of halos.entries()) (h.material as THREE.SpriteMaterial).opacity = 0.7 + 0.15 * Math.sin(t * 2 + i * 0.7);
    g.rotation.y = 0.35 * Math.sin(t * 0.4);
  });
}

/** Led de 5 mm con sus dos patas, que brilla y respira. */
export function led(k: Kit, p: Params): void {
  const glow = p.glow ?? '#3d7bff';
  const g = k.add(new THREE.Group());
  const domeMat = mat(p.color ?? glow, { opacity: 0.75, rough: 0.1, emissive: glow, emissiveIntensity: 0.6 });
  const dome = mesh(lathe([[0, -0.15], [0.3, -0.15], [0.3, 0.32], [0.26, 0.48], [0.15, 0.58], [0, 0.61]], 32), domeMat);
  g.add(dome);
  g.add(mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.06, 32), domeMat, [0, -0.18, 0]));
  const chip = mesh(new THREE.BoxGeometry(0.08, 0.06, 0.08), glowMat('#ffffff'), [0, 0.18, 0]);
  g.add(chip);
  const leg = metal('#d7dbe0', 0.3);
  g.add(mesh(tube([[-0.1, -0.2, 0], [-0.1, -0.95, 0]], 0.022, 4), leg));
  g.add(mesh(tube([[0.1, -0.2, 0], [0.1, -0.6, 0], [0.2, -0.7, 0], [0.2, -0.98, 0]], 0.022, 16), leg));
  const h = halo(glow, 1.1, 0.7);
  h.position.y = 0.25;
  g.add(h);
  const h2 = halo('#ffffff', 0.5, 0.9);
  h2.position.y = 0.2;
  g.add(h2);
  k.animate((t) => {
    const s = 0.8 + 0.2 * Math.sin(t * 2.2);
    (h.material as THREE.SpriteMaterial).opacity = 0.8 * s;
    h.scale.setScalar(1.0 + 0.2 * s);
    domeMat.emissiveIntensity = 0.4 + 0.4 * s;
    g.rotation.y = t * 0.4;
  });
}

/** Láser médico: pieza de mano con un haz y un punto que chisporrotea. */
export function laser(k: Kit, p: Params): void {
  const glow = p.glow ?? '#36ff7a';
  const g = k.add(new THREE.Group());
  const body = new THREE.Group();
  body.position.set(-0.3, 0.35, 0);
  body.rotation.z = -0.9;
  g.add(body);
  body.add(mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.9, 24), mat(p.color ?? '#e9eef4', { rough: 0.3, metal: 0.2 }), [0, 0.2, 0]));
  body.add(mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.12, 24), mat(p.color2 ?? '#2a9df4', { rough: 0.3 }), [0, -0.05, 0]));
  body.add(mesh(new THREE.CylinderGeometry(0.06, 0.12, 0.2, 24), metal('#b8c0c8', 0.25), [0, -0.35, 0]));
  body.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.8, 8), mat('#333'), [0, 0.9, 0]));
  const beamMat = new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false });
  const beam = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.7, 8), beamMat, [0, -0.8, 0]);
  body.add(beam);
  const spot = halo(glow, 0.5, 1);
  spot.position.set(0, -1.15, 0);
  body.add(spot);
  const target = mesh(new THREE.DodecahedronGeometry(0.16, 0), mat('#c9a979', { rough: 0.8, flat: true }));
  const tp = new THREE.Vector3();
  spot.getWorldPosition(tp);
  g.updateMatrixWorld(true);
  spot.getWorldPosition(tp);
  target.position.copy(tp).add(new THREE.Vector3(0.05, -0.08, 0));
  g.add(target);
  const sparks = particles(30, glow, 0.09);
  g.add(sparks);
  emitter(k, sparks, (_i, o, v) => {
    o.copy(tp);
    v.set(k.rand() - 0.5, k.rand() * 0.8, k.rand() - 0.5).multiplyScalar(0.8);
  }, { life: 0.5, gravity: 1.5 });
  k.animate((t) => {
    beamMat.opacity = 0.6 + 0.3 * Math.sin(t * 20) ** 2;
    spot.scale.setScalar(0.4 + 0.15 * Math.abs(Math.sin(t * 7)));
    g.rotation.y = 0.3 * Math.sin(t * 0.5);
  });
}

/** La Tierra con su capa de ozono (o con su atmósfera de nitrógeno). */
export function planet(k: Kit, p: Params): void {
  const tex = canvasTexture(256, 128, (g, w, h) => {
    const r = seeded(p.seed ?? 5);
    g.fillStyle = '#2f7fd8';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) {
      const x = r() * w;
      const y = h * 0.2 + r() * h * 0.6;
      g.fillStyle = r() > 0.3 ? '#4caf50' : '#c8a96a';
      g.beginPath();
      g.ellipse(x, y, 8 + r() * 22, 6 + r() * 14, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#f4f8ff';
    g.fillRect(0, 0, w, h * 0.08);
    g.fillRect(0, h * 0.92, w, h * 0.08);
  });
  const earth = k.add(mesh(new THREE.SphereGeometry(0.55, 40, 28), mat(tex ? '#ffffff' : '#2f7fd8', { map: tex, rough: 0.7 })));
  const layerColor = p.glow ?? '#7fe3ff';
  const layer = k.add(mesh(new THREE.SphereGeometry(p.variant === 'atmosfera' ? 0.7 : 0.66, 40, 28), new THREE.MeshBasicMaterial({ color: layerColor, transparent: true, opacity: 0.22, depthWrite: false, toneMapped: false })));
  const rim = k.add(halo(layerColor, 1.7, 0.45));
  if (p.variant === 'atmosfera') {
    // Moléculas de N₂ (pesas de dos bolas) dando vueltas.
    const molMat = mat('#3050f8', { rough: 0.3 });
    const geo = new THREE.SphereGeometry(0.045, 12, 8);
    const mols: THREE.Group[] = [];
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Group();
      m.add(mesh(geo, molMat, [-0.04, 0, 0]), mesh(geo, molMat, [0.04, 0, 0]));
      k.add(m);
      mols.push(m);
    }
    k.animate((t) => {
      mols.forEach((m, i) => {
        const a = t * 0.5 + (i / mols.length) * Math.PI * 2;
        const tilt = (i % 3) * 0.6 - 0.6;
        m.position.set(Math.cos(a) * 0.8, Math.sin(a) * 0.8 * Math.sin(tilt) + Math.sin(i) * 0.15, Math.sin(a) * 0.8 * Math.cos(tilt));
        m.rotation.set(t * 2 + i, t * 1.5, 0);
      });
    });
  } else {
    // Rayos ultravioleta que llegan y rebotan en la capa.
    const rayMat = new THREE.MeshBasicMaterial({ color: '#b46bff', transparent: true, opacity: 0.9, toneMapped: false });
    const rays: THREE.Mesh[] = [];
    for (let i = 0; i < 4; i++) {
      const ray = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.22, 6), rayMat);
      k.add(ray);
      rays.push(ray);
    }
    const flash = k.add(halo('#d7b8ff', 0.4, 0));
    k.animate((t) => {
      rays.forEach((ray, i) => {
        const ph = ((t * 0.5 + i / rays.length) % 1) * 2; // 0..1 baja, 1..2 rebota
        const ang = -0.6 + i * 0.4;
        const dir = new THREE.Vector3(Math.sin(ang), Math.cos(ang), 0.35).normalize();
        const dist = ph < 1 ? 1.15 - ph * 0.45 : 0.7 + (ph - 1) * 0.45;
        ray.position.copy(dir).multiplyScalar(dist);
        ray.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        ray.visible = dist < 1.1;
        if (i === 0) {
          flash.position.copy(dir).multiplyScalar(0.68);
          (flash.material as THREE.SpriteMaterial).opacity = Math.max(0, 1 - Math.abs(ph - 1) * 5);
        }
      });
    });
  }
  k.animate((t) => {
    earth.rotation.y = t * 0.25;
    (layer.material as THREE.MeshBasicMaterial).opacity = 0.2 + 0.05 * Math.sin(t * 1.5);
    rim.scale.setScalar(1.7 + 0.05 * Math.sin(t));
  });
}

/** Nubes: de gas de color, de tormenta con rayo, de contaminación, de lluvia ácida o de radón. */
export function cloud(k: Kit, p: Params): void {
  const color = p.color ?? '#c8e06a';
  const g = k.add(new THREE.Group());
  const v = p.variant ?? 'gas';
  const puffs: Array<{ m: THREE.Mesh; base: number; ph: number }> = [];
  const puffMat = mat(color, { rough: 0.9, opacity: v === 'gas' || v === 'radon' ? 0.72 : 1, emissive: color, emissiveIntensity: v === 'gas' ? 0.25 : 0.05 });
  const addPuffs = (cy: number, spread: number, n: number, size: number) => {
    const r = seeded(p.seed ?? 7);
    for (let i = 0; i < n; i++) {
      const s = size * (0.6 + r() * 0.6);
      const m = mesh(new THREE.IcosahedronGeometry(1, 2), puffMat, [(r() - 0.5) * spread * 2, cy + (r() - 0.4) * spread * 0.7, (r() - 0.5) * spread]);
      m.scale.setScalar(s);
      g.add(m);
      puffs.push({ m, base: s, ph: r() * 6 });
    }
  };
  if (v === 'smog') {
    // Edificios bajo una boina parda.
    const r = seeded(4);
    const bm = [mat('#8fa3b8', { rough: 0.6 }), mat('#b4c2d0', { rough: 0.6 }), mat('#71859a', { rough: 0.6 })];
    for (let i = 0; i < 9; i++) {
      const h = 0.3 + r() * 0.7;
      const x = -0.7 + (i % 5) * 0.34 + (r() - 0.5) * 0.08;
      const z = i < 5 ? -0.15 : 0.22;
      g.add(mesh(new THREE.BoxGeometry(0.22, h, 0.22), bm[i % 3], [x, -0.9 + h / 2, z]));
    }
    addPuffs(0.25, 0.75, 12, 0.24);
    puffMat.opacity = 0.8;
    puffMat.transparent = true;
  } else if (v === 'radon') {
    // Roca de granito de la que sale un gas que brilla un poco.
    const tex = spotsTexture('#c9b9b0', ['#2b2b2b', '#f2e6e0', '#9c7f74', '#e8b4a0'], 220, 3);
    const rock = mesh(new THREE.DodecahedronGeometry(0.55, 1), mat(tex ? '#ffffff' : '#c9b9b0', { map: tex, rough: 0.85, flat: true }), [0, -0.5, 0]);
    rock.scale.set(1.3, 0.7, 1);
    g.add(rock);
    const gas = particles(40, color, 0.22);
    g.add(gas);
    emitter(k, gas, (_i, o, vel) => {
      o.set((k.rand() - 0.5) * 0.7, -0.2, (k.rand() - 0.5) * 0.5);
      vel.set((k.rand() - 0.5) * 0.15, 0.35 + k.rand() * 0.2, (k.rand() - 0.5) * 0.15);
    }, { life: 3.4 });
  } else {
    addPuffs(v === 'gas' ? 0 : 0.3, v === 'gas' ? 0.55 : 0.6, v === 'gas' ? 14 : 11, v === 'gas' ? 0.3 : 0.28);
  }
  if (v === 'tormenta') {
    const pts: Array<[number, number, number]> = [[0.05, 0.05, 0.1], [-0.12, -0.25, 0.1], [0.06, -0.3, 0.1], [-0.1, -0.65, 0.1], [0.1, -0.7, 0.1], [-0.05, -1.0, 0.1]];
    const boltMat = glowMat('#fff6a0');
    const bolt = mesh(tube(pts, 0.035, 40), boltMat);
    g.add(bolt);
    const flash = halo('#fff3b0', 1.8, 0);
    flash.position.y = -0.3;
    g.add(flash);
    k.animate((t) => {
      // Un destello cada 3 s; en calma, el rayo se queda quieto y tenue.
      const c = t % 3;
      const on = k.calm ? 0.5 : c < 0.12 || (c > 0.22 && c < 0.3) ? 1 : 0.15;
      (flash.material as THREE.SpriteMaterial).opacity = on * 0.8;
      boltMat.color.setScalar(0.4 + on * 0.6);
      puffMat.emissiveIntensity = 0.05 + on * 0.25;
    });
  }
  if (v === 'lluvia') {
    const dropMat = mat(p.glow ?? '#d6e86a', { rough: 0.1, opacity: 0.85, emissive: p.glow ?? '#d6e86a', emissiveIntensity: 0.2 });
    const dropGeo = new THREE.SphereGeometry(0.03, 8, 6);
    const drops = Array.from({ length: 16 }, (_, i) => {
      const m = mesh(dropGeo, dropMat);
      m.scale.y = 2.2;
      g.add(m);
      return { m, x: -0.55 + (i % 8) * 0.16, z: i < 8 ? -0.1 : 0.15, ph: k.rand() };
    });
    k.animate((t) => {
      for (const d of drops) {
        const f = (t * 0.8 + d.ph) % 1;
        d.m.position.set(d.x, 0.05 - f * 1.0, d.z);
      }
    });
  }
  k.animate((t) => {
    for (const pf of puffs) pf.m.scale.setScalar(pf.base * (1 + 0.08 * Math.sin(t * 1.2 + pf.ph)));
    g.position.x = 0.04 * Math.sin(t * 0.4);
    if (v === 'gas') g.rotation.y = t * 0.15;
  });
}

/** Chispas de colores: fuegos artificiales, bengala o piedra de mechero. */
export function sparks(k: Kit, p: Params): void {
  const glow = p.glow ?? '#ff3b3b';
  const g = k.add(new THREE.Group());
  const v = p.variant ?? 'fuegos';
  if (v === 'fuegos') {
    // Varias palmeras que estallan en ciclo: cada partícula sale del centro.
    const n = 90;
    const pts = particles(n, glow, 0.17);
    const white = particles(30, '#fff6e0', 0.1);
    g.add(pts, white);
    const dirs = Array.from({ length: n + 30 }, () => new THREE.Vector3(k.rand() * 2 - 1, k.rand() * 2 - 1, k.rand() * 2 - 1).normalize().multiplyScalar(0.7 + k.rand() * 0.3));
    const center = new THREE.Vector3(0, 0.2, 0);
    const trail = mesh(new THREE.CylinderGeometry(0.01, 0.02, 0.5, 6), new THREE.MeshBasicMaterial({ color: '#ffd28a', transparent: true, opacity: 0.8, toneMapped: false }));
    g.add(trail);
    // El tubo de cartón del que salen, para que se reconozca entre estallido y estallido.
    g.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.35, 20), mat(glow, { rough: 0.6 }), [0, -0.8, 0]));
    g.add(mesh(new THREE.CylinderGeometry(0.125, 0.125, 0.06, 20), mat('#f5f0e6', { rough: 0.7 }), [0, -0.75, 0]));
    g.add(mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.02, 20), mat('#3a2a20'), [0, -0.62, 0]));
    const flash = halo(glow, 1, 0);
    flash.position.copy(center);
    g.add(flash);
    k.animate((t) => {
      const c = (t / 2.6) % 1;
      const up = Math.min(1, c / 0.25);
      trail.visible = c < 0.25;
      trail.position.set(0, -0.9 + up * 1.1, 0);
      const burst = Math.max(0, (c - 0.25) / 0.75);
      const r = 1 - (1 - burst) ** 3;
      const fall = burst * burst * 0.35;
      const fade = burst > 0 ? 1 - burst * burst : 0;
      (pts.material as THREE.PointsMaterial).opacity = fade;
      (white.material as THREE.PointsMaterial).opacity = fade;
      (flash.material as THREE.SpriteMaterial).opacity = burst > 0 ? Math.max(0, 1 - burst * 4) : 0;
      for (const [arr, off] of [[pts, 0], [white, n]] as const) {
        const pos = arr.geometry.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < pos.count; i++) {
          const d = dirs[i + off];
          const rr = r * (off ? 0.6 : 0.85);
          pos.setXYZ(i, center.x + d.x * rr, center.y + d.y * rr - fall, center.z + d.z * rr);
        }
        pos.needsUpdate = true;
      }
    });
    return;
  }
  let origin: THREE.Vector3;
  if (v === 'bengala') {
    g.rotation.z = -0.5;
    g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 8), metal('#8d939a', 0.4), [0, -0.3, 0]));
    g.add(mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.55, 10), mat('#5c5650', { rough: 0.9 }), [0, 0.3, 0]));
    origin = new THREE.Vector3(0, 0.58, 0);
    const core = halo('#ffffff', 0.55, 1);
    core.position.copy(origin);
    g.add(core);
    const h = halo(glow, 1.3, 0.55);
    h.position.copy(origin);
    g.add(h);
    k.animate((t) => core.scale.setScalar(0.45 + 0.15 * Math.abs(wave(t * 6, 2))));
  } else {
    // Mechero de piedra: cuerpo, rueda que gira y chispas.
    g.add(mesh(roundedBox(0.5, 0.95, 0.28, 0.1), mat(p.color ?? '#ff4f8b', { rough: 0.25, opacity: 0.92 }), [0, -0.4, 0]));
    g.add(mesh(roundedBox(0.52, 0.32, 0.3, 0.05), metal('#c9ced6', 0.2), [0, 0.2, 0]));
    const wheel = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.1, 18), metal('#7d848c', 0.5, { flat: true }), [0.05, 0.43, 0], [Math.PI / 2, 0, 0]);
    g.add(wheel);
    g.add(mesh(roundedBox(0.12, 0.08, 0.12, 0.02), mat('#444'), [-0.15, 0.42, 0]));
    origin = new THREE.Vector3(-0.05, 0.5, 0);
    k.animate((t) => (wheel.rotation.y = -t * 6));
    const flame = mesh(lathe([[0, 0], [0.07, 0.06], [0.08, 0.15], [0.04, 0.3], [0, 0.42]], 16), glowMat('#ffb340', 0.85), [-0.12, 0.48, 0]);
    g.add(flame);
    k.animate((t) => {
      const on = (t % 2.2) > 0.35 ? 1 : 0;
      flame.scale.set(1, on ? 0.9 + 0.15 * wave(t * 4, 5) : 0.01, 1);
    });
  }
  const sp = particles(70, glow, 0.11);
  g.add(sp);
  emitter(k, sp, (_i, o, vel) => {
    o.copy(origin);
    vel.set(k.rand() - 0.5, k.rand() * 0.9 - 0.2, k.rand() - 0.5).normalize().multiplyScalar(0.5 + k.rand() * 0.8);
  }, { life: 0.55, gravity: 1.2, drag: 1 });
  k.animate((t) => (g.rotation.y = 0.3 * Math.sin(t * 0.6)));
}

/** Forma de llama (gota estirada) para reutilizar. */
function flameGeo(r: number, h: number): THREE.LatheGeometry {
  return lathe([[0, 0], [r * 0.7, h * 0.06], [r, h * 0.2], [r * 0.85, h * 0.45], [r * 0.45, h * 0.75], [0, h]], 18);
}

/** Llamas: quemador de cocina (azul), soplete o cerilla. */
export function flame(k: Kit, p: Params): void {
  const g = k.add(new THREE.Group());
  const v = p.variant ?? 'hornillo';
  const flames: Array<{ m: THREE.Object3D; ph: number; base: number }> = [];
  if (v === 'hornillo') {
    g.add(mesh(new THREE.CylinderGeometry(0.85, 0.9, 0.16, 32), mat('#2b2f36', { metal: 0.6, rough: 0.35 }), [0, -0.55, 0]));
    g.add(mesh(new THREE.CylinderGeometry(0.42, 0.45, 0.14, 32), metal('#4a4f57', 0.4), [0, -0.42, 0]));
    g.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 24), mat('#1d1f23'), [0, -0.33, 0]));
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + Math.PI / 4;
      g.add(mesh(roundedBox(0.6, 0.05, 0.06, 0.02), mat('#15171a', { metal: 0.4 }), [Math.cos(a) * 0.6, -0.32, Math.sin(a) * 0.6], [0, -a, 0]));
    }
    const outer = new THREE.MeshBasicMaterial({ color: p.glow ?? '#2f7bff', transparent: true, opacity: 0.75, depthWrite: false, toneMapped: false });
    const inner = new THREE.MeshBasicMaterial({ color: '#9fd0ff', transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false });
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const f = new THREE.Group();
      f.position.set(Math.cos(a) * 0.4, -0.36, Math.sin(a) * 0.4);
      f.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35);
      f.add(mesh(flameGeo(0.07, 0.36), outer));
      f.add(mesh(flameGeo(0.035, 0.18), inner));
      g.add(f);
      flames.push({ m: f, ph: i * 1.3, base: 1 });
    }
    const h = halo(p.glow ?? '#4b8dff', 1.8, 0.35);
    h.position.y = -0.2;
    g.add(h);
    g.rotation.x = 0.35;
  } else if (v === 'soplete') {
    g.rotation.z = -1.2;
    g.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.8, 18), metal('#c99a3c', 0.3), [0, -0.45, 0]));
    g.add(mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.4, 12), metal('#b0844a', 0.3), [0, 0.1, 0]));
    for (const y of [-0.55, -0.3]) g.add(mesh(new THREE.TorusGeometry(0.07, 0.03, 8, 16), mat('#d43c3c'), [0.13, y, 0], [0, Math.PI / 2, 0]));
    const outer = new THREE.MeshBasicMaterial({ color: p.glow ?? '#5aa0ff', transparent: true, opacity: 0.7, depthWrite: false, toneMapped: false });
    const f = new THREE.Group();
    f.position.y = 0.3;
    f.add(mesh(flameGeo(0.08, 0.75), outer));
    f.add(mesh(flameGeo(0.035, 0.2), glowMat('#ffffff')));
    g.add(f);
    flames.push({ m: f, ph: 0, base: 1 });
    const h = halo('#bcd8ff', 0.9, 0.7);
    h.position.y = 0.38;
    g.add(h);
  } else {
    // Cerilla sobre su caja con la tira de rascar.
    g.add(mesh(roundedBox(1.2, 0.3, 0.75, 0.04), mat(p.color ?? '#f2c84b', { rough: 0.6 }), [0, -0.75, 0]));
    g.add(mesh(new THREE.BoxGeometry(1.21, 0.18, 0.02), mat('#5a2a1e', { rough: 1 }), [0, -0.75, 0.38]));
    const stick = new THREE.Group();
    stick.position.set(0, -0.6, 0.0);
    stick.rotation.z = -0.25;
    stick.add(mesh(new THREE.BoxGeometry(0.06, 1.0, 0.06), mat('#f0d9a8', { rough: 0.8 }), [0, 0.5, 0]));
    stick.add(mesh(new THREE.SphereGeometry(0.06, 12, 10), mat('#c62828', { rough: 0.6 }), [0, 1.02, 0]));
    const f = new THREE.Group();
    f.position.y = 1.0;
    f.add(mesh(flameGeo(0.11, 0.42), glowMat('#ff9d2e', 0.85)));
    f.add(mesh(flameGeo(0.06, 0.24), glowMat('#fff3c4')));
    stick.add(f);
    const h = halo('#ffb347', 1.2, 0.6);
    h.position.y = 1.15;
    stick.add(h);
    g.add(stick);
    flames.push({ m: f, ph: 0, base: 1 });
  }
  k.animate((t) => {
    for (const f of flames) {
      const w = wave(t * 3, f.ph);
      f.m.scale.set(1 + 0.05 * w, f.base * (1 + 0.15 * w), 1 + 0.05 * w);
    }
    if (v === 'hornillo') g.rotation.y = t * 0.2;
  });
}

/** Cohete que tiembla con su chorro de fuego y humo. */
export function rocket(k: Kit, p: Params): void {
  const g = k.add(new THREE.Group());
  g.rotation.z = -0.35;
  const body = mat(p.color ?? '#f4f6f9', { rough: 0.3, metal: 0.1 });
  const accent = mat(p.color2 ?? '#e5484d', { rough: 0.35 });
  g.add(mesh(lathe([[0, -0.55], [0.2, -0.55], [0.23, -0.3], [0.24, 0.1], [0.2, 0.4], [0.1, 0.62], [0, 0.72]], 32), body));
  g.add(mesh(lathe([[0.12, 0.5], [0.06, 0.65], [0, 0.72]], 24), accent));
  g.add(mesh(new THREE.TorusGeometry(0.075, 0.025, 10, 24), metal('#9aa3ad'), [0, 0.12, 0.215]));
  g.add(mesh(new THREE.CircleGeometry(0.075, 24), mat('#7cc4ff', { rough: 0.05, metal: 0.3 }), [0, 0.12, 0.225]));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const fin = mesh(new THREE.BoxGeometry(0.03, 0.32, 0.22), accent);
    fin.position.set(Math.cos(a) * 0.27, -0.42, Math.sin(a) * 0.27);
    fin.rotation.y = -a;
    g.add(fin);
  }
  g.add(mesh(new THREE.CylinderGeometry(0.11, 0.16, 0.12, 20), metal('#6d747c', 0.4), [0, -0.6, 0]));
  const fire = new THREE.Group();
  fire.position.y = -0.64;
  fire.rotation.x = Math.PI;
  fire.add(mesh(flameGeo(0.14, 0.55), glowMat(p.glow ?? '#7fb8ff', 0.7)));
  fire.add(mesh(flameGeo(0.07, 0.3), glowMat('#ffffff', 0.9)));
  g.add(fire);
  const h = halo(p.glow ?? '#9cc8ff', 1, 0.7);
  h.position.y = -0.8;
  g.add(h);
  const smoke = particles(30, '#e8ecf0', 0.25, false);
  g.add(smoke);
  emitter(k, smoke, (_i, o, v) => {
    o.set((k.rand() - 0.5) * 0.1, -0.9, (k.rand() - 0.5) * 0.1);
    v.set((k.rand() - 0.5) * 0.3, -0.25 - k.rand() * 0.2, (k.rand() - 0.5) * 0.3);
  }, { life: 1.2 });
  k.animate((t) => {
    fire.scale.set(1, 1 + 0.2 * wave(t * 5, 1), 1);
    g.position.set(0.01 * Math.sin(t * 40), 0.05 * Math.sin(t * 0.8), 0);
  });
}

/** Volcán con su cráter encendido y una fumarola de gases. */
export function volcano(k: Kit, p: Params): void {
  const g = k.add(new THREE.Group());
  const tex = spotsTexture('#8a5a3b', ['#6b4129', '#a0704c', '#5a3a26'], 60, p.seed ?? 9);
  g.add(mesh(lathe([[0.95, -0.8], [0.8, -0.62], [0.55, -0.35], [0.3, 0.0], [0.22, 0.05], [0.17, -0.02], [0, -0.05]], 28), mat(tex ? '#ffffff' : '#8a5a3b', { map: tex, rough: 0.9, flat: true })));
  const lava = mesh(new THREE.CircleGeometry(0.19, 20), glowMat('#ff6a1a'), [0, 0.0, 0], [-Math.PI / 2, 0, 0]);
  g.add(lava);
  // Cauces de lava por la ladera.
  const lavaMat = glowMat('#ff7b2a');
  g.add(mesh(tube([[0.18, 0.02, 0.05], [0.35, -0.2, 0.15], [0.5, -0.45, 0.2], [0.7, -0.72, 0.25]], 0.035, 24), lavaMat));
  g.add(mesh(tube([[-0.15, 0.02, 0.1], [-0.3, -0.25, 0.25], [-0.42, -0.55, 0.42]], 0.03, 24), lavaMat));
  const h = halo('#ff7a2a', 0.9, 0.7);
  h.position.y = 0.05;
  g.add(h);
  const gas = particles(36, p.color ?? '#d9d3a0', 0.3, false);
  (gas.material as THREE.PointsMaterial).opacity = 0.7;
  g.add(gas);
  emitter(k, gas, (_i, o, v) => {
    o.set((k.rand() - 0.5) * 0.15, 0.05, (k.rand() - 0.5) * 0.15);
    v.set(0.08 + (k.rand() - 0.5) * 0.15, 0.4 + k.rand() * 0.2, (k.rand() - 0.5) * 0.15);
  }, { life: 2.2, drag: 0.3 });
  k.animate((t) => {
    lavaMat.color.setRGB(1, 0.42 + 0.12 * Math.sin(t * 2), 0.15);
    (h.material as THREE.SpriteMaterial).opacity = 0.6 + 0.2 * Math.sin(t * 2.5);
    g.rotation.y = t * 0.15;
  });
}
