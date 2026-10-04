import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Radar } from 'lucide-react';
import { api } from '../api.js';
import Landing from './Landing.jsx';
import Dashboard from './Dashboard.jsx';

/** Корневой экран: сплэш → лендинг ⇄ дашборд (после Steam-входа). */
export default function AuthGate() {
  const [user, setUser] = useState(undefined); // undefined = идёт проверка сессии
  const [view, setView] = useState('landing');
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    // результат возврата со Steam: ?auth=ok | ?auth=failed&reason=...
    const sp = new URLSearchParams(window.location.search);
    if (sp.get('auth') === 'failed') {
      setAuthError(sp.get('reason') || 'unknown');
    }
    if (sp.has('auth')) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    api
      .me()
      .then((res) => {
        if (!alive) return;
        // res = { success, authenticated, data: user | null }
        if (res?.authenticated && res.data) {
          setUser(res.data);
          setView('app');
        } else {
          setUser(null);
        }
      })
      .catch(() => alive && setUser(null));
    return () => {
      alive = false;
    };
  }, []);

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      /* сессия истекла — и так хорошо */
    }
    setUser(null);
    setView('landing');
  };

  if (user === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2.2, repeat: Infinity, ease: 'linear' }}
          className="rounded-full border-2 border-neon/30 border-t-neon p-4"
        >
          <Radar className="text-neon" size={36} />
        </motion.div>
      </div>
    );
  }

  if (view === 'landing') {
    return <Landing user={user} onEnter={() => setView('app')} authError={authError} />;
  }

  return (
    <div className="fade-in">
      <Dashboard user={user} onLogout={logout} />
    </div>
  );
}
