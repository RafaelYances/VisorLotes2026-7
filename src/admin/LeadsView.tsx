import { Archive, Building2, Check, Copy, Hash, Inbox, Loader2, Mail, MapPin, Phone, Trash2, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { WhatsAppIcon } from '../components/ui';
import { SITE } from '../config';
import { cx, whatsappUrl } from '../lib/format';
import { adminApi, type Lead } from './api';

const TABS = [
  ['new', 'Nuevas'],
  ['contacted', 'Contactadas'],
  ['archived', 'Archivadas'],
] as const;

/** Teléfono colombiano de 10 dígitos → formato internacional para WhatsApp. */
const waNumber = (phone: string) => {
  const d = phone.replace(/\D/g, '');
  return d.length === 10 && d.startsWith('3') ? `57${d}` : d;
};

export function LeadsView({
  onError,
  notify,
  onCount,
}: {
  onError: (e: unknown) => void;
  notify: (ok: boolean, msg: string) => void;
  onCount: (n: number) => void;
}) {
  const [items, setItems] = useState<Lead[] | null>(null);
  const [tab, setTab] = useState<Lead['status']>('new');

  const load = useCallback(
    () =>
      adminApi
        .leads()
        .then((r) => {
          setItems(r.items);
          onCount(r.items.filter((i) => i.status === 'new').length);
        })
        .catch(onError),
    [onError, onCount],
  );
  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => Object.fromEntries(TABS.map(([k]) => [k, items?.filter((i) => i.status === k).length ?? 0])), [items]);
  const shown = items?.filter((i) => i.status === tab) ?? [];

  async function setStatus(l: Lead, status: Lead['status'], msg: string) {
    try {
      await adminApi.updateLead(l.id, { status });
      const next = items!.map((i) => (i.id === l.id ? { ...i, status } : i));
      setItems(next);
      onCount(next.filter((i) => i.status === 'new').length);
      notify(true, msg);
    } catch (e) {
      onError(e);
    }
  }

  async function remove(l: Lead) {
    if (!confirm(`¿Eliminar la solicitud de ${l.name}? No se puede deshacer.`)) return;
    try {
      await adminApi.deleteLead(l.id);
      const next = items!.filter((i) => i.id !== l.id);
      setItems(next);
      onCount(next.filter((i) => i.status === 'new').length);
      notify(true, 'Solicitud eliminada');
    } catch (e) {
      onError(e);
    }
  }

  return (
    <div className="min-h-0 flex-1 scrollbar-thin overflow-y-auto bg-slate-50">
      <div className="mx-auto max-w-4xl p-4 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">Solicitudes</h1>
            <p className="text-sm text-slate-500">Personas que quieren publicar su proyecto (formulario de la página principal).</p>
          </div>
          <div className="flex gap-1 rounded-xl bg-white p-1 ring-1 ring-slate-200">
            {TABS.map(([k, label]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={cx(
                  'rounded-lg px-3 py-1.5 text-sm font-bold transition',
                  tab === k ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100',
                )}
              >
                {label} <span className={cx('ml-1 text-xs', tab === k ? 'text-white/80' : 'text-slate-400')}>{counts[k]}</span>
              </button>
            ))}
          </div>
        </div>

        {!items && <Loader2 className="mx-auto mt-16 size-6 animate-spin text-slate-400" />}
        {items && shown.length === 0 && (
          <div className="mt-10 flex flex-col items-center gap-2 rounded-3xl bg-white p-10 text-center text-slate-500 ring-1 ring-slate-200">
            <Inbox className="size-8" />
            {tab === 'new' ? 'No hay solicitudes nuevas.' : 'No hay solicitudes en esta sección.'}
          </div>
        )}

        <ul className="mt-5 space-y-3">
          {shown.map((l) => (
            <LeadCard key={l.id} lead={l} onStatus={setStatus} onDelete={remove} onError={onError} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function LeadCard({
  lead: l,
  onStatus,
  onDelete,
  onError,
}: {
  lead: Lead;
  onStatus: (l: Lead, s: Lead['status'], msg: string) => void;
  onDelete: (l: Lead) => void;
  onError: (e: unknown) => void;
}) {
  const [notes, setNotes] = useState(l.notes);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const greeting = `Hola ${l.name.split(' ')[0]}, te escribimos de ${SITE.name} por tu solicitud para publicar tu proyecto en ${l.location}.`;

  async function saveNotes() {
    if (notes === l.notes) return;
    try {
      await adminApi.updateLead(l.id, { notes });
      l.notes = notes;
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      onError(e);
    }
  }

  const copyAll = async () => {
    await navigator.clipboard.writeText(
      [
        `Nombre: ${l.name}`,
        l.company && `Empresa: ${l.company}`,
        `Teléfono: ${l.phone}`,
        `Correo: ${l.email}`,
        `Ubicación: ${l.location}`,
        l.lots && `Lotes: ${l.lots}`,
        l.message && `Mensaje: ${l.message}`,
      ]
        .filter(Boolean)
        .join('\n'),
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <li className={cx('rounded-3xl bg-white p-5 ring-1', l.status === 'new' ? 'ring-brand-300 shadow-soft' : 'ring-slate-200')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            {l.status === 'new' && <span className="bg-brand-500 size-2 rounded-full" />}
            <h3 className="text-lg font-extrabold text-slate-900">{l.name}</h3>
          </div>
          {l.company && (
            <p className="flex items-center gap-1.5 text-sm text-slate-600">
              <Building2 className="size-3.5" /> {l.company}
            </p>
          )}
        </div>
        <time className="text-xs text-slate-500">
          {new Date(l.ts).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })}
        </time>
      </div>

      <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <a href={`tel:${l.phone.replace(/[^\d+]/g, '')}`} className="hover:text-brand-700 flex items-center gap-2 text-slate-700">
          <Phone className="size-4 text-slate-400" /> {l.phone}
        </a>
        <a href={`mailto:${l.email}`} className="hover:text-brand-700 flex items-center gap-2 break-all text-slate-700">
          <Mail className="size-4 shrink-0 text-slate-400" /> {l.email}
        </a>
        <span className="flex items-center gap-2 text-slate-700">
          <MapPin className="size-4 text-slate-400" /> {l.location}
        </span>
        {l.lots != null && (
          <span className="flex items-center gap-2 text-slate-700">
            <Hash className="size-4 text-slate-400" /> {l.lots} lotes aprox.
          </span>
        )}
      </div>
      {l.message && <p className="mt-3 rounded-2xl bg-slate-50 p-3 text-sm whitespace-pre-line text-slate-700">{l.message}</p>}

      <div className="mt-3">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          maxLength={2000}
          rows={2}
          placeholder="Notas internas (solo tú las ves): ej. 'llamé el lunes, enviar propuesta'"
          className="focus:border-brand-500 w-full resize-y rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
        />
        {saved && <span className="text-brand-700 text-xs font-semibold">Nota guardada</span>}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href={whatsappUrl(waNumber(l.phone), greeting)}
          target="_blank"
          rel="noopener"
          onClick={() => l.status === 'new' && onStatus(l, 'contacted', 'Marcada como contactada')}
          className="bg-brand-600 hover:bg-brand-700 inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-bold text-white"
        >
          <WhatsAppIcon className="size-4" /> Escribir por WhatsApp
        </a>
        <button
          onClick={copyAll}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-100 px-3 text-sm font-bold text-slate-700 hover:bg-slate-200"
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />} Copiar datos
        </button>
        {l.status === 'new' && (
          <button
            onClick={() => onStatus(l, 'contacted', 'Marcada como contactada')}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-100 px-3 text-sm font-bold text-slate-700 hover:bg-slate-200"
          >
            <Check className="size-4" /> Marcar contactada
          </button>
        )}
        {l.status !== 'archived' ? (
          <button
            onClick={() => onStatus(l, 'archived', 'Solicitud archivada')}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-100 px-3 text-sm font-bold text-slate-700 hover:bg-slate-200"
          >
            <Archive className="size-4" /> Archivar
          </button>
        ) : (
          <button
            onClick={() => onStatus(l, 'new', 'Solicitud restaurada')}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-100 px-3 text-sm font-bold text-slate-700 hover:bg-slate-200"
          >
            <Undo2 className="size-4" /> Restaurar
          </button>
        )}
        <button
          onClick={() => onDelete(l)}
          className="ml-auto grid size-10 place-items-center rounded-xl text-slate-400 hover:bg-rose-50 hover:text-rose-600"
          title="Eliminar"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
    </li>
  );
}
