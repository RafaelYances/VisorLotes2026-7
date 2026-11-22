import { Link } from 'react-router';
import { BrandMark } from '../components/ui';

export function NotFound({ message = 'No encontramos esta página.' }: { message?: string }) {
  return (
    <div className="from-brand-950 to-brand-800 grid min-h-screen place-items-center bg-gradient-to-br px-6 text-center text-white">
      <div className="flex flex-col items-center gap-6">
        <BrandMark light />
        <p className="text-7xl font-black text-white/10">404</p>
        <p className="text-brand-100 text-lg">{message}</p>
        <Link to="/" className="bg-brand-500 shadow-glow hover:bg-brand-400 rounded-2xl px-6 py-3 font-bold">
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}
