import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import AppLayout from './components/AppLayout'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/auth/LoginPage'
import RegisterPage from './pages/auth/RegisterPage'
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage'
import DashboardPage from './pages/DashboardPage'

// Heavy routes (three.js / three-vrm / MediaPipe) are code-split so they only
// load when the user actually opens them — keeping the initial bundle small.
const GeneratePage = lazy(() => import('./pages/GeneratePage'))
const LibraryPage = lazy(() => import('./pages/LibraryPage'))
const StudioPage = lazy(() => import('./pages/StudioPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'))
const AdminPage = lazy(() => import('./pages/AdminPage'))
const OnboardingPage = lazy(() => import('./pages/OnboardingPage'))
const ObsView = lazy(() => import('./pages/ObsView'))

function LoadingScreen() {
  return (
    <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-300">
      <div className="animate-pulse text-sm">Carregando…</div>
    </div>
  )
}

export default function App() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />

            {/* OBS capture surface (public, transparent) */}
            <Route path="/obs" element={<ObsView />} />

            {/* Authenticated app shell */}
            <Route
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/app" element={<DashboardPage />} />
              <Route path="/app/generate" element={<GeneratePage />} />
              <Route path="/app/library" element={<LibraryPage />} />
              <Route path="/app/studio" element={<StudioPage />} />
              <Route path="/app/analytics" element={<AnalyticsPage />} />
              <Route path="/app/settings" element={<SettingsPage />} />
              <Route path="/app/admin" element={<AdminPage />} />
            </Route>

            {/* Onboarding (auth, outside the shell) */}
            <Route
              path="/onboarding"
              element={
                <ProtectedRoute>
                  <OnboardingPage />
                </ProtectedRoute>
              }
            />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </Suspense>
  )
}
