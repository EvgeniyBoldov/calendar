import React from 'react';
import { Moon, Sun, Monitor } from 'lucide-react';
import { useThemeStore, applyTheme } from '../../stores/themeStore';
import clsx from 'clsx';

export const ThemeToggle: React.FC = () => {
  const { theme, setTheme } = useThemeStore();

  React.useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Listen for system theme changes
  React.useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (theme === 'system') {
        applyTheme('system');
      }
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  const options = [
    { value: 'light' as const, icon: Sun, label: 'Светлая' },
    { value: 'dark' as const, icon: Moon, label: 'Тёмная' },
    { value: 'system' as const, icon: Monitor, label: 'Система' },
  ];

  return (
    <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => setTheme(option.value)}
          className={clsx(
            "p-2 rounded-md transition-all duration-200",
            theme === option.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
          title={option.label}
        >
          <option.icon size={16} />
        </button>
      ))}
    </div>
  );
};
