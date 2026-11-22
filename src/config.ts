/** Configuración general de la plataforma. Cambia aquí marca y contacto. */
export const SITE = {
  name: 'Lotes del Caribe',
  slogan: 'Encuentra tu lote ideal',
  /** WhatsApp comercial de la plataforma (formato internacional, sin +). */
  whatsapp: '573114007716',
  /**
   * Endpoint opcional para el formulario "Publica tu proyecto"
   * (Formspree, Web3Forms, Google Apps Script…). Defínelo en .env como
   * VITE_LEADS_ENDPOINT. Si no existe, el formulario se envía por WhatsApp.
   */
  leadsEndpoint: import.meta.env.VITE_LEADS_ENDPOINT as string | undefined,
};

export const STATUS = {
  available: { label: 'Disponible', color: '#10b981', soft: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' },
  reserved: { label: 'Reservado', color: '#f59e0b', soft: 'bg-amber-50 text-amber-700 ring-amber-600/20' },
  sold: { label: 'Vendido', color: '#ef4444', soft: 'bg-rose-50 text-rose-700 ring-rose-600/20' },
} as const;

export const PROJECT_STATUS: Record<string, { label: string; className: string }> = {
  'en-venta': { label: 'En venta', className: 'bg-brand-500 text-white' },
  proximamente: { label: 'Próximamente', className: 'bg-white text-brand-800' },
  vendido: { label: 'Agotado', className: 'bg-slate-800 text-white' },
};
