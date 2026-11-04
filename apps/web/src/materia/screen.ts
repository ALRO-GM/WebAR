import './materia.css';
import type { ARProvider } from '@webar/ar-core';
import type { AppContext, Experience } from '../experience';
import { t } from '../i18n';
import { CrystalExperience } from './crystal';
import { h } from './dom';
import { amorphousSVG, crystalSVG, floatsSVG, hbondSVG, molecularSVG, polarSVG, waterStatesSVG } from './illustrations';
import { STRUCTURES, STRUCTURE_IDS, type StructureId } from './lattices';
import { WaterExperience } from './water';

/** Lo que se puede abrir directamente (?abrir=<id>): `agua` o el id de una estructura. */
export type MateriaTarget = 'agua' | StructureId;

/** Crea la experiencia de `target` (para enlaces directos y la página de pruebas). */
export function createMateriaExperience(ctx: AppContext, target: MateriaTarget, options: { temp?: number } = {}): Experience {
  return target === 'agua' ? new WaterExperience(ctx, options.temp ?? -10) : new CrystalExperience(ctx, target);
}

/** Pinta la sección dentro de `container` (lista de temas, explicaciones, botones para verlo en 3D o en RA). */
export function renderMateriaScreen(container: HTMLElement, ctx: AppContext): void {
  const ar = ctx.supportsWorldAR();
  const aviso = h('p', { class: 'mat-aviso', role: 'alert' });

  const launch = (experience: Experience, provider: ARProvider) => {
    aviso.textContent = '';
    if (ficha.open) ficha.close();
    ctx.launch(experience, provider).catch((error: Error) => (aviso.textContent = t('materia.error', { error: error.message })));
  };

  /** Botones «Ver en 3D» y «Ver en RA» para lo que crea `make`. */
  const viewButtons = (name: string, make: () => Experience) =>
    h(
      'div',
      { class: 'mat-botones' },
      h('button', { type: 'button', class: 'btn', 'aria-label': t('materia.ver3d.aria', { nombre: name }), onclick: () => launch(make(), ctx.viewer) }, h('span', { 'aria-hidden': 'true', text: '🧊' }), t('materia.ver3d')),
      h(
        'button',
        {
          type: 'button',
          class: 'btn menta',
          disabled: !ar,
          'aria-label': t('materia.verRA.aria', { nombre: name }),
          onclick: () => launch(make(), ctx.xr),
        },
        h('span', { 'aria-hidden': 'true', text: '📱' }),
        t('materia.verRA'),
      ),
      ar ? null : h('p', { class: 'pequeno mat-nota', text: t('materia.ra.no') }),
    );

  // --- Ficha de un cristal (diálogo) ------------------------------------------------
  const ficha = h('dialog', { class: 'mat-ficha', 'aria-labelledby': 'mat-ficha-titulo' });
  ficha.addEventListener('click', (e) => {
    if (e.target === ficha) ficha.close(); // toque fuera de la tarjeta
  });
  const openFicha = (id: StructureId) => {
    const def = STRUCTURES[id];
    const name = t(`materia.s.${id}.nombre`);
    const cn = def.coordination;
    const section = (key: string, field: string) => h('section', {}, h('h3', { text: t(`materia.ficha.${key}`) }), h('p', { text: t(`materia.s.${id}.${field}`) }));
    ficha.replaceChildren(
      h(
        'div',
        { class: 'mat-ficha-cuerpo' },
        h(
          'header',
          { class: 'mat-ficha-cabeza' },
          h('div', { class: 'mat-ficha-dibujo', html: crystalSVG(id) }),
          h('div', {}, h('h2', { id: 'mat-ficha-titulo', text: name }), h('p', { class: 'texto-suave', text: t(`materia.s.${id}.ejemplo`) })),
          h('button', { type: 'button', class: 'btn claro redondo mat-cerrar', 'aria-label': t('materia.cerrar'), onclick: () => ficha.close() }, h('span', { 'aria-hidden': 'true', text: '✕' })),
        ),
        h(
          'div',
          { class: 'mat-datos' },
          h('span', { class: `chip mat-enlace-${def.bond}`, text: t(`materia.enlace.${def.bond}`) }),
          h('span', { class: 'chip', text: Array.isArray(cn) ? t('materia.dato.vecinos2', { a: cn[0], b: cn[1] }) : t('materia.dato.vecinos', { n: cn }) }),
          h('span', { class: 'chip', text: def.flat ? t('materia.dato.plano') : t('materia.dato.ocupado', { p: def.packing }) }),
        ),
        section('atomos', 'atomos'),
        section('formacion', 'formacion'),
        section('dia', 'dia'),
        section('diferencia', 'diferencia'),
        h('section', { class: 'mat-curiosidad' }, h('h3', { text: `💡 ${t('materia.ficha.curiosidad')}` }), h('p', { text: t(`materia.s.${id}.curiosidad`) })),
      ),
      h('footer', { class: 'mat-ficha-pie' }, viewButtons(name, () => new CrystalExperience(ctx, id))),
    );
    ficha.showModal();
    ficha.querySelector<HTMLElement>('.mat-cerrar')?.focus();
  };

  // --- La pantalla -----------------------------------------------------------------------
  const crystalCards = STRUCTURE_IDS.map((id, i) => {
    const name = t(`materia.s.${id}.nombre`);
    const def = STRUCTURES[id];
    return h(
      'li',
      { class: 'entra', style: `animation-delay:${Math.min(i, 10) * 40}ms` },
      h(
        'button',
        { type: 'button', class: `card pulsable mat-cristal mat-enlace-${def.bond}`, 'aria-label': t('materia.cristales.abrir', { nombre: name }), onclick: () => openFicha(id) },
        h('span', { class: 'mat-cristal-dibujo', html: crystalSVG(id) }),
        h('strong', { text: name }),
        h('span', { class: 'pequeno', text: t(`materia.s.${id}.corto`) }),
      ),
    );
  });

  const otherCard = (key: string, svgMarkup: string, extra?: HTMLElement) =>
    h(
      'article',
      { class: 'card mat-otra entra' },
      h('div', { class: 'mat-otra-dibujo', html: svgMarkup }),
      h('h3', { text: t(`materia.o.${key}.titulo`) }),
      h('p', { text: t(`materia.o.${key}.texto`) }),
      extra ?? null,
    );

  const waterName = t('materia.agua.titulo');
  container.replaceChildren(
    h(
      'section',
      { class: 'materia', 'aria-labelledby': 'mat-titulo' },
      h('header', { class: 'mat-cabecera entra' }, h('h1', { id: 'mat-titulo', text: t('materia.titulo') }), h('p', { class: 'texto-suave', text: t('materia.intro') })),
      h(
        'article',
        { class: 'card mat-estrella entra' },
        h('span', { class: 'chip mat-insignia', text: `⭐ ${t('materia.estrella')}` }),
        h('div', { class: 'mat-estrella-dibujo', html: waterStatesSVG() }),
        h('h2', { text: waterName }),
        h('p', { text: t('materia.agua.texto') }),
        viewButtons(waterName, () => new WaterExperience(ctx, -10)),
      ),
      aviso,
      h('h2', { class: 'mat-apartado', text: t('materia.cristales.titulo') }),
      h('p', { class: 'texto-suave', text: t('materia.cristales.intro') }),
      h('ul', { class: 'mat-rejilla', role: 'list' }, ...crystalCards),
      h('h2', { class: 'mat-apartado', text: t('materia.otras.titulo') }),
      h('p', { class: 'texto-suave', text: t('materia.otras.intro') }),
      h(
        'div',
        { class: 'mat-otras' },
        otherCard('amorfo', amorphousSVG()),
        otherCard('molecular', molecularSVG()),
        otherCard('polar', polarSVG()),
        otherCard(
          'puentes',
          hbondSVG(),
          h('button', { type: 'button', class: 'btn mat-peq info', onclick: () => launch(new WaterExperience(ctx, -10), ctx.viewer) }, h('span', { 'aria-hidden': 'true', text: '🔍' }), t('materia.o.ver.hielo')),
        ),
        otherCard('flota', floatsSVG()),
      ),
      ficha,
    ),
  );
}
