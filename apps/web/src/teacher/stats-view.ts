import { getElement, getSpecies } from '@webar/chem';
import { t } from '../i18n';
import { contentName } from '../i18n/content';
import type { Skill } from '../learn/exercises';
import { dayKey } from '../platform/progress';
import { bars, chartCard, columns, esc, heatmap, pct, stacked, table, wireToggles } from './charts';
import { classStats, easiest, hardest, rate, type ClassEvent, type ClassStats, type Status, type StudentInfo, type StudentStats } from './stats';

/**
 * La página de estadísticas de una clase: primero lo que hay que hacer
 * (recomendaciones en frases cortas), luego el detalle (uso, preguntas,
 * avance) y al final la tabla del alumnado. Todo se calcula en el navegador
 * a partir de los eventos (stats.ts).
 */
export interface ClassEventsResponse {
  clase: { id: number; name: string; course: string };
  alumnos: Array<StudentInfo & { last_seen: string | null }>;
  eventos: Array<[number, ClassEvent['tipo'], Record<string, unknown>, string]>;
  completo: boolean;
}

const lang = () => document.documentElement.lang || 'es';
const skillName = (s: Skill | string) => t(`estadisticas.tipo.${s}`);
/** «Oxígeno (O)», «Agua (H₂O)»; si no se conoce, el id tal cual. */
function topicName(topic: string): string {
  try {
    const formula = getSpecies(topic)?.formula ?? getElement(topic).symbol;
    return `${esc(contentName(topic))} <small>(${esc(formula)})</small>`;
  } catch {
    return esc(topic);
  }
}
const topicPlain = (topic: string) => topicName(topic).replace(/<[^>]+>/g, '');
const unitName = (unit: number, elements: string[]) => `${t('camino.unidad', { n: unit + 1 })} · ${elements.join(', ')}`;

const STATUS_ICON: Record<Status, string> = { avanzado: '🚀', 'en-marcha': '✓', retrasado: '⚠', inactivo: '💤', 'sin-empezar': '○' };
const statusChip = (s: Status) => `<span class="estado ${s}"><span aria-hidden="true">${STATUS_ICON[s]}</span> ${t(`estadisticas.estado.${s}`)}</span>`;

function reasonText(r: StudentStats['reasons'][number]): string {
  const vars = { ...r.vars };
  if (typeof vars.tipo === 'string') vars.tipo = skillName(vars.tipo);
  return t(`estadisticas.motivo.${r.key}`, vars);
}

export function renderStats(view: HTMLElement, data: ClassEventsResponse): void {
  const events: ClassEvent[] = data.eventos.map(([alumno, tipo, datos, fecha]) => ({ alumno, tipo, datos, fecha }));
  const stats = classStats(data.alumnos, events, new Date());
  const name = new Map(stats.students.map((s) => [s.id, s.alias]));
  const alias = (id: number) => esc(name.get(id) ?? '?');

  view.innerHTML = `<p><a href="#clase/${data.clase.id}">${t('estadisticas.volver_clase')}</a></p>
    <h2>${t('estadisticas.titulo')} · ${esc(data.clase.name)} <small>${t(`curso.${data.clase.course}`)}</small></h2>
    <nav class="indice" aria-label="${t('estadisticas.indice')}">
      ${['recomendaciones', 'uso', 'preguntas', 'avance', 'alumnado'].map((id) => `<a href="#" data-ir="e-${id}">${t(`estadisticas.seccion.${id}`)}</a>`).join('')}
    </nav>
    ${data.completo ? '' : `<p class="aviso-datos" role="note">${t('estadisticas.incompleto')}</p>`}
    ${tiles(stats)}
    ${stats.started ? '' : `<section class="tarjeta-panel"><p>${t('estadisticas.vacia')}</p></section>`}
    ${recommendations(stats, alias)}
    <h3 class="seccion" id="e-uso">${t('estadisticas.seccion.uso')}</h3>
    ${usage(stats)}
    <h3 class="seccion" id="e-preguntas">${t('estadisticas.seccion.preguntas')}</h3>
    ${questions(stats)}
    <h3 class="seccion" id="e-avance">${t('estadisticas.seccion.avance')}</h3>
    ${progress(stats)}
    <h3 class="seccion" id="e-alumnado">${t('estadisticas.seccion.alumnado')}</h3>
    ${studentTable(stats)}
    <p class="pequeno">${t('estadisticas.nota_privacidad')}</p>`;

  wireToggles(view);
  view.querySelectorAll<HTMLAnchorElement>('[data-ir]').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById(a.dataset.ir!)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }),
  );
  // Parejas ⇄ equipos.
  view.querySelectorAll<HTMLButtonElement>('[data-agrupar]').forEach((b) =>
    b.addEventListener('click', () => {
      view.querySelectorAll<HTMLButtonElement>('[data-agrupar]').forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
      view.querySelectorAll<HTMLElement>('[data-grupos]').forEach((g) => (g.hidden = g.dataset.grupos !== b.dataset.agrupar));
    }),
  );
  view.querySelector<HTMLButtonElement>('[data-copiar]')?.addEventListener('click', async (e) => {
    const visible = view.querySelector<HTMLElement>('[data-grupos]:not([hidden])')!;
    const text = [...visible.querySelectorAll<HTMLElement>('li')].map((li) => li.innerText.replace(/\s+/g, ' ').trim()).join('\n');
    const button = e.currentTarget as HTMLButtonElement;
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = t('estadisticas.copiado');
    } catch {
      button.textContent = t('estadisticas.no_copiado');
    }
  });
  // Ficha de cada alumno (se abre debajo de su fila).
  view.querySelectorAll<HTMLButtonElement>('[data-ficha]').forEach((b) =>
    b.addEventListener('click', () => {
      const row = view.querySelector<HTMLElement>(`#ficha-${b.dataset.ficha}`)!;
      row.hidden = !row.hidden;
      b.setAttribute('aria-expanded', String(!row.hidden));
    }),
  );
}

function tiles(s: ClassStats): string {
  const minutes = s.students.reduce((sum, x) => sum + x.minutes, 0);
  const tile = (label: string, value: string, help = '') => `<div class="tile"><span class="valor">${value}</span><span class="etiqueta">${esc(label)}</span>${help ? `<small>${esc(help)}</small>` : ''}</div>`;
  return `<section class="tiles">
    ${tile(t('estadisticas.tile.empezado'), `${s.started}<small>/${s.students.length}</small>`)}
    ${tile(t('estadisticas.tile.activos'), `${s.active7}<small>/${s.students.length}</small>`)}
    ${tile(t('estadisticas.tile.acierto'), s.answers.intentos ? pct(rate(s.answers)) : '—', t('estadisticas.tile.acierto_ayuda', { n: s.answers.intentos }))}
    ${tile(t('estadisticas.tile.minutos'), String(minutes))}
  </section>`;
}

function recommendations(s: ClassStats, alias: (id: number) => string): string {
  const hardSkills = hardest(s.bySkill, 3);
  const hardItems = hardest(s.items, 5);
  const hardTopics = hardest(s.byTopic, 4);
  const behind = s.students.filter((x) => x.status === 'retrasado' || x.status === 'inactivo').sort((a, b) => a.mastery - b.mastery);
  const ahead = s.students.filter((x) => x.status === 'avanzado').sort((a, b) => b.mastery - a.mastery);
  const notStarted = s.students.filter((x) => x.status === 'sin-empezar');
  const fails = (r: { fallaron: number; alumnos: number; intentos: number; aciertos: number }) =>
    t('estadisticas.fallan', { pct: Math.round((1 - rate(r)) * 100), n: r.fallaron, de: r.alumnos });

  const work = hardSkills.length || hardTopics.length
    ? `<ul class="recos">${hardSkills.map((h) => `<li><b>${esc(skillName(h.skill))}</b> · ${esc(fails(h))}<br/><small>${t(`estadisticas.idea.${h.skill}`)}</small></li>`).join('')}
        ${hardTopics.map((h) => `<li><b>${topicName(h.topic)}</b> · ${esc(fails(h))}</li>`).join('')}</ul>
      ${hardItems.length ? `<details><summary>${t('estadisticas.preguntas_concretas')}</summary><ul class="recos">${hardItems.map((i) => `<li>${esc(skillName(i.skill))} · ${topicName(i.topic)} · ${esc(fails(i))}</li>`).join('')}</ul></details>` : ''}`
    : `<p class="pequeno">${t(s.answers.intentos ? 'estadisticas.nada_dificil' : 'estadisticas.sin_respuestas')}</p>`;

  const person = (x: StudentStats) => `<li><b>${esc(x.alias)}</b> ${statusChip(x.status)}<br/><small>${x.reasons.map(reasonText).map(esc).join(' · ')}</small></li>`;
  const pairs = s.pairs.map((p) => {
    const help = [
      ...p.skills.map(skillName),
      ...(p.unit !== null ? [t('camino.unidad', { n: p.unit + 1 })] : []),
    ];
    return `<li><b>${alias(p.tutor)}</b> ${t('estadisticas.ayuda_a')} <b>${p.learners.map(alias).join(` ${t('estadisticas.y')} `)}</b>${help.length ? `<br/><small>${esc(t('estadisticas.con', { lista: help.join(', ') }))}</small>` : ''}</li>`;
  });
  const teams = s.teams.map((team, i) => `<li><b>${t('estadisticas.equipo', { n: i + 1 })}:</b> ${team.map(alias).join(', ')}</li>`);

  return `<h3 class="seccion" id="e-recomendaciones">${t('estadisticas.seccion.recomendaciones')}</h3>
  <div class="recos-rejilla">
    <section class="tarjeta-panel reco trabajar"><h4>🎯 ${t('estadisticas.trabajar')}</h4><p class="pequeno">${t('estadisticas.trabajar_ayuda')}</p>${work}</section>
    <section class="tarjeta-panel reco"><h4>🤝 ${t('estadisticas.empujon')}</h4><p class="pequeno">${t('estadisticas.empujon_ayuda')}</p>
      ${behind.length ? `<ul class="recos">${behind.map(person).join('')}</ul>` : `<p class="pequeno">${t('estadisticas.nadie_retrasado')}</p>`}
      ${notStarted.length ? `<p class="pequeno">${esc(t('estadisticas.sin_empezar', { n: notStarted.length, lista: notStarted.map((x) => x.alias).join(', ') }))}</p>` : ''}</section>
    <section class="tarjeta-panel reco"><h4>🚀 ${t('estadisticas.adelantados')}</h4><p class="pequeno">${t('estadisticas.adelantados_ayuda')}</p>
      ${ahead.length ? `<ul class="recos">${ahead.map(person).join('')}</ul>` : `<p class="pequeno">${t('estadisticas.nadie_adelantado')}</p>`}</section>
    <section class="tarjeta-panel reco"><h4>👥 ${t('estadisticas.grupos')}</h4><p class="pequeno">${t('estadisticas.grupos_ayuda')}</p>
      ${s.pairs.length ? `<div class="botonera" role="group" aria-label="${t('estadisticas.grupos')}">
        <button type="button" class="secundario" data-agrupar="parejas" aria-pressed="true">${t('estadisticas.parejas')}</button>
        <button type="button" class="secundario" data-agrupar="equipos" aria-pressed="false">${t('estadisticas.equipos')}</button>
        <button type="button" class="secundario" data-copiar>${t('estadisticas.copiar')}</button></div>
      <ul class="recos" data-grupos="parejas">${pairs.join('')}</ul>
      <ul class="recos" data-grupos="equipos" hidden>${teams.join('')}</ul>
      <p class="pequeno">${t('estadisticas.grupos_como')}</p>` : `<p class="pequeno">${t('estadisticas.pocos_para_grupos')}</p>`}</section>
  </div>`;
}

function usage(s: ClassStats): string {
  const fmt = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString(lang(), { day: 'numeric', month: 'short' });
  const daily = columns(
    s.daily.map((d, i) => ({
      label: fmt(d.day),
      value: d.active,
      showLabel: i % 5 === 0 || i === s.daily.length - 1,
      tip: t('estadisticas.dia_tip', { dia: fmt(d.day), n: d.active, acciones: d.events, lecciones: d.lessons }),
    })),
    t('estadisticas.diario'),
  );
  const dailyTable = table(
    [t('profe.dia'), t('estadisticas.col.activos'), t('profe.acciones'), t('estadisticas.col.lecciones')],
    [...s.daily].reverse().map((d) => [fmt(d.day), d.active, d.events, d.lessons]),
  );
  // Días de la semana en el idioma del panel (lunes primero): 2024-01-01 fue lunes.
  const days = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(lang(), { weekday: 'short' }));
  const busiest = s.heat.flatMap((row, d) => row.map((v, h) => ({ d, h, v }))).sort((a, b) => b.v - a.v)[0];
  const heatTable = table(
    [t('estadisticas.col.dia_semana'), ...Array.from({ length: 24 }, (_, h) => `${h}`)],
    s.heat.map((row, d) => [esc(days[d]), ...row]),
  );
  return `${chartCard('g-diario', t('estadisticas.diario'), t('estadisticas.diario_ayuda'), daily, dailyTable)}
  ${chartCard(
    'g-calor',
    t('estadisticas.calor'),
    busiest?.v ? t('estadisticas.calor_ayuda', { dia: days[busiest.d], hora: busiest.h }) : '',
    heatmap(s.heat, days, t('estadisticas.calor')),
    heatTable,
  )}`;
}

function questions(s: ClassStats): string {
  const note = (r: { intentos: number; fallaron: number; alumnos: number }) => t('estadisticas.nota_tasa', { n: r.intentos, fallaron: r.fallaron, de: r.alumnos });
  const skills = s.bySkill.map((r) => ({ label: esc(skillName(r.skill)), value: rate(r), note: note(r), tip: `${skillName(r.skill)}: ${pct(rate(r))} · ${note(r)}` }));
  const skillTable = table(
    [t('estadisticas.col.tipo'), t('estadisticas.col.acierto'), t('estadisticas.col.respuestas'), t('estadisticas.col.fallaron')],
    s.bySkill.map((r) => [esc(skillName(r.skill)), pct(rate(r)), r.intentos, `${r.fallaron}/${r.alumnos}`]),
  );
  const enough = s.byTopic.filter((r) => r.intentos >= 3);
  const topicBars = (list: typeof enough) => bars(list.map((r) => ({ label: topicName(r.topic), value: rate(r), note: note(r), tip: `${topicPlain(r.topic)}: ${pct(rate(r))} · ${note(r)}` })));
  // Peor y mejor que la media de la clase: así las dos listas no se pisan.
  const average = rate(s.answers);
  const worst = hardest(enough, 8, average);
  const best = easiest(enough, 8, average);
  const topicTable = table(
    [t('estadisticas.col.tema'), t('estadisticas.col.acierto'), t('estadisticas.col.respuestas'), t('estadisticas.col.fallaron')],
    s.byTopic.map((r) => [topicName(r.topic), pct(rate(r)), r.intentos, `${r.fallaron}/${r.alumnos}`]),
  );
  const itemsTable = table(
    [t('estadisticas.col.tema'), t('estadisticas.col.tipo'), t('estadisticas.col.acierto'), t('estadisticas.col.respuestas')],
    s.items.filter((i) => i.intentos >= 2).slice(0, 40).map((i) => [topicName(i.topic), esc(skillName(i.skill)), pct(rate(i)), i.intentos]),
  );
  return `${chartCard('g-tipos', t('estadisticas.por_tipo'), t('estadisticas.por_tipo_ayuda'), bars(skills), skillTable)}
  <div class="profe-dos">
    ${chartCard('g-dificiles', t('estadisticas.temas_dificiles'), t('estadisticas.temas_ayuda'), topicBars(worst), topicTable)}
    ${chartCard('g-faciles', t('estadisticas.temas_faciles'), '', topicBars(best), topicTable)}
  </div>
  <section class="tarjeta-panel"><details><summary><b>${t('estadisticas.todas_preguntas')}</b></summary>${itemsTable}</details></section>`;
}

function progress(s: ClassStats): string {
  const legend = [t('estadisticas.unidad_hecha'), t('estadisticas.unidad_en_curso'), t('estadisticas.unidad_sin_llegar')];
  const units = stacked(
    s.units.map((u) => ({
      label: esc(unitName(u.unit, u.elements)),
      parts: [u.completed, u.inProgress, u.notYet],
      tip: t('estadisticas.unidad_tip', { unidad: unitName(u.unit, u.elements), hecha: u.completed, curso: u.inProgress, sin: u.notYet }),
    })),
    legend,
  );
  const unitTable = table(
    [t('estadisticas.col.unidad'), ...legend],
    s.units.map((u) => [esc(unitName(u.unit, u.elements)), u.completed, u.inProgress, u.notYet]),
  );
  const elementTable = table(
    [t('estadisticas.col.elemento'), t('estadisticas.col.unidad'), t('estadisticas.col.han_hecho'), t('estadisticas.col.acierto'), t('estadisticas.col.respuestas')],
    s.elements.map((e) => [topicName(e.symbol), e.unit + 1, `${e.students}/${s.started}`, e.rate.intentos ? pct(rate(e.rate)) : '—', e.rate.intentos]),
  );
  const elementChips = `<div class="chips-elementos">${s.elements
    .map((e) => {
      const share = s.started ? e.students / s.started : 0;
      const tip = t('estadisticas.elemento_tip', { nombre: topicPlain(e.symbol), n: e.students, de: s.started, acierto: e.rate.intentos ? pct(rate(e.rate)) : '—' });
      return `<span class="chip-elemento n${Math.min(5, Math.ceil(share * 5))}" data-tip="${esc(tip)}"><b>${esc(e.symbol)}</b><small>${e.students}</small></span>`;
    })
    .join('')}</div>
    <p class="calor-leyenda pequeno"><span>${t('estadisticas.nadie')}</span>${[0, 1, 2, 3, 4, 5].map((k) => `<span class="celda n${k}"></span>`).join('')}<span>${t('estadisticas.toda_la_clase')}</span></p>`;
  return `${chartCard('g-unidades', t('estadisticas.unidades'), t('estadisticas.unidades_ayuda', { mediana: Math.round(s.medianDone) }), units, unitTable)}
  ${chartCard('g-elementos', t('estadisticas.elementos'), t('estadisticas.elementos_ayuda'), elementChips, elementTable)}`;
}

function studentTable(s: ClassStats): string {
  if (!s.students.length) return `<section class="tarjeta-panel"><p class="pequeno">${t('profe.sin_alumnos')}</p></section>`;
  const order: Status[] = ['retrasado', 'inactivo', 'en-marcha', 'avanzado', 'sin-empezar'];
  const rows = [...s.students].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || a.alias.localeCompare(b.alias));
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(lang(), { day: 'numeric', month: 'short' }) : t('profe.nunca'));
  const today = dayKey(new Date());
  return `<section class="tarjeta-panel"><p class="pequeno">${t('estadisticas.alumnado_ayuda')}</p><div class="tabla-datos"><table class="tabla-alumnado"><thead><tr>
    ${['alias', 'estado', 'unidad', 'lecciones', 'acierto', 'dias', 'minutos', 'ultima'].map((c) => `<th scope="col">${t(`estadisticas.col.${c}`)}</th>`).join('')}
    </tr></thead><tbody>${rows
      .map(
        (x) => `<tr><th scope="row"><button type="button" class="enlace" data-ficha="${x.id}" aria-expanded="false" aria-controls="ficha-${x.id}">${esc(x.alias)}</button></th>
        <td>${statusChip(x.status)}</td><td>${x.events ? Math.min(x.unit + 1, 99) : '—'}</td><td>${x.lessons}</td>
        <td>${x.answers.intentos ? pct(rate(x.answers)) : '—'}</td><td>${x.activeDays}</td><td>${x.minutes}</td>
        <td>${x.lastActive && dayKey(new Date(x.lastActive)) === today ? t('estadisticas.hoy') : when(x.lastActive)}</td></tr>
        <tr id="ficha-${x.id}" class="ficha" hidden><td colspan="8">${studentCard(x)}</td></tr>`,
      )
      .join('')}</tbody></table></div></section>`;
}

function studentCard(x: StudentStats): string {
  const skills = [...x.bySkill].sort((a, b) => rate(a[1]) - rate(b[1]));
  const topics = [...x.byTopic].filter(([, r]) => r.aciertos < r.intentos).sort((a, b) => rate(a[1]) - rate(b[1])).slice(0, 6);
  return `<div class="ficha-alumno">
    ${x.reasons.length ? `<p>${x.reasons.map(reasonText).map(esc).join(' · ')}</p>` : ''}
    <p class="pequeno">${esc(t('estadisticas.ficha_resumen', { nivel: x.progress.level + 1, xp: x.progress.xp, moleculas: x.progress.species.size, racha: x.progress.streak }))}</p>
    ${skills.length ? bars(skills.map(([k, r]) => ({ label: esc(skillName(k)), value: rate(r), note: t('estadisticas.de_n', { a: r.aciertos, n: r.intentos }), tip: `${skillName(k)}: ${r.aciertos}/${r.intentos}` }))) : `<p class="pequeno">${t('estadisticas.sin_respuestas')}</p>`}
    ${topics.length ? `<p class="pequeno">${t('estadisticas.falla_en')} ${topics.map(([k, r]) => `${topicName(k)} ${r.aciertos}/${r.intentos}`).join(' · ')}</p>` : ''}
  </div>`;
}

/** Comparativa de las clases del profesor (lista de clases). */
export function compareClasses(
  rows: Array<{ id: number; alumnos: number; activos: number; acciones: number; lecciones: number; aciertos: number; preguntas: number }>,
  names: Map<number, string>,
): string {
  if (rows.length < 2) return '';
  return `<section class="tarjeta-panel"><h3>${t('estadisticas.comparar')}</h3><p class="pequeno">${t('estadisticas.comparar_ayuda')}</p>
    ${bars(rows.map((r) => {
      const share = r.alumnos ? r.activos / r.alumnos : 0;
      return { label: `<a href="#clase/${r.id}/estadisticas">${esc(names.get(r.id))}</a>`, value: share, note: t('estadisticas.activos_de', { n: r.activos, de: r.alumnos }), tip: `${names.get(r.id)}: ${pct(share)}` };
    }))}
    ${table(
      [t('estadisticas.col.clase'), t('estadisticas.col.alumnos'), t('estadisticas.col.activos7'), t('estadisticas.col.acciones7'), t('estadisticas.col.lecciones7'), t('estadisticas.col.acierto')],
      rows.map((r) => [`<a href="#clase/${r.id}/estadisticas">${esc(names.get(r.id))}</a>`, r.alumnos, r.activos, r.acciones, r.lecciones, r.preguntas ? pct(r.aciertos / r.preguntas) : '—']),
    )}</section>`;
}
