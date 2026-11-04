/**
 * Emitir al proyector: el móvil del profesor manda lo que ve (RA incluida) a
 * un ordenador con la misma cuenta, abierto en /proyector.html.
 *
 * ```ts
 * import './cast/cast.css';
 * import { renderCastPanel, getCastSender } from './cast';
 * const deps = {
 *   frameSources: () => ({ gl: ar.renderer.domElement, video: marker.source, mirror: false }),
 *   renderNow: () => ar.renderer.render(ar.scene, ar.camera),
 *   onFrame: (cb) => ar.on('rendered', cb), // opcional: tras cada pintado
 * };
 * renderCastPanel(perfil, deps);             // entrar + Emitir / Dejar de emitir
 * hud.append(getCastSender().indicator());   // opcional: si no, va a <body>
 * ```
 */
export { renderCastPanel } from './panel';
export { CastSender, getCastSender, DIRECT_TIMEOUT_MS, type CastState, type CastTransport } from './sender';
export type { CastDeps, CastMode, FrameSources } from './compositor';
export { teacherToken, loginTeacher, forgetTeacher } from './api';
