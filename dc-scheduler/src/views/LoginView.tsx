import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, AlertCircle, Loader2 } from 'lucide-react';
import { api } from '../api/client';
import { useAuthStore } from '../stores/authStore';

export function LoginView() {
  const navigate = useNavigate();
  const { setUser, setLoading, setError, isAuthenticated, isLoading, error } = useAuthStore();
  
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');

  // Если уже авторизован - редирект
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!login.trim() || !password) {
      setError('Введите логин и пароль');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await api.auth.login({ login: login.trim(), password });
      setUser(response.user);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка входа');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="max-w-md w-full space-y-8">
        {/* Logo / Title */}
        <div className="text-center">
          <div className="mx-auto h-16 w-16 bg-blue-600 rounded-xl flex items-center justify-center">
            <LogIn className="h-8 w-8 text-white" />
          </div>
          <h2 className="mt-6 text-3xl font-bold text-gray-900 dark:text-white">
            DC Scheduler
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Система планирования работ в дата-центрах
          </p>
        </div>

        {/* Login Form */}
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-sm space-y-4">
            <div>
              <label htmlFor="login" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Логин
              </label>
              <input
                id="login"
                name="login"
                type="text"
                autoComplete="username"
                required
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                className="appearance-none relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 sm:text-sm"
                placeholder="Введите логин"
                disabled={isLoading}
              />
            </div>
            
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Пароль
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="appearance-none relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 sm:text-sm"
                placeholder="Введите пароль"
                disabled={isLoading}
              />
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={isLoading}
            className="group relative w-full flex justify-center py-2.5 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Вход...
              </>
            ) : (
              <>
                <LogIn className="h-4 w-4 mr-2" />
                Войти
              </>
            )}
          </button>
        </form>

        {/* Footer */}
        <p className="text-center text-xs text-gray-500 dark:text-gray-400">
          Для получения доступа обратитесь к администратору
        </p>
      </div>
    </div>
  );
}
