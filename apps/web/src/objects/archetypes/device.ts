import * as THREE from 'three';
import {
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
  tube,
  wave,
  type Kit,
  type Params,
} from '../kit';

// Arquetipos de aparatos: chips, móviles, relojes, detectores, jeringas,
// bombonas, barras de combustible y núcleos inestables.

/** Chips: procesador en su placa, transistor antiguo o panel solar. */
export function chip(k: Kit, p: Params): void {
  const g = k.add(new THREE.Group());
  const v = p.variant ?? 'chip';
  if (v === 'panel') {
    const tex = canvasTexture(256, 256, (gg, w) => {
      gg.fillStyle = p.color ?? '#1d3f8f';
      gg.fillRect(0, 0, w, w);
      gg.strokeStyle = '#c9d6ea';
      gg.lineWidth = 3;
      for (let i = 0; i <= 4; i++) {
        gg.beginPath();
        gg.moveTo((i * w) / 4, 0);
        gg.lineTo((i * w) / 4, w);
        gg.moveTo(0, (i * w) / 4);
        gg.lineTo(w, (i * w) / 4);
        gg.stroke();
      }
      gg.strokeStyle = 'rgba(200,214,234,0.35)';
      gg.lineWidth = 1;
      for (let i = 0; i < w; i += 8) {
        gg.beginPath();
        gg.moveTo(i, 0);
        gg.lineTo(i, w);
        gg.stroke();
      }
    });
    const panel = new THREE.Group();
    panel.add(mesh(roundedBox(1.5, 1.0, 0.05, 0.02), metal('#c9ced6', 0.3)));
    panel.add(mesh(new THREE.PlaneGeometry(1.44, 0.94), mat(tex ? '#ffffff' : '#1d3f8f', { map: tex, metal: 0.3, rough: 0.15 }), [0, 0, 0.027]));
    panel.rotation.x = -0.75;
    panel.position.y = 0.15;
    g.add(panel);
    g.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.7, 10), metal('#9aa0a6'), [0, -0.45, -0.1]));
    g.add(mesh(new THREE.CylinderGeometry(0.25, 0.3, 0.06, 20), metal('#9aa0a6'), [0, -0.8, -0.1]));
    // El sol que se refleja pasando por el panel.
    const shine = halo('#fff6d0', 0.7, 0.8);
    panel.add(shine);
    const sun = halo('#ffd54f', 0.6, 0.9);
    sun.position.set(0.8, 0.85, 0.2);
    g.add(sun);
    k.animate((t) => {
      shine.position.set(Math.sin(t * 0.7) * 0.6, Math.cos(t * 0.5) * 0.3, 0.05);
      g.rotation.y = 0.35 * Math.sin(t * 0.4);
    });
    return;
  }
  if (v === 'transistor') {
    const can = new THREE.Group();
    can.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.45, 32), metal(p.color ?? '#c7ccd2', 0.2), [0, 0.2, 0]));
    can.add(mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.06, 32), metal(p.color ?? '#c7ccd2', 0.2), [0, -0.03, 0]));
    can.add(mesh(new THREE.BoxGeometry(0.06, 0.06, 0.12), metal('#b0b5ba'), [0.36, -0.03, 0]));
    const legs = metal('#d6b56a', 0.3);
    for (const [x, z] of [[-0.15, 0], [0, 0.12], [0.15, 0]]) can.add(mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.9, 6), legs, [x, -0.5, z]));
    g.add(can);
    const sp = halo('#9fd8ff', 0.25, 0.9);
    g.add(sp);
    k.animate((t) => {
      can.rotation.y = t * 0.5;
      const u = (t * 0.8) % 1;
      sp.position.set(-0.15, -0.95 + u * 0.9, 0);
      g.rotation.x = 0.2;
    });
    return;
  }
  // Placa verde con pistas de luz y el chip encima.
  const board = canvasTexture(256, 256, (gg, w) => {
    gg.fillStyle = '#1f7a4d';
    gg.fillRect(0, 0, w, w);
    gg.strokeStyle = '#d4b45a';
    gg.lineWidth = 3;
    const r = seeded(8);
    for (let i = 0; i < 26; i++) {
      gg.beginPath();
      const x = r() * w;
      const y = r() * w;
      gg.moveTo(x, y);
      gg.lineTo(x + (r() > 0.5 ? 60 : 0), y + (r() > 0.5 ? 0 : 60));
      gg.stroke();
      gg.fillStyle = '#d4b45a';
      gg.beginPath();
      gg.arc(x, y, 4, 0, Math.PI * 2);
      gg.fill();
    }
  });
  g.add(mesh(roundedBox(1.6, 0.06, 1.2, 0.02), mat(board ? '#ffffff' : '#1f7a4d', { map: board, rough: 0.5 }), [0, -0.25, 0]));
  const pkg = new THREE.Group();
  pkg.position.y = -0.12;
  pkg.add(mesh(roundedBox(0.7, 0.12, 0.7, 0.03), mat('#1c1d22', { rough: 0.45 })));
  const lbl = labelTexture(p.label ?? '', '#b9c0c8', '#3a3f45', 128, 128);
  pkg.add(mesh(new THREE.BoxGeometry(0.4, 0.02, 0.4), metal(lbl ? '#ffffff' : '#c3c9d0', 0.25, { map: lbl }), [0, 0.07, 0]));
  const pin = metal('#d8dde2', 0.3);
  for (let s = 0; s < 4; s++)
    for (let i = 0; i < 7; i++) {
      const off = -0.27 + i * 0.09;
      const pm = mesh(new THREE.BoxGeometry(0.035, 0.03, 0.12), pin);
      const a = (s * Math.PI) / 2;
      pm.position.set(Math.cos(a) * 0.4 - Math.sin(a) * off, -0.05, Math.sin(a) * 0.4 + Math.cos(a) * off);
      pm.rotation.y = -a + Math.PI / 2;
      pkg.add(pm);
    }
  g.add(pkg);
  // Pulsos de luz por las pistas.
  const glow = p.glow ?? '#7df9ff';
  const pulses = Array.from({ length: 6 }, (_, i) => {
    const s = halo(glow, 0.18, 1);
    g.add(s);
    return { s, a: (i / 6) * Math.PI * 2 };
  });
  k.animate((t) => {
    for (const pu of pulses) {
      const u = (t * 0.5 + pu.a) % 1;
      const r = 0.42 + u * 0.4;
      pu.s.position.set(Math.cos(pu.a) * r * 1.2, -0.2, Math.sin(pu.a) * r * 0.8);
      (pu.s.material as THREE.SpriteMaterial).opacity = 1 - u;
    }
    g.rotation.y = t * 0.3;
    g.rotation.x = 0.45;
  });
}

/** Móvil: pantalla táctil con toques que dejan ondas, o abierto por detrás. */
export function phone(k: Kit, p: Params): void {
  const g = k.add(new THREE.Group());
  g.add(mesh(roundedBox(0.78, 1.55, 0.09, 0.1), mat(p.color ?? '#1d1f24', { rough: 0.3, metal: 0.4 })));
  if (p.variant === 'placa') {
    const tex = canvasTexture(128, 256, (gg, w, h) => {
      gg.fillStyle = '#1f7a4d';
      gg.fillRect(0, 0, w, h);
      gg.fillStyle = '#c9b06a';
      for (let i = 0; i < 40; i++) gg.fillRect((i * 37) % w, (i * 53) % h, 18, 3);
    });
    g.add(mesh(new THREE.PlaneGeometry(0.66, 1.4), mat(tex ? '#ffffff' : '#1f7a4d', { map: tex, rough: 0.5 }), [0, 0, -0.047], [0, Math.PI, 0]));
    // Chips y condensadores de tantalio (amarillos y naranjas).
    const r = seeded(4);
    const caps: THREE.Mesh[] = [];
    g.add(mesh(roundedBox(0.3, 0.04, 0.3, 0.01), mat('#202226'), [0, 0.2, -0.065], [Math.PI / 2, 0, 0]));
    g.add(mesh(roundedBox(0.2, 0.25, 0.04, 0.01), metal('#c8cdd3', 0.3), [0.12, -0.3, -0.065]));
    for (let i = 0; i < 10; i++) {
      const c = mesh(roundedBox(0.08, 0.05, 0.04, 0.01), mat(i % 2 ? '#f2b705' : '#e07b00', { rough: 0.4, emissive: '#ffcf33', emissiveIntensity: 0 }), [-0.22 + r() * 0.44, -0.6 + r() * 1.2, -0.065]);
      g.add(c);
      caps.push(c);
    }
    g.add(mesh(roundedBox(0.5, 0.45, 0.05, 0.03), mat('#3a3d44', { rough: 0.4 }), [0, -0.35, -0.07]));
    g.rotation.y = Math.PI + 0.4;
    k.animate((t) => {
      caps.forEach((c, i) => ((c.material as THREE.MeshStandardMaterial).emissiveIntensity = Math.max(0, Math.sin(t * 2 + i)) * 0.6));
      g.rotation.y = Math.PI + 0.5 * Math.sin(t * 0.5);
    });
    return;
  }
  const tex = canvasTexture(128, 256, (gg, w, h) => {
    const grd = gg.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, p.color2 ?? '#6a5cff');
    grd.addColorStop(1, '#ff7ab6');
    gg.fillStyle = grd;
    gg.fillRect(0, 0, w, h);
    const cols = ['#ffd54f', '#4fc3f7', '#81c784', '#ff8a65', '#ba68c8', '#ffffff'];
    for (let i = 0; i < 16; i++) {
      gg.fillStyle = cols[i % cols.length];
      const x = 14 + (i % 4) * 27;
      const y = 30 + Math.floor(i / 4) * 34;
      gg.beginPath();
      gg.roundRect(x, y, 20, 20, 5);
      gg.fill();
    }
  });
  g.add(mesh(new THREE.PlaneGeometry(0.7, 1.45), new THREE.MeshBasicMaterial({ color: tex ? '#ffffff' : '#6a5cff', map: tex, toneMapped: false }), [0, 0, 0.047]));
  g.add(mesh(roundedBox(0.16, 0.04, 0.02, 0.01), mat('#000'), [0, 0.68, 0.05]));
  // Toques: un dedo invisible deja anillos que se agrandan.
  const rings = Array.from({ length: 2 }, () => {
    const m = mesh(new THREE.RingGeometry(0.06, 0.08, 32), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, toneMapped: false }));
    g.add(m);
    return m;
  });
  const spots = [[0.12, 0.2], [-0.15, -0.25], [0.1, -0.45], [-0.1, 0.4]];
  k.animate((t) => {
    rings.forEach((m, i) => {
      const c = (t * 0.7 + i * 0.5) % 1;
      const s = spots[Math.floor(t * 0.7 + i * 0.5) % spots.length];
      m.position.set(s[0], s[1], 0.05);
      m.scale.setScalar(0.5 + c * 2);
      (m.material as THREE.MeshBasicMaterial).opacity = (1 - c) * 0.9;
    });
    g.rotation.y = 0.45 * Math.sin(t * 0.5);
    g.rotation.x = -0.15;
  });
}

/** Esfera de reloj con números y agujas. */
function clockFace(dark: boolean, glow: string): THREE.CanvasTexture | null {
  return canvasTexture(256, 256, (gg, w) => {
    gg.fillStyle = dark ? '#16222b' : '#fbfbf8';
    gg.fillRect(0, 0, w, w);
    gg.fillStyle = dark ? glow : '#222';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const big = i % 3 === 0;
      gg.beginPath();
      gg.arc(w / 2 + Math.sin(a) * w * 0.38, w / 2 - Math.cos(a) * w * 0.38, big ? 11 : 6, 0, Math.PI * 2);
      gg.fill();
    }
  });
}

/** Relojes: reloj atómico (con órbitas alrededor) o reloj de pulsera con números que brillan. */
export function clock(k: Kit, p: Params): void {
  const g = k.add(new THREE.Group());
  const luminous = p.variant === 'luminoso';
  const glow = p.glow ?? (luminous ? '#a6ff4d' : '#5fd0ff');
  const face = clockFace(luminous, glow);
  const r = luminous ? 0.42 : 0.55;
  const caseMat = metal(p.color ?? (luminous ? '#c9a24a' : '#d8dde3'), 0.25);
  g.add(mesh(new THREE.CylinderGeometry(r + 0.06, r + 0.06, 0.14, 48), caseMat, [0, 0, -0.03], [Math.PI / 2, 0, 0]));
  g.add(mesh(new THREE.CircleGeometry(r, 48), luminous ? new THREE.MeshBasicMaterial({ color: '#ffffff', map: face, toneMapped: false }) : mat('#ffffff', { map: face, rough: 0.5 }), [0, 0, 0.045]));
  g.add(mesh(new THREE.CircleGeometry(r, 48), glass('#ffffff', 0.12), [0, 0, 0.07]));
  const handMat = luminous ? glowMat(glow) : mat('#1d1f24');
  const hour = new THREE.Group();
  hour.add(mesh(roundedBox(0.05, r * 0.55, 0.02, 0.01), handMat, [0, r * 0.25, 0]));
  const minute = new THREE.Group();
  minute.add(mesh(roundedBox(0.035, r * 0.82, 0.02, 0.01), handMat, [0, r * 0.38, 0]));
  const second = new THREE.Group();
  second.add(mesh(new THREE.BoxGeometry(0.012, r * 0.9, 0.01), mat('#e53935'), [0, r * 0.38, 0]));
  for (const [h, z] of [[hour, 0.05], [minute, 0.06], [second, 0.065]] as const) {
    h.position.z = z;
    g.add(h);
  }
  g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.04, 12), caseMat, [0, 0, 0.07], [Math.PI / 2, 0, 0]));
  let lum: THREE.Sprite | undefined;
  if (luminous) {
    // Correa del reloj de pulsera.
    const strap = mat(p.color2 ?? '#5b3a29', { rough: 0.7 });
    g.add(mesh(roundedBox(0.4, 0.55, 0.06, 0.03), strap, [0, 0.7, -0.06]));
    g.add(mesh(roundedBox(0.4, 0.55, 0.06, 0.03), strap, [0, -0.7, -0.06]));
    g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 12), caseMat, [r + 0.1, 0, 0], [0, 0, Math.PI / 2]));
    lum = halo(glow, 1.4, 0.35);
    lum.position.z = 0.1;
    g.add(lum);
  } else {
    // Órbitas de electrones alrededor: «reloj atómico».
    const orbMat = glowMat(glow, 0.8);
    const orbits: THREE.Group[] = [];
    for (let i = 0; i < 3; i++) {
      const o = new THREE.Group();
      o.rotation.set(Math.PI / 2 + (i - 1) * 0.9, (i - 1) * 0.5, 0);
      o.add(mesh(new THREE.TorusGeometry(0.85, 0.012, 6, 64), orbMat));
      const e = mesh(new THREE.SphereGeometry(0.055, 12, 10), glowMat('#ffffff'), [0.85, 0, 0]);
      o.add(e);
      g.add(o);
      orbits.push(o);
    }
    k.animate((t) => orbits.forEach((o, i) => (o.children[1].position.set(Math.cos(t * (1.5 + i * 0.4)) * 0.85, Math.sin(t * (1.5 + i * 0.4)) * 0.85, 0))));
  }
  k.animate((t) => {
    second.rotation.z = -Math.floor(t) * ((Math.PI * 2) / 60);
    minute.rotation.z = -t * 0.05;
    hour.rotation.z = -t * 0.004 - 1;
    if (lum) (lum.material as THREE.SpriteMaterial).opacity = 0.28 + 0.1 * Math.sin(t * 1.5);
    g.rotation.y = 0.4 * Math.sin(t * 0.45);
  });
}

/** Detector de techo (humo o monóxido) con su luz que parpadea. */
export function detector(k: Kit, p: Params): void {
  const g = k.add(new THREE.Group());
  const white = mat(p.color ?? '#f5f6f8', { rough: 0.35 });
  g.add(mesh(lathe([[0, -0.18], [0.62, -0.18], [0.68, -0.1], [0.66, 0.05], [0.5, 0.15], [0.3, 0.18], [0, 0.18]], 48), white));
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    g.add(mesh(roundedBox(0.03, 0.03, 0.14, 0.01), mat('#9aa3ad'), [Math.cos(a) * 0.45, 0.16, Math.sin(a) * 0.45], [0, Math.PI / 2 - a, 0]));
  }
  g.add(mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.04, 32), mat('#e9ecef', { rough: 0.4 }), [0, 0.19, 0]));
  const lbl = p.label ? labelTexture(p.label, '#e9ecef', '#5a6470', 128, 128) : null;
  if (lbl) g.add(mesh(new THREE.CircleGeometry(0.2, 32), mat('#ffffff', { map: lbl }), [0, 0.215, 0], [-Math.PI / 2, 0, 0]));
  const ledMat = glowMat(p.glow ?? '#ff2a2a');
  const ledM = mesh(new THREE.SphereGeometry(0.04, 12, 8), ledMat, [0.38, 0.17, 0.0]);
  g.add(ledM);
  const h = halo(p.glow ?? '#ff2a2a', 0.4, 0.9);
  h.position.copy(ledM.position);
  g.add(h);
  // Un hilillo de humo que se acerca.
  const smoke = particles(16, '#9aa3ad', 0.2, false);
  (smoke.material as THREE.PointsMaterial).opacity = 0.45;
  k.add(smoke);
  emitter(k, smoke, (_i, o, v) => {
    o.set(0.2 + (k.rand() - 0.5) * 0.3, -0.95, 0.3 + (k.rand() - 0.5) * 0.3);
    v.set((k.rand() - 0.5) * 0.1, 0.4, (k.rand() - 0.5) * 0.1);
  }, { life: 2 });
  g.rotation.x = 1.2;
  g.position.y = 0.0;
  k.animate((t) => {
    const on = (t % 1.5) < 0.2 || k.calm;
    ledMat.color.set(on ? (p.glow ?? '#ff2a2a') : '#5a1010');
    h.visible = on;
    g.rotation.z = 0.3 * Math.sin(t * 0.4);
  });
}

/** Termómetro antiguo de cristal: la columna de mercurio sube y baja. */
export function thermometer(k: Kit, p: Params): void {
  const g = k.add(new THREE.Group());
  g.rotation.z = -0.35;
  const scale = canvasTexture(64, 256, (gg, w, h) => {
    gg.fillStyle = '#ffffff';
    gg.fillRect(0, 0, w, h);
    gg.fillStyle = '#334';
    for (let i = 0; i < 26; i++) gg.fillRect(w * 0.15, 10 + i * 9, i % 5 === 0 ? w * 0.5 : w * 0.28, 2);
    gg.fillStyle = '#e53935';
    gg.fillRect(w * 0.15, 10 + 13 * 9, w * 0.5, 3);
  });
  g.add(mesh(new THREE.PlaneGeometry(0.22, 1.35), mat('#ffffff', { map: scale, rough: 0.6 }), [0, 0.12, -0.06]));
  g.add(mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.5, 24, 1, true), glass('#f4fbff', 0.3), [0, 0.15, 0]));
  g.add(mesh(new THREE.SphereGeometry(0.09, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), glass('#f4fbff', 0.3), [0, 0.9, 0]));
  const hg = metal(p.color ?? '#d4d8dd', 0.05);
  g.add(mesh(new THREE.SphereGeometry(0.15, 24, 16), hg, [0, -0.72, 0]));
  g.add(mesh(new THREE.SphereGeometry(0.17, 24, 16), glass('#f4fbff', 0.25), [0, -0.72, 0]));
  const col = mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 12), hg);
  g.add(col);
  k.animate((t) => {
    const h = 0.55 + 0.35 * (0.5 + 0.5 * Math.sin(t * 0.7));
    col.scale.y = h;
    col.position.y = -0.6 + h / 2;
    g.rotation.y = 0.4 * Math.sin(t * 0.4);
  });
}

/** Jeringa con un líquido (que brilla si es radiactivo) y el émbolo que empuja. */
export function syringe(k: Kit, p: Params): void {
  const g = k.add(new THREE.Group());
  g.rotation.z = -1.0;
  const liquidColor = p.color ?? '#7ee0a1';
  g.add(mesh(new THREE.CylinderGeometry(0.17, 0.17, 1.0, 24, 1, true), glass('#ffffff', 0.25)));
  const liquidMat = p.glow ? mat(liquidColor, { opacity: 0.85, emissive: p.glow, emissiveIntensity: 0.7 }) : mat(liquidColor, { opacity: 0.8, rough: 0.1 });
  const liquid = mesh(new THREE.CylinderGeometry(0.15, 0.15, 1, 24), liquidMat);
  g.add(liquid);
  for (let i = 0; i < 6; i++) g.add(mesh(new THREE.BoxGeometry(0.08, 0.01, 0.01), mat('#333'), [0.13, -0.35 + i * 0.12, 0.09]));
  g.add(mesh(new THREE.CylinderGeometry(0.06, 0.17, 0.12, 24), glass('#ffffff', 0.4), [0, -0.56, 0]));
  g.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.45, 8), metal('#d8dde2', 0.15), [0, -0.84, 0]));
  g.add(mesh(roundedBox(0.55, 0.05, 0.2, 0.02), mat('#f2f4f7', { rough: 0.3 }), [0, 0.5, 0]));
  const plunger = new THREE.Group();
  plunger.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.06, 24), mat('#3a3d44', { rough: 0.6 }), [0, 0, 0]));
  plunger.add(mesh(new THREE.BoxGeometry(0.04, 0.8, 0.12), mat('#f2f4f7', { rough: 0.3 }), [0, 0.4, 0]));
  plunger.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 24), mat('#f2f4f7', { rough: 0.3 }), [0, 0.8, 0]));
  g.add(plunger);
  const h = p.glow ? halo(p.glow, 1.0, 0.35) : null;
  if (h) g.add(h);
  const drop = mesh(new THREE.SphereGeometry(0.03, 10, 8), liquidMat);
  g.add(drop);
  k.animate((t) => {
    const c = 0.5 + 0.5 * Math.sin(t * 0.8);
    const top = -0.45 + 0.85 * c;
    plunger.position.y = top + 0.03;
    liquid.scale.y = Math.max(0.01, top + 0.5);
    liquid.position.y = (-0.5 + top) / 2;
    drop.position.set(0, -1.08 - ((t * 0.9) % 1) * 0.1, 0);
    drop.visible = Math.cos(t * 0.8) < 0;
    if (h) (h.material as THREE.SpriteMaterial).opacity = 0.3 + 0.1 * Math.sin(t * 2);
    g.rotation.y = 0.3 * Math.sin(t * 0.4);
  });
}

/** Billete que, al pasarle la lámpara ultravioleta, enseña fibras que brillan. */
export function banknote(k: Kit, p: Params): void {
  const g = k.add(new THREE.Group());
  const tex = canvasTexture(512, 256, (gg, w, h) => {
    const grd = gg.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, p.color ?? '#7fb3e8');
    grd.addColorStop(1, p.color2 ?? '#b8d7f5');
    gg.fillStyle = grd;
    gg.fillRect(0, 0, w, h);
    gg.strokeStyle = 'rgba(30,60,120,0.35)';
    gg.lineWidth = 2;
    for (let i = 0; i < 18; i++) {
      gg.beginPath();
      gg.arc(w * 0.62, h * 0.5, 20 + i * 8, 0, Math.PI * 2);
      gg.stroke();
    }
    // Arco y ventana: motivo arquitectónico genérico.
    gg.fillStyle = 'rgba(255,255,255,0.55)';
    gg.fillRect(w * 0.08, h * 0.25, w * 0.22, h * 0.6);
    gg.fillStyle = 'rgba(30,60,120,0.45)';
    gg.beginPath();
    gg.arc(w * 0.19, h * 0.45, w * 0.08, Math.PI, 0);
    gg.fill();
    gg.fillStyle = '#1e3c78';
    gg.font = 'bold 96px system-ui, sans-serif';
    gg.textAlign = 'right';
    gg.fillText(p.label ?? '20', w * 0.95, h * 0.33);
    gg.font = 'bold 60px system-ui, sans-serif';
    gg.fillText('€', w * 0.95, h * 0.9);
  });
  const note = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.75, 24, 4), mat(tex ? '#ffffff' : '#7fb3e8', { map: tex, rough: 0.8, side: THREE.DoubleSide }));
  g.add(note);
  // Fibras fluorescentes (rojas, azules, verdes) que se encienden bajo la lámpara.
  const fibers = canvasTexture(512, 256, (gg, w, h) => {
    const r = seeded(13);
    const cols = ['#ff3d6e', '#3dc3ff', '#4dff8a', '#ffe14d'];
    gg.lineWidth = 3;
    for (let i = 0; i < 70; i++) {
      gg.strokeStyle = cols[i % cols.length];
      const x = r() * w;
      const y = r() * h;
      gg.beginPath();
      gg.moveTo(x, y);
      gg.quadraticCurveTo(x + r() * 20, y + r() * 20, x + (r() - 0.5) * 30, y + (r() - 0.5) * 30);
      gg.stroke();
    }
    gg.fillStyle = 'rgba(255,220,80,0.9)';
    for (let i = 0; i < 12; i++) gg.fillRect(w * 0.35 + i * 14, h * 0.1, 8, 8);
  });
  const fibMat = new THREE.MeshBasicMaterial({ map: fibers, color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
  const fib = new THREE.Mesh(note.geometry, fibMat);
  fib.position.z = 0.003;
  g.add(fib);
  const lampG = new THREE.Group();
  lampG.add(mesh(roundedBox(0.3, 0.12, 0.12, 0.04), mat('#2b2d33', { rough: 0.4 })));
  lampG.add(mesh(new THREE.BoxGeometry(0.24, 0.02, 0.06), glowMat('#b26bff'), [0, -0.065, 0]));
  const uv = halo('#9a5bff', 1.2, 0.6);
  uv.position.y = -0.25;
  lampG.add(uv);
  g.add(lampG);
  const pos = note.geometry.attributes.position as THREE.BufferAttribute;
  const base = Float32Array.from(pos.array);
  g.rotation.x = -0.5;
  k.animate((t) => {
    const x = Math.sin(t * 0.8) * 0.6;
    lampG.position.set(x, 0.35, 0.3);
    fibMat.opacity = 0.35 + 0.65 * Math.max(0, 1 - Math.abs(x) * 1.3);
    for (let i = 0; i < pos.count; i++) pos.setZ(i, base[i * 3 + 2] + Math.sin(base[i * 3] * 3 + t * 1.5) * 0.04);
    pos.needsUpdate = true;
  });
}

/** Gafas que se oscurecen con la luz (y se aclaran a la sombra). */
export function glasses(k: Kit, p: Params): void {
  const g = k.add(new THREE.Group());
  const frame = mat(p.color ?? '#2b2d33', { rough: 0.35, metal: 0.3 });
  const lensMat = mat('#6d4c41', { opacity: 0.2, rough: 0.05, metal: 0.2 });
  for (const x of [-0.38, 0.38]) {
    g.add(mesh(new THREE.TorusGeometry(0.28, 0.035, 10, 40), frame, [x, 0, 0]));
    const lens = mesh(new THREE.CircleGeometry(0.28, 40), lensMat, [x, 0, 0]);
    lens.scale.y = 0.85;
    g.add(lens);
  }
  g.add(mesh(new THREE.TorusGeometry(0.1, 0.03, 8, 16, Math.PI), frame, [0, 0.05, 0]));
  for (const x of [-0.66, 0.66]) g.add(mesh(tube([[x, 0.05, 0], [x * 1.04, 0.05, -0.5], [x * 1.0, -0.1, -0.75]], 0.025, 16), frame));
  const sun = halo('#ffd54f', 0.8, 0.9);
  g.add(sun);
  g.rotation.y = -0.4;
  k.animate((t) => {
    const c = 0.5 + 0.5 * Math.sin(t * 0.7);
    sun.position.set(0.2, 0.55 + c * 0.25, 0.6);
    (sun.material as THREE.SpriteMaterial).opacity = 0.2 + 0.8 * c;
    lensMat.opacity = 0.2 + 0.68 * c;
    lensMat.color.set('#6d4c41').lerp(new THREE.Color('#1a1210'), c);
    g.rotation.y = -0.4 + 0.3 * Math.sin(t * 0.4);
  });
}

/** Bombonas: de gas (soldadura, oxígeno), sifón de nata o extintor. */
export function tank(k: Kit, p: Params): void {
  const g = k.add(new THREE.Group());
  const v = p.variant ?? 'gas';
  const body = mat(p.color ?? '#5f6b78', { rough: 0.35, metal: 0.4 });
  if (v === 'sifon') {
    const steel = metal(p.color ?? '#d5dade', 0.15);
    g.add(mesh(lathe([[0, -0.85], [0.3, -0.85], [0.33, -0.8], [0.33, 0.25], [0.28, 0.35], [0, 0.36]], 40), steel));
    g.add(mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.2, 24), mat('#2b2d33', { rough: 0.4 }), [0, 0.45, 0]));
    g.add(mesh(roundedBox(0.4, 0.07, 0.12, 0.03), mat('#2b2d33'), [0.12, 0.6, 0], [0, 0, 0.2]));
    g.add(mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.28, 12), metal('#c8cdd3'), [-0.06, 0.25, 0.0], [0, 0, 0.0]));
    // La carga de N₂O enroscada a un lado.
    g.add(mesh(lathe([[0, -0.12], [0.07, -0.08], [0.08, 0.06], [0.03, 0.14], [0, 0.15]], 16), metal('#c3c9d0', 0.2), [0.28, 0.52, 0], [0, 0, -1.2]));
    // Nata que sale en espiral.
    const cream = mat('#fffaf0', { rough: 0.6 });
    const swirl = new THREE.Group();
    for (let i = 0; i < 5; i++) swirl.add(mesh(new THREE.TorusGeometry(0.16 - i * 0.03, 0.06, 10, 24), cream, [0, i * 0.07, 0], [Math.PI / 2, 0, 0]));
    swirl.position.set(-0.6, -0.8, 0.2);
    g.add(swirl);
    g.add(mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.15, 24), mat('#7cc4ff', { rough: 0.2, opacity: 0.6 }), [-0.6, -0.9, 0.2]));
    g.rotation.y = 0.4;
    k.animate((t) => {
      swirl.scale.set(1, 0.7 + 0.3 * Math.abs(Math.sin(t * 0.8)), 1);
      swirl.rotation.y = t * 0.6;
    });
    return;
  }
  const extinguisher = v === 'extintor';
  g.add(mesh(lathe([[0, -0.88], [0.3, -0.88], [0.32, -0.84], [0.32, 0.35], [0.26, 0.5], [0.12, 0.58], [0, 0.6]], 36), body));
  if (!extinguisher) g.add(mesh(lathe([[0.315, 0.3], [0.27, 0.48], [0.12, 0.58], [0.0, 0.6]], 36), mat(p.color2 ?? '#2e7d32', { rough: 0.35 })));
  g.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.18, 16), metal('#c9a24a', 0.3), [0, 0.68, 0]));
  g.add(mesh(new THREE.TorusGeometry(0.11, 0.025, 8, 20), mat(extinguisher ? '#222' : '#2b2d33'), [0, 0.8, 0], [Math.PI / 2, 0, 0]));
  // Manómetro con aguja que tiembla.
  const gauge = new THREE.Group();
  gauge.position.set(0.15, 0.7, 0.05);
  gauge.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 24), metal('#c9ced4'), [0, 0, 0], [Math.PI / 2, 0, 0]));
  gauge.add(mesh(new THREE.CircleGeometry(0.085, 24), mat('#ffffff'), [0, 0, 0.026]));
  const needle = mesh(new THREE.BoxGeometry(0.01, 0.07, 0.005), mat('#e53935'), [0, 0.03, 0.03]);
  const needleG = new THREE.Group();
  needleG.position.z = 0.0;
  needleG.add(needle);
  gauge.add(needleG);
  g.add(gauge);
  if (extinguisher) {
    g.add(mesh(tube([[0.05, 0.62, 0], [0.4, 0.55, 0.05], [0.45, 0.0, 0.1], [0.42, -0.4, 0.15]], 0.035, 30), mat('#1d1f24', { rough: 0.6 })));
    g.add(mesh(new THREE.ConeGeometry(0.06, 0.15, 12), mat('#1d1f24'), [0.42, -0.5, 0.15], [Math.PI, 0, 0]));
    g.add(mesh(roundedBox(0.3, 0.05, 0.08, 0.02), metal('#b0b5ba'), [-0.12, 0.72, 0], [0, 0, -0.3]));
    const lbl = labelTexture(p.label ?? '', '#f5f5f5', '#c62828', 128, 128);
    if (lbl) g.add(mesh(new THREE.PlaneGeometry(0.35, 0.35), mat('#ffffff', { map: lbl }), [0, -0.2, 0.322]));
  }
  const puff = particles(14, '#ffffff', 0.18, false);
  (puff.material as THREE.PointsMaterial).opacity = 0.5;
  g.add(puff);
  const src = extinguisher ? new THREE.Vector3(0.42, -0.58, 0.15) : new THREE.Vector3(0.1, 0.8, 0);
  emitter(k, puff, (_i, o, vel) => {
    o.copy(src);
    vel.set(0.25 + k.rand() * 0.2, (extinguisher ? -0.3 : 0.15) + (k.rand() - 0.5) * 0.2, (k.rand() - 0.5) * 0.2);
  }, { life: 1.4, drag: 0.6 });
  k.animate((t) => {
    needleG.rotation.z = -0.5 + 0.08 * wave(t * 3, 2);
    g.rotation.y = 0.5 * Math.sin(t * 0.4);
  });
}

/** Barras de combustible bajo el agua con brillo azul, o pila nuclear de sonda (RTG). */
export function rod(k: Kit, p: Params): void {
  const g = k.add(new THREE.Group());
  const glow = p.glow ?? '#3fb6ff';
  if (p.variant === 'rtg') {
    const dark = mat(p.color ?? '#7d8794', { metal: 0.6, rough: 0.45 });
    g.add(mesh(new THREE.CylinderGeometry(0.25, 0.25, 1.2, 24), dark));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.add(mesh(new THREE.BoxGeometry(0.03, 1.1, 0.38), dark, [Math.cos(a) * 0.42, 0, Math.sin(a) * 0.42], [0, Math.PI / 2 - a, 0]));
    }
    for (const y of [-0.62, 0.62]) g.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 24), metal('#c9ced4', 0.3), [0, y, 0]));
    const core = glowMat('#ff5a1f');
    for (const y of [-0.66, 0.66]) g.add(mesh(new THREE.CircleGeometry(0.16, 24), core, [0, y, 0], [y > 0 ? -Math.PI / 2 : Math.PI / 2, 0, 0]));
    const heat = halo('#ff6a2a', 1.2, 0.3);
    g.add(heat);
    g.rotation.z = 0.15;
    g.rotation.x = 0.25;
    k.animate((t) => {
      core.color.setRGB(1, 0.3 + 0.1 * Math.sin(t * 2), 0.1);
      heat.scale.setScalar(1.5 + 0.15 * Math.sin(t * 1.3));
      g.rotation.y = t * 0.4;
    });
    return;
  }
  // Agua de la piscina del reactor y el haz de barras.
  g.add(mesh(new THREE.CylinderGeometry(0.75, 0.75, 1.5, 32, 1, true), new THREE.MeshBasicMaterial({ color: '#1e88e5', transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false })));
  const clad = metal(p.color ?? '#b9c0c8', 0.3);
  for (let i = 0; i < 7; i++) {
    const a = (i / 6) * Math.PI * 2;
    const r = i === 6 ? 0 : 0.27;
    g.add(mesh(new THREE.CylinderGeometry(0.11, 0.11, 1.3, 16), clad, [Math.cos(a) * r, 0, Math.sin(a) * r]));
    g.add(mesh(new THREE.SphereGeometry(0.11, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), clad, [Math.cos(a) * r, 0.65, Math.sin(a) * r]));
  }
  for (const y of [-0.35, 0.1, 0.5]) g.add(mesh(new THREE.TorusGeometry(0.4, 0.025, 6, 6), metal('#8a929c'), [0, y, 0], [Math.PI / 2, 0, 0]));
  const cherenkov = halo(glow, 2.0, 0.55);
  g.add(cherenkov);
  const inner = new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.3, depthWrite: false, toneMapped: false });
  g.add(mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.35, 24), inner));
  k.animate((t) => {
    const s = 0.5 + 0.5 * Math.sin(t * 1.4);
    (cherenkov.material as THREE.SpriteMaterial).opacity = 0.45 + 0.25 * s;
    inner.opacity = 0.2 + 0.15 * s;
    g.rotation.y = t * 0.25;
  });
}

/** Núcleo inestable que tiembla y escupe chispas; con anillo de acelerador si hace falta. */
export function nucleus(k: Kit, p: Params): void {
  const g = k.add(new THREE.Group());
  const color = p.color ?? '#ff5d5d';
  const glow = p.glow ?? color;
  const proton = mat(color, { rough: 0.3, emissive: color, emissiveIntensity: 0.25 });
  const neutron = mat('#c9d3de', { rough: 0.35 });
  const ball = new THREE.SphereGeometry(0.12, 14, 10);
  const core = new THREE.Group();
  const r = seeded(p.seed ?? 17);
  const parts: Array<{ m: THREE.Mesh; base: THREE.Vector3; ph: number }> = [];
  const n = 60;
  for (let i = 0; i < n; i++) {
    // Espiral de Fibonacci en capas: una bola compacta.
    const f = (i + 0.5) / n;
    const rr = 0.46 * Math.cbrt(f);
    const phi = Math.acos(1 - 2 * ((i * 0.618) % 1));
    const th = i * 2.39996;
    const base = new THREE.Vector3(Math.sin(phi) * Math.cos(th) * rr, Math.cos(phi) * rr, Math.sin(phi) * Math.sin(th) * rr);
    const m = mesh(ball, r() > 0.5 ? neutron : proton);
    m.position.copy(base);
    core.add(m);
    parts.push({ m, base, ph: r() * 10 });
  }
  g.add(core);
  const h = halo(glow, 1.4, 0.55);
  g.add(h);
  const sp = particles(50, glow, 0.08);
  g.add(sp);
  emitter(k, sp, (_i, o, v) => {
    v.set(k.rand() - 0.5, k.rand() - 0.5, k.rand() - 0.5).normalize();
    o.copy(v).multiplyScalar(0.55);
    v.multiplyScalar(0.8 + k.rand() * 0.8);
  }, { life: 0.7 });
  let ringBeam: THREE.Sprite | undefined;
  if (p.variant === 'acelerador') {
    const ringG = new THREE.Group();
    ringG.rotation.x = Math.PI / 2 - 0.9;
    ringG.add(mesh(new THREE.TorusGeometry(0.82, 0.07, 12, 64), metal('#b8c0c8', 0.3)));
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ringG.add(mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), mat(i % 2 ? '#2f6fd8' : '#e5484d', { rough: 0.4 }), [Math.cos(a) * 0.82, Math.sin(a) * 0.82, 0], [0, 0, a]));
    }
    ringBeam = halo('#ffffff', 0.35, 1);
    ringG.add(ringBeam);
    g.add(ringG);
  }
  k.animate((t, dt) => {
    // Temblor nervioso: cada partícula vibra; a ratos, un sobresalto.
    const jolt = (t % 2.3) < 0.15 ? 2.5 : 1;
    for (const q of parts) {
      const a = 0.012 * jolt;
      q.m.position.set(q.base.x + Math.sin(t * 23 + q.ph) * a, q.base.y + Math.sin(t * 19 + q.ph * 2) * a, q.base.z + Math.sin(t * 29 + q.ph * 3) * a);
    }
    core.rotation.y += dt * 0.6;
    core.rotation.x += dt * 0.25;
    h.scale.setScalar(1.3 + 0.2 * Math.abs(Math.sin(t * 3)) * jolt);
    if (ringBeam) ringBeam.position.set(Math.cos(t * 3) * 0.82, Math.sin(t * 3) * 0.82, 0);
  });
}

