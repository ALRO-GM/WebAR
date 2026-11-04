import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { DB } from './db.ts';

/** Contraseñas y PIN con scrypt y sal. */
export function hashSecret(secret: string): string {
  const salt = randomBytes(16);
  return `${salt.toString('base64')}:${scryptSync(secret, salt, 32).toString('base64')}`;
}

export function checkSecret(secret: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  const candidate = scryptSync(secret, Buffer.from(salt, 'base64'), 32);
  return timingSafeEqual(candidate, Buffer.from(hash, 'base64'));
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/**
 * Tokens de larga duración (uno por dispositivo): la app los guarda y funciona
 * sin conexión; el servidor solo guarda su hash.
 */
export function issueToken(db: DB, kind: 'teacher' | 'student', ownerId: number): string {
  const token = randomBytes(32).toString('base64url');
  db.prepare('insert into tokens (hash, kind, owner_id) values (?, ?, ?)').run(sha256(token), kind, ownerId);
  return token;
}

export function resolveToken(db: DB, token: string | undefined): { kind: 'teacher' | 'student'; ownerId: number } | null {
  if (!token) return null;
  const row = db.prepare('select kind, owner_id from tokens where hash = ?').get(sha256(token)) as { kind: 'teacher' | 'student'; owner_id: number } | undefined;
  return row ? { kind: row.kind, ownerId: row.owner_id } : null;
}

/** Código de clase: 6 letras y números sin los que se confunden (0/O, 1/I/L). */
export function classCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(6);
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
}
