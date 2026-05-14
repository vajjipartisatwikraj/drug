import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AuditPreview } from "../../components/AuditPreview";
import { PageNav } from "../../components/PageNav";

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
    <div className="space-y-6">
      {/* Header */}
      <div>
        <button onClick={() => navigate(-1)} className="mb-4 text-blue-400 hover:text-blue-300">
          ← Back
        </button>
        <h1 className="text-3xl font-bold text-white mb-2">{document.filename}</h1>
        <p className="text-slate-400">Document ID: {id}</p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
          <p className="text-sm text-slate-400">Total Pages</p>
          <p className="text-3xl font-bold text-white mt-2">{document.summary?.total_pages || 0}</p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
          <p className="text-sm text-slate-400">Pass Pages</p>
          <p className="text-3xl font-bold text-emerald-400 mt-2">{totalPassCount}</p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
          <p className="text-sm text-slate-400">Fail Pages</p>
          <p className="text-3xl font-bold text-red-400 mt-2">{totalFailCount}</p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
          <p className="text-sm text-slate-400">Status</p>
          <p className={`text-lg font-bold mt-2 ${document.status === "completed" ? "text-emerald-400" : "text-amber-400"}`}>
            {document.status.toUpperCase()}
          </p>
        </div>
      </div>

      {/* Audit Content */}
      <div className="grid grid-cols-12 gap-6">
        <aside className="col-span-3 space-y-4 lg:sticky lg:top-24 lg:self-start">
          <PageNav markdown={document.result} status="completed" />
        </aside>
        <div className="col-span-9">
          <div className="min-h-[80vh] rounded-xl border border-slate-700 bg-slate-800/30 p-6 overflow-y-auto">
            <AuditPreview markdown={document.result} isStreaming={false} />
          </div>
        </div>
      </div>

      {/* Pages Grid */}
      <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Pages Audit Grid</h3>
        <div className="grid grid-cols-6 md:grid-cols-12 gap-3">
          {document.pages?.map((page) => (
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

            {/* Modal Tabs */}
            <div className="flex border-b border-slate-700">
              <button className="flex-1 px-6 py-3 text-sm font-medium text-white bg-slate-700/50">
                Details
              </button>
              <button className="flex-1 px-6 py-3 text-sm font-medium text-slate-400 hover:text-white">
                PDF Preview
              </button>
            </div>

            {/* Modal Content - Details Tab */}
            <div className="p-6 space-y-4">
              <div>
                <p className="text-sm text-slate-400 mb-2">Current Status</p>
                <div className="flex gap-2 items-center">
                  <span
                    className={`px-3 py-1 rounded-full text-sm font-semibold ${
                      selectedPage.status === "pass" || selectedPage.status === "manual_pass"
                        ? "bg-emerald-600/20 text-emerald-400"
                        : "bg-red-600/20 text-red-400"
                    }`}
                  >
                    {selectedPage.status.toUpperCase().replace("_", " ")}
                  </span>
                </div>
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

              <div className="pt-4 border-t border-slate-700">
                <p className="text-sm text-slate-400 mb-2">Page Details</p>
                <pre className="bg-slate-900/50 p-3 rounded-lg text-xs text-slate-300 overflow-auto max-h-48">
                  {JSON.stringify(selectedPage.details, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentDetailPage;
