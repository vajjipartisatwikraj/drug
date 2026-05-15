import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAudit } from "../../hooks/useAudit";
import { FileUpload } from "../../components/FileUpload";
import { AuditPreview } from "../../components/AuditPreview";
import { PageNav } from "../../components/PageNav";
import { StatusBadge } from "../../components/StatusBadge";

interface AuthUser {
  id: string;
  username: string;
  role: string;
}

interface RecentDocument {
  id: string;
  filename: string;
  status: string;
  created_at?: string;
  analyzed_at?: string;
  size_mb?: number;
}

interface AuditPageProps {
  token: string;
  user: AuthUser;
  onLogout?: () => void;
}

function toLocalDateTime(value?: string): string {
  if (!value) return "-";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleString();
}

export const AuditPage: React.FC<AuditPageProps> = ({ token, user }) => {
  const navigate = useNavigate();
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

  const [authError, setAuthError] = useState<string | null>(null);
  const [newUserForm, setNewUserForm] = useState({ username: "", password: "" });
  const [adminMessage, setAdminMessage] = useState<string | null>(null);
  const [recentDocs, setRecentDocs] = useState<RecentDocument[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [recentError, setRecentError] = useState<string | null>(null);

  const totalDocuments = recentDocs.length;
  const totalPagesReviewed = recentDocs.length > 0 ? recentDocs.length * 6 : 0;

  // Load recent documents on mount
  useEffect(() => {
    if (token) {
      void loadRecentDocuments();
    }
  }, [token]);

  const loadRecentDocuments = async () => {
    setLoadingRecent(true);
    setRecentError(null);
    try {
      const response = await fetch("/api/auditor/recent-documents?limit=20", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || "Failed to load documents");
      setRecentDocs((payload.documents || []) as RecentDocument[]);
    } catch (err) {
      setRecentError(err instanceof Error ? err.message : "Failed to load documents");
    } finally {
      setLoadingRecent(false);
    }
  };

  const handleFileSelect = async (file: File) => {
    if (!token) {
      setAuthError("Please login first.");
      return;
    }
    await uploadAndAudit(file, token);
  };

  const handleCreateUser = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!token) return;

    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          username: newUserForm.username,
          password: newUserForm.password,
          role: "auditor",
        }),
      });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || "Failed to create user");

      setAdminMessage(`User "${newUserForm.username}" created successfully`);
      setNewUserForm({ username: "", password: "" });
      setTimeout(() => setAdminMessage(null), 3000);
    } catch (err) {
      setAdminMessage(
        err instanceof Error ? err.message : "Failed to create user"
      );
    }
  };

  const openRecentDocument = async (documentId: string) => {
    navigate(`/document/${documentId}`);
  };

  return (
    <div className="space-y-6">
      {status === "idle" ? (
        <div className="min-h-[calc(100vh-9rem)] flex flex-col">
          <div className="flex-1 space-y-8">
            <div className="space-y-2">
              <p className="text-sm text-subtle">Dashboard</p>
              <h2 className="text-3xl text-title">Hello {user.username} 👋</h2>
              <p className="text-base text-muted">
                Stay on top of your audit workload. Review issues, track reports, and keep every batch aligned with compliance.
              </p>
            </div>

            <div className="grid grid-cols-4 gap-5">
              <div className="card-shell p-4">
                <p className="text-xs text-subtle uppercase tracking-[0.2em]">Documents</p>
                <p className="text-2xl text-title mt-3">{totalDocuments}</p>
                <p className="text-xs text-muted mt-1">Total audited</p>
              </div>
              <div className="card-shell p-4">
                <p className="text-xs text-subtle uppercase tracking-[0.2em]">Issues</p>
                <p className="text-2xl text-title mt-3">0</p>
                <p className="text-xs text-muted mt-1">Raised by admin</p>
              </div>
              <div className="card-shell p-4">
                <p className="text-xs text-subtle uppercase tracking-[0.2em]">Reports</p>
                <p className="text-2xl text-title mt-3">0</p>
                <p className="text-xs text-muted mt-1">Generated</p>
              </div>
              <div className="card-shell p-4">
                <p className="text-xs text-subtle uppercase tracking-[0.2em]">Pages</p>
                <p className="text-2xl text-title mt-3">{totalPagesReviewed}</p>
                <p className="text-xs text-muted mt-1">Reviewed</p>
              </div>
            </div>

            <div className="space-y-5">
              <div className="space-y-2 text-center">
                <h3 className="text-xl text-heading">Upload Batch Manufacturing Record</h3>
                <p className="text-sm text-muted">
                  Upload your BMR PDF for comprehensive audit with mathematical validation.
                </p>
              </div>

              <div className="w-full max-w-3xl mx-auto">
                <FileUpload onFileSelect={handleFileSelect} disabled={status !== "idle"} />
                {authError && (
                  <p className="mt-4 text-sm text-[var(--color-danger)] text-center">{authError}</p>
                )}
              </div>
            </div>

            {user.role === "admin" && (
              <div className="card-shell p-5">
                <h3 className="text-base text-heading mb-3">Create Auditor User</h3>
                <form className="grid grid-cols-1 md:grid-cols-3 gap-3" onSubmit={handleCreateUser}>
                  <input
                    type="text"
                    placeholder="Username"
                    value={newUserForm.username}
                    onChange={(e) =>
                      setNewUserForm((prev) => ({ ...prev, username: e.target.value }))
                    }
                    className="input-field px-3 py-2"
                    required
                  />
                  <input
                    type="password"
                    placeholder="Password"
                    value={newUserForm.password}
                    onChange={(e) =>
                      setNewUserForm((prev) => ({ ...prev, password: e.target.value }))
                    }
                    className="input-field px-3 py-2"
                    required
                  />
                  <button
                    type="submit"
                    className="btn-primary px-3 py-2"
                  >
                    Create User
                  </button>
                </form>
                {adminMessage && (
                  <p className="mt-3 text-sm text-[var(--color-success)]">{adminMessage}</p>
                )}
              </div>
            )}
          </div>

          <div className="mt-10">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg text-heading">Recent Documents</h3>
            </div>
            {loadingRecent && <p className="text-sm text-muted">Loading recent documents...</p>}
            {recentError && <p className="text-sm text-[var(--color-danger)]">{recentError}</p>}
            {!loadingRecent && !recentError && (
              <>
                {recentDocs.length === 0 ? (
                  <p className="text-sm text-muted">No analyzed documents yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[var(--color-border)]">
                          <th className="text-left px-4 py-3 font-semibold text-body">Filename</th>
                          <th className="text-left px-4 py-3 font-semibold text-body">Status</th>
                          <th className="text-left px-4 py-3 font-semibold text-body">Uploaded</th>
                          <th className="text-left px-4 py-3 font-semibold text-body">Analyzed</th>
                          <th className="text-left px-4 py-3 font-semibold text-body">Size</th>
                          <th className="text-left px-4 py-3 font-semibold text-body">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--color-border)]">
                        {recentDocs.map((doc) => (
                          <tr
                            key={doc.id}
                            className="hover:bg-[var(--color-surface-strong)] transition-colors cursor-pointer"
                          >
                            <td className="px-4 py-3 text-body truncate max-w-xs">{doc.filename}</td>
                            <td className="px-4 py-3">
                              <StatusBadge status={doc.status} />
                            </td>
                            <td className="px-4 py-3 text-muted text-xs">
                              {toLocalDateTime(doc.created_at)}
                            </td>
                            <td className="px-4 py-3 text-muted text-xs">
                              {toLocalDateTime(doc.analyzed_at)}
                            </td>
                            <td className="px-4 py-3 text-muted text-xs">
                              {doc.size_mb ? `${doc.size_mb.toFixed(2)} MB` : "-"}
                            </td>
                            <td className="px-4 py-3">
                              <button
                                onClick={() => void openRecentDocument(doc.id)}
                                className="text-[var(--color-success)] hover:text-[var(--color-text)] font-medium transition-colors text-xs"
                              >
                                View
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-6">
          <aside className="col-span-3 space-y-4 lg:sticky lg:top-24 lg:self-start">
            <PageNav markdown={markdown} status={status} />
            <div className="card-shell p-4">
              <h3 className="text-sm text-heading mb-3">Pipeline Validation</h3>
              <div className="space-y-2">
                {pipelineChecks.map((step) => (
                  <div key={step.key} className="flex items-start gap-2">
                    <span
                      className={`mt-1 inline-block w-2.5 h-2.5 rounded-full ${
                        step.status === "done"
                          ? "bg-[var(--color-success)]"
                          : step.status === "in_progress"
                            ? "bg-[var(--color-warning)]"
                            : step.status === "error"
                              ? "bg-[var(--color-danger)]"
                              : "bg-[var(--color-border-strong)]"
                      }`}
                    />
                    <div className="min-w-0">
                      <p className="text-xs text-body">{step.label}</p>
                      {step.message && (
                        <p
                          className="text-[11px] text-muted truncate"
                          title={step.message}
                        >
                          {step.message}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {error && (
              <div className="rounded-xl p-4" style={{ border: "1px solid rgba(224, 96, 90, 0.35)", backgroundColor: "rgba(224, 96, 90, 0.08)" }}>
                <h3 className="text-sm font-medium text-[var(--color-danger)] mb-2">Error</h3>
                <p className="text-sm text-[var(--color-danger)]">{error}</p>
              </div>
            )}
          </aside>
          <div className="col-span-9">
            <div className="min-h-[80vh] overflow-y-auto card-shell p-6 scroll-smooth">
              <AuditPreview
                markdown={markdown}
                isStreaming={status === "processing" || status === "uploading"}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuditPage;
