import React from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Map, Users, Calendar, Hammer, Menu, X } from 'lucide-react';
import { ThemeToggle } from './ui/ThemeToggle';
import clsx from 'clsx';

export const Layout: React.FC = () => {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = React.useState(true);

  const navItems = [
    { path: '/works', label: 'Список работ', icon: Hammer },
    { path: '/engineers', label: 'Инженеры', icon: Users },
    { path: '/regions', label: 'Регионы и ДЦ', icon: Map },
    { path: '/calendar', label: 'Календарь работ', icon: Calendar },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-card border-b border-border z-50">
        <div className="flex items-center justify-between h-full px-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="btn-ghost btn-icon rounded-lg"
            >
              {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
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
          </div>
        </div>
      </header>

      {/* Sidebar */}
      <aside
        className={clsx(
          "fixed top-16 left-0 bottom-0 bg-sidebar border-r border-sidebar-border transition-all duration-300 z-40",
          sidebarOpen ? "w-64" : "w-0 -translate-x-full"
        )}
      >
        <nav className="p-4 space-y-2">
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
          "pt-16 min-h-screen transition-all duration-300",
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
