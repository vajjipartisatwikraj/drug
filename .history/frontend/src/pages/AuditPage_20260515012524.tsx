import React, { useState, useEffect } from "react";
import { useAudit } from "../hooks/useAudit";
import { FileUpload } from "../components/FileUpload";
import { AuditPreview } from "../components/AuditPreview";
import { PageNav } from "../components/PageNav";
import { StatusBadge } from "../components/StatusBadge";

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
      const response = await fetch("/api/users", {
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
    } catch (err) {
      setRecentError(err instanceof Error ? err.message : "Failed to load document");
    }
  };

  return (
    <div className="space-y-6">
      {status === "idle" ? (
        <div className="space-y-6">
          {/* Upload Section - Full Width */}
          <div className="w-full">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-semibold text-white mb-2">
                Upload Batch Manufacturing Record
              </h2>
              <p className="text-slate-400">
                Upload your BMR PDF for comprehensive audit with mathematical validation
              </p>
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
                    onChange={(e) =>
                      setNewUserForm((prev) => ({ ...prev, username: e.target.value }))
                    }
                    className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-blue-400"
                    required
                  />
                  <input
                    type="password"
                    placeholder="Password"
                    value={newUserForm.password}
                    onChange={(e) =>
                      setNewUserForm((prev) => ({ ...prev, password: e.target.value }))
                    }
                    className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-blue-400"
                    required
                  />
                  <button
                    type="submit"
                    className="rounded-lg bg-emerald-600 px-3 py-2 font-medium text-white hover:bg-emerald-500"
                  >
                    Create User
                  </button>
                </form>
                {adminMessage && (
                  <p className="mt-3 text-sm text-emerald-400">{adminMessage}</p>
                )}
              </div>
            )}
          </div>

          {/* Recent Documents Section - Full Width Below */}
          <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Recent Documents</h3>
            {loadingRecent && <p className="text-sm text-slate-300">Loading recent documents...</p>}
            {recentError && <p className="text-sm text-red-400">{recentError}</p>}
            {!loadingRecent && !recentError && (
              <>
                {recentDocs.length === 0 ? (
                  <p className="text-sm text-slate-400">No analyzed documents yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-700 bg-slate-900/30">
                          <th className="text-left px-4 py-3 font-semibold text-slate-300">Filename</th>
                          <th className="text-left px-4 py-3 font-semibold text-slate-300">Status</th>
                          <th className="text-left px-4 py-3 font-semibold text-slate-300">Uploaded</th>
                          <th className="text-left px-4 py-3 font-semibold text-slate-300">Analyzed</th>
                          <th className="text-left px-4 py-3 font-semibold text-slate-300">Size</th>
                          <th className="text-left px-4 py-3 font-semibold text-slate-300">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-700">
                        {recentDocs.map((doc) => (
                          <tr
                            key={doc.id}
                            className="hover:bg-slate-900/40 transition-colors cursor-pointer"
                          >
                            <td className="px-4 py-3 text-slate-100 truncate max-w-xs">{doc.filename}</td>
                            <td className="px-4 py-3">
                              <StatusBadge status={doc.status} />
                            </td>
                            <td className="px-4 py-3 text-slate-400 text-xs">
                              {toLocalDateTime(doc.created_at)}
                            </td>
                            <td className="px-4 py-3 text-slate-400 text-xs">
                              {toLocalDateTime(doc.analyzed_at)}
                            </td>
                            <td className="px-4 py-3 text-slate-400 text-xs">
                              {doc.size_mb ? `${doc.size_mb.toFixed(2)} MB` : "-"}
                            </td>
                            <td className="px-4 py-3">
                              <button
                                onClick={() => void openRecentDocument(doc.id)}
                                className="text-blue-400 hover:text-blue-300 font-medium transition-colors text-xs"
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
                        <p
                          className="text-[11px] text-slate-400 truncate"
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
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                <h3 className="text-sm font-medium text-red-400 mb-2">Error</h3>
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}
          </aside>
          <div className="col-span-9">
            <div className="min-h-[80vh] overflow-y-auto rounded-xl border border-slate-700 bg-slate-800/30 p-6 scroll-smooth">
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
