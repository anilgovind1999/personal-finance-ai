import React from 'react';
import { useStore } from '@/store/AppStore';
import { cx } from '@/components/ui/Primitives';
import {
  IconBudget, IconChart, IconDashboard, IconInbox, IconLedger, IconMoon, IconPlus,
  IconReport, IconSettings, IconSparkles, IconSun, IconTarget, IconWallet,
} from '@/components/Icons';

export type Route =
  | 'dashboard' | 'transactions' | 'capture' | 'approvals' | 'analytics'
  | 'budgets' | 'goals' | 'accounts' | 'reports' | 'settings';

interface NavItem {
  route: Route;
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  /** Shown in the mobile tab bar. */
  primary?: boolean;
}

export const NAV: NavItem[] = [
  { route: 'dashboard', label: 'Dashboard', icon: IconDashboard, primary: true },
  { route: 'capture', label: 'AI Capture', icon: IconSparkles, primary: true },
  { route: 'approvals', label: 'Pending Approval', icon: IconInbox, primary: true },
  { route: 'transactions', label: 'Transactions', icon: IconLedger, primary: true },
  { route: 'analytics', label: 'Analytics', icon: IconChart },
  { route: 'budgets', label: 'Budgets', icon: IconBudget },
  { route: 'goals', label: 'Goals', icon: IconTarget },
  { route: 'accounts', label: 'Accounts', icon: IconWallet },
  { route: 'reports', label: 'Reports', icon: IconReport },
  { route: 'settings', label: 'Settings', icon: IconSettings },
];

export function Shell({
  route, onNavigate, onQuickAdd, children,
}: {
  route: Route;
  onNavigate: (r: Route) => void;
  onQuickAdd: () => void;
  children: React.ReactNode;
}) {
  const { state, dispatch, toasts, dismissToast } = useStore();
  const pendingCount = state.pending.filter((p) => p.status === 'pending').length;
  const dark = state.settings.theme === 'dark';
  const current = NAV.find((n) => n.route === route);

  const toggleTheme = () =>
    dispatch({ type: 'settings/update', settings: { theme: dark ? 'light' : 'dark' } });

  return (
    <div className="flex min-h-full bg-plane">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-surface lg:flex">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent text-white shadow-card">
            <IconSparkles width={18} height={18} />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-bold">FinSight</p>
            <p className="text-[11px] text-subtle">Personal Finance AI</p>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
          {NAV.map((item) => (
            <NavButton
              key={item.route}
              item={item}
              active={route === item.route}
              badge={item.route === 'approvals' ? pendingCount : 0}
              onClick={() => onNavigate(item.route)}
            />
          ))}
        </nav>

        <div className="border-t border-line p-3">
          <button
            type="button"
            onClick={toggleTheme}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-plane hover:text-ink"
          >
            {dark ? <IconMoon width={18} height={18} /> : <IconSun width={18} height={18} />}
            {dark ? 'Dark mode' : 'Light mode'}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-surface/95 px-4 py-3 backdrop-blur lg:hidden">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-white">
            <IconSparkles width={16} height={16} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold leading-tight">{current?.label ?? 'FinSight'}</p>
            <p className="text-[11px] text-subtle">Personal Finance AI</p>
          </div>
          <button type="button" onClick={toggleTheme} aria-label="Toggle theme" className="rounded-lg p-2 text-muted hover:bg-plane hover:text-ink">
            {dark ? <IconMoon width={18} height={18} /> : <IconSun width={18} height={18} />}
          </button>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-3 pb-28 pt-4 sm:px-5 lg:pb-10 lg:pt-6">{children}</main>

        {/* Mobile tab bar */}
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-lg items-stretch">
            {NAV.filter((n) => n.primary).map((item) => (
              <TabButton
                key={item.route}
                item={item}
                active={route === item.route}
                badge={item.route === 'approvals' ? pendingCount : 0}
                onClick={() => onNavigate(item.route)}
              />
            ))}
            <TabButton
              item={{ route: 'settings', label: 'More', icon: IconSettings }}
              active={['settings', 'analytics', 'budgets', 'goals', 'accounts', 'reports'].includes(route)}
              badge={0}
              onClick={() => onNavigate('settings')}
            />
          </div>
        </nav>

        {/* Quick add — the fastest path to a manual entry. */}
        <button
          type="button"
          onClick={onQuickAdd}
          aria-label="Add transaction"
          className="fixed bottom-20 right-4 z-30 grid h-14 w-14 place-items-center rounded-full bg-accent text-white shadow-pop transition-transform active:scale-95 lg:bottom-8 lg:right-8"
        >
          <IconPlus width={24} height={24} />
        </button>
      </div>

      {/* Toasts */}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex flex-col items-center gap-2 px-4 lg:inset-x-auto lg:bottom-28 lg:right-6 lg:top-auto lg:items-end lg:px-0">
        {toasts.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => dismissToast(t.id)}
            className={cx(
              'pointer-events-auto flex w-full max-w-sm items-center gap-2 rounded-xl border px-3.5 py-2.5 text-left text-xs font-medium shadow-pop animate-fade-up',
              t.tone === 'error' ? 'border-critical/40 bg-critical/12 text-critical'
                : t.tone === 'info' ? 'border-line bg-raised text-ink'
                : 'border-good/40 bg-good/12 text-good',
            )}
          >
            {t.message}
          </button>
        ))}
      </div>
    </div>
  );
}

function NavButton({
  item, active, badge, onClick,
}: {
  item: NavItem;
  active: boolean;
  badge: number;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cx(
        'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
        active ? 'bg-accent/12 text-accent' : 'text-muted hover:bg-plane hover:text-ink',
      )}
    >
      <Icon width={18} height={18} />
      <span className="truncate">{item.label}</span>
      {badge > 0 && (
        <span className="ml-auto rounded-pill bg-critical px-1.5 py-0.5 text-[10px] font-bold text-white tnum">{badge}</span>
      )}
    </button>
  );
}

function TabButton({
  item, active, badge, onClick,
}: {
  item: NavItem;
  active: boolean;
  badge: number;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cx('relative flex flex-1 flex-col items-center gap-1 px-1 py-2.5 text-[10px] font-semibold transition-colors',
        active ? 'text-accent' : 'text-subtle')}
    >
      <span className="relative">
        <Icon width={20} height={20} />
        {badge > 0 && (
          <span className="absolute -right-2 -top-1.5 min-w-[16px] rounded-pill bg-critical px-1 text-[9px] font-bold leading-4 text-white tnum">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </span>
      <span className="truncate">{item.label}</span>
    </button>
  );
}
