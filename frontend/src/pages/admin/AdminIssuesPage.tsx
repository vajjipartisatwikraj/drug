import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

interface AdminIssueRow {
  id: string;
  document_id: string;
  document_filename: string;
  auditor_username?: string;
  page_number: number;
  reason: string;
  severity: string;
  status: string;
  created_at?: string;
  resolved_at?: string | null;
  resolution_notes?: string | null;
}

interface AdminIssuesPageProps {
  token: string;
}

const formatDateTime = (value?: string | null): string => {
  if (!value) return "-";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return String(value);
  return dt.toLocaleString();
};

const severityClass = (severity: string): string => {
  switch (severity.toLowerCase()) {
    case "critical":
      return "badge-danger";
    case "high":
      return "badge-warning";
    case "low":
      return "badge-neutral";
    default:
      return "badge-neutral";
  }
};

const statusClass = (status: string): string => {
  switch (status.toLowerCase()) {
    case "resolved":
      return "badge-success";
    case "rejected":
      return "badge-danger";
    default:
      return "badge-warning";
  }
};

export const AdminIssuesPage: React.FC<AdminIssuesPageProps> = ({ token }) => {
  const navigate = useNavigate();
  const [issues, setIssues] = useState<AdminIssueRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    const loadIssues = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/admin/issues?limit=200", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.detail || "Failed to load issues");
        if (!cancelled) setIssues(payload.issues || []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load issues");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadIssues();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const totals = useMemo(() => {
    const pending = issues.filter((issue) => issue.status === "pending").length;
    const resolved = issues.filter((issue) => issue.status === "resolved").length;
    const rejected = issues.filter((issue) => issue.status === "rejected").length;
    return { total: issues.length, pending, resolved, rejected };
  }, [issues]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl text-title mb-2">Issues</h1>
        <p className="text-muted">Review all issues raised across audited documents</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card-shell p-4">
          <p className="text-sm text-muted">Total Issues</p>
          <p className="text-3xl text-title mt-2">{totals.total}</p>
        </div>
        <div className="card-shell p-4">
          <p className="text-sm text-muted">Pending</p>
          <p className="text-3xl text-heading mt-2" style={{ color: "var(--color-warning)" }}>
            {totals.pending}
          </p>
        </div>
        <div className="card-shell p-4">
          <p className="text-sm text-muted">Resolved</p>
          <p className="text-3xl text-heading mt-2" style={{ color: "var(--color-success)" }}>
            {totals.resolved}
          </p>
        </div>
        <div className="card-shell p-4">
          <p className="text-sm text-muted">Rejected</p>
          <p className="text-3xl text-heading mt-2" style={{ color: "var(--color-danger)" }}>
            {totals.rejected}
          </p>
        </div>
      </div>

      <div className="card-shell overflow-hidden">
        {loading && <p className="text-muted text-sm p-4">Loading issues...</p>}
        {error && <p className="text-[var(--color-danger)] text-sm p-4">{error}</p>}
        {!loading && !error && issues.length === 0 && (
          <p className="text-muted text-sm p-4">No issues have been raised yet.</p>
        )}
        {!loading && !error && issues.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-strong)]">
                  <th className="px-6 py-3 text-left font-semibold text-body">Document</th>
                  <th className="px-6 py-3 text-left font-semibold text-body">Auditor</th>
                  <th className="px-6 py-3 text-left font-semibold text-body">Page</th>
                  <th className="px-6 py-3 text-left font-semibold text-body">Severity</th>
                  <th className="px-6 py-3 text-left font-semibold text-body">Status</th>
                  <th className="px-6 py-3 text-left font-semibold text-body">Raised</th>
                  <th className="px-6 py-3 text-left font-semibold text-body">Resolved</th>
                  <th className="px-6 py-3 text-left font-semibold text-body">Action</th>
                </tr>
              </thead>
              <tbody>
                {issues.map((issue) => (
                  <tr
                    key={issue.id}
                    className="border-b border-[var(--color-border)] hover:bg-[var(--color-surface-strong)] transition-colors"
                  >
                    <td className="px-6 py-4 text-body font-medium">
                      {issue.document_filename || "-"}
                    </td>
                    <td className="px-6 py-4 text-muted">
                      {issue.auditor_username || "-"}
                    </td>
                    <td className="px-6 py-4 text-muted">{issue.page_number}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${severityClass(issue.severity)}`}>
                        {issue.severity.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusClass(issue.status)}`}>
                        {issue.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-muted">
                      {formatDateTime(issue.created_at)}
                    </td>
                    <td className="px-6 py-4 text-muted">
                      {formatDateTime(issue.resolved_at)}
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => navigate(`/document/${issue.document_id}`)}
                        className="text-[var(--color-success)] hover:text-[var(--color-text)] font-medium text-sm"
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
      </div>
    </div>
  );
};

export default AdminIssuesPage;
