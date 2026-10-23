import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from './lib/auth'
import { isConfigured } from './lib/supabase'
import { isRecoveryUrl } from './lib/recovery'
import { ToastProvider } from './components/ui/toast'
import { Spinner } from './components/ui'
import { AppShell } from './components/layout/AppShell'
import Landing from './pages/Landing'
import Splash from './pages/Splash'
import Discover from './pages/Discover'

const Login = lazy(() => import('./pages/Login'))
const Signup = lazy(() => import('./pages/Signup'))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const PostGig = lazy(() => import('./pages/PostGig'))
const GigDetail = lazy(() => import('./pages/GigDetail'))
const MyGigs = lazy(() => import('./pages/MyGigs'))
const MyWork = lazy(() => import('./pages/MyWork'))
const Services = lazy(() => import('./pages/Services'))
const ServiceDetail = lazy(() => import('./pages/ServiceDetail'))
const PostService = lazy(() => import('./pages/PostService'))
const MyServices = lazy(() => import('./pages/MyServices'))
const Wallet = lazy(() => import('./pages/Wallet'))
const Money = lazy(() => import('./pages/Money'))
const Economics = lazy(() => import('./pages/Economics'))
const IncomeStatement = lazy(() => import('./pages/IncomeStatement'))
const Workers = lazy(() => import('./pages/Workers'))
const WorkerProfile = lazy(() => import('./pages/WorkerProfile'))
const Profile = lazy(() => import('./pages/Profile'))
const Impact = lazy(() => import('./pages/Impact'))
const Verify = lazy(() => import('./pages/Verify'))
const Trust = lazy(() => import('./pages/Trust'))
const IdentityDemo = lazy(() => import('./pages/IdentityDemo'))
const NotFound = lazy(() => import('./pages/NotFound'))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 20_000, retry: 1, refetchOnWindowFocus: true },
  },
})

function RequireAuth({ children }: { children: ReactNode }) {
  const { userId, profile, loading } = useAuth()
  const location = useLocation()
  if (loading) return <Spinner />
  const next = encodeURIComponent(`${location.pathname}${location.search}${location.hash}`)
  if (!userId) return <Navigate to={`/login?next=${next}`} replace />
  if (!profile && location.pathname !== '/profile') return <Navigate to={`/profile?setup=1&next=${next}`} replace />
  return <>{children}</>
}

function HomeRoute() {
  const { userId, profile, loading } = useAuth()
  if (loading) return <Spinner />
  if (userId && profile) return <Navigate to={profile.role === 'customer' ? '/my-gigs' : '/discover'} replace />
  if (userId) return <Navigate to="/profile?setup=1" replace />
  // Signed-out visitors land on the splash and choose: register or sign in. The full story lives at /welcome.
  return <Splash />
}

// If the reset-link redirect isn't allow-listed, Supabase falls back to the site root — send it to the reset page anyway.
function RecoveryLinkRedirect() {
  const { pathname, search, hash } = useLocation()
  if (pathname === '/reset-password' || !isRecoveryUrl(search, hash)) return null
  return <Navigate to={`/reset-password${search}${hash}`} replace />
}

function ConfigError() {
  return (
    <div className="mx-auto max-w-md p-8 text-center">
      <h1 className="text-xl font-bold">KashWise is not configured</h1>
      <p className="mt-2 text-muted">Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (see .env.example).</p>
    </div>
  )
}

export default function App() {
  if (!isConfigured) return <ConfigError />
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <RecoveryLinkRedirect />
            <Suspense fallback={<Spinner />}>
              <Routes>
                <Route index element={<HomeRoute />} />
                <Route element={<AppShell />}>
                  <Route path="welcome" element={<Landing />} />
                  <Route path="login" element={<Login />} />
                  <Route path="signup" element={<Signup />} />
                  <Route path="forgot-password" element={<ForgotPassword />} />
                  <Route path="reset-password" element={<ResetPassword />} />
                  <Route path="discover" element={<Discover />} />
                  <Route path="workers" element={<Workers />} />
                  <Route path="gigs/new" element={<RequireAuth><PostGig /></RequireAuth>} />
                  <Route path="gigs/:id" element={<GigDetail />} />
                  <Route path="my-gigs" element={<RequireAuth><MyGigs /></RequireAuth>} />
                  <Route path="my-work" element={<RequireAuth><MyWork /></RequireAuth>} />
                  <Route path="services" element={<Services />} />
                  <Route path="services/new" element={<RequireAuth><PostService /></RequireAuth>} />
                  <Route path="services/:id" element={<ServiceDetail />} />
                  <Route path="services/:id/edit" element={<RequireAuth><PostService /></RequireAuth>} />
                  <Route path="my-services" element={<RequireAuth><MyServices /></RequireAuth>} />
                  <Route path="money" element={<RequireAuth><Money /></RequireAuth>} />
                  <Route path="wallet" element={<RequireAuth><Wallet /></RequireAuth>} />
                  <Route path="wallet/statement" element={<RequireAuth><IncomeStatement /></RequireAuth>} />
                  <Route path="w/:id" element={<WorkerProfile />} />
                  <Route path="profile" element={<RequireAuth><Profile /></RequireAuth>} />
                  <Route path="impact" element={<Impact />} />
                  <Route path="economics" element={<Economics />} />
                  <Route path="verify" element={<Verify />} />
                  <Route path="trust" element={<Trust />} />
                  <Route path="identity-demo" element={<IdentityDemo />} />
                  <Route path="*" element={<NotFound />} />
                </Route>
              </Routes>
            </Suspense>
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  )
}
