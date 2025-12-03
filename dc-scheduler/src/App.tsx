import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { RegionsView } from './views/RegionsView';
import { EngineersView } from './views/EngineersView';
import { CalendarView } from './views/CalendarView';
import { WorksView } from './views/WorksView';
import { useThemeStore, applyTheme } from './stores/themeStore';

function App() {
  const { theme } = useThemeStore();

  React.useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/calendar" replace />} />
          <Route path="regions" element={<RegionsView />} />
          <Route path="engineers" element={<EngineersView />} />
          <Route path="calendar" element={<CalendarView />} />
          <Route path="works" element={<WorksView />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
