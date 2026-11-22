const nf = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });

export const m = (n: number) => `${nf.format(n)} m`;
export const m2 = (n: number) => `${nf.format(n)} m²`;
export const num = (n: number) => nf0.format(n);
export const ha = (n: number) => `${nf.format(n / 10000)} ha`;

export function price(value: number | null, currency = 'COP') {
  if (!value) return 'Consultar';
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
}

export const lotTitle = (l: { manzana: string; numero: string }) => `Lote ${l.numero} · Manzana ${l.manzana}`;

export function whatsappUrl(phone: string, text: string) {
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
