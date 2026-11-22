/** Utilidades criptográficas (Web Crypto) para el panel de administración. */

const enc = new TextEncoder();

export const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)));
export const unb64 = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return a;
}

export const randomToken = (bytes = 32) => b64(randomBytes(bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export async function sha256(s: string) {
  return b64(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}

/** Comparación en tiempo constante (evita ataques de tiempo). */
export function safeEqual(a: string, b: string) {
  const A = enc.encode(a);
  const B = enc.encode(b);
  if (A.length !== B.length) {
    // Comparar igual para no revelar la longitud por tiempo
    crypto.subtle.timingSafeEqual?.(A, A);
    return false;
  }
  if (crypto.subtle.timingSafeEqual) return crypto.subtle.timingSafeEqual(A, B);
  let diff = 0;
  for (let i = 0; i < A.length; i++) diff |= A[i] ^ B[i];
  return diff === 0;
}

// ---------------------------------------------------------------- contraseñas
// PBKDF2-SHA256 con sal aleatoria. 100.000 iteraciones es el máximo que permite Workers.
const ITER = 100_000;

async function pbkdf2(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  return `pbkdf2$${ITER}$${b64(salt)}$${b64(await pbkdf2(password, salt, ITER))}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [alg, iter, salt, hash] = stored.split('$');
  if (alg !== 'pbkdf2') return false;
  const got = b64(await pbkdf2(password, unb64(salt), Number(iter)));
  return safeEqual(got, hash);
}

// ---------------------------------------------------------------- TOTP (RFC 6238)
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Uint8Array) {
  let bits = 0,
    value = 0,
    out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(s: string): Uint8Array<ArrayBuffer> {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0,
    value = 0;
  const out: number[] = [];
  for (const c of clean) {
    value = (value << 5) | B32.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

async function hotp(secret: string, counter: number) {
  const key = await crypto.subtle.importKey('raw', base32Decode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const msg = new ArrayBuffer(8);
  const view = new DataView(msg);
  view.setUint32(0, Math.floor(counter / 2 ** 32));
  view.setUint32(4, counter >>> 0);
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg));
  const o = h[h.length - 1] & 15;
  const code = (((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1_000_000;
  return code.toString().padStart(6, '0');
}

export const totpStep = (t = Date.now()) => Math.floor(t / 30_000);

/**
 * Verifica un código de 6 dígitos con tolerancia de ±1 intervalo (±30 s).
 * Devuelve el intervalo usado (para impedir reutilizar el mismo código) o null.
 */
export async function verifyTotp(secret: string, code: string, lastStep = 0): Promise<number | null> {
  if (!/^\d{6}$/.test(code)) return null;
  const now = totpStep();
  for (const step of [now - 1, now, now + 1]) {
    if (step <= lastStep) continue;
    if (safeEqual(await hotp(secret, step), code)) return step;
  }
  return null;
}

export const newTotpSecret = () => base32Encode(randomBytes(20));
