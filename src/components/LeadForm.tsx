import { CheckCircle2, Loader2, Send } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState, type FormEvent } from 'react';
import { SITE } from '../config';
import { whatsappUrl } from '../lib/format';

const FIELDS = [
  { name: 'nombre', label: 'Nombre completo', type: 'text', required: true, autoComplete: 'name' },
  { name: 'empresa', label: 'Empresa / constructora', type: 'text', autoComplete: 'organization' },
  { name: 'telefono', label: 'Teléfono / WhatsApp', type: 'tel', required: true, autoComplete: 'tel' },
  { name: 'email', label: 'Correo electrónico', type: 'email', required: true, autoComplete: 'email' },
  { name: 'ubicacion', label: 'Ubicación del proyecto', type: 'text', required: true },
  { name: 'lotes', label: 'Número aproximado de lotes', type: 'number' },
] as const;

export function LeadForm() {
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    setState('sending');
    if (SITE.leadsEndpoint) {
      try {
        const r = await fetch(SITE.leadsEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ ...data, origen: 'Publica tu proyecto' }),
        });
        if (!r.ok) throw new Error();
        setState('done');
        return;
      } catch {
        setState('error');
        return;
      }
    }
    const text = [
      '¡Hola! Quiero publicar mi proyecto en ' + SITE.name + '.',
      ...FIELDS.filter((f) => data[f.name]).map((f) => `• ${f.label}: ${data[f.name]}`),
      data.mensaje ? `• Mensaje: ${data.mensaje}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    window.open(whatsappUrl(SITE.whatsapp, text), '_blank', 'noopener');
    setState('done');
  }

  return (
    <div className="relative">
      <AnimatePresence mode="wait">
        {state === 'done' ? (
          <motion.div
            key="done"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex min-h-[420px] flex-col items-center justify-center gap-4 rounded-3xl bg-white p-10 text-center"
          >
            <span className="bg-brand-100 text-brand-600 grid size-16 place-items-center rounded-full">
              <CheckCircle2 className="size-9" />
            </span>
            <h3 className="text-brand-950 text-2xl font-extrabold">¡Gracias por escribirnos!</h3>
            <p className="max-w-sm text-slate-600">
              Recibimos tus datos. Nuestro equipo te contactará muy pronto para publicar tu proyecto.
            </p>
            <button onClick={() => setState('idle')} className="text-brand-700 mt-2 text-sm font-semibold hover:underline">
              Enviar otra solicitud
            </button>
          </motion.div>
        ) : (
          <motion.form
            key="form"
            onSubmit={onSubmit}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="grid gap-4 rounded-3xl bg-white p-6 sm:grid-cols-2 sm:p-8"
          >
            {FIELDS.map((f) => (
              <label key={f.name} className="group relative block">
                <input
                  name={f.name}
                  type={f.type}
                  required={'required' in f && f.required}
                  autoComplete={'autoComplete' in f ? f.autoComplete : undefined}
                  min={f.type === 'number' ? 1 : undefined}
                  placeholder=" "
                  className="peer focus:border-brand-500 focus:ring-brand-500/15 h-14 w-full rounded-2xl border border-slate-200 bg-slate-50/60 px-4 pt-4 text-[15px] text-slate-900 transition outline-none focus:bg-white focus:ring-4"
                />
                <span className="peer-focus:text-brand-700 pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-[15px] text-slate-500 transition-all peer-focus:top-4 peer-focus:text-[11px] peer-focus:font-semibold peer-[:not(:placeholder-shown)]:top-4 peer-[:not(:placeholder-shown)]:text-[11px] peer-[:not(:placeholder-shown)]:font-semibold">
                  {f.label}
                  {'required' in f && f.required && <span className="text-brand-600"> *</span>}
                </span>
              </label>
            ))}
            <label className="relative block sm:col-span-2">
              <textarea
                name="mensaje"
                rows={3}
                placeholder="Cuéntanos sobre tu proyecto: etapa, servicios, precios…"
                className="focus:border-brand-500 focus:ring-brand-500/15 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-3 text-[15px] transition outline-none placeholder:text-slate-400 focus:bg-white focus:ring-4"
              />
            </label>
            <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-500">
                Al enviar aceptas ser contactado por nuestro equipo. No compartimos tus datos con terceros.
              </p>
              <button
                type="submit"
                disabled={state === 'sending'}
                className="bg-brand-600 shadow-glow hover:bg-brand-700 inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-2xl px-6 font-bold text-white transition active:scale-[0.98] disabled:opacity-60"
              >
                {state === 'sending' ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-4" />}
                Quiero publicar mi proyecto
              </button>
            </div>
            {state === 'error' && (
              <p className="text-sm font-medium text-rose-600 sm:col-span-2">
                No pudimos enviar el formulario. Intenta de nuevo o escríbenos por WhatsApp.
              </p>
            )}
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}
