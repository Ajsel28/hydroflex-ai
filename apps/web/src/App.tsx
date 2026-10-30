import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { AppShell } from './components/layout/AppShell';
import { LoadingBlock } from './components/ui/primitives';
import { AppStateProvider } from './state/app';
import { ThemeProvider } from './state/theme';
import { ToastProvider } from './state/toast';

const Landing = lazy(() => import('./pages/Landing'));
const MissionControl = lazy(() => import('./pages/MissionControl'));
const Lab = lazy(() => import('./pages/Lab'));
const Dispatch = lazy(() => import('./pages/Dispatch'));
const Storage = lazy(() => import('./pages/Storage'));
const Frontier = lazy(() => import('./pages/Frontier'));
const Risk = lazy(() => import('./pages/Risk'));
const Notebook = lazy(() => import('./pages/Notebook'));
const About = lazy(() => import('./pages/About'));
const Present = lazy(() => import('./pages/Present'));
const NotFound = lazy(() => import('./pages/NotFound'));

const wrap = (el: ReactNode) => (
  <Suspense
    fallback={
      <div className="mx-auto max-w-[1480px] px-6 py-8">
        <LoadingBlock label="Loading view…" height={420} />
      </div>
    }
  >
    {el}
  </Suspense>
);

export const routes = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: wrap(<Landing />) },
      { path: 'mission', element: wrap(<MissionControl />) },
      { path: 'lab', element: wrap(<Lab />) },
      { path: 'dispatch', element: wrap(<Dispatch />) },
      { path: 'storage', element: wrap(<Storage />) },
      { path: 'frontier', element: wrap(<Frontier />) },
      { path: 'risk', element: wrap(<Risk />) },
      { path: 'notebook', element: wrap(<Notebook />) },
      { path: 'about', element: wrap(<About />) },
      { path: 'present', element: wrap(<Present />) },
      { path: '*', element: wrap(<NotFound />) },
    ],
  },
];

const router = createBrowserRouter(routes);

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AppStateProvider>{children}</AppStateProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

export function App() {
  return (
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  );
}
