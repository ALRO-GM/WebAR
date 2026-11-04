import * as THREE from 'three';
import type { ARAnchor, ARProvider } from '@webar/ar-core';
import type { AppContext } from '../experience';
import { t } from '../i18n';
import { vibrate } from '../settings';
import { createShadow } from '../shadow';
import { fmt, h } from './dom';

/**
 * Dónde se pone el modelo: en el visor 3D, en el centro (girar con el dedo);
 * en RA, sobre la mesa o el suelo al tocar (como «explorar» en main.ts), con
 * su sombra y un tamaño que se cambia con un deslizador o pellizcando.
 *
 * `root` es el modelo, centrado en el origen y de radio `radius` (metros).
 */
export class Stage {
  /** Escala elegida en RA (1 = tamaño normal). */
  scale = 1;
  readonly ar: boolean;
  /** Controles de RA (pista + deslizador de tamaño) para meter en el HUD. */
  readonly controls?: HTMLElement;

  private anchor?: ARAnchor;
  private shadow?: THREE.Mesh;
  private hint?: HTMLElement;
  private slider?: HTMLInputElement;
  private output?: HTMLElement;
  private pinch?: { distance: number; scale: number };

  constructor(
    private readonly ctx: AppContext,
    provider: ARProvider,
    private readonly root: THREE.Object3D,
    private readonly radius: number,
  ) {
    this.ar = provider === ctx.xr;
    if (!this.ar) {
      this.anchor = ctx.viewer.createAnchor();
      this.anchor.object.add(root);
      // El panel de abajo tapa parte de la pantalla: el modelo se ve un poco más arriba y más pequeño.
      // Un poco desde arriba, que se vean las capas y el interior.
      ctx.viewer.setView(new THREE.Vector3(0.35, 0.32, 0.62), new THREE.Vector3());
      ctx.viewer.frame(radius * 1.12);
      this.shiftView();
      window.addEventListener('resize', this.shiftView);
      return;
    }
    this.hint = h('p', { class: 'mat-pista', role: 'status' });
    this.slider = h('input', { type: 'range', min: '0.3', max: '4', step: '0.1', value: '1', 'aria-label': t('materia.ra.tamano') });
    this.output = h('output', { class: 'mat-valor' });
    this.slider.addEventListener('input', () => this.setScale(Number(this.slider!.value)));
    this.controls = h(
      'div',
      { class: 'mat-ra' },
      this.hint,
      h('label', { class: 'mat-deslizador' }, h('span', { text: t('materia.ra.tamano') }), this.slider, this.output),
    );
    this.setScale(1);
    window.addEventListener('touchstart', this.onTouch, { passive: true });
    window.addEventListener('touchmove', this.onTouch, { passive: true });
    window.addEventListener('touchend', this.onTouchEnd, { passive: true });
  }

  /** Toque en RA: coloca (o mueve) el modelo sobre la superficie que se ve. */
  async select(): Promise<void> {
    if (!this.ar || this.pinch) return;
    const anchor = await this.ctx.xr.placeAnchor();
    if (!anchor) return;
    this.anchor?.dispose();
    this.anchor = anchor;
    this.shadow = createShadow(this.radius * 0.9);
    anchor.object.add(this.shadow, this.root);
    this.apply();
    vibrate(20);
  }

  setScale(scale: number): void {
    this.scale = THREE.MathUtils.clamp(scale, 0.3, 4);
    if (this.slider) {
      this.slider.value = String(this.scale);
      this.slider.setAttribute('aria-valuetext', t('materia.ra.tamano.texto', { x: fmt(this.scale, 1) }));
    }
    if (this.output) this.output.textContent = t('materia.ra.tamano.valor', { x: fmt(this.scale, 1) });
    this.apply();
  }

  /** Cada frame: la pista de RA. */
  frame(): void {
    if (!this.hint) return;
    const text = this.anchor ? t('materia.ra.pista.mover') : this.ctx.xr.hasHit ? t('materia.ra.pista.toca') : t('materia.ra.pista.suelo');
    if (this.hint.textContent !== text) this.hint.textContent = text;
  }

  dispose(): void {
    window.removeEventListener('resize', this.shiftView);
    if (!this.ar) this.ctx.ar.camera.clearViewOffset();
    window.removeEventListener('touchstart', this.onTouch);
    window.removeEventListener('touchmove', this.onTouch);
    window.removeEventListener('touchend', this.onTouchEnd);
    this.root.removeFromParent();
    this.shadow?.geometry.dispose();
    this.anchor?.dispose();
    this.anchor = undefined;
  }

  private readonly shiftView = (): void => {
    const { innerWidth: w, innerHeight: h } = window;
    this.ctx.ar.camera.setViewOffset(w, h, 0, h * 0.17, w, h);
  };

  private apply(): void {
    if (!this.ar) return;
    this.root.scale.setScalar(this.scale);
    // Apoyado en la superficie: el centro, a un radio de altura.
    this.root.position.y = this.radius * this.scale * 1.02;
    this.shadow?.scale.setScalar(this.scale);
  }

  // Pellizco con dos dedos: cambia el tamaño.
  private readonly onTouch = (e: TouchEvent): void => {
    if (e.touches.length !== 2) return;
    const [a, b] = [e.touches[0], e.touches[1]];
    const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    if (!this.pinch) this.pinch = { distance, scale: this.scale };
    else this.setScale(this.pinch.scale * (distance / this.pinch.distance));
  };
  private readonly onTouchEnd = (e: TouchEvent): void => {
    // Se suelta el pellizco un poco después, para que el último dedo no cuente como «colocar».
    if (e.touches.length < 2 && this.pinch) setTimeout(() => (this.pinch = undefined), 300);
  };
}
