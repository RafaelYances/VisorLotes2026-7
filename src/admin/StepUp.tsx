import { Loader2, ShieldAlert, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../lib/format';
import { Field } from './AuthScreens';

export interface StepUpRequest {
  title: string;
  description: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  /** Si se indica, hay que escribir este texto exacto (ej: el nombre del proyecto). */
  typeToConfirm?: string;
  run: (password: string, code: string, typed: string) => Promise<void>;
}

/** Doble autorización: vuelve a pedir contraseña y código de 6 dígitos antes de una acción sensible. */
export function StepUpDialog({ request, onClose }: { request: StepUpRequest | null; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!request) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    try {
      await request.run(String(f.get('password')), String(f.get('code')).replace(/\s/g, ''), String(f.get('typed') ?? ''));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
      const code = e.currentTarget.querySelector<HTMLInputElement>('input[name=code]');
      if (code) code.value = '';
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <AnimatePresence>
      {request && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="bg-brand-950/70 fixed inset-0 z-[80] grid place-items-center p-4 backdrop-blur-sm"
          onClick={() => !busy && onClose()}
        >
          <motion.form
            initial={{ scale: 0.95, y: 10 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.97 }}
            onClick={(e) => e.stopPropagation()}
            onSubmit={submit}
            className="w-full max-w-md space-y-4 rounded-3xl bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start gap-3">
              <span
                className={cx(
                  'grid size-11 shrink-0 place-items-center rounded-2xl',
                  request.danger ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600',
                )}
              >
                <ShieldAlert className="size-6" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-extrabold text-slate-900">{request.title}</h2>
                <div className="mt-1 text-sm text-slate-600">{request.description}</div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100"
                aria-label="Cancelar"
              >
                <X className="size-4" />
              </button>
            </div>
            <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600 ring-1 ring-slate-100">
              🔐 <b>Doble autorización:</b> confirma tu contraseña y un código nuevo de tu app autenticadora.
            </p>
            {request.typeToConfirm && (
              <Field
                label={`Escribe "${request.typeToConfirm}" para confirmar`}
                name="typed"
                autoComplete="off"
                spellCheck={false}
                required
              />
            )}
            <Field
              label="Contraseña"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              autoFocus={!request.typeToConfirm}
            />
            <Field
              label="Código de 6 dígitos"
              name="code"
              inputMode="numeric"
              pattern="[0-9 ]{6,7}"
              autoComplete="one-time-code"
              maxLength={7}
              required
              className="text-center text-xl font-bold tracking-[0.4em]"
            />
            {error && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 ring-1 ring-rose-200">{error}</p>}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="h-12 flex-1 rounded-xl bg-slate-100 font-bold text-slate-700 hover:bg-slate-200"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={busy}
                className={cx(
                  'inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl font-bold text-white disabled:opacity-60',
                  request.danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-brand-600 hover:bg-brand-700',
                )}
              >
                {busy && <Loader2 className="size-4 animate-spin" />}
                {request.confirmLabel}
              </button>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
