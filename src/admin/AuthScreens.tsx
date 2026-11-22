import { KeyRound, Loader2, LockKeyhole, ShieldCheck, Smartphone } from 'lucide-react';
import { motion } from 'motion/react';
import QRCode from 'qrcode';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { BrandMark } from '../components/ui';
import { cx } from '../lib/format';
import { adminApi, ApiError } from './api';

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="from-brand-950 via-brand-900 to-brand-800 grid min-h-screen place-items-center bg-gradient-to-br px-4 py-10">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <BrandMark light />
        </div>
        <div className="rounded-3xl bg-white p-7 shadow-2xl sm:p-8">
          <div className="bg-brand-50 text-brand-700 mb-4 grid size-12 place-items-center rounded-2xl">
            <LockKeyhole className="size-6" />
          </div>
          <h1 className="text-brand-950 text-2xl font-extrabold">{title}</h1>
          <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>
        <p className="text-brand-100/60 mt-6 text-center text-xs">Panel privado. Los intentos de ingreso quedan registrados.</p>
      </motion.div>
    </div>
  );
}

export function Field({ label, hint, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <input
        {...props}
        className={cx(
          'focus:border-brand-500 focus:ring-brand-500/15 mt-1.5 h-12 w-full rounded-xl border border-slate-200 bg-slate-50/60 px-4 text-[15px] transition outline-none focus:bg-white focus:ring-4',
          props.className,
        )}
      />
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function SubmitButton({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="bg-brand-600 shadow-glow hover:bg-brand-700 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl font-bold text-white transition active:scale-[0.99] disabled:opacity-60"
    >
      {busy && <Loader2 className="size-5 animate-spin" />}
      {children}
    </button>
  );
}

const ErrorBox = ({ msg }: { msg: string }) =>
  msg ? <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 ring-1 ring-rose-200">{msg}</p> : null;

const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : 'No se pudo conectar con el servidor');

/** Ingreso: contraseña + código de 6 dígitos de la app autenticadora. */
export function Login({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    try {
      await adminApi.login(String(f.get('password')), String(f.get('code')).replace(/\s/g, ''));
      onDone();
    } catch (err) {
      setError(errMsg(err));
      (e.target as HTMLFormElement).querySelector<HTMLInputElement>('input[name=code]')!.value = '';
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthShell title="Panel de administración" subtitle="Ingresa tu contraseña y el código de tu app autenticadora.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Contraseña" name="password" type="password" autoComplete="current-password" required autoFocus />
        <Field
          label="Código de 6 dígitos"
          name="code"
          inputMode="numeric"
          pattern="[0-9 ]{6,7}"
          autoComplete="one-time-code"
          maxLength={7}
          required
          className="text-center text-xl font-bold tracking-[0.4em]"
          hint="Ábrelo en Google Authenticator, Microsoft Authenticator o similar."
        />
        <ErrorBox msg={error} />
        <SubmitButton busy={busy}>Ingresar</SubmitButton>
      </form>
    </AuthShell>
  );
}

/** Creación de la cuenta (solo la primera vez, con el código ADMIN_SETUP_TOKEN). */
export function Setup({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [token, setToken] = useState('');
  const [secret, setSecret] = useState('');
  const [qr, setQr] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function start(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await adminApi.setupStart(token.trim());
      setSecret(r.secret);
      setQr(await QRCode.toDataURL(r.otpauth, { margin: 1, width: 220, color: { dark: '#022c22', light: '#ffffff' } }));
      setStep(2);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  async function finish(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (f.get('password') !== f.get('password2')) return setError('Las contraseñas no coinciden');
    setBusy(true);
    setError('');
    try {
      await adminApi.setupFinish({
        token: token.trim(),
        email: String(f.get('email')),
        password: String(f.get('password')),
        secret,
        code: String(f.get('code')).replace(/\s/g, ''),
      });
      onDone();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => setError(''), [step]);

  if (step === 1)
    return (
      <AuthShell
        title="Configura tu panel"
        subtitle="Esto se hace una sola vez. Escribe el código de configuración que guardaste en Cloudflare (ADMIN_SETUP_TOKEN)."
      >
        <form key="setup-token" onSubmit={start} className="space-y-4">
          <Field
            label="Código de configuración"
            type="text"
            name="setup-token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            required
            autoFocus
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            hint="Se ve lo que escribes para que verifiques: mayúsculas, minúsculas y espacios deben coincidir exactamente."
          />
          <ErrorBox msg={error} />
          <SubmitButton busy={busy}>Continuar</SubmitButton>
        </form>
      </AuthShell>
    );

  return (
    <AuthShell title="Crea tu acceso" subtitle="Tu cuenta tendrá doble protección: contraseña + código de tu celular.">
      <form key="setup-account" onSubmit={finish} className="space-y-5">
        <Field label="Tu correo" name="email" type="email" autoComplete="email" required autoFocus />
        <Field
          label="Contraseña"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
          hint="Mínimo 12 caracteres, con letras y números. Usa una que no uses en otro sitio."
        />
        <Field label="Repite la contraseña" name="password2" type="password" autoComplete="new-password" minLength={12} required />

        <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
          <p className="flex items-center gap-2 text-sm font-bold text-slate-800">
            <Smartphone className="text-brand-600 size-4" /> Vincula tu celular
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-slate-600">
            <li>
              Instala <b>Google Authenticator</b> (o Microsoft Authenticator) en tu celular.
            </li>
            <li>
              Toca <b>+</b> → <b>Escanear código QR</b> y escanea este código.
            </li>
            <li>Escribe abajo el código de 6 dígitos que aparece.</li>
          </ol>
          <div className="mt-3 flex flex-col items-center gap-2">
            {qr && <img src={qr} alt="Código QR para la app autenticadora" className="size-48 rounded-xl ring-1 ring-slate-200" />}
            <details className="text-center text-xs text-slate-500">
              <summary className="cursor-pointer">¿No puedes escanear? Clave manual</summary>
              <code className="mt-1 block font-mono text-[13px] font-semibold break-all text-slate-800 select-all">
                {secret.match(/.{1,4}/g)?.join(' ')}
              </code>
            </details>
          </div>
        </div>

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
        <ErrorBox msg={error} />
        <SubmitButton busy={busy}>
          <ShieldCheck className="size-5" /> Crear mi acceso
        </SubmitButton>
        <p className="flex items-start gap-2 text-xs text-slate-500">
          <KeyRound className="mt-0.5 size-3.5 shrink-0" /> Guarda la clave manual en un lugar seguro: si pierdes el celular, con ella
          puedes volver a vincular la app.
        </p>
      </form>
    </AuthShell>
  );
}
