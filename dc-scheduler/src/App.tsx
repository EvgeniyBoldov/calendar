import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Layout } from './components/Layout';
import { RegionsView } from './views/RegionsView';
import { EngineersView } from './views/EngineersView';
import { CalendarView } from './views/CalendarView';
import { WorksView } from './views/WorksView';
import { EngineerDashboard } from './views/EngineerDashboard';
import { SettingsView } from './views/SettingsView';
import { LoginView } from './views/LoginView';
import { AdminUsersView } from './views/AdminUsersView';
import { useThemeStore, applyTheme } from './stores/themeStore';
import { useAuthStore } from './stores/authStore';
import { api } from './api/client';

import { useWorkStore } from './stores/workStore';
import { useEngineerStore } from './stores/engineerStore';
import { useDataCenterStore } from './stores/dataCenterStore';
import { useSync } from './hooks/useSync';

// Компонент защищённого роута
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthStore();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

// Основное приложение (внутри BrowserRouter)
function AppContent() {
  const { theme } = useThemeStore();
  const { isAuthenticated, setUser, setLoading, logout } = useAuthStore();
  const { fetchWorks } = useWorkStore();
  const { fetchEngineers } = useEngineerStore();
  const { fetchData: fetchDataCenters } = useDataCenterStore();
  
  // Enable real-time SSE synchronization (только если авторизован)
  useSync();

  // Применяем тему
  React.useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Проверяем авторизацию при загрузке
  React.useEffect(() => {
    const checkAuth = async () => {
      setLoading(true);
      try {
        const user = await api.auth.me();
        setUser(user);
      } catch {
        logout();
      }
    };
    checkAuth();
  }, []);

  // Загружаем данные только если авторизован
  React.useEffect(() => {
    if (isAuthenticated) {
      fetchWorks();
      fetchEngineers();
      fetchDataCenters();
    }
  }, [isAuthenticated]);

  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<LoginView />} />
      
      {/* Protected routes */}
      <Route path="/" element={
        <ProtectedRoute>
          <Layout />
        </ProtectedRoute>
      }>
        <Route index element={<Navigate to="/calendar" replace />} />
        <Route path="regions" element={<RegionsView />} />
        <Route path="engineers" element={<EngineersView />} />
        <Route path="calendar" element={<CalendarView />} />
        <Route path="works" element={<WorksView />} />
        <Route path="my-tasks" element={<EngineerDashboard />} />
        <Route path="settings" element={<SettingsView />} />
        <Route path="admin/users" element={<AdminUsersView />} />
      </Route>
      
      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;
