// Tipos mínimos de Cloudflare Workers usados por el panel (evita depender de @cloudflare/workers-types).

interface D1Result<T = unknown> {
  results: T[];
  success: boolean;
  meta: Record<string, unknown>;
}
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}
interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
  exec(query: string): Promise<unknown>;
}
interface Fetcher {
  fetch(input: Request | string, init?: RequestInit): Promise<Response>;
}

interface R2ObjectBody {
  body: ReadableStream;
  size: number;
  etag: string;
  httpEtag: string;
  httpMetadata?: { contentType?: string };
  range?: { offset: number; length?: number };
}
interface R2Bucket {
  get(key: string, options?: { range?: { offset: number; length?: number } }): Promise<R2ObjectBody | null>;
  head(key: string): Promise<{ size: number; httpEtag: string; httpMetadata?: { contentType?: string } } | null>;
  put(
    key: string,
    value: ArrayBuffer | ReadableStream | Blob,
    options?: { httpMetadata?: { contentType?: string; cacheControl?: string } },
  ): Promise<unknown>;
  delete(keys: string | string[]): Promise<void>;
}

interface Env {
  /** Fotos y videos subidos desde el panel (Cloudflare R2). */
  MEDIA: R2Bucket;
  ASSETS: Fetcher;
  DB: D1Database;
  /** Secreto de un solo uso para crear la cuenta de administración (Cloudflare → Variables and secrets). */
  ADMIN_SETUP_TOKEN?: string;
}

interface SubtleCrypto {
  timingSafeEqual?(a: ArrayBuffer | ArrayBufferView, b: ArrayBuffer | ArrayBufferView): boolean;
}
