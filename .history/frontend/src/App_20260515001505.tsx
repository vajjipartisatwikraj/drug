import { useEffect, useState, type FormEvent } from "react";
import { AuditPreview } from "./components/AuditPreview";
import { FileUpload } from "./components/FileUpload";
import { PageNav } from "./components/PageNav";
import { StatusBadge } from "./components/StatusBadge";
import { useAudit } from "./hooks/useAudit";
import LandingPage from "./components/LandingPage";

type Role = "admin" | "auditor";
type AppPage = "audit" | "admin-users" | "admin-docs";
type ViewType = "landing" | "login" | "app";

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

function App() {
  const {
    markdown,
    status,
    error,
    elapsedTime,
    pipelineChecks,
    uploadAndAudit,
    loadExistingAudit,
    reset,
  } = useAudit();

  const [token, setToken] = useState<string | null>(() => localStorage.getItem("authToken"));
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [newUserForm, setNewUserForm] = useState({ username: "", password: "" });
  const [adminMessage, setAdminMessage] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<ViewType>("landing");

  const [currentPage, setCurrentPage] = useState<AppPage>("audit");
  const [recentDocs, setRecentDocs] = useState<RecentDocument[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [recentError, setRecentError] = useState<string | null>(null);

  const [adminUsers, setAdminUsers] = useState<AdminUserRow[]>([]);
  const [adminUserTotals, setAdminUserTotals] = useState<{ admins: number; auditors: number; users: number } | null>(null);
  const [loadingAdminUsers, setLoadingAdminUsers] = useState(false);
  const [adminUsersError, setAdminUsersError] = useState<string | null>(null);

  const [adminDocs, setAdminDocs] = useState<AdminDocumentRow[]>([]);
  const [adminDocsTotal, setAdminDocsTotal] = useState(0);
  const [loadingAdminDocs, setLoadingAdminDocs] = useState(false);
  const [adminDocsError, setAdminDocsError] = useState<string | null>(null);
  const [docFilter, setDocFilter] = useState({ year: "", month: "", day: "", limit: "50" });

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
        if (me.role !== "admin") setCurrentPage("audit");
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

  useEffect(() => {
    if (!token || !user) return;
    setLoadingRecent(true);
    setRecentError(null);
    void (async () => {
      try {
        const response = await fetch("/api/auditor/recent-documents?limit=20", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.detail || "Failed to fetch recent documents");
        setRecentDocs((payload.documents || []) as RecentDocument[]);
      } catch (err) {
        setRecentError(err instanceof Error ? err.message : "Failed to fetch recent documents");
      } finally {
        setLoadingRecent(false);
      }
    })();
  }, [token, user, status]);

  const fetchAdminUsers = async () => {
    if (!token || user?.role !== "admin") return;
    setLoadingAdminUsers(true);
    setAdminUsersError(null);
    try {
      const response = await fetch("/api/admin/users/details", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || "Failed to fetch user details");
      setAdminUsers((payload.users || []) as AdminUserRow[]);
      setAdminUserTotals(payload.totals || null);
    } catch (err) {
      setAdminUsersError(err instanceof Error ? err.message : "Failed to fetch user details");
    } finally {
      setLoadingAdminUsers(false);
    }
  };

  const fetchAdminDocs = async () => {
    if (!token || user?.role !== "admin") return;
    setLoadingAdminDocs(true);
    setAdminDocsError(null);
    try {
      const qs = new URLSearchParams();
      if (docFilter.year.trim()) qs.set("year", docFilter.year.trim());
      if (docFilter.month.trim()) qs.set("month", docFilter.month.trim());
      if (docFilter.day.trim()) qs.set("day", docFilter.day.trim());
      if (docFilter.limit.trim()) qs.set("limit", docFilter.limit.trim());
      const response = await fetch(`/api/admin/documents/details?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || "Failed to fetch document details");
      setAdminDocs((payload.recent_documents || []) as AdminDocumentRow[]);
      setAdminDocsTotal(payload.total_documents || 0);
    } catch (err) {
      setAdminDocsError(err instanceof Error ? err.message : "Failed to fetch document details");
    } finally {
      setLoadingAdminDocs(false);
    }
  };

  useEffect(() => {
    if (!token || user?.role !== "admin") return;
    if (currentPage === "admin-users") void fetchAdminUsers();
    if (currentPage === "admin-docs") void fetchAdminDocs();
  }, [currentPage, token, user?.role]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setIsAuthLoading(true);
    setAuthError(null);
    setAdminMessage(null);
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
      setCurrentPage("audit");
      setCurrentView("app");
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
    setAdminMessage(null);
    setRecentDocs([]);
    setAdminUsers([]);
    setAdminDocs([]);
    setCurrentPage("audit");
    setCurrentView("landing");
    reset();
  };

  const handleCreateUser = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setAdminMessage(null);
    setAuthError(null);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(newUserForm),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || "User creation failed");
      setAdminMessage(`Auditor '${payload.username}' created successfully.`);
      setNewUserForm({ username: "", password: "" });
      void fetchAdminUsers();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "User creation failed");
    }
  };

  const handleFileSelect = async (file: File) => {
    if (!token) {
      setAuthError("Please login first.");
      return;
    }
    await uploadAndAudit(file, token);
  };

  const openRecentDocument = async (documentId: string) => {
    if (!token) return;
    setRecentError(null);
    try {
      const response = await fetch(`/api/documents/${documentId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || "Failed to load document");
      const documentMarkdown = (payload.document?.result || "") as string;
      if (!documentMarkdown) throw new Error("This document has no saved analysis output.");
      loadExistingAudit(documentMarkdown);
      setCurrentPage("audit");
    } catch (err) {
      setRecentError(err instanceof Error ? err.message : "Failed to load document");
    }
  };

  if (!token || !user) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center px-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-800/70 p-6 shadow-xl">
          <h1 className="text-xl font-semibold text-white mb-1">BMR Audit Login</h1>
          <p className="text-sm text-slate-400 mb-6">Login with admin or auditor credentials.</p>
          <form className="space-y-4" onSubmit={handleLogin}>
            <div>
              <label className="block text-sm text-slate-300 mb-1">Username</label>
              <input
                type="text"
                value={loginForm.username}
                onChange={(e) => setLoginForm((prev) => ({ ...prev, username: e.target.value }))}
                className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-blue-400"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1">Password</label>
              <input
                type="password"
                value={loginForm.password}
                onChange={(e) => setLoginForm((prev) => ({ ...prev, password: e.target.value }))}
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
        </div>
      </div>
    );
  }

  const renderAdminUsersPage = () => (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
        <h2 className="text-lg font-semibold text-white mb-3">User Details</h2>
        {adminUserTotals && (
          <p className="text-sm text-slate-300 mb-3">
            Total Users: {adminUserTotals.users} · Admins: {adminUserTotals.admins} · Auditors: {adminUserTotals.auditors}
          </p>
        )}
        {loadingAdminUsers && <p className="text-slate-300 text-sm">Loading user details...</p>}
        {adminUsersError && <p className="text-red-400 text-sm">{adminUsersError}</p>}
        {!loadingAdminUsers && !adminUsersError && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-300 border-b border-slate-700">
                  <th className="py-2">Username</th>
                  <th className="py-2">Role</th>
                  <th className="py-2">Password Hash</th>
                  <th className="py-2">Documents</th>
                  <th className="py-2">Created</th>
                </tr>
              </thead>
              <tbody>
                {adminUsers.map((u) => (
                  <tr key={u.id} className="border-b border-slate-800 text-slate-200">
                    <td className="py-2">{u.username}</td>
                    <td className="py-2 uppercase">{u.role}</td>
                    <td className="py-2 font-mono text-xs break-all">{u.password_hash}</td>
                    <td className="py-2">{u.audited_document_ids.length}</td>
                    <td className="py-2">{toLocalDateTime(u.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );

  const renderAdminDocsPage = () => (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
        <h2 className="text-lg font-semibold text-white mb-3">Documents Details</h2>
        <form
          className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4"
          onSubmit={(e) => {
            e.preventDefault();
            void fetchAdminDocs();
          }}
        >
          <input
            type="number"
            placeholder="Year (e.g. 2026)"
            value={docFilter.year}
            onChange={(e) => setDocFilter((p) => ({ ...p, year: e.target.value }))}
            className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100"
          />
          <input
            type="number"
            placeholder="Month (1-12)"
            value={docFilter.month}
            onChange={(e) => setDocFilter((p) => ({ ...p, month: e.target.value }))}
            className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100"
          />
          <input
            type="number"
            placeholder="Day (1-31)"
            value={docFilter.day}
            onChange={(e) => setDocFilter((p) => ({ ...p, day: e.target.value }))}
            className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100"
          />
          <input
            type="number"
            placeholder="Limit"
            value={docFilter.limit}
            onChange={(e) => setDocFilter((p) => ({ ...p, limit: e.target.value }))}
            className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100"
          />
          <button type="submit" className="rounded-lg bg-blue-600 px-3 py-2 font-medium text-white hover:bg-blue-500">
            Apply Filters
          </button>
        </form>
        <p className="text-sm text-slate-300 mb-3">Total analyzed documents: {adminDocsTotal}</p>
        {loadingAdminDocs && <p className="text-slate-300 text-sm">Loading document details...</p>}
        {adminDocsError && <p className="text-red-400 text-sm">{adminDocsError}</p>}
        {!loadingAdminDocs && !adminDocsError && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-300 border-b border-slate-700">
                  <th className="py-2">Filename</th>
                  <th className="py-2">Auditor</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Pages</th>
                  <th className="py-2">Analyzed At</th>
                </tr>
              </thead>
              <tbody>
                {adminDocs.map((d) => (
                  <tr key={d.id} className="border-b border-slate-800 text-slate-200">
                    <td className="py-2">{d.filename}</td>
                    <td className="py-2">{d.auditor_username || "-"}</td>
                    <td className="py-2 uppercase">{d.status}</td>
                    <td className="py-2">{d.page_count}</td>
                    <td className="py-2">{toLocalDateTime(d.analyzed_at || d.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-900">
      <header className="bg-slate-800/80 border-b border-slate-700 sticky top-0 z-50 backdrop-blur-sm">
        <div className="max-w-screen-2xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-emerald-500 flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                  />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-semibold text-white">BMR Audit System</h1>
                <p className="text-sm text-slate-400">
                  {user.role.toUpperCase()} · {user.username}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <StatusBadge status={status} />
              {status !== "idle" && elapsedTime && (
                <span className="text-sm text-slate-300 font-mono">Elapsed: {elapsedTime}</span>
              )}
              <button
                onClick={() => setCurrentPage("audit")}
                className={`px-3 py-2 text-sm rounded-lg ${currentPage === "audit" ? "bg-blue-600 text-white" : "bg-slate-700 text-slate-200"}`}
              >
                Audit
              </button>
              {user.role === "admin" && (
                <>
                  <button
                    onClick={() => setCurrentPage("admin-users")}
                    className={`px-3 py-2 text-sm rounded-lg ${currentPage === "admin-users" ? "bg-blue-600 text-white" : "bg-slate-700 text-slate-200"}`}
                  >
                    User Details
                  </button>
                  <button
                    onClick={() => setCurrentPage("admin-docs")}
                    className={`px-3 py-2 text-sm rounded-lg ${currentPage === "admin-docs" ? "bg-blue-600 text-white" : "bg-slate-700 text-slate-200"}`}
                  >
                    Documents Details
                  </button>
                </>
              )}
              <button
                onClick={handleLogout}
                className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-screen-2xl mx-auto px-6 py-8">
        {currentPage === "admin-users" && user.role === "admin" && renderAdminUsersPage()}
        {currentPage === "admin-docs" && user.role === "admin" && renderAdminDocsPage()}

        {currentPage === "audit" && (
          <>
            {status === "idle" ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                  <div className="text-center mb-8">
                    <h2 className="text-2xl font-semibold text-white mb-2">Upload Batch Manufacturing Record</h2>
                    <p className="text-slate-400">Upload your BMR PDF for comprehensive audit with mathematical validation</p>
                  </div>

                  <FileUpload onFileSelect={handleFileSelect} disabled={status !== "idle"} />
                  {authError && <p className="mt-4 text-sm text-red-400 text-center">{authError}</p>}

                  {user.role === "admin" && (
                    <div className="mt-8 rounded-xl border border-slate-700 bg-slate-800/50 p-5">
                      <h3 className="text-base font-semibold text-white mb-3">Create Auditor User</h3>
                      <form className="grid grid-cols-1 md:grid-cols-3 gap-3" onSubmit={handleCreateUser}>
                        <input
                          type="text"
                          placeholder="Username"
                          value={newUserForm.username}
                          onChange={(e) => setNewUserForm((prev) => ({ ...prev, username: e.target.value }))}
                          className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-blue-400"
                          required
                        />
                        <input
                          type="password"
                          placeholder="Password"
                          value={newUserForm.password}
                          onChange={(e) => setNewUserForm((prev) => ({ ...prev, password: e.target.value }))}
                          className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-blue-400"
                          required
                        />
                        <button type="submit" className="rounded-lg bg-emerald-600 px-3 py-2 font-medium text-white hover:bg-emerald-500">
                          Create User
                        </button>
                      </form>
                      {adminMessage && <p className="mt-3 text-sm text-emerald-400">{adminMessage}</p>}
                    </div>
                  )}
                </div>

                <aside className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
                  <h3 className="text-base font-semibold text-white mb-3">Recent Documents</h3>
                  {loadingRecent && <p className="text-sm text-slate-300">Loading recent documents...</p>}
                  {recentError && <p className="text-sm text-red-400">{recentError}</p>}
                  {!loadingRecent && !recentError && (
                    <div className="space-y-2 max-h-[480px] overflow-y-auto">
                      {recentDocs.length === 0 && <p className="text-sm text-slate-400">No analyzed documents yet.</p>}
                      {recentDocs.map((doc) => (
                        <button
                          key={doc.id}
                          onClick={() => void openRecentDocument(doc.id)}
                          className="w-full text-left rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 hover:border-blue-500"
                        >
                          <p className="text-sm text-slate-100 truncate">{doc.filename}</p>
                          <p className="text-xs text-slate-400">{toLocalDateTime(doc.analyzed_at || doc.created_at)}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </aside>
              </div>
            ) : (
              <div className="grid grid-cols-12 gap-6">
                <aside className="col-span-3 space-y-4 lg:sticky lg:top-24 lg:self-start">
                  <PageNav markdown={markdown} status={status} />
                  <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                    <h3 className="text-sm font-medium text-slate-300 mb-3">Pipeline Validation</h3>
                    <div className="space-y-2">
                      {pipelineChecks.map((step) => (
                        <div key={step.key} className="flex items-start gap-2">
                          <span
                            className={`mt-1 inline-block w-2.5 h-2.5 rounded-full ${
                              step.status === "done"
                                ? "bg-emerald-400"
                                : step.status === "in_progress"
                                  ? "bg-amber-400"
                                  : step.status === "error"
                                    ? "bg-red-400"
                                    : "bg-slate-600"
                            }`}
                          />
                          <div className="min-w-0">
                            <p className="text-xs text-slate-200">{step.label}</p>
                            {step.message && (
                              <p className="text-[11px] text-slate-400 truncate" title={step.message}>
                                {step.message}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {error && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                      <h3 className="text-sm font-medium text-red-400 mb-2">Error</h3>
                      <p className="text-sm text-red-300">{error}</p>
                    </div>
                  )}
                </aside>
                <div className="col-span-9">
                  <div className="min-h-[80vh] overflow-y-auto rounded-xl border border-slate-700 bg-slate-800/30 p-6 scroll-smooth">
                    <AuditPreview markdown={markdown} isStreaming={status === "processing" || status === "uploading"} />
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
