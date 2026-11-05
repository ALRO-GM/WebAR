/**
 * Aprender de verdad: si a mitad de una lección (o de una Adivina) se sale de
 * la app o de la pestaña, o se cambia a otra ventana (p. ej. para preguntar a
 * una IA), al volver se empieza de nuevo desde la primera pregunta. Repetirlas
 * es lo que fija lo aprendido.
 *
 * `onLeave` se llama una vez por salida. Devuelve cómo dejar de vigilar.
 */
export function watchLeave(onLeave: () => void): () => void {
  let away = false;
  const leave = () => {
    if (away) return;
    away = true;
    onLeave();
  };
  const back = () => {
    if (document.visibilityState === 'visible' && document.hasFocus()) away = false;
  };
  const onVisibility = () => (document.visibilityState === 'hidden' ? leave() : back());
  document.addEventListener('visibilitychange', onVisibility);
  // En el ordenador, cambiar a otra ventana no oculta la pestaña: se mira el foco.
  window.addEventListener('blur', leave);
  window.addEventListener('focus', back);
  window.addEventListener('pagehide', leave);
  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('blur', leave);
    window.removeEventListener('focus', back);
    window.removeEventListener('pagehide', leave);
  };
}
