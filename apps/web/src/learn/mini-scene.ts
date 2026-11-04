import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createRenderer } from '@webar/ar-core';

export interface Showable {
  object: THREE.Object3D;
  radius: number;
  update(dt: number): void;
  dispose(): void;
}

/**
 * Un visor 3D pequeño dentro de una tarjeta (lecciones, Adivina): su propio
 * lienzo, luz suave y el objeto girando despacio. Se desecha al cambiar de
 * ejercicio para no dejar contextos WebGL abiertos.
 */
export class MiniScene {
  private readonly renderer: THREE.WebGLRenderer | null;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
  private readonly pivot = new THREE.Group();
  private item: Showable | null = null;
  private frame = 0;
  private last = performance.now();
  private readonly observer: ResizeObserver;
  private drag: { x: number; rot: number } | null = null;

  constructor(private readonly host: HTMLElement) {
    this.renderer = createRenderer();
    this.observer = new ResizeObserver(() => this.resize());
    // Sin WebGL no hay dibujo 3D: el ejercicio sigue igual, solo sin la figura.
    if (!this.renderer) {
      host.hidden = true;
      return;
    }
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setClearColor(0, 0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const canvas = this.renderer.domElement;
    canvas.style.cssText = 'width:100%;height:100%;display:block;touch-action:pan-y';
    host.append(canvas);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(1, 2, 2);
    this.scene.add(key, new THREE.AmbientLight(0xffffff, 0.4), this.pivot);
    this.observer.observe(host);
    this.resize();
    // Girar con el dedo (horizontal); el desplazamiento vertical sigue siendo de la página.
    canvas.addEventListener('pointerdown', (e) => (this.drag = { x: e.clientX, rot: this.pivot.rotation.y }));
    canvas.addEventListener('pointermove', (e) => this.drag && (this.pivot.rotation.y = this.drag.rot + (e.clientX - this.drag.x) * 0.01));
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) canvas.addEventListener(ev, () => (this.drag = null));
    this.loop();
  }

  show(item: Showable): void {
    if (!this.renderer) return item.dispose();
    this.item?.dispose();
    this.pivot.clear();
    this.item = item;
    this.pivot.add(item.object);
    const r = item.radius || 0.5;
    this.camera.position.set(0, r * 0.6, r * 3.6);
    this.camera.lookAt(0, 0, 0);
    this.camera.near = r * 0.05;
    this.camera.far = r * 50;
    this.camera.updateProjectionMatrix();
  }

  private resize(): void {
    const { clientWidth: w, clientHeight: h } = this.host;
    if (!w || !h || !this.renderer) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private loop = () => {
    this.frame = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    if (!this.drag) this.pivot.rotation.y += dt * 0.4;
    this.item?.update(dt);
    this.renderer?.render(this.scene, this.camera);
  };

  /** Avanza la animación a mano (pruebas sin pantalla). */
  advance(seconds: number): void {
    for (let t = 0; t < seconds; t += 1 / 30) this.item?.update(1 / 30);
    this.renderer?.render(this.scene, this.camera);
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.item?.dispose();
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
    this.renderer?.domElement.remove();
  }
}
