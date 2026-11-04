import { randomInt } from 'node:crypto';
import type { DB } from './db.ts';

/**
 * Ligas semanales: la semana (hora de Madrid), los apodos generados y el
 * cierre de semana con subidas y bajadas. Sin rutas: las pone api.ts.
 */

export const LEAGUES = 10;
export const GROUP_SIZE = 30;
export const PROMOTE = 7;
export const DEMOTE = 5;
/** Tope de XP creíble por día transcurrido de la semana (frena trampas). */
export const XP_PER_DAY = 2000;

const TZ = 'Europe/Madrid';
const DAY = 86_400_000;

const madridParts = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Fecha y hora de pared en Madrid para un instante. */
function wallClock(at: number) {
  const p = Object.fromEntries(madridParts.formatToParts(new Date(at)).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, s: +p.second };
}

/** Diferencia (ms) entre la hora de Madrid y UTC en un instante. */
function offset(at: number): number {
  const w = wallClock(at);
  return Date.UTC(w.y, w.m - 1, w.d, w.h, w.min, w.s) - Math.floor(at / 1000) * 1000;
}

/** Instante UTC de las 00:00 de Madrid de una fecha (año, mes 1-12, día). */
function madridMidnight(y: number, m: number, d: number): number {
  const wall = Date.UTC(y, m - 1, d);
  let at = wall - offset(wall);
  at = wall - offset(at); // segunda pasada por si el cambio de hora cae en medio
  return at;
}

export interface Week {
  /** Semana ISO: «2026-W45». */
  id: string;
  /** Lunes 00:00 de Madrid (ISO, UTC). */
  starts: string;
  /** Lunes siguiente 00:00 de Madrid (ISO, UTC): cuando termina. */
  ends: string;
  /** Día de la semana en curso: 1 (lunes) a 7 (domingo). */
  day: number;
}

/** La semana (lunes a domingo, hora de Madrid) que contiene `now`. */
export function weekOf(now: Date): Week {
  const w = wallClock(now.getTime());
  const local = Date.UTC(w.y, w.m - 1, w.d); // la fecha de Madrid, como día UTC
  const day = ((new Date(local).getUTCDay() + 6) % 7) + 1;
  const monday = new Date(local - (day - 1) * DAY);
  const nextMonday = new Date(monday.getTime() + 7 * DAY);
  // Semana ISO: la del jueves de esta semana.
  const thursday = new Date(monday.getTime() + 3 * DAY);
  const isoYear = thursday.getUTCFullYear();
  const week = Math.floor((thursday.getTime() - Date.UTC(isoYear, 0, 1)) / (7 * DAY)) + 1;
  const at = (d: Date) => new Date(madridMidnight(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())).toISOString();
  return { id: `${isoYear}-W${String(week).padStart(2, '0')}`, starts: at(monday), ends: at(nextMonday), day };
}

/** La semana anterior a `week`. */
export function previousWeek(week: Week): Week {
  return weekOf(new Date(Date.parse(week.starts) - DAY / 2));
}

/**
 * Cuántos suben y cuántos bajan en un grupo de `n`: 7 y 5 a partir de 12
 * (antes se pisarían); con menos, en la misma proporción (7/12 y 5/12) y sin
 * que se crucen. Uno solo que juega, sube.
 */
export function quotas(n: number): { up: number; down: number } {
  if (n >= PROMOTE + DEMOTE) return { up: PROMOTE, down: DEMOTE };
  return { up: Math.round((n * PROMOTE) / (PROMOTE + DEMOTE)), down: Math.floor((n * DEMOTE) / (PROMOTE + DEMOTE)) };
}

// --- Apodos -----------------------------------------------------------------
// Sustantivo + adjetivo concordado + número. Los genera el servidor para que
// nadie ponga su nombre real.

type Gender = 'm' | 'f';
export const NOUNS: Array<[string, Gender]> = [
  ['Neutrón', 'm'], ['Protón', 'm'], ['Electrón', 'm'], ['Quark', 'm'], ['Átomo', 'm'], ['Fotón', 'm'],
  ['Isótopo', 'm'], ['Ion', 'm'], ['Catalizador', 'm'], ['Cristal', 'm'], ['Mol', 'm'], ['Orbital', 'm'],
  ['Polímero', 'm'], ['Imán', 'm'], ['Matraz', 'm'], ['Mechero', 'm'], ['Cometa', 'm'], ['Bosón', 'm'],
  ['Gato', 'm'], ['Pulpo', 'm'], ['Ajolote', 'm'], ['Tardígrado', 'm'], ['Mapache', 'm'], ['Pingüino', 'm'],
  ['Molécula', 'f'], ['Partícula', 'f'], ['Gata', 'f'], ['Probeta', 'f'], ['Pipeta', 'f'], ['Bureta', 'f'],
  ['Chispa', 'f'], ['Burbuja', 'f'], ['Llama', 'f'], ['Onda', 'f'], ['Galaxia', 'f'], ['Estrella', 'f'],
  ['Nebulosa', 'f'], ['Ameba', 'f'], ['Neurona', 'f'], ['Proteína', 'f'], ['Enzima', 'f'], ['Hélice', 'f'],
  ['Lupa', 'f'], ['Balanza', 'f'], ['Medusa', 'f'], ['Nutria', 'f'], ['Ardilla', 'f'], ['Tortuga', 'f'],
];
/** [masculino, femenino]; si es igual, una sola forma. */
export const ADJECTIVES: Array<[string, string?]> = [
  ['Veloz'], ['Cuántico', 'Cuántica'], ['Curioso', 'Curiosa'], ['Brillante'], ['Valiente'], ['Radiante'],
  ['Eléctrico', 'Eléctrica'], ['Magnético', 'Magnética'], ['Luminoso', 'Luminosa'], ['Inquieto', 'Inquieta'],
  ['Sabio', 'Sabia'], ['Audaz'], ['Feliz'], ['Risueño', 'Risueña'],
  ['Intrépido', 'Intrépida'], ['Burbujeante'], ['Saltarín', 'Saltarina'], ['Travieso', 'Traviesa'], ['Noble'],
  ['Gaseoso', 'Gaseosa'], ['Estable'], ['Polar'], ['Alcalino', 'Alcalina'], ['Efervescente'], ['Fosforescente'],
  ['Fluorescente'], ['Incandescente'], ['Volátil'], ['Ligero', 'Ligera'], ['Cristalino', 'Cristalina'],
  ['Elegante'], ['Dormilón', 'Dormilona'], ['Bailarín', 'Bailarina'], ['Cósmico', 'Cósmica'],
  ['Atómico', 'Atómica'], ['Galáctico', 'Galáctica'], ['Tenaz'], ['Alegre'], ['Genial'], ['Ingenioso', 'Ingeniosa'],
  ['Supersónico', 'Supersónica'],
];

export function nickname(): string {
  const [noun, gender] = NOUNS[randomInt(NOUNS.length)];
  const [masc, fem] = ADJECTIVES[randomInt(ADJECTIVES.length)];
  return `${noun} ${gender === 'f' ? (fem ?? masc) : masc} ${randomInt(1, 1000)}`;
}

/** Un apodo que no tenga nadie (si tras muchos intentos no sale, número más largo). */
export function freshNickname(db: DB): string {
  const taken = db.prepare('select 1 from players where nickname = ?');
  for (let i = 0; i < 30; i++) {
    const name = nickname();
    if (!taken.get(name)) return name;
  }
  return `${nickname()}${randomInt(10, 100)}`;
}

// --- Cierre de semana ---------------------------------------------------------

/**
 * Cierra (una vez) todas las semanas anteriores a `current` con jugadores:
 * en cada grupo suben los primeros y bajan los últimos (ver `quotas`); los
 * que no jugaron esa semana no están en ningún grupo y se quedan igual.
 * Va en una transacción y apunta la semana en `league_weeks`, así que
 * repetirlo (o dos peticiones a la vez) no cambia nada.
 */
export function closePastWeeks(db: DB, current: Week): void {
  const pendingSql = `select distinct week from league_entries where week < ? and week not in (select week from league_weeks) order by week`;
  if (!db.prepare(pendingSql).get(current.id)) return;
  db.exec('begin immediate');
  try {
    const weeks = db.prepare(pendingSql).all(current.id) as Array<{ week: string }>;
    const groups = db.prepare('select distinct league, grp from league_entries where week = ?');
    const members = db.prepare('select player_id, xp from league_entries where week = ? and league = ? and grp = ? order by xp desc, rowid');
    const setLeague = db.prepare('update players set league = ? where id = ?');
    const result = db.prepare('insert or replace into league_results (week, player_id, league, rank, change) values (?, ?, ?, ?, ?)');
    for (const { week } of weeks) {
      for (const g of groups.all(week) as Array<{ league: number; grp: number }>) {
        const list = members.all(week, g.league, g.grp) as Array<{ player_id: number; xp: number }>;
        const { up, down } = quotas(list.length);
        list.forEach((p, i) => {
          let change: 'sube' | 'baja' | 'igual' = 'igual';
          if (i < up && p.xp > 0 && g.league < LEAGUES - 1) change = 'sube';
          else if (i >= list.length - down && g.league > 0) change = 'baja';
          const league = g.league + (change === 'sube' ? 1 : change === 'baja' ? -1 : 0);
          setLeague.run(league, p.player_id);
          result.run(week, p.player_id, g.league, i + 1, change);
        });
      }
      db.prepare("insert into league_weeks (week, closed) values (?, datetime('now'))").run(week);
    }
    db.exec('commit');
  } catch (error) {
    db.exec('rollback');
    throw error;
  }
}
