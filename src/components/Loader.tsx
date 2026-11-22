export function FullLoader({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="from-brand-950 via-brand-900 to-brand-800 fixed inset-0 z-50 grid place-items-center bg-gradient-to-br">
      <div className="flex flex-col items-center gap-5">
        <div className="relative size-16">
          <div className="bg-brand-400/30 absolute inset-0 rounded-2xl blur-xl" />
          <div className="border-brand-300/20 border-t-brand-300 absolute inset-0 animate-spin rounded-2xl border-2 [animation-duration:1.1s]" />
          <svg viewBox="0 0 32 32" className="absolute inset-0 m-auto size-7" aria-hidden>
            <path d="M5 23 14 8l13 15z" fill="#ecfdf5" />
            <circle cx="23" cy="9" r="3" fill="#fde68a" />
          </svg>
        </div>
        <p className="text-brand-100/80 text-sm font-medium tracking-wide">{label}</p>
      </div>
    </div>
  );
}
