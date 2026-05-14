import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AuditPreview } from "../../components/AuditPreview";

interface PageStatus {
  page_number: number;
  status: "pass" | "fail" | "manual_pass" | "manual_fail";
  details?: Record<string, unknown>;
}

interface DocumentDetail {
  id: string;
  filename: string;
  result: string;
  status: string;
  created_at?: string;
  analyzed_at?: string;
  pages?: PageStatus[];
  summary?: {
    pass_count: number;
    fail_count: number;
    total_pages: number;
  };
}

interface DocumentDetailPageProps {
  token: string;
}

export const DocumentDetailPage: React.FC<DocumentDetailPageProps> = ({ token }) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [document, setDocument] = useState<DocumentDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPage, setSelectedPage] = useState<PageStatus | null>(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (id && token) {
      loadDocument();
    }
  }, [id, token]);

  const loadDocument = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/documents/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || "Failed to load document");
      setDocument(payload.document as DocumentDetail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load document");
    } finally {
      setLoading(false);
    }
  };

  const handlePageClick = (page: PageStatus) => {
    setSelectedPage(page);
    setShowModal(true);
  };

  const handleManualStatus = async (newStatus: "manual_pass" | "manual_fail") => {
    if (!selectedPage || !document) return;

    try {
      // Update local state
      const updatedPages = document.pages?.map((p) =>
        p.page_number === selectedPage.page_number ? { ...p, status: newStatus } : p
      ) || [];
      
      setDocument({ ...document, pages: updatedPages });
      setSelectedPage({ ...selectedPage, status: newStatus });

      // Optional: sync with backend
      await fetch(`/api/documents/${id}/page/${selectedPage.page_number}/status`, {
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

  if (loading) return <div className="text-slate-300 text-center py-8">Loading document...</div>;
  if (error) return <div className="text-red-400 text-center py-8">{error}</div>;
  if (!document) return <div className="text-slate-300 text-center py-8">Document not found</div>;

  const manualPassCount = document.pages?.filter((p) => p.status === "manual_pass").length || 0;
  const manualFailCount = document.pages?.filter((p) => p.status === "manual_fail").length || 0;
  const totalPassCount = (document.summary?.pass_count || 0) + manualPassCount;
  const totalFailCount = (document.summary?.fail_count || 0) + manualFailCount;

  return (
    <div className="space-y-6 px-6 py-8">
      {/* Header */}
      <div>
        <button onClick={() => navigate(-1)} className="mb-4 text-blue-400 hover:text-blue-300 text-sm">
          ← Back to Documents
        </button>
        <h1 className="text-3xl font-bold text-white mb-1">{document.filename}</h1>
        <p className="text-slate-400 text-sm">Document ID: {id}</p>
      </div>

      {/* Summary Stats - 4 Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4 hover:bg-slate-800/70 transition-colors">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Total Pages</p>
          <p className="text-3xl font-bold text-white">{document.summary?.total_pages || 0}</p>
        </div>
        <div className="rounded-lg border border-emerald-700/30 bg-emerald-900/10 p-4 hover:bg-emerald-900/20 transition-colors">
          <p className="text-xs text-emerald-400 uppercase tracking-wide mb-2">Pass Pages</p>
          <p className="text-3xl font-bold text-emerald-400">{totalPassCount}</p>
        </div>
        <div className="rounded-lg border border-red-700/30 bg-red-900/10 p-4 hover:bg-red-900/20 transition-colors">
          <p className="text-xs text-red-400 uppercase tracking-wide mb-2">Fail Pages</p>
          <p className="text-3xl font-bold text-red-400">{totalFailCount}</p>
        </div>
        <div className={`rounded-lg border p-4 transition-colors ${
          document.status === "completed"
            ? "border-emerald-700/30 bg-emerald-900/10 hover:bg-emerald-900/20"
            : "border-amber-700/30 bg-amber-900/10 hover:bg-amber-900/20"
        }`}>
          <p className="text-xs uppercase tracking-wide mb-2" style={{
            color: document.status === "completed" ? "#4ade80" : "#facc15"
          }}>Status</p>
          <p className="text-lg font-bold" style={{
            color: document.status === "completed" ? "#4ade80" : "#facc15"
          }}>
            {document.status.toUpperCase()}
          </p>
        </div>
      </div>

      {/* Audit Tables Section */}
      <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Audit Tables</h3>
        <div className="bg-slate-900/50 rounded-lg p-4 max-h-96 overflow-y-auto">
          <AuditPreview markdown={document.result} isStreaming={false} />
        </div>
      </div>

      {/* Pages Audited Grid */}
      <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-6">
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-white mb-2">Pages Audited</h3>
          <div className="flex gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full bg-emerald-600/20 text-emerald-400 text-sm font-semibold">
                {totalPassCount} Pass
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full bg-red-600/20 text-red-400 text-sm font-semibold">
                {totalFailCount} Fail
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full bg-slate-700/50 text-slate-300 text-sm font-semibold">
                {document.summary?.total_pages || 0} Total
              </span>
            </div>
          </div>
        </div>
        
        <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-12 gap-2">
          {document.pages?.map((page) => {
            const st = (page.status || "unknown").toString().toLowerCase();
            const isPass = st === "pass" || st === "manual_pass";
            const isFail = st === "fail" || st === "manual_fail";
            return (
              <button
                key={page.page_number}
                onClick={() => handlePageClick(page)}
                className={`aspect-square rounded-lg font-bold text-xs transition-all flex items-center justify-center cursor-pointer ${
                  isPass
                    ? "bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-600/50"
                    : isFail
                      ? "bg-red-600 text-white hover:bg-red-500 shadow-lg shadow-red-600/50"
                      : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                }`}
              >
                {page.page_number}
              </button>
            );
          })}
        </div>
      </div>

      {/* Page Detail Modal */}
      {showModal && selectedPage && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div
            className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-700 bg-slate-900/50">
              <div>
                <h2 className="text-2xl font-bold text-white">Page {selectedPage.page_number}</h2>
                {(() => {
                  const selSt = (selectedPage.status || "unknown").toString().toLowerCase();
                  const selPass = selSt === "pass" || selSt === "manual_pass";
                  return (
                    <p className="text-sm text-slate-400 mt-1">
                      Status: <span className={`font-semibold ${selPass ? "text-emerald-400" : "text-red-400"}`}>
                        {selectedPage.status ? selectedPage.status.toUpperCase().replace("_", " ") : "UNKNOWN"}
                      </span>
                    </p>
                  );
                })()}
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-white transition-colors text-2xl"
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto">
              {/* Tabs */}
              <div className="flex border-b border-slate-700 bg-slate-900/30 sticky top-0 z-10">
                <button className="flex-1 px-6 py-3 text-sm font-medium text-white border-b-2 border-blue-600 bg-slate-800/50">
                  📋 Details
                </button>
                <button className="flex-1 px-6 py-3 text-sm font-medium text-slate-400 hover:text-white transition-colors">
                  📄 PDF Preview
                </button>
              </div>

              {/* Details Tab Content */}
              <div className="p-6 space-y-6">
                {/* Current Status */}
                <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4">
                  <p className="text-xs text-slate-500 uppercase tracking-wide mb-3 font-semibold">Current Status</p>
                  <div className="inline-block">
                    <span
                      className={`px-4 py-2 rounded-lg text-sm font-bold ${
                        selectedPage.status === "pass" || selectedPage.status === "manual_pass"
                          ? "bg-emerald-600/30 text-emerald-300 border border-emerald-600/50"
                          : "bg-red-600/30 text-red-300 border border-red-600/50"
                      }`}
                    >
                      {selectedPage.status === "manual_pass" && "✓ "}
                      {selectedPage.status === "manual_fail" && "✗ "}
                      {selectedPage.status.toUpperCase().replace("_", " ")}
                    </span>
                  </div>
                </div>

                {/* Manual Audit Override Section */}
                <div className="rounded-lg border border-blue-700/30 bg-blue-900/10 p-4">
                  <p className="text-xs text-blue-400 uppercase tracking-wide mb-4 font-semibold">Manual Audit Override</p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleManualStatus("manual_pass")}
                      className={`flex-1 px-4 py-3 rounded-lg font-bold transition-all transform hover:scale-105 ${
                        selectedPage.status === "manual_pass"
                          ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/50 ring-2 ring-emerald-400"
                          : "bg-slate-700 text-slate-300 hover:bg-slate-600 border border-slate-600"
                      }`}
                    >
                      ✓ Manual Pass
                    </button>
                    <button
                      onClick={() => handleManualStatus("manual_fail")}
                      className={`flex-1 px-4 py-3 rounded-lg font-bold transition-all transform hover:scale-105 ${
                        selectedPage.status === "manual_fail"
                          ? "bg-red-600 text-white shadow-lg shadow-red-600/50 ring-2 ring-red-400"
                          : "bg-slate-700 text-slate-300 hover:bg-slate-600 border border-slate-600"
                      }`}
                    >
                      ✗ Manual Fail
                    </button>
                  </div>
                </div>

                {/* Page Details */}
                {selectedPage.details && Object.keys(selectedPage.details).length > 0 && (
                  <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4">
                    <p className="text-xs text-slate-500 uppercase tracking-wide mb-3 font-semibold">Page Details</p>
                    <div className="bg-slate-950 p-3 rounded-lg max-h-48 overflow-y-auto">
                      <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap break-words">
                        {JSON.stringify(selectedPage.details, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentDetailPage;
