import './theme.css';
import './style.css';
import './teacher.css';
import qrcode from 'qrcode-generator';
import { REACTIONS, SPECIES, getSpecies } from '@webar/chem';
import { has, t, translate } from './i18n';
import { contentName, speciesName } from './i18n/content';
import { RIDDLES } from './cards/riddle';
import { NODES } from './learn/path';
import { applySettings } from './settings';
import { COURSES, COURSE_SPECIES } from './platform/progress';
import { wireTooltips } from './teacher/charts';
import { compareClasses, renderStats, type ClassEventsResponse } from './teacher/stats-view';

// Panel del profesorado: cuenta, clases, alumnado, estadísticas (teacher/) y retos.
// Necesita conexión (el alumnado es quien usa la app sin ella).

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const view = $('profe-contenido');
let token = localStorage.getItem('webar:profe');

interface ClassRow { id: number; name: string; course: string; code: string; students?: number }
interface Detail {
  clase: ClassRow;
  alumnos: Array<{ id: number; alias: string; last_seen: string | null; discovered: number; reactions: number; challenges: number }>;
  retos: Array<{ id: number; title: string; description: string; targets: string[]; ends: string | null }>;
  actividades: Array<{
    id: number; tipo: 'acertijo' | 'adivina'; acertijo?: string; elementos?: string[]; creada: string; cerrada: string | null;
    resultados: Array<{ alias: string; puntos?: number; resuelto?: boolean; aciertos?: number; total?: number }>;
  }>;
  actividad: Array<{ day: string; events: number }>;
  reacciones: Array<{ reaction: string; times: number }>;
  discovered: Array<{ species: string; students: number }>;
}

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error(t('profe.error_red'));
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token) logout();
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data as T;
}

function logout(): void {
  token = null;
  localStorage.removeItem('webar:profe');
  void route();
}

/** Muestra el error de un formulario en su párrafo de alerta. */
function guard(form: HTMLFormElement, fn: () => Promise<void>): void {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const out = form.querySelector('.error')!;
    out.textContent = '';
    try {
      await fn();
    } catch (error) {
      out.textContent = (error as Error).message;
    }
  });
}

// --- Entrar --------------------------------------------------------------------

function renderLogin(): void {
  $('profe-quien').textContent = '';
  view.innerHTML = `<div class="profe-dos">
    <form id="f-entrar" class="tarjeta-panel"><h2>${t('profe.entrar')}</h2>
      <label>${t('profe.email')}<input name="email" type="email" required autocomplete="email" /></label>
      <label>${t('profe.password')}<input name="password" type="password" required minlength="8" autocomplete="current-password" /></label>
      <button>${t('profe.entrar')}</button><p class="error" role="alert"></p></form>
    <form id="f-registro" class="tarjeta-panel"><h2>${t('profe.crear_cuenta')}</h2>
      <label>${t('profe.nombre')}<input name="nombre" required maxlength="80" autocomplete="name" /></label>
      <label>${t('profe.email')}<input name="email" type="email" required autocomplete="email" /></label>
      <label>${t('profe.password')}<input name="password" type="password" required minlength="8" autocomplete="new-password" /></label>
      <button>${t('profe.crear_cuenta')}</button><p class="error" role="alert"></p></form></div>
    <section class="tarjeta-panel demo-profe"><h2>🎬 ${t('demo.profe_titulo')}</h2><p class="pequeno">${t('demo.profe_texto')}</p>
      <button id="demo-profe" type="button">${t('demo.profe_boton')}</button><p class="error" role="alert"></p></section>`;
  $('demo-profe').addEventListener('click', async () => {
    try {
      const res = await api<{ token: string; clase: number }>('POST', '/api/demo');
      token = res.token;
      localStorage.setItem('webar:profe', res.token);
      location.hash = `clase/${res.clase}/estadisticas`;
      await route();
    } catch (error) {
      view.querySelector('.demo-profe .error')!.textContent = (error as Error).message;
    }
  });
  for (const [id, path] of [['f-entrar', '/api/sesion'], ['f-registro', '/api/profesores']] as const) {
    const form = $<HTMLFormElement>(id);
    guard(form, async () => {
      const res = await api<{ token: string }>('POST', path, Object.fromEntries(new FormData(form)));
      token = res.token;
      localStorage.setItem('webar:profe', res.token);
      await route();
    });
  }
}

// --- Clases ----------------------------------------------------------------------

async function renderClasses(): Promise<void> {
  const data = await api<{ profesor: { name: string }; clases: ClassRow[] }>('GET', '/api/profesor');
  $('profe-quien').innerHTML = `${esc(t('profe.hola', { nombre: data.profesor.name }))} <a id="proyectar" class="btn pequeno" href="/proyector.html">${t('emision.proyectar')}</a> <button id="salir" class="secundario">${t('profe.salir')}</button>`;
  $('salir').addEventListener('click', logout);
  view.innerHTML = `<h2>${t('profe.clases')}</h2>
    <div class="clases">${data.clases.length ? data.clases.map((c) => `<a class="clase" href="#clase/${c.id}"><b>${esc(c.name)}</b><span>${t(`curso.${c.course}`)} · ${t('profe.alumnos_n', { n: c.students ?? 0 })}</span><code>${c.code}</code></a>`).join('') : `<p>${t('profe.ninguna')}</p>`}</div>
    <form id="f-clase" class="tarjeta-panel en-linea"><h3>${t('profe.nueva_clase')}</h3>
      <label>${t('profe.nombre_clase')}<input name="nombre" required maxlength="80" /></label>
      <label>${t('profe.curso')}<select name="curso">${COURSES.map((c) => `<option value="${c}">${t(`curso.${c}`)}</option>`).join('')}</select></label>
      <button>${t('profe.crear')}</button><p class="error" role="alert"></p></form>
    <div id="comparar"></div>`;
  if (data.clases.length > 1)
    void api<{ clases: Parameters<typeof compareClasses>[0] }>('GET', '/api/profesor/resumen')
      .then((r) => ($('comparar').innerHTML = compareClasses(r.clases, new Map(data.clases.map((c) => [c.id, c.name])))))
      .catch(() => undefined);
  const form = $<HTMLFormElement>('f-clase');
  guard(form, async () => {
    const c = await api<ClassRow>('POST', '/api/clases', Object.fromEntries(new FormData(form)));
    location.hash = `clase/${c.id}`;
  });
}

// --- Una clase --------------------------------------------------------------------

async function renderClass(id: number): Promise<void> {
  const d = await api<Detail>('GET', `/api/clases/${id}`);
  const link = `${location.origin}/?unirse=${d.clase.code}`;
  const qr = qrcode(0, 'M');
  qr.addData(link);
  qr.make();
  const discovered = new Map(d.discovered.map((x) => [x.species, x.students]));
  const totalReactions = d.alumnos.reduce((s, a) => s + a.reactions, 0);
  const totalChallenges = d.alumnos.reduce((s, a) => s + a.challenges, 0);

  view.innerHTML = `<p><a href="#">${t('profe.volver')}</a></p>
    <h2>${esc(d.clase.name)} <small>${t(`curso.${d.clase.course}`)}</small></h2>
    <a class="boton-estadisticas" href="#clase/${id}/estadisticas"><span aria-hidden="true">📊</span><span><b>${t('estadisticas.abrir')}</b><small>${t('estadisticas.abrir_texto')}</small></span></a>
    <section class="codigo-clase tarjeta-panel">
      <div><h3>${t('profe.codigo')}</h3><p class="codigo">${d.clase.code}</p><p class="pequeno">${t('profe.codigo_texto')}</p><p class="pequeno"><a href="${esc(link)}">${esc(link)}</a></p></div>
      <div class="qr" role="img" aria-label="QR: ${esc(link)}">${qr.createSvgTag({ cellSize: 5, margin: 2, scalable: true })}</div>
    </section>

    ${activitiesSection(d)}

    <section class="tiles">
      ${tile(t('profe.tile.alumnos'), d.alumnos.length)}
      ${tile(t('profe.tile.moleculas'), `${discovered.size}<small>/${SPECIES.length}</small>`)}
      ${tile(t('profe.tile.reacciones'), totalReactions)}
      ${tile(t('profe.tile.retos'), totalChallenges)}
    </section>

    <section class="tarjeta-panel"><h3>${t('profe.liga')}</h3><p class="pequeno">${t('profe.liga_texto')}</p><div id="liga-clase"><p class="pequeno">${t('liga.cargando')}</p></div></section>

    <section class="tarjeta-panel"><div class="cabecera-grafica"><h3>${t('profe.actividad')}</h3>
      <button id="alternar" class="secundario">${t('profe.ver_tabla')}</button></div>
      <div id="grafica"></div></section>

    <section class="tarjeta-panel"><h3>${t('profe.alumnado')}</h3>${studentsTable(d)}</section>

    <section class="tarjeta-panel"><h3>${t('profe.cobertura')}</h3><p class="pequeno">${t('profe.cobertura_texto')}</p>
      ${COURSES.map((c) => `<h4>${t(`curso.${c}`)}</h4><div class="cobertura">${COURSE_SPECIES[c].map((s) => {
        const n = discovered.get(s) ?? 0;
        return `<span class="${n ? 'si' : 'no'}">${getSpecies(s)!.formula}${n ? ` (${n})` : ''}</span>`;
      }).join('')}</div>`).join('')}
      ${d.reacciones.length ? `<h4>${t('profe.col.reacciones')}</h4><ul>${d.reacciones.map((r) => `<li>${esc(REACTIONS.find((x) => x.id === r.reaction)?.name ?? r.reaction)}: ${r.times}</li>`).join('')}</ul>` : ''}
    </section>

    <section class="tarjeta-panel"><h3>${t('profe.retos')}</h3>
      ${d.retos.map((r) => `<div class="reto"><div><b>${esc(r.title)}</b><small>${r.targets.map((s) => getSpecies(s)?.formula ?? s).join(' · ')}${r.ends ? ` · ${t('retos.hasta', { fecha: new Date(r.ends).toLocaleDateString(document.documentElement.lang) })}` : ''}</small></div>
        <button class="secundario" data-borrar-reto="${r.id}">${t('profe.borrar')}</button></div>`).join('')}
      <form id="f-reto" class="nuevo-reto"><h4>${t('profe.nuevo_reto')}</h4>
        <label>${t('profe.reto_titulo')}<input name="titulo" required maxlength="80" /></label>
        <label>${t('profe.reto_descripcion')}<input name="descripcion" maxlength="500" /></label>
        <label>${t('profe.reto_fin')}<input name="fin" type="date" /></label>
        <fieldset><legend>${t('profe.reto_moleculas')}</legend>
        ${COURSES.map((c) => `<div class="grupo"><button type="button" class="secundario" data-curso="${c}">${t('profe.reto_todo_curso', { curso: t(`curso.${c}`) })}</button>
          ${COURSE_SPECIES[c].map((s) => `<label class="casilla"><input type="checkbox" name="objetivos" value="${esc(s)}" data-de="${c}" />${getSpecies(s)!.formula}</label>`).join('')}</div>`).join('')}
        </fieldset>
        <button>${t('profe.crear')}</button><p class="error" role="alert"></p></form>
    </section>
    <p><button id="borrar-clase" class="peligro">${t('profe.borrar_clase')}</button></p>`;

  renderActivity(d.actividad);
  void api<{ alumnos: Array<{ puesto: number; alias: string; xp: number }> }>('GET', `/api/clases/${id}/liga`)
    .then((l) => {
      $('liga-clase').innerHTML = l.alumnos.length
        ? `<ol class="ranking">${l.alumnos.map((a) => `<li><span class="puesto">${a.puesto <= 3 ? ['🥇', '🥈', '🥉'][a.puesto - 1] : a.puesto}</span><span class="ranking-nombre">${esc(a.alias)}</span><b>${a.xp} XP</b></li>`).join('')}</ol>`
        : `<p class="pequeno">${t('profe.liga_vacia')}</p>`;
    })
    .catch(() => ($('liga-clase').innerHTML = `<p class="pequeno">${t('liga.sin_red')}</p>`));
  let asTable = false;
  $('alternar').addEventListener('click', () => {
    asTable = !asTable;
    $('alternar').textContent = asTable ? t('profe.ver_grafica') : t('profe.ver_tabla');
    renderActivity(d.actividad, asTable);
  });

  view.querySelectorAll<HTMLButtonElement>('[data-curso]').forEach((b) =>
    b.addEventListener('click', () => view.querySelectorAll<HTMLInputElement>(`[data-de="${b.dataset.curso}"]`).forEach((i) => (i.checked = true))),
  );
  wireActivities(id);
  const form = $<HTMLFormElement>('f-reto');
  guard(form, async () => {
    const data = new FormData(form);
    await api('POST', `/api/clases/${id}/retos`, { titulo: data.get('titulo'), descripcion: data.get('descripcion'), fin: data.get('fin'), objetivos: data.getAll('objetivos') });
    await renderClass(id);
  });
  view.querySelectorAll<HTMLButtonElement>('[data-borrar-reto]').forEach((b) =>
    b.addEventListener('click', async () => {
      await api('DELETE', `/api/clases/${id}/retos/${b.dataset.borrarReto}`);
      await renderClass(id);
    }),
  );
  view.querySelectorAll<HTMLButtonElement>('[data-alumno]').forEach((b) =>
    b.addEventListener('click', async () => {
      const student = d.alumnos.find((a) => a.id === Number(b.dataset.alumno))!;
      if (b.dataset.accion === 'quitar') {
        if (!confirm(t('profe.confirmar_quitar', { alias: student.alias }))) return;
        await api('DELETE', `/api/clases/${id}/alumnos/${student.id}`);
      } else {
        const alias = prompt(t('profe.nuevo_alias', { alias: student.alias }), student.alias);
        if (!alias) return;
        await api('PATCH', `/api/clases/${id}/alumnos/${student.id}`, { alias });
      }
      await renderClass(id);
    }),
  );
  $('borrar-clase').addEventListener('click', async () => {
    if (!confirm(t('profe.confirmar_borrar_clase', { nombre: d.clase.name }))) return;
    await api('DELETE', `/api/clases/${id}`);
    location.hash = '';
  });
}

// --- Actividades para la clase (acertijos y Adivina) -------------------------------

/** Lo que se puede poner en una Adivina: elementos del camino y sustancias del curso con objeto cotidiano. */
function guessOptions(course: string): { elements: string[]; species: string[] } {
  const elements = [...new Set(NODES.filter((n) => n.kind === 'leccion').map((n) => n.elements[0]))].filter((s) => has(`objeto.${s}`)).slice(0, 40);
  const species = (COURSE_SPECIES[course as keyof typeof COURSE_SPECIES] ?? []).filter((s) => has(`objeto.${s}`));
  return { elements, species };
}

function activitiesSection(d: Detail): string {
  const students = d.alumnos.length;
  const { elements, species } = guessOptions(d.clase.course);
  const check = (c: string, on: boolean) => `<label class="casilla"><input type="checkbox" name="elementos" value="${esc(c)}" ${on ? 'checked' : ''}/>${esc(contentName(c))}</label>`;
  const list = d.actividades.map((a) => {
    const done = a.resultados.length;
    const avg = done ? Math.round(a.resultados.reduce((s, r) => s + Number(r.puntos ?? 0), 0) / done) : 0;
    const what = a.tipo === 'acertijo' ? `🕵️ ${t('actividad.acertijo')}: ${esc(speciesName(a.acertijo ?? ''))}` : `🔮 ${t('actividad.adivina')}: ${(a.elementos ?? []).map((c) => esc(contentName(c))).join(', ')}`;
    return `<div class="reto actividad"><div><b>${what}</b>
      <small>${new Date(a.creada.replace(' ', 'T') + 'Z').toLocaleString(document.documentElement.lang, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · ${a.cerrada ? t('profe.actividad_cerrada') : t('profe.actividad_abierta')} · ${t('profe.actividad_hecha', { n: done, de: students })}${done ? ` · ${t('profe.actividad_media', { n: avg })}` : ''}</small>
      ${done ? `<details><summary>${t('profe.actividad_resultados')}</summary><ul>${a.resultados.map((r) => `<li>${esc(r.alias)}: ${r.puntos ?? 0}${a.tipo === 'acertijo' ? (r.resuelto ? ' ✓' : ' ✗') : ` (${r.aciertos ?? 0}/${r.total ?? 0})`}</li>`).join('')}</ul></details>` : ''}</div>
      ${a.cerrada ? '' : `<button class="secundario" data-cerrar-actividad="${a.id}">${t('profe.actividad_cerrar')}</button>`}</div>`;
  }).join('');
  return `<section class="tarjeta-panel"><h3>${t('profe.actividades')}</h3><p class="pequeno">${t('profe.actividades_texto')}</p>
    ${list || `<p class="pequeno">${t('profe.actividades_ninguna')}</p>`}
    <form id="f-acertijo" class="nuevo-reto"><h4>🕵️ ${t('profe.lanzar_acertijo')}</h4>
      <label>${t('profe.que_acertijo')}<select name="acertijo">${RIDDLES.map((r) => `<option value="${r.id}">${esc(speciesName(r.target))} (${t(`acertijo.dificultad.${r.difficulty}`)})</option>`).join('')}</select></label>
      <button>${t('profe.lanzar')}</button><p class="error" role="alert"></p></form>
    <form id="f-adivina" class="nuevo-reto"><h4>🔮 ${t('profe.lanzar_adivina')}</h4><p class="pequeno">${t('profe.adivina_texto')}</p>
      <fieldset><legend>${t('profe.elementos')}</legend><div class="grupo">${elements.map((c, i) => check(c, i < 8)).join('')}</div></fieldset>
      ${species.length ? `<fieldset><legend>${t('profe.sustancias_curso', { curso: t(`curso.${d.clase.course}`) })}</legend><div class="grupo">${species.map((c) => check(c, false)).join('')}</div></fieldset>` : ''}
      <button>${t('profe.lanzar')}</button><p class="error" role="alert"></p></form>
  </section>`;
}

function wireActivities(id: number): void {
  const riddle = $<HTMLFormElement>('f-acertijo');
  guard(riddle, async () => {
    await api('POST', `/api/clases/${id}/actividades`, { tipo: 'acertijo', acertijo: new FormData(riddle).get('acertijo') });
    await renderClass(id);
  });
  const guess = $<HTMLFormElement>('f-adivina');
  guard(guess, async () => {
    await api('POST', `/api/clases/${id}/actividades`, { tipo: 'adivina', elementos: new FormData(guess).getAll('elementos') });
    await renderClass(id);
  });
  view.querySelectorAll<HTMLButtonElement>('[data-cerrar-actividad]').forEach((b) =>
    b.addEventListener('click', async () => {
      await api('DELETE', `/api/clases/${id}/actividades/${b.dataset.cerrarActividad}`);
      await renderClass(id);
    }),
  );
}

const tile = (label: string, value: unknown) => `<div class="tile"><span class="valor">${value}</span><span class="etiqueta">${esc(label)}</span></div>`;

function studentsTable(d: Detail): string {
  if (!d.alumnos.length) return `<p class="pequeno">${t('profe.sin_alumnos')}</p>`;
  return `<div class="tabla-datos"><table><thead><tr>
    <th scope="col">${t('profe.col.alias')}</th><th scope="col">${t('profe.col.moleculas')}</th><th scope="col">${t('profe.col.reacciones')}</th>
    <th scope="col">${t('profe.col.retos')}</th><th scope="col">${t('profe.col.ultima')}</th><th scope="col"><span class="sr">Acciones</span></th></tr></thead><tbody>
    ${d.alumnos.map((a) => `<tr><th scope="row">${esc(a.alias)}</th><td>${a.discovered}</td><td>${a.reactions}</td><td>${a.challenges}</td>
      <td>${a.last_seen ? new Date(`${a.last_seen}Z`).toLocaleDateString(document.documentElement.lang) : t('profe.nunca')}</td>
      <td class="acciones"><button class="secundario" data-alumno="${a.id}" data-accion="alias">${t('profe.renombrar')}</button>
      <button class="secundario" data-alumno="${a.id}" data-accion="quitar">${t('profe.quitar')}</button></td></tr>`).join('')}
    </tbody></table></div>`;
}

/**
 * Barras de una sola serie (sin leyenda: el título la nombra), valores de 14
 * días con los vacíos a 0, tooltip al pasar y vista de tabla alternativa.
 */
function renderActivity(rows: Detail['actividad'], asTable = false): void {
  const days: Array<{ day: string; events: number }> = [];
  for (let i = 13; i >= 0; i--) {
    const day = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    days.push({ day, events: rows.find((r) => r.day === day)?.events ?? 0 });
  }
  const fmt = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString(document.documentElement.lang, { day: 'numeric', month: 'short' });
  const box = $('grafica');
  if (asTable) {
    box.innerHTML = `<div class="tabla-datos"><table><thead><tr><th scope="col">${t('profe.dia')}</th><th scope="col">${t('profe.acciones')}</th></tr></thead><tbody>
      ${days.map((d) => `<tr><th scope="row">${fmt(d.day)}</th><td>${d.events}</td></tr>`).join('')}</tbody></table></div>`;
    return;
  }
  const W = 560, H = 180, padL = 28, padB = 22, padT = 8;
  const max = Math.max(4, ...days.map((d) => d.events));
  const nice = Math.ceil(max / 4) * 4;
  const bw = (W - padL) / days.length;
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / nice);
  const grid = [0, nice / 2, nice].map((v) => `<line x1="${padL}" x2="${W}" y1="${y(v)}" y2="${y(v)}" class="rejilla-g"/><text x="${padL - 6}" y="${y(v) + 4}" class="eje" text-anchor="end">${v}</text>`).join('');
  const bars = days.map((d, i) => {
    // Barra fina (60 % del hueco, máx. 22 px) centrada, con las esquinas de arriba redondeadas y la base recta.
    const w = Math.min(bw * 0.6, 22);
    const x = padL + i * bw + (bw - w) / 2;
    const h = Math.max(0, y(0) - y(d.events));
    const r = Math.min(4, h, w / 2);
    const path = h ? `M${x},${y(0)} v${-(h - r)} q0,${-r} ${r},${-r} h${w - 2 * r} q${r},0 ${r},${r} v${h - r} z` : '';
    return `<g class="barra" data-i="${i}"><rect x="${padL + i * bw}" y="${padT}" width="${bw}" height="${H - padT - padB}" fill="transparent"/>${path ? `<path d="${path}"/>` : ''}
      ${i % 2 === 0 || i === 13 ? `<text x="${x + w / 2}" y="${H - 6}" class="eje" text-anchor="middle">${fmt(d.day)}</text>` : ''}</g>`;
  }).join('');
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="grafica" role="img" aria-label="${esc(t('profe.actividad'))}">${grid}${bars}</svg><p class="pequeno">${t('profe.actividad_eje')}</p>`;
  const tip = $('tooltip');
  box.querySelectorAll<SVGGElement>('.barra').forEach((g) => {
    const d = days[Number(g.dataset.i)];
    g.addEventListener('pointerenter', () => {
      g.classList.add('activa');
      tip.innerHTML = `<b>${d.events}</b> ${esc(t('profe.actividad_eje'))}<br/><small>${fmt(d.day)}</small>`;
      tip.hidden = false;
    });
    g.addEventListener('pointermove', (e) => Object.assign(tip.style, { left: `${e.clientX + 12}px`, top: `${e.clientY - 40}px` }));
    g.addEventListener('pointerleave', () => {
      g.classList.remove('activa');
      tip.hidden = true;
    });
  });
}

// --- Rutas -----------------------------------------------------------------------

async function route(): Promise<void> {
  try {
    if (!token) return renderLogin();
    const m = location.hash.match(/^#clase\/(\d+)(\/estadisticas)?$/);
    if (m?.[2]) {
      view.innerHTML = `<p class="pequeno">${t('estadisticas.cargando')}</p>`;
      renderStats(view, await api<ClassEventsResponse>('GET', `/api/clases/${m[1]}/eventos`));
    } else if (m) await renderClass(Number(m[1]));
    else await renderClasses();
  } catch (error) {
    view.innerHTML = `<p class="error" role="alert">${esc((error as Error).message)}</p>`;
  }
}

applySettings();
translate();
wireTooltips(view, $('tooltip'));
window.addEventListener('hashchange', () => void route());
void route();
