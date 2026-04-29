import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/app-shell";
import { AuthProvider, useAuth } from "./lib/auth-context";
import { AuthLoadingPage, ChangePasswordPage, InitialSetupPage, LoginPage } from "./pages/auth";
import { DashboardPage } from "./pages/dashboard";
import { EventsPage } from "./pages/events";
import { InventoryPage } from "./pages/inventory";
import { OrdersPage } from "./pages/orders";
import { ProductsPage } from "./pages/products";
import { SettingsPage } from "./pages/settings";

const AuthenticatedRoutes = (): JSX.Element => {
  const { session } = useAuth();

  if (!session) {
    return <LoginPage />;
  }

  if (session.user.mustChangePassword) {
    return <ChangePasswordPage />;
  }

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route
          path="inventory"
          element={
            session.user.role === "viewer" ? <Navigate to="/" replace /> : <InventoryPage />
          }
        />
        <Route path="orders" element={<OrdersPage />} />
        <Route path="events" element={<EventsPage />} />
        <Route
          path="settings"
          element={
            session.permissions.canManageSettings ? <SettingsPage /> : <Navigate to="/" replace />
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
};

const AppContent = (): JSX.Element => {
  const { loading, hasAdmin } = useAuth();

  if (loading) {
    return <AuthLoadingPage />;
  }

  if (!hasAdmin) {
    return <InitialSetupPage />;
  }

  return <AuthenticatedRoutes />;
};

export const App = (): JSX.Element => (
  <AuthProvider>
    <AppContent />
  </AuthProvider>
);
