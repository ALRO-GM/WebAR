import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, accessSync, constants } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Esquema. Del alumno solo se guarda un alias (lo elige o lo pone el profesor)
 * y el hash de un PIN: ni correo, ni nombre real, ni ubicación (guía de la
 * AEPD para centros educativos). Su progreso son eventos que solo crecen.
 */
const SCHEMA = `
create table if not exists teachers (
  id integer primary key,
  email text not null unique collate nocase,
  name text not null,
  password text not null,
  created text not null default (datetime('now'))
);
create table if not exists classes (
  id integer primary key,
  teacher_id integer not null references teachers(id) on delete cascade,
  name text not null,
  course text not null,
  code text not null unique,
  created text not null default (datetime('now'))
);
create table if not exists students (
  id integer primary key,
  class_id integer not null references classes(id) on delete cascade,
  alias text not null collate nocase,
  pin text not null,
  created text not null default (datetime('now')),
  last_seen text,
  unique (class_id, alias)
);
create table if not exists tokens (
  hash text primary key,
  kind text not null check (kind in ('teacher', 'student')),
  owner_id integer not null,
  created text not null default (datetime('now'))
);
create table if not exists events (
  id text primary key,
  student_id integer not null references students(id) on delete cascade,
  class_id integer not null references classes(id) on delete cascade,
  type text not null,
  data text not null,
  client_time text not null,
  server_time text not null default (datetime('now'))
);
create index if not exists events_class on events(class_id, server_time);
create table if not exists challenges (
  id integer primary key,
  class_id integer not null references classes(id) on delete cascade,
  title text not null,
  description text not null default '',
  targets text not null,
  ends text,
  created text not null default (datetime('now'))
);
`;

export type DB = DatabaseSync;

/** Abre (o crea) la base de datos. Si la carpeta no se puede escribir (p. ej. la CI), va a /tmp. */
export function openDatabase(path = process.env.DB_PATH ?? '/data/webar.db'): DB {
  let file = path;
  if (file !== ':memory:') {
    try {
      mkdirSync(dirname(file), { recursive: true });
      accessSync(dirname(file), constants.W_OK);
    } catch {
      file = '/tmp/webar.db';
      console.warn(`No se puede escribir en ${dirname(path)}: base de datos temporal en ${file}`);
    }
  }
  const db = new DatabaseSync(file);
  db.exec('pragma journal_mode = wal; pragma foreign_keys = on; pragma busy_timeout = 3000;');
  db.exec(SCHEMA);
  return db;
}
