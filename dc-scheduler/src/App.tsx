import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { RegionsView } from './views/RegionsView';
import { EngineersView } from './views/EngineersView';
import { CalendarView } from './views/CalendarView';
import { WorksView } from './views/WorksView';
import { EngineerDashboard } from './views/EngineerDashboard';
import { SettingsView } from './views/SettingsView';
import { useThemeStore, applyTheme } from './stores/themeStore';

import { useWorkStore } from './stores/workStore';
import { useEngineerStore } from './stores/engineerStore';
import { useDataCenterStore } from './stores/dataCenterStore';
import { useSync } from './hooks/useSync';

function App() {
  const { theme } = useThemeStore();
  const { fetchWorks } = useWorkStore();
  const { fetchEngineers } = useEngineerStore();
  const { fetchData: fetchDataCenters } = useDataCenterStore();
  
  // Enable real-time SSE synchronization
  useSync();

  React.useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  React.useEffect(() => {
    fetchWorks();
    fetchEngineers();
    fetchDataCenters();
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/calendar" replace />} />
          <Route path="regions" element={<RegionsView />} />
          <Route path="engineers" element={<EngineersView />} />
          <Route path="calendar" element={<CalendarView />} />
          <Route path="works" element={<WorksView />} />
          <Route path="my-tasks" element={<EngineerDashboard />} />
          <Route path="settings" element={<SettingsView />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
