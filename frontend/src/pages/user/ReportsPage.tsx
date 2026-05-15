import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

interface ReportRow {
  id: string;
  document_filename: string;
  status: string;
  created_at?: string;
  total_passed?: number;
  total_failed?: number;
}

interface ReportsPageProps {
  token: string;
}

export const ReportsPage: React.FC<ReportsPageProps> = ({ token }) => {
  const navigate = useNavigate();
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const loadReports = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/reports?limit=50", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.detail || "Failed to load reports");
        if (!cancelled) setReports(payload.reports || []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load reports");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadReports();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Reports</h1>
        <p className="text-slate-400">View and manage audit reports</p>
      </div>

      <div className="rounded-lg border border-slate-700 bg-slate-800/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700 bg-slate-800/80">
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">
                  Report ID
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">
                  Document
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td className="px-6 py-6 text-sm text-slate-400" colSpan={5}>
                    Loading reports...
                  </td>
                </tr>
              )}
              {!loading && error && (
                <tr>
                  <td className="px-6 py-6 text-sm text-red-400" colSpan={5}>
                    {error}
                  </td>
                </tr>
              )}
              {!loading && !error && reports.length === 0 && (
                <tr>
                  <td className="px-6 py-6 text-sm text-slate-400" colSpan={5}>
                    No reports found.
                  </td>
                </tr>
              )}
              {!loading && !error &&
                reports.map((report) => (
                  <tr
                    key={report.id}
                    className="border-b border-slate-700/50 hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="px-6 py-4 text-sm text-slate-200">
                      {report.id.slice(-6).toUpperCase()}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-200">
                      {report.document_filename || "-"}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span className="px-2 py-1 rounded-full text-xs bg-emerald-600/20 text-emerald-400">
                        {report.status || "completed"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-400">
                      {report.created_at ? new Date(report.created_at).toLocaleDateString() : "-"}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <button
                        onClick={() => navigate(`/report/${report.id}`)}
                        className="text-blue-400 hover:text-blue-300 font-medium"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ReportsPage;
