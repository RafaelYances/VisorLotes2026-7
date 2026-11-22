import { useCallback, useEffect, useState } from 'react';
import { FullLoader } from '../components/Loader';
import { adminApi, type SessionInfo } from './api';
import { Login, Setup } from './AuthScreens';
import { Dashboard } from './Dashboard';

/** Panel de administración (/admin). Todo el acceso real lo valida el servidor. */
export default function AdminApp() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [error, setError] = useState('');

  const refresh = useCallback(() => {
    adminApi
      .session()
      .then(setSession)
      .catch(() => setError('No se pudo conectar con el servidor del panel.'));
  }, []);

  useEffect(() => {
    document.title = 'Panel · VisorLotes';
    // Que los buscadores no indexen el panel
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    refresh();
    return () => meta.remove();
  }, [refresh]);

  if (error) return <FullLoader label={error} />;
  if (!session) return <FullLoader label="Verificando acceso…" />;
  if (!session.setup) return <Setup onDone={refresh} />;
  if (!session.authenticated) return <Login onDone={refresh} />;
  return <Dashboard email={session.email} onLogout={() => setSession({ setup: true, authenticated: false })} />;
}
