import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Layout } from '@/components/layout/Layout';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { FullPageLoader } from '@/components/ui/LoadingSpinner';

// Lazy-loaded pages for code splitting
const LoginPage = lazy(() => import('@/pages/login/LoginPage'));
const DashboardPage = lazy(() => import('@/pages/dashboard/DashboardPage'));
const SalesListPage = lazy(() => import('@/pages/sales/SalesListPage'));
const SalesDetailPage = lazy(() => import('@/pages/sales/SalesDetailPage'));
const CustomerListPage = lazy(() => import('@/pages/customers/CustomerListPage'));
const CustomerDetailPage = lazy(() => import('@/pages/customers/CustomerDetailPage'));
const ProjectListPage = lazy(() => import('@/pages/projects/ProjectListPage'));
const ProjectDetailPage = lazy(() => import('@/pages/projects/ProjectDetailPage'));
const ProfilePage = lazy(() => import('@/pages/profile/ProfilePage'));
const AdminSalesPage = lazy(() => import('@/pages/admin/sales/AdminSalesPage'));
const AdminCustomerPage = lazy(() => import('@/pages/admin/customers/AdminCustomerPage'));
const AdminProjectPage = lazy(() => import('@/pages/admin/projects/AdminProjectPage'));

function SuspenseWrapper({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<FullPageLoader />}>
      {children}
    </Suspense>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public Routes */}
            <Route
              path="/login"
              element={
                <SuspenseWrapper>
                  <LoginPage />
                </SuspenseWrapper>
              }
            />

            {/* Protected Routes */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Layout>
                    <SuspenseWrapper>
                      <DashboardPage />
                    </SuspenseWrapper>
                  </Layout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/sales"
              element={
                <ProtectedRoute>
                  <Layout>
                    <SuspenseWrapper>
                      <SalesListPage />
                    </SuspenseWrapper>
                  </Layout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/sales/:id"
              element={
                <ProtectedRoute>
                  <Layout>
                    <SuspenseWrapper>
                      <SalesDetailPage />
                    </SuspenseWrapper>
                  </Layout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/customers"
              element={
                <ProtectedRoute>
                  <Layout>
                    <SuspenseWrapper>
                      <CustomerListPage />
                    </SuspenseWrapper>
                  </Layout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/customers/:id"
              element={
                <ProtectedRoute>
                  <Layout>
                    <SuspenseWrapper>
                      <CustomerDetailPage />
                    </SuspenseWrapper>
                  </Layout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/projects"
              element={
                <ProtectedRoute>
                  <Layout>
                    <SuspenseWrapper>
                      <ProjectListPage />
                    </SuspenseWrapper>
                  </Layout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/projects/:id"
              element={
                <ProtectedRoute>
                  <Layout>
                    <SuspenseWrapper>
                      <ProjectDetailPage />
                    </SuspenseWrapper>
                  </Layout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <Layout>
                    <SuspenseWrapper>
                      <ProfilePage />
                    </SuspenseWrapper>
                  </Layout>
                </ProtectedRoute>
              }
            />

            {/* Admin Routes */}
            <Route
              path="/admin/sales"
              element={
                <ProtectedRoute requiredRole="admin">
                  <Layout>
                    <SuspenseWrapper>
                      <AdminSalesPage />
                    </SuspenseWrapper>
                  </Layout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin/customers"
              element={
                <ProtectedRoute requiredRole="admin">
                  <Layout>
                    <SuspenseWrapper>
                      <AdminCustomerPage />
                    </SuspenseWrapper>
                  </Layout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin/projects"
              element={
                <ProtectedRoute requiredRole="admin">
                  <Layout>
                    <SuspenseWrapper>
                      <AdminProjectPage />
                    </SuspenseWrapper>
                  </Layout>
                </ProtectedRoute>
              }
            />

            {/* Default redirect */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
