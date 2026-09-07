import { useEffect, useState } from 'react';
import { AppStoreProvider, useStore } from '@/store/AppStore';
import { Shell, type Route } from '@/components/Shell';
import { Dashboard } from '@/pages/Dashboard';
import { Capture } from '@/pages/Capture';
import { Approvals } from '@/pages/Approvals';
import { QuickAdd, Transactions } from '@/pages/Transactions';
import { Analytics } from '@/pages/Analytics';
import { Budgets } from '@/pages/Budgets';
import { Goals } from '@/pages/Goals';
import { Accounts } from '@/pages/Accounts';
import { Reports } from '@/pages/Reports';
import { Settings } from '@/pages/Settings';

const ROUTES: Route[] = [
  'dashboard', 'transactions', 'capture', 'approvals', 'analytics',
  'budgets', 'goals', 'accounts', 'reports', 'settings',
];

function routeFromHash(): Route {
  const hash = window.location.hash.replace('#/', '') as Route;
  return ROUTES.includes(hash) ? hash : 'dashboard';
}

function Router() {
  const { ready } = useStore();
  const [route, setRoute] = useState<Route>(routeFromHash);
  const [quickAdd, setQuickAdd] = useState(false);

  // Hash routing keeps the back button working without a router dependency.
  useEffect(() => {
    const onHash = () => setRoute(routeFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = (next: Route) => {
    window.location.hash = `#/${next}`;
    setRoute(next);
    window.scrollTo({ top: 0 });
  };

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-plane">
        <div className="w-full max-w-md space-y-3 px-6">
          <div className="skeleton h-8 w-40" />
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="skeleton h-24" />
            ))}
          </div>
          <div className="skeleton h-48" />
          <p className="text-center text-xs text-subtle">Loading your data…</p>
        </div>
      </div>
    );
  }

  return (
    <Shell route={route} onNavigate={navigate} onQuickAdd={() => setQuickAdd(true)}>
      {route === 'dashboard' && <Dashboard onNavigate={navigate} />}
      {route === 'capture' && <Capture onNavigate={navigate} />}
      {route === 'approvals' && <Approvals />}
      {route === 'transactions' && <Transactions />}
      {route === 'analytics' && <Analytics />}
      {route === 'budgets' && <Budgets />}
      {route === 'goals' && <Goals />}
      {route === 'accounts' && <Accounts />}
      {route === 'reports' && <Reports />}
      {route === 'settings' && <Settings onNavigate={navigate} />}
      <QuickAdd open={quickAdd} onClose={() => setQuickAdd(false)} />
    </Shell>
  );
}

export default function App() {
  return (
    <AppStoreProvider>
      <Router />
    </AppStoreProvider>
  );
}
