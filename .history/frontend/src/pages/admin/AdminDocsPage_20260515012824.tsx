import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

interface AdminDocumentRow {
  id: string;
  filename: string;
  status: string;
  created_at?: string;
  analyzed_at?: string;
  auditor_username?: string;
  page_count: number;
}

interface AdminDocsPageProps {
  token: string;
}

function toLocalDateTime(value?: string): string {
  if (!value) return "-";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleString();
}

export const AdminDocsPage: React.FC<AdminDocsPageProps> = ({ token }) => {
  const [adminDocs, setAdminDocs] = useState<AdminDocumentRow[]>([]);
  const [adminDocsTotal, setAdminDocsTotal] = useState(0);
  const [loadingAdminDocs, setLoadingAdminDocs] = useState(false);
  const [adminDocsError, setAdminDocsError] = useState<string | null>(null);
  const [docFilter, setDocFilter] = useState({
    year: "",
    month: "",
    day: "",
    limit: "50",
  });

  useEffect(() => {
    void fetchAdminDocs();
  }, []);

  const fetchAdminDocs = async () => {
    if (!token) return;
    setLoadingAdminDocs(true);
    setAdminDocsError(null);
    try {
      const qs = new URLSearchParams();
      if (docFilter.year.trim()) qs.set("year", docFilter.year.trim());
      if (docFilter.month.trim()) qs.set("month", docFilter.month.trim());
      if (docFilter.day.trim()) qs.set("day", docFilter.day.trim());
      if (docFilter.limit.trim()) qs.set("limit", docFilter.limit.trim());
      const response = await fetch(
        `/api/admin/documents/details?${qs.toString()}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.detail || "Failed to fetch document details");
      setAdminDocs((payload.recent_documents || []) as AdminDocumentRow[]);
      setAdminDocsTotal(payload.total_documents || 0);
    } catch (err) {
      setAdminDocsError(
        err instanceof Error ? err.message : "Failed to fetch document details"
      );
    } finally {
      setLoadingAdminDocs(false);
    }
  };

  const handleFilterSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void fetchAdminDocs();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Documents Details</h1>
        <p className="text-slate-400">View all analyzed documents across the system</p>
      </div>

      {/* Filter Form */}
      <form className="rounded-lg border border-slate-700 bg-slate-800/50 p-4" onSubmit={handleFilterSubmit}>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
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
          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-3 py-2 font-medium text-white hover:bg-blue-500"
          >
            Apply Filters
          </button>
        </div>
      </form>

      {/* Stats */}
      <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
        <p className="text-sm text-slate-300">
          <span className="font-semibold">Total analyzed documents:</span>{" "}
          <span className="text-white font-bold text-lg">{adminDocsTotal}</span>
        </p>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-slate-700 bg-slate-800/50 overflow-hidden">
        {loadingAdminDocs && (
          <p className="text-slate-300 text-sm p-4">Loading document details...</p>
        )}
        {adminDocsError && (
          <p className="text-red-400 text-sm p-4">{adminDocsError}</p>
        )}
        {!loadingAdminDocs && !adminDocsError && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 bg-slate-800/80">
                  <th className="px-6 py-3 text-left font-semibold text-slate-300">
                    Filename
                  </th>
                  <th className="px-6 py-3 text-left font-semibold text-slate-300">
                    Auditor
                  </th>
                  <th className="px-6 py-3 text-left font-semibold text-slate-300">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left font-semibold text-slate-300">
                    Pages
                  </th>
                  <th className="px-6 py-3 text-left font-semibold text-slate-300">
                    Analyzed At
                  </th>
                </tr>
              </thead>
              <tbody>
                {adminDocs.map((d) => (
                  <tr
                    key={d.id}
                    className="border-b border-slate-700/50 hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="px-6 py-4 text-slate-200 font-medium">{d.filename}</td>
                    <td className="px-6 py-4 text-slate-400">{d.auditor_username || "-"}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          d.status === "completed"
                            ? "bg-emerald-600/20 text-emerald-400"
                            : d.status === "processing"
                              ? "bg-amber-600/20 text-amber-400"
                              : "bg-slate-600/20 text-slate-400"
                        }`}
                      >
                        {d.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-200">{d.page_count}</td>
                    <td className="px-6 py-4 text-slate-400">
                      {toLocalDateTime(d.analyzed_at || d.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {adminDocs.length === 0 && !loadingAdminDocs && (
              <div className="p-8 text-center">
                <p className="text-slate-400">No documents found matching the filters</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDocsPage;
