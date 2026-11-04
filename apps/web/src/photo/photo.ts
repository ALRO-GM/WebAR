import * as THREE from 'three';
import { MarkerTrackingProvider, type ARProvider } from '@webar/ar-core';
import { AtomView, MoleculeView, getElement, getSpecies } from '@webar/chem';
import { CharacterFigure, MascotFigure } from '../characters';
import type { AppContext, Experience } from '../experience';
import { t } from '../i18n';
import { contentName } from '../i18n/content';
import { createEveryday, hasEveryday } from '../objects';
import { calm, vibrate } from '../settings';
import { sfx } from '../sfx';

export interface PhotoDeps {
  ctx: AppContext;
  /** Personajes disponibles (ids) y contenidos (elementos y sustancias) que se pueden poner. */
  characters: () => string[];
  contents: () => string[];
  /** Al guardar o compartir una foto (para el progreso). */
  onPhoto: () => void;
}

interface Thing {
  object: THREE.Object3D;
  update(dt: number): void;
  dispose(): void;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * Foto con científicos: la cámara del móvil de fondo y, encima, un personaje
 * histórico en 3D junto a un átomo o una molécula (o su objeto cotidiano).
 * Se mueve con un dedo, se agranda pellizcando y se gira con dos dedos.
 * En RA del mundo (WebXR), se coloca en el suelo al tocar; ahí la foto es la
 * captura de pantalla del sistema, porque WebXR no da la imagen de la cámara.
 */
export class PhotoMode implements Experience {
  readonly id = 'foto';
  readonly camera = new MarkerTrackingProvider({ markerSize: 0.04, accept: () => false, facing: 'environment' });
  private readonly stage = new THREE.Group();
  private figure: CharacterFigure | MascotFigure | null = null;
  private thing: Thing | null = null;
  private hud?: HTMLElement;
  private character = 'gato';
  private content = 'H2O';
  private showObject = false;
  private provider?: ARProvider;
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private gesture: { dist: number; angle: number; scale: number; rot: number } | null = null;
  private time = 0;

  constructor(private readonly deps: PhotoDeps) {}

  onStart(provider: ARProvider): void {
    this.provider = provider;
    const { ar } = this.deps.ctx;
    this.character = this.deps.characters().includes(this.character) ? this.character : this.deps.characters()[0] ?? 'gato';
    const contents = this.deps.contents();
    if (!contents.includes(this.content)) this.content = contents[contents.length - 1] ?? 'H';
    ar.scene.add(this.stage);
    this.stage.position.set(0, -0.14, -0.62);
    this.stage.rotation.set(0, 0, 0);
    this.stage.scale.setScalar(1);
    this.stage.visible = provider === this.camera;
    this.build();
    this.renderHud();
    const canvas = ar.renderer.domElement;
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    for (const ev of ['pointerup', 'pointercancel'] as const) canvas.addEventListener(ev, this.onUp);
    canvas.style.touchAction = 'none';
  }

  onEnd(): void {
    const canvas = this.deps.ctx.ar.renderer.domElement;
    canvas.removeEventListener('pointerdown', this.onDown);
    canvas.removeEventListener('pointermove', this.onMove);
    for (const ev of ['pointerup', 'pointercancel'] as const) canvas.removeEventListener(ev, this.onUp);
    this.clear();
    this.stage.removeFromParent();
    this.hud?.remove();
    this.hud = undefined;
  }

  /** En RA del mundo: tocar el suelo coloca el grupo ahí. */
  async onSelect(): Promise<void> {
    const { xr } = this.deps.ctx;
    if (this.provider !== xr) return;
    const anchor = await xr.placeAnchor();
    if (!anchor) return;
    anchor.object.add(this.stage);
    this.stage.position.set(0, 0, 0);
    this.stage.scale.setScalar(2.5);
    this.stage.visible = true;
    this.figure?.wave();
    vibrate(20);
  }

  frame(dt: number): void {
    this.time += dt;
    this.figure?.update(dt);
    this.thing?.update(dt);
    // El personaje mira a la cámara.
    if (this.figure) this.figure.lookAt(this.deps.ctx.ar.camera.getWorldPosition(new THREE.Vector3()));
  }

  private clear(): void {
    this.figure?.dispose();
    this.thing?.dispose();
    this.figure = null;
    this.thing = null;
    this.stage.clear();
  }

  private build(): void {
    this.clear();
    this.figure = this.character === 'gato' ? new MascotFigure() : new CharacterFigure(this.character);
    this.figure.object.position.set(-0.07, 0, 0);
    this.stage.add(this.figure.object);
    this.thing = this.makeThing();
    this.thing.object.position.set(0.09, 0.13, 0);
    this.stage.add(this.thing.object);
  }

  private makeThing(): Thing {
    const c = this.content;
    if (this.showObject && hasEveryday(c)) return createEveryday(c, { size: 0.06, calm: calm() });
    const species = getSpecies(c);
    if (species) {
      const view = new MoleculeView(species, { metersPerAngstrom: 0.022 });
      return { object: view.object, update: (dt) => (view.object.rotation.y += dt * 0.5), dispose: () => view.dispose() };
    }
    const atom = new AtomView(getElement(c), { metersPerPm: 0.00045 });
    return { object: atom.object, update: (dt) => atom.update(dt), dispose: () => atom.dispose() };
  }

  private renderHud(): void {
    const { ctx } = this.deps;
    this.hud?.remove();
    const hud = document.createElement('div');
    hud.className = 'hud-foto';
    const world = this.provider === ctx.xr;
    hud.innerHTML = `
      <p class="burbuja burbuja-arriba">${world ? t('foto.pista_ra') : t('foto.pista')}</p>
      <div class="barra">
        <div class="fila foto-opciones">
          <label class="flotante foto-elegir"><span>${t('foto.personaje')}</span>
            <select data-personaje>${this.deps.characters().map((id) => `<option value="${id}" ${id === this.character ? 'selected' : ''}>${esc(id === 'gato' ? t('gato.nombre') : t(`personaje.${id}.nombre`))}</option>`).join('')}</select></label>
          <label class="flotante foto-elegir"><span>${t('foto.junto')}</span>
            <select data-contenido>${this.deps.contents().map((c) => `<option value="${c}" ${c === this.content ? 'selected' : ''}>${esc(contentName(c))}</option>`).join('')}</select></label>
          <button type="button" class="btn claro pequeno" data-objeto aria-pressed="${this.showObject}">${this.showObject ? t('foto.ver_atomo') : t('foto.ver_objeto')}</button>
        </div>
        <div class="fila">
          ${world ? '' : `<button type="button" class="btn claro redondo" data-girar aria-label="${t('foto.girar_camara')}">🔄</button>`}
          ${world ? '' : `<button type="button" class="btn obturador" data-foto aria-label="${t('foto.disparar')}"><span></span></button>`}
          <button type="button" class="btn claro" data-salir>${t('comun.salir')}</button>
        </div>
      </div>`;
    ctx.overlay.append(hud);
    this.hud = hud;
    hud.querySelector<HTMLSelectElement>('[data-personaje]')!.addEventListener('change', (e) => {
      this.character = (e.target as HTMLSelectElement).value;
      this.build();
      this.figure?.wave();
    });
    hud.querySelector<HTMLSelectElement>('[data-contenido]')!.addEventListener('change', (e) => {
      this.content = (e.target as HTMLSelectElement).value;
      this.build();
    });
    hud.querySelector('[data-objeto]')!.addEventListener('click', () => {
      this.showObject = !this.showObject;
      this.build();
      this.renderHud();
    });
    hud.querySelector('[data-salir]')!.addEventListener('click', () => void ctx.exit());
    hud.querySelector('[data-foto]')?.addEventListener('click', () => this.shoot());
    hud.querySelector('[data-girar]')?.addEventListener('click', async () => {
      this.camera.facing = this.camera.facing === 'user' ? 'environment' : 'user';
      await ctx.launch(this, this.camera);
    });
  }

  // --- Gestos: 1 dedo mueve, 2 dedos escalan y giran ---------------------------------

  private readonly onDown = (e: PointerEvent) => {
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    (e.target as Element).setPointerCapture?.(e.pointerId);
    if (this.pointers.size === 2) this.gesture = { ...this.twoFinger(), scale: this.stage.scale.x, rot: this.stage.rotation.y };
  };

  private readonly onMove = (e: PointerEvent) => {
    const prev = this.pointers.get(e.pointerId);
    if (!prev) return;
    const now = { x: e.clientX, y: e.clientY };
    this.pointers.set(e.pointerId, now);
    if (this.pointers.size === 2 && this.gesture) {
      const g = this.twoFinger();
      this.stage.scale.setScalar(THREE.MathUtils.clamp((this.gesture.scale * g.dist) / this.gesture.dist, 0.3, 6));
      this.stage.rotation.y = this.gesture.rot - (g.angle - this.gesture.angle);
    } else if (this.pointers.size === 1 && this.provider === this.camera) {
      // Mover en el plano de la pantalla, a la profundidad del grupo.
      const depth = -this.stage.position.z;
      const camera = this.deps.ctx.ar.camera;
      const h = 2 * depth * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / (camera.view?.height ? camera.view.height / camera.view.fullHeight : 1);
      const k = h / window.innerHeight;
      this.stage.position.x += (now.x - prev.x) * k * (this.camera.facing === 'user' ? -1 : 1);
      this.stage.position.y -= (now.y - prev.y) * k;
    }
  };

  private readonly onUp = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.gesture = null;
  };

  private twoFinger(): { dist: number; angle: number } {
    const [a, b] = [...this.pointers.values()];
    return { dist: Math.max(Math.hypot(b.x - a.x, b.y - a.y), 1), angle: Math.atan2(b.y - a.y, b.x - a.x) };
  }

  // --- La foto -------------------------------------------------------------------------

  private shoot(): void {
    const { ar } = this.deps.ctx;
    const source = this.camera.source;
    const gl = ar.renderer.domElement;
    const out = document.createElement('canvas');
    out.width = gl.width;
    out.height = gl.height;
    const g = out.getContext('2d')!;
    if (source) {
      const sw = source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
      const sh = source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;
      const cover = Math.max(out.width / sw, out.height / sh);
      const w = sw * cover;
      const h = sh * cover;
      g.save();
      if (this.camera.facing === 'user') {
        g.translate(out.width, 0);
        g.scale(-1, 1);
      }
      g.drawImage(source, (out.width - w) / 2, (out.height - h) / 2, w, h);
      g.restore();
    }
    // Pintar justo antes de copiar: el lienzo WebGL no guarda la imagen entre frames.
    ar.renderer.render(ar.scene, ar.camera);
    g.drawImage(gl, 0, 0);
    // Marca de agua pequeña.
    const s = out.width / 400;
    g.font = `800 ${Math.round(13 * s)}px 'Nunito Variable', system-ui, sans-serif`;
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.shadowColor = 'rgba(0,0,0,0.5)';
    g.shadowBlur = 4 * s;
    g.fillText(t('foto.marca'), 12 * s, out.height - 14 * s);
    sfx.toque();
    vibrate(30);
    this.figure?.celebrate();
    this.flash();
    out.toBlob((blob) => blob && this.preview(blob), 'image/jpeg', 0.92);
  }

  private flash(): void {
    const f = document.createElement('div');
    f.className = 'flash-foto';
    this.deps.ctx.overlay.append(f);
    setTimeout(() => f.remove(), 450);
  }

  private preview(blob: Blob): void {
    const url = URL.createObjectURL(blob);
    const file = new File([blob], `atomos-ar-${Date.now()}.jpg`, { type: 'image/jpeg' });
    const box = document.createElement('div');
    box.className = 'foto-vista flotante';
    box.innerHTML = `<img src="${url}" alt="${t('foto.alt')}" />
      <div class="fila">
        ${navigator.canShare?.({ files: [file] }) ? `<button type="button" class="btn" data-compartir>${t('foto.compartir')}</button>` : ''}
        <a class="btn ${navigator.canShare?.({ files: [file] }) ? 'claro' : ''}" href="${url}" download="${file.name}" data-guardar>${t('foto.guardar')}</a>
        <button type="button" class="btn claro" data-otra>${t('foto.otra')}</button>
      </div>`;
    this.hud?.append(box);
    const done = () => this.deps.onPhoto();
    box.querySelector('[data-compartir]')?.addEventListener('click', async () => {
      try {
        await navigator.share({ files: [file], title: t('foto.titulo') });
        done();
      } catch {
        /* cancelado */
      }
    });
    box.querySelector('[data-guardar]')!.addEventListener('click', done);
    box.querySelector('[data-otra]')!.addEventListener('click', () => {
      box.remove();
      URL.revokeObjectURL(url);
    });
  }
}
