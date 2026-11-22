import { ArrowUpRight, MapPin, Ruler } from 'lucide-react';
import { motion } from 'motion/react';
import { Link } from 'react-router';
import { PROJECT_STATUS } from '../config';
import { asset } from '../lib/data';
import { m2, num } from '../lib/format';
import type { ProjectCard as Card } from '../types';
import { LotsPreview } from './LotsPreview';
import { AvailabilityBar } from './ui';

export function ProjectCard({ project, index }: { project: Card; index: number }) {
  const s = project.stats;
  const st = PROJECT_STATUS[project.status] ?? PROJECT_STATUS['en-venta'];
  return (
    <motion.article
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.6, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }}
      className="group shadow-soft hover:shadow-glow relative flex flex-col overflow-hidden rounded-3xl bg-white ring-1 ring-slate-900/5 transition-shadow duration-500"
    >
      <Link to={`/proyecto/${project.slug}`} className="absolute inset-0 z-10" aria-label={`Explorar ${project.name}`} />
      <div className="from-brand-950 via-brand-900 to-brand-700 relative aspect-[16/10] overflow-hidden bg-gradient-to-br">
        <div className="absolute inset-0 [background-image:radial-gradient(rgba(255,255,255,0.35)_1px,transparent_1px)] [background-size:18px_18px] opacity-30" />
        <div className="bg-brand-400/30 absolute -top-16 -right-16 size-56 rounded-full blur-3xl transition-transform duration-700 group-hover:scale-125" />
        <LotsPreview
          preview={project.preview}
          className="absolute inset-0 h-full w-full p-6 transition-transform duration-700 ease-out group-hover:scale-[1.06] group-hover:-rotate-1"
        />
        {project.logo && (
          <img src={asset(project.logo)} alt="" className="absolute bottom-4 left-4 h-11 w-auto drop-shadow-lg" loading="lazy" />
        )}
        <span className={`absolute top-4 left-4 rounded-full px-3 py-1 text-xs font-bold shadow-lg ${st.className}`}>{st.label}</span>
        <span className="group-hover:text-brand-700 absolute top-4 right-4 grid size-10 place-items-center rounded-full bg-white/15 text-white backdrop-blur transition-all duration-300 group-hover:bg-white">
          <ArrowUpRight className="size-5 transition-transform duration-300 group-hover:rotate-45" />
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-4 p-6">
        <div>
          <h3 className="text-brand-950 text-xl font-extrabold tracking-tight">{project.name}</h3>
          <p className="mt-1 text-sm text-slate-600">{project.tagline}</p>
          <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <MapPin className="text-brand-600 size-3.5" />
            {project.location.city}, {project.location.region}
          </p>
        </div>
        <div className="mt-auto grid grid-cols-3 gap-2 text-center">
          <Stat value={num(s.total)} label="Lotes" />
          <Stat value={num(s.available)} label="Disponibles" accent />
          <Stat value={`${Math.round(s.areaMin)}+`} label="m² desde" icon />
        </div>
        <div>
          <AvailabilityBar available={s.available} reserved={s.reserved} sold={s.sold} />
          <p className="mt-2 text-xs text-slate-500">
            {Math.round((s.available / (s.total || 1)) * 100)}% disponible · {m2(Math.round(s.areaTotal))} en total
          </p>
        </div>
      </div>
    </motion.article>
  );
}

function Stat({ value, label, accent, icon }: { value: string; label: string; accent?: boolean; icon?: boolean }) {
  return (
    <div className={`rounded-2xl px-2 py-3 ${accent ? 'bg-brand-50' : 'bg-slate-50'}`}>
      <div className={`flex items-center justify-center gap-1 text-lg font-extrabold ${accent ? 'text-brand-700' : 'text-slate-800'}`}>
        {icon && <Ruler className="size-3.5 text-slate-400" />}
        {value}
      </div>
      <div className="text-[11px] font-medium tracking-wide text-slate-500 uppercase">{label}</div>
    </div>
  );
}
