import { Navigate, Route, Routes } from "react-router-dom";
import { useEffect } from "react";
import { AppShell } from "./components/layout/app-shell";
import { AuthProvider, useAuth } from "./lib/auth-context";
import { getDesktopApi } from "./lib/desktop-api";
import {
  AuthLoadingPage,
  ChangePasswordPage,
  InitialSetupPage,
  LoginPage,
} from "./pages/auth";
import { DashboardPage } from "./pages/dashboard";
import { EventsPage } from "./pages/events";
import { InventoryPage } from "./pages/inventory";
import { OrdersPage } from "./pages/orders";
import { ProfitPage } from "./pages/profit";
import { ProductsPage } from "./pages/products";
import { SettingsPage } from "./pages/settings";

type StartupReadyMark = "login_rendered" | "initial_setup_rendered" | "authenticated_shell_rendered";

const sentStartupMarks = new Set<StartupReadyMark>();

const hideBootSplash = (): void => {
  const bootSplash = document.getElementById("boot-splash");
  if (!bootSplash) {
    return;
  }

  bootSplash.classList.add("boot-hidden");
  window.setTimeout(() => bootSplash.remove(), 180);
};

const markStartupReady = (name: StartupReadyMark): void => {
  hideBootSplash();
  if (sentStartupMarks.has(name)) {
    return;
  }

  sentStartupMarks.add(name);
  getDesktopApi().startup.markRendererReady(name);
};

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
            session.user.role === "viewer" ? (
              <Navigate to="/" replace />
            ) : (
              <InventoryPage />
            )
          }
        />
        <Route path="orders" element={<OrdersPage />} />
        <Route path="events" element={<EventsPage />} />
        <Route path="profit" element={<ProfitPage />} />
        <Route
          path="settings"
          element={
            session.permissions.canManageSettings ? (
              <SettingsPage />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
};

const AppContent = (): JSX.Element => {
  const { loading, hasAdmin, session } = useAuth();

  useEffect(() => {
    if (loading) {
      return;
    }

    if (!hasAdmin) {
      markStartupReady("initial_setup_rendered");
      return;
    }

    if (!session) {
      markStartupReady("login_rendered");
      return;
    }

    markStartupReady("authenticated_shell_rendered");
  }, [hasAdmin, loading, session]);

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
