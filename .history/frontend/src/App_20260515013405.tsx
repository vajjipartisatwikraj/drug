import { useEffect, useState, type FormEvent } from "react";
import { Routes, Route, useNavigate, Navigate } from "react-router-dom";
import { Layout } from "./components/layout";
import LandingPage from "./components/LandingPage";
import { AuditPage } from "./pages/user/AuditPage";
import { DocumentsPage } from "./pages/user/DocumentsPage";
import { DocumentDetailPage } from "./pages/user/DocumentDetailPage";
import { ReportsPage } from "./pages/user/ReportsPage";
import { ReportDetailPage } from "./pages/user/ReportDetailPage";
import { SettingsPage } from "./pages/user/SettingsPage";
import { ProfilePage } from "./pages/user/ProfilePage";
import { AdminUsersPage } from "./pages/admin/AdminUsersPage";
import { AdminUserDetailPage } from "./pages/admin/AdminUserDetailPage";
import { AdminDocsPage } from "./pages/admin/AdminDocsPage";

type Role = "admin" | "auditor";
type AppPage = "audit" | "admin-users" | "admin-docs";

interface AuthUser {
  id: string;
  username: string;
  role: Role;
  employee_details?: Record<string, unknown>;
}

interface RecentDocument {
  id: string;
  filename: string;
  status: string;
  created_at?: string;
  analyzed_at?: string;
  size_mb?: number;
}

interface AdminUserRow {
  id: string;
  username: string;
  role: Role;
  password_hash: string;
  employee_details: Record<string, unknown>;
  audited_document_ids: string[];
  created_at?: string;
}

interface AdminDocumentRow {
  id: string;
  filename: string;
  status: string;
  created_at?: string;
  analyzed_at?: string;
  auditor_username?: string;
  page_count: number;
}

function toLocalDateTime(value?: string): string {
  if (!value) return "-";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleString();
}

interface LoginPageProps {
  loginForm: { username: string; password: string };
  setLoginForm: (form: { username: string; password: string }) => void;
  authError: string | null;
  isAuthLoading: boolean;
  onSubmit: (e: FormEvent<HTMLFormElement>) => Promise<void>;
}

const LoginPageComponent: React.FC<LoginPageProps> = ({
  loginForm,
  setLoginForm,
  authError,
  isAuthLoading,
  onSubmit,
}) => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center px-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-800/70 p-6 shadow-xl">
        <h1 className="text-xl font-semibold text-white mb-1">BMR Audit Login</h1>
        <p className="text-sm text-slate-400 mb-6">Login with admin or auditor credentials.</p>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="block text-sm text-slate-300 mb-1">Username</label>
            <input
              type="text"
              value={loginForm.username}
              onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
              className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-blue-400"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">Password</label>
            <input
              type="password"
              value={loginForm.password}
              onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
              className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-blue-400"
              required
            />
          </div>
          {authError && <p className="text-sm text-red-400">{authError}</p>}
          <button
            type="submit"
            disabled={isAuthLoading}
            className="w-full rounded-lg bg-blue-600 px-3 py-2 font-medium text-white hover:bg-blue-500 disabled:opacity-60"
          >
            {isAuthLoading ? "Logging in..." : "Login"}
          </button>
        </form>
        <p className="mt-5 text-xs text-slate-500">
          Default admin: <span className="text-slate-300">admin</span> /{" "}
          <span className="text-slate-300">admin123</span>
        </p>
        <button
          onClick={() => navigate("/")}
          className="w-full mt-4 px-3 py-2 text-sm text-blue-400 hover:text-blue-300"
        >
          ← Back to Home
        </button>
      </div>
    </div>
  );
};

function App() {
  const navigate = useNavigate();

  const [token, setToken] = useState<string | null>(() => localStorage.getItem("authToken"));
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });

  useEffect(() => {
    if (!token) {
      setUser(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error("Session expired. Please login again.");
        const me = (await response.json()) as AuthUser;
        if (cancelled) return;
        setUser(me);
        setAuthError(null);
      } catch (e) {
        if (cancelled) return;
        localStorage.removeItem("authToken");
        setToken(null);
        setUser(null);
        setAuthError(e instanceof Error ? e.message : "Authentication failed.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setIsAuthLoading(true);
    setAuthError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loginForm),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || "Login failed");
      localStorage.setItem("authToken", payload.access_token);
      setToken(payload.access_token);
      setUser(payload.user as AuthUser);
      setLoginForm({ username: "", password: "" });
      navigate("/audit");
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("authToken");
    setToken(null);
    setUser(null);
    navigate("/");
  };

  // Routes configuration
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={!token ? <LandingPage onLoginClick={() => navigate("/login")} /> : <Navigate to="/audit" replace />} />
      <Route path="/login" element={!token ? <LoginPageComponent loginForm={loginForm} setLoginForm={setLoginForm} authError={authError} isAuthLoading={isAuthLoading} onSubmit={handleLogin} /> : <Navigate to="/audit" replace />} />

      {/* Protected Routes with Layout */}
      <Route
        path="/audit"
        element={
          token && user ? (
            <Layout user={user} onLogout={handleLogout}>
              <AuditPage token={token} user={user} />
            </Layout>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/documents"
        element={
          token && user ? (
            <Layout user={user} onLogout={handleLogout}>
              <DocumentsPage />
            </Layout>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/document/:id"
        element={
          token && user ? (
            <Layout user={user} onLogout={handleLogout}>
              <DocumentDetailPage token={token} />
            </Layout>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/reports"
        element={
          token && user ? (
            <Layout user={user} onLogout={handleLogout}>
              <ReportsPage />
            </Layout>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/report/:id"
        element={
          token && user ? (
            <Layout user={user} onLogout={handleLogout}>
              <ReportDetailPage token={token} />
            </Layout>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/settings"
        element={
          token && user ? (
            <Layout user={user} onLogout={handleLogout}>
              <SettingsPage />
            </Layout>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/profile"
        element={
          token && user ? (
            <Layout user={user} onLogout={handleLogout}>
              <ProfilePage />
            </Layout>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/admin-users"
        element={
          token && user && user.role === "admin" ? (
            <Layout user={user} onLogout={handleLogout}>
              <AdminUsersPage token={token} />
            </Layout>
          ) : (
            <Navigate to="/audit" replace />
          )
        }
      />
      <Route
        path="/admin/user/:id"
        element={
          token && user && user.role === "admin" ? (
            <Layout user={user} onLogout={handleLogout}>
              <AdminUserDetailPage token={token} />
            </Layout>
          ) : (
            <Navigate to="/audit" replace />
          )
        }
      />
      <Route
        path="/admin-docs"
        element={
          token && user && user.role === "admin" ? (
            <Layout user={user} onLogout={handleLogout}>
              <AdminDocsPage token={token} />
            </Layout>
          ) : (
            <Navigate to="/audit" replace />
          )
        }
      />
    </Routes>
  );
}

export default App;
