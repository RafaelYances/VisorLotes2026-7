import { ArrowDown, Building2, Compass, Home as HomeIcon, Map, MousePointerClick, Ruler, ShieldCheck, Smartphone } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { LeadForm } from '../components/LeadForm';
import { ProjectCard } from '../components/ProjectCard';
import { BrandMark, SectionTitle, WhatsAppIcon } from '../components/ui';
import { SITE } from '../config';
import { asset, loadProjects, useAsync } from '../lib/data';
import { HERO_BLUR } from '../heroBlur';
import { cx, num, whatsappUrl } from '../lib/format';

export function Home() {
  const { data: projects = [], loading } = useAsync(loadProjects, []);
  const totals = projects.reduce(
    (t, p) => ({ lots: t.lots + p.stats.total, available: t.available + p.stats.available, area: t.area + p.stats.areaTotal }),
    { lots: 0, available: 0, area: 0 },
  );

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* HERO */}
      <section className="bg-brand-950 relative isolate flex min-h-[100svh] items-end overflow-hidden pt-32 pb-16 sm:items-center sm:pb-24">
        {/* Fondo: foto aérea con vista previa borrosa y un acercamiento lento */}
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <img src={HERO_BLUR} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover blur-xl" />
          <motion.img
            src={asset('img/hero.webp')}
            srcSet={`${asset('img/hero-sm.webp')} 1000w, ${asset('img/hero.webp')} 1600w`}
            sizes="100vw"
            alt="Vista aérea de San Bernardo del Viento y el mar Caribe"
            fetchPriority="high"
            decoding="async"
            initial={{ scale: 1.12, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ scale: { duration: 14, ease: 'easeOut' }, opacity: { duration: 1.2 } }}
            className="absolute inset-0 h-full w-full object-cover object-[center_60%]"
          />
          {/* Capas suaves: el cielo y el mar se ven; el texto sigue legible */}
          <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/35 to-transparent" />
          <div className="from-brand-950 via-brand-950/20 absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t to-transparent" />
          <div className="from-brand-950/85 via-brand-950/40 max-sm:via-brand-950/60 max-sm:to-brand-950/30 absolute inset-0 bg-gradient-to-r via-45% to-transparent to-75%" />
        </div>

        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            className="max-w-3xl"
          >
            <span className="glass-dark text-brand-100 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold">
              <span className="relative flex size-2">
                <span className="bg-brand-400 absolute inline-flex size-full animate-ping rounded-full opacity-75" />
                <span className="bg-brand-400 relative inline-flex size-2 rounded-full" />
              </span>
              Disponibilidad actualizada en tiempo real
            </span>
            <h1 className="mt-6 text-[2.6rem] leading-[1.05] font-extrabold tracking-tight text-white [text-shadow:0_2px_24px_rgb(2_44_34/0.45)] sm:text-6xl lg:text-7xl">
              Tu lote ideal, <br className="hidden sm:block" />
              <span className="text-gradient">visto desde el cielo.</span>
            </h1>
            <p className="text-brand-50/80 mt-6 max-w-xl text-lg leading-relaxed">
              Recorre proyectos sobre imagen satelital, consulta medidas reales de cada lote y descubre qué casa puedes construir en él. Sin
              registros, sin complicaciones.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <a
                href="#proyectos"
                className="bg-brand-500 shadow-glow hover:bg-brand-400 inline-flex h-14 items-center justify-center gap-2 rounded-2xl px-7 text-base font-bold text-white transition active:scale-[0.98]"
              >
                <Map className="size-5" /> Explorar proyectos
              </a>
              <a
                href="#publica"
                className="glass-dark inline-flex h-14 items-center justify-center gap-2 rounded-2xl px-7 text-base font-semibold text-white transition hover:bg-white/15"
              >
                <Building2 className="size-5" /> Publica tu proyecto
              </a>
            </div>
          </motion.div>

          <motion.dl
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="glass-dark mt-14 grid max-w-3xl grid-cols-3 divide-x divide-white/10 overflow-hidden rounded-3xl"
          >
            {[
              { k: 'Proyectos', v: loading ? '—' : num(projects.length) },
              { k: 'Lotes disponibles', v: loading ? '—' : num(totals.available) },
              { k: 'Hectáreas', v: loading ? '—' : (totals.area / 10000).toLocaleString('es-CO', { maximumFractionDigits: 1 }) },
            ].map((s) => (
              <div key={s.k} className="px-4 py-5 sm:px-7">
                <dd className="text-2xl font-extrabold text-white sm:text-4xl">{s.v}</dd>
                <dt className="text-brand-200/80 mt-1 text-[11px] font-semibold tracking-wider uppercase sm:text-xs">{s.k}</dt>
              </div>
            ))}
          </motion.dl>
        </div>

        <a
          href="#proyectos"
          className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 text-white/60 transition hover:text-white sm:block"
          aria-label="Bajar"
        >
          <ArrowDown className="animate-float size-6" />
        </a>
      </section>

      {/* PROYECTOS */}
      <section id="proyectos" className="relative scroll-mt-20 py-24 sm:py-32">
        <div className="from-brand-50 absolute inset-x-0 top-0 -z-10 h-96 bg-gradient-to-b to-transparent" />
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionTitle eyebrow="Proyectos" title="Elige dónde empezar tu historia">
            Cada proyecto con su plano real, el estado de cada lote y toda la información para decidir con confianza.
          </SectionTitle>
          <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {loading
              ? [0, 1, 2].map((i) => <div key={i} className="skeleton h-[460px] rounded-3xl" />)
              : projects.map((p, i) => <ProjectCard key={p.slug} project={p} index={i} />)}
            {!loading && (
              <motion.a
                href="#publica"
                initial={{ opacity: 0, y: 28 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: projects.length * 0.08 }}
                className="group border-brand-200 bg-brand-50/40 hover:border-brand-400 hover:bg-brand-50 flex min-h-[300px] flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed p-8 text-center transition"
              >
                <span className="text-brand-600 shadow-soft grid size-16 place-items-center rounded-2xl bg-white transition group-hover:scale-110">
                  <Building2 className="size-8" />
                </span>
                <span className="text-brand-950 text-lg font-extrabold">¿Tienes un proyecto de lotes?</span>
                <span className="max-w-xs text-sm text-slate-600">
                  Publícalo aquí y muéstralo como nunca antes. Déjanos tus datos y te contactamos.
                </span>
              </motion.a>
            )}
          </div>
        </div>
      </section>

      {/* CÓMO FUNCIONA */}
      <section id="como-funciona" className="bg-brand-950 scroll-mt-20 py-24 text-white sm:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-brand-300 text-sm font-bold tracking-[0.2em] uppercase">Cómo funciona</p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">De la pantalla a tu terreno en 3 pasos</h2>
          </div>
          <div className="mt-16 grid gap-6 md:grid-cols-3">
            {[
              {
                icon: Compass,
                t: 'Explora el mapa',
                d: 'Navega el proyecto sobre imagen satelital real. Filtra por estado, manzana o tamaño.',
              },
              {
                icon: MousePointerClick,
                t: 'Elige tu lote',
                d: 'Consulta área, frente, fondo, colindancias y precio de cada lote al instante.',
              },
              { icon: HomeIcon, t: 'Imagina tu casa', d: 'Prueba diseños de casa a escala real dentro del lote, respetando los retiros.' },
            ].map((s, i) => (
              <motion.div
                key={s.t}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: i * 0.1 }}
                className="group relative overflow-hidden rounded-3xl bg-white/[0.04] p-8 ring-1 ring-white/10 transition hover:bg-white/[0.07]"
              >
                <span className="absolute top-4 right-6 text-7xl font-black text-white/5">{i + 1}</span>
                <span className="from-brand-400 to-brand-600 shadow-glow grid size-14 place-items-center rounded-2xl bg-gradient-to-br">
                  <s.icon className="size-7" />
                </span>
                <h3 className="mt-6 text-xl font-bold">{s.t}</h3>
                <p className="text-brand-100/70 mt-2">{s.d}</p>
              </motion.div>
            ))}
          </div>
          <div className="text-brand-100/80 mt-12 grid gap-4 text-sm sm:grid-cols-3">
            {[
              { icon: Ruler, t: 'Medidas tomadas del plano topográfico (CAD)' },
              { icon: Smartphone, t: 'Diseñado para celular, tablet y computador' },
              { icon: ShieldCheck, t: 'Sin registros: entra, explora y contacta' },
            ].map((f) => (
              <div key={f.t} className="flex items-center gap-3 rounded-2xl px-4 py-3 ring-1 ring-white/10">
                <f.icon className="text-brand-300 size-5 shrink-0" /> {f.t}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PUBLICA */}
      <section id="publica" className="relative scroll-mt-20 overflow-hidden py-24 sm:py-32">
        <div className="from-brand-50 to-brand-100/60 absolute inset-0 -z-10 bg-gradient-to-br via-white" />
        <div className="bg-brand-200/40 absolute top-20 -left-40 -z-10 size-[500px] rounded-full blur-3xl" />
        <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-5 lg:px-8">
          <div className="lg:col-span-2">
            <p className="text-brand-600 text-sm font-bold tracking-[0.2em] uppercase">Para desarrolladores</p>
            <h2 className="text-brand-950 mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">Publica tu proyecto con nosotros</h2>
            <p className="mt-4 text-lg text-slate-600">
              Convertimos tu plano CAD en un visor interactivo de alto impacto: lotes en tiempo real, medidas exactas y una experiencia que
              vende sola.
            </p>
            <ul className="mt-8 space-y-4">
              {[
                'Visor satelital con tu loteo y tu marca',
                'Inventario de lotes siempre actualizado',
                'Clientes que llegan a tu WhatsApp con el lote elegido',
              ].map((t) => (
                <li key={t} className="flex items-start gap-3 text-slate-700">
                  <span className="bg-brand-500 mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-white">
                    <svg viewBox="0 0 20 20" className="size-3.5" fill="currentColor">
                      <path d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.6l7.3-7.3a1 1 0 0 1 1.4 0z" />
                    </svg>
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="from-brand-400 to-brand-700 shadow-soft rounded-[2rem] bg-gradient-to-br p-[2px] lg:col-span-3">
            <LeadForm />
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 40);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  return (
    <header className="fixed inset-x-0 top-0 z-40 px-3 pt-3 sm:px-6">
      <nav
        className={cx(
          'mx-auto flex h-16 max-w-7xl items-center justify-between rounded-2xl px-4 transition-all duration-500 sm:px-6',
          scrolled ? 'glass shadow-soft' : 'bg-transparent',
        )}
      >
        <BrandMark light={!scrolled} />
        <div className={cx('hidden items-center gap-8 text-sm font-semibold md:flex', scrolled ? 'text-slate-700' : 'text-white/85')}>
          <a href="#proyectos" className="hover:text-brand-500 transition">
            Proyectos
          </a>
          <a href="#como-funciona" className="hover:text-brand-500 transition">
            Cómo funciona
          </a>
          <a href="#publica" className="hover:text-brand-500 transition">
            Publica tu proyecto
          </a>
        </div>
        <a
          href={whatsappUrl(SITE.whatsapp, 'Hola, quiero información sobre los proyectos de lotes.')}
          target="_blank"
          rel="noopener"
          className="bg-brand-500 shadow-glow hover:bg-brand-600 inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-bold text-white transition"
        >
          <WhatsAppIcon className="size-4" />
          <span className="hidden sm:inline">Escríbenos</span>
        </a>
      </nav>
    </header>
  );
}

function Footer() {
  return (
    <footer className="bg-brand-950 text-brand-100/70">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-4 py-10 sm:flex-row sm:px-6 lg:px-8">
        <BrandMark light />
        <p className="text-center text-sm">
          © {new Date().getFullYear()} {SITE.name}. Información de referencia; confirma disponibilidad y precios con un asesor.
        </p>
        <a
          href={whatsappUrl(SITE.whatsapp, 'Hola')}
          target="_blank"
          rel="noopener"
          className="text-brand-300 inline-flex items-center gap-2 text-sm font-semibold hover:text-white"
        >
          <WhatsAppIcon className="size-4" /> WhatsApp
        </a>
      </div>
    </footer>
  );
}
