import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";

interface ReportPage {
  page_number: number;
  status: "pass" | "fail" | "manual_pass" | "manual_fail";
  findings?: string[];
}

interface ReportDetail {
  id: string;
  document_filename: string;
  report_data: string;
  status: string;
  created_at?: string;
  pages?: ReportPage[];
  summary?: {
    pass_count: number;
    fail_count: number;
    total_pages: number;
    critical_issues: number;
    warnings: number;
  };
}

interface ReportDetailPageProps {
  token: string;
}

export const ReportDetailPage: React.FC<ReportDetailPageProps> = ({ token }) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [report, setReport] = useState<ReportDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPage, setSelectedPage] = useState<ReportPage | null>(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (id && token) {
      loadReport();
    }
  }, [id, token]);

  const loadReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/reports/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || "Failed to load report");
      setReport(payload.report as ReportDetail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load report");
    } finally {
      setLoading(false);
    }
  };

  const handlePageClick = (page: ReportPage) => {
    setSelectedPage(page);
    setShowModal(true);
  };

  const handleManualStatus = async (newStatus: "manual_pass" | "manual_fail") => {
    if (!selectedPage || !report) return;

    try {
      const updatedPages = report.pages?.map((p) =>
        p.page_number === selectedPage.page_number ? { ...p, status: newStatus } : p
      ) || [];

      setReport({ ...report, pages: updatedPages });
      setSelectedPage({ ...selectedPage, status: newStatus });

      await fetch(`/api/reports/${id}/page/${selectedPage.page_number}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });
    } catch (err) {
      console.error("Failed to update page status:", err);
    }
  };

  if (loading) return <div className="text-slate-300 text-center py-8">Loading report...</div>;
  if (error) return <div className="text-red-400 text-center py-8">{error}</div>;
  if (!report) return <div className="text-slate-300 text-center py-8">Report not found</div>;

  const manualPassCount = report.pages?.filter((p) => p.status === "manual_pass").length || 0;
  const manualFailCount = report.pages?.filter((p) => p.status === "manual_fail").length || 0;
  const totalPassCount = (report.summary?.pass_count || 0) + manualPassCount;
  const totalFailCount = (report.summary?.fail_count || 0) + manualFailCount;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <button onClick={() => navigate(-1)} className="mb-4 text-blue-400 hover:text-blue-300">
          ← Back
        </button>
        <h1 className="text-3xl font-bold text-white mb-2">Report: {report.document_filename}</h1>
        <p className="text-slate-400">Report ID: {id}</p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
          <p className="text-sm text-slate-400">Total Pages</p>
          <p className="text-3xl font-bold text-white mt-2">{report.summary?.total_pages || 0}</p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
          <p className="text-sm text-slate-400">Pass</p>
          <p className="text-3xl font-bold text-emerald-400 mt-2">{totalPassCount}</p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
          <p className="text-sm text-slate-400">Fail</p>
          <p className="text-3xl font-bold text-red-400 mt-2">{totalFailCount}</p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
          <p className="text-sm text-slate-400">Critical Issues</p>
          <p className="text-3xl font-bold text-orange-400 mt-2">{report.summary?.critical_issues || 0}</p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
          <p className="text-sm text-slate-400">Warnings</p>
          <p className="text-3xl font-bold text-yellow-400 mt-2">{report.summary?.warnings || 0}</p>
        </div>
      </div>

      {/* Report Summary */}
      <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Report Summary</h3>
        <div className="prose prose-invert max-w-none">
          <pre className="bg-slate-900/50 p-4 rounded-lg text-sm text-slate-300 overflow-auto max-h-96">
            {report.report_data}
          </pre>
        </div>
      </div>

      {/* Pages Grid */}
      {report.pages && report.pages.length > 0 && (
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Pages Audit Grid</h3>
          <div className="grid grid-cols-6 md:grid-cols-12 gap-3">
            {report.pages.map((page) => (
              <button
                key={page.page_number}
                onClick={() => handlePageClick(page)}
                className={`aspect-square rounded-lg font-semibold text-sm transition-all flex items-center justify-center ${
                  page.status === "pass" || page.status === "manual_pass"
                    ? "bg-emerald-600/20 text-emerald-400 border border-emerald-600/30 hover:border-emerald-500"
                    : page.status === "fail" || page.status === "manual_fail"
                      ? "bg-red-600/20 text-red-400 border border-red-600/30 hover:border-red-500"
                      : "bg-slate-700 text-slate-300 border border-slate-600 hover:border-slate-500"
                }`}
              >
                {page.page_number}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Page Detail Modal */}
      {showModal && selectedPage && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div
            className="bg-slate-800 rounded-xl border border-slate-700 max-w-2xl w-full max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-700">
              <h2 className="text-xl font-bold text-white">Page {selectedPage.page_number}</h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-white text-2xl"
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-4">
              <div>
                <p className="text-sm text-slate-400 mb-2">Current Status</p>
                <span
                  className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${
                    selectedPage.status === "pass" || selectedPage.status === "manual_pass"
                      ? "bg-emerald-600/20 text-emerald-400"
                      : "bg-red-600/20 text-red-400"
                  }`}
                >
                  {selectedPage.status.toUpperCase().replace("_", " ")}
                </span>
              </div>

              <div>
                <p className="text-sm text-slate-400 mb-3">Manual Audit Override</p>
                <div className="flex gap-3">
                  <button
                    onClick={() => handleManualStatus("manual_pass")}
                    className={`flex-1 px-4 py-2 rounded-lg font-medium transition-all ${
                      selectedPage.status === "manual_pass"
                        ? "bg-emerald-600 text-white"
                        : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                    }`}
                  >
                    ✓ Manual Pass
                  </button>
                  <button
                    onClick={() => handleManualStatus("manual_fail")}
                    className={`flex-1 px-4 py-2 rounded-lg font-medium transition-all ${
                      selectedPage.status === "manual_fail"
                        ? "bg-red-600 text-white"
                        : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                    }`}
                  >
                    ✗ Manual Fail
                  </button>
                </div>
              </div>

              {selectedPage.findings && selectedPage.findings.length > 0 && (
                <div className="pt-4 border-t border-slate-700">
                  <p className="text-sm text-slate-400 mb-2">Findings</p>
                  <ul className="space-y-2">
                    {selectedPage.findings.map((finding, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm text-slate-300">
                        <span className="text-amber-400 mt-0.5">•</span>
                        <span>{finding}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportDetailPage;
