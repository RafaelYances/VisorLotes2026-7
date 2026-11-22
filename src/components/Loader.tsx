import { asset } from '../lib/data';

export function FullLoader({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="from-brand-950 via-brand-900 to-brand-800 fixed inset-0 z-50 grid place-items-center bg-gradient-to-br">
      <div className="flex flex-col items-center gap-5">
        <div className="relative size-16">
          <div className="bg-brand-400/30 absolute inset-0 rounded-2xl blur-xl" />
          <div className="border-brand-300/20 border-t-brand-300 absolute inset-0 animate-spin rounded-2xl border-2 [animation-duration:1.1s]" />
          <img src={asset('img/brand-logo.webp')} alt="" className="absolute inset-0 m-auto h-8 w-auto" />
        </div>
        <p className="text-brand-100/80 text-sm font-medium tracking-wide">{label}</p>
      </div>
    </div>
  );
}
