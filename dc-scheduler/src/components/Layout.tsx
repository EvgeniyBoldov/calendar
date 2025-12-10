import React, { useMemo } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Map, Users, Calendar, Hammer, Menu, X, ClipboardList, Settings, LogOut, Shield } from 'lucide-react';
import { ThemeToggle } from './ui/ThemeToggle';
import type { UserRole } from '../stores/authStore';
import { useAuthStore, roleLabels, roleColors } from '../stores/authStore';
import { api } from '../api/client';
import clsx from 'clsx';

interface NavItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  roles?: UserRole[];  // Если не указано - доступно всем
}

export const Layout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const { user, logout } = useAuthStore();

  const handleLogout = async () => {
    try {
      await api.auth.logout();
    } catch {
      // Ignore errors
    }
    logout();
    navigate('/login');
  };

  // Все пункты меню с ограничениями по ролям
  const allNavItems: NavItem[] = [
    { path: '/calendar', label: 'Календарь', icon: Calendar },
    { path: '/works', label: 'Работы', icon: Hammer },
    { path: '/my-tasks', label: 'Мои задачи', icon: ClipboardList, roles: ['ENGINEER'] },
    { path: '/engineers', label: 'Инженеры', icon: Users, roles: ['ADMIN', 'EXPERT'] },
    { path: '/regions', label: 'Регионы и ДЦ', icon: Map, roles: ['ADMIN', 'EXPERT'] },
    { path: '/admin/users', label: 'Пользователи', icon: Shield, roles: ['ADMIN'] },
    { path: '/settings', label: 'Настройки', icon: Settings },
  ];

  // Фильтруем пункты меню по роли пользователя
  const navItems = useMemo(() => {
    if (!user) return [];
    return allNavItems.filter(item => {
      if (!item.roles) return true;  // Доступно всем
      return item.roles.includes(user.role);
    });
  }, [user]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-card border-b border-border z-50">
        <div className="flex items-center justify-between h-full px-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="btn-ghost rounded-lg h-12 w-12 flex items-center justify-center"
              title={sidebarOpen ? 'Скрыть меню' : 'Показать меню'}
            >
              {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <Calendar size={18} className="text-primary-foreground" />
              </div>
              <h1 className="text-lg font-semibold text-foreground hidden sm:block">
                DC Scheduler
              </h1>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <ThemeToggle />
            
            {/* User info */}
            {user && (
              <div className="flex items-center gap-3">
                <div className="hidden sm:flex flex-col items-end">
                  <span className="text-sm font-medium text-foreground">
                    {user.fullName || user.login}
                  </span>
                  <span className={clsx(
                    "text-xs px-2 py-0.5 rounded-full",
                    roleColors[user.role]
                  )}>
                    {roleLabels[user.role]}
                  </span>
                </div>
                <button
                  onClick={handleLogout}
                  className="btn-ghost rounded-lg h-12 w-12 flex items-center justify-center text-muted-foreground hover:text-foreground"
                  title="Выйти"
                >
                  <LogOut className="w-6 h-6" />
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Sidebar */}
      <aside
        className={clsx(
          "fixed top-16 left-0 bottom-0 bg-sidebar border-r border-sidebar-border transition-transform duration-300 z-40 w-64 overflow-hidden",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <nav className="h-full p-4 space-y-2">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={clsx(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                )}
              >
                <item.icon size={18} className={isActive ? "text-primary" : ""} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <main
        className={clsx(
          "pt-16 min-h-screen transition-[padding] duration-300",
          sidebarOpen ? "pl-64" : "pl-0"
        )}
      >
        <div className="p-6">
          <div className="card p-6 min-h-[calc(100vh-7rem)] animate-fade-in">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
};
