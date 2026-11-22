import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';
import { Home } from './pages/Home';
import { NotFound } from './pages/NotFound';
import { FullLoader } from './components/Loader';

const ProjectPage = lazy(() => import('./pages/ProjectPage'));

export function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<FullLoader />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/proyecto/:slug" element={<ProjectPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
