import React, { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useParams, useNavigate } from "react-router-dom";
import { AuditPreview } from "../../components/AuditPreview";

interface PageStatus {
  page_number: number;
  status: "pass" | "fail" | "manual_pass" | "manual_fail";
  details?: Record<string, unknown>;
  manual_pass_reason?: string | null;
  manual_fail_reason?: string | null;
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
  user: {
    role: "admin" | "auditor";
  };
}

export const DocumentDetailPage: React.FC<DocumentDetailPageProps> = ({ token, user }) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [document, setDocument] = useState<DocumentDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPage, setSelectedPage] = useState<PageStatus | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [activeTab, setActiveTab] = useState<"details" | "info" | "preview" | "issue">("info");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pendingStatus, setPendingStatus] = useState<"manual_pass" | "manual_fail" | null>(null);
  const [manualReason, setManualReason] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [issueReason, setIssueReason] = useState("");
  const [issueSeverity, setIssueSeverity] = useState("medium");
  const [issueList, setIssueList] = useState<Array<{ id: string; reason: string; severity: string; status: string; resolution_notes?: string | null }>>([]);
  const [issueLoading, setIssueLoading] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [issueNotes, setIssueNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    if (id && token) {
      loadDocument();
    }
  }, [id, token]);

  useEffect(() => {
    if (!showModal || !id || !token || activeTab !== "preview") {
      return;
    }

    let revokeUrl: string | null = null;
    const loadPdf = async () => {
      setPdfLoading(true);
      setPdfError(null);
      try {
        const response = await fetch(`/api/documents/${id}/pdf`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.detail || "Failed to load PDF");
        }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        revokeUrl = url;
        setPdfUrl(url);
      } catch (err) {
        setPdfError(err instanceof Error ? err.message : "Failed to load PDF");
      } finally {
        setPdfLoading(false);
      }
    };

    loadPdf();

    return () => {
      if (revokeUrl) {
        URL.revokeObjectURL(revokeUrl);
      }
    };
  }, [showModal, id, token, activeTab]);

  useEffect(() => {
    if (!showModal) {
      setActiveTab("info");
      setPdfUrl(null);
      setPdfError(null);
      setPendingStatus(null);
      setManualReason("");
      setSaveError(null);
      setIssueReason("");
      setIssueSeverity("medium");
      setIssueList([]);
      setIssueError(null);
    }
  }, [showModal]);

  useEffect(() => {
    if (!showModal || !selectedPage || !id || !token) return;
    if (activeTab !== "issue" && user.role !== "auditor") return;

    let cancelled = false;
    const loadIssues = async () => {
      setIssueLoading(true);
      setIssueError(null);
      try {
        const response = await fetch(
          `/api/documents/${id}/page/${selectedPage.page_number}/issues`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.detail || "Failed to load issues");
        if (!cancelled) setIssueList(payload.issues || []);
      } catch (err) {
        if (!cancelled) {
          setIssueError(err instanceof Error ? err.message : "Failed to load issues");
        }
      } finally {
        if (!cancelled) setIssueLoading(false);
      }
    };

    loadIssues();
    return () => {
      cancelled = true;
    };
  }, [showModal, selectedPage, id, token, activeTab, user.role]);
  const handleRaiseIssue = async () => {
    if (!selectedPage || !id) return;
    if (!issueReason.trim()) {
      setIssueError("Reason is required.");
      return;
    }

    setIssueLoading(true);
    setIssueError(null);
    try {
      const response = await fetch(
        `/api/documents/${id}/page/${selectedPage.page_number}/issues`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            reason: issueReason.trim(),
            severity: issueSeverity,
          }),
        },
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || "Failed to raise issue");
      setIssueReason("");
      setIssueSeverity("medium");
      setActiveTab("issue");

      const listResponse = await fetch(
        `/api/documents/${id}/page/${selectedPage.page_number}/issues`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const listPayload = await listResponse.json();
      if (listResponse.ok) {
        setIssueList(listPayload.issues || []);
      }
    } catch (err) {
      setIssueError(err instanceof Error ? err.message : "Failed to raise issue");
    } finally {
      setIssueLoading(false);
    }
  };

  const handleResolveIssue = async (issueId: string, status: "resolved" | "rejected") => {
    if (!selectedPage || !id) return;
    setIssueLoading(true);
    setIssueError(null);
    try {
      const response = await fetch(
        `/api/documents/${id}/page/${selectedPage.page_number}/issues/${issueId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            status,
            notes: issueNotes[issueId] || "",
          }),
        },
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || "Failed to update issue");
      setIssueNotes((prev) => ({ ...prev, [issueId]: "" }));
      setIssueList((prev) =>
        prev.map((issue) =>
          issue.id === issueId ? { ...issue, status, resolution_notes: issueNotes[issueId] } : issue,
        ),
      );
    } catch (err) {
      setIssueError(err instanceof Error ? err.message : "Failed to update issue");
    } finally {
      setIssueLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedPage) return;
    if (selectedPage.status === "manual_pass") {
      setPendingStatus("manual_pass");
      setManualReason(selectedPage.manual_pass_reason ?? "");
    } else if (selectedPage.status === "manual_fail") {
      setPendingStatus("manual_fail");
      setManualReason(selectedPage.manual_fail_reason ?? "");
    } else {
      setPendingStatus(null);
      setManualReason("");
    }
    setSaveError(null);
  }, [selectedPage]);

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

  const statusLabel = (status: PageStatus["status"]) => {
    switch (status) {
      case "pass":
        return "PASS";
      case "fail":
        return "FAIL";
      case "manual_pass":
        return "M PASS";
      case "manual_fail":
        return "M FAIL";
      default:
        return status.toUpperCase();
    }
  };

  const detailMarkdownComponents = {
    h1: ({ children }: { children?: React.ReactNode }) => (
      <h1 className="text-xl text-title mb-2">{children}</h1>
    ),
    h2: ({ children }: { children?: React.ReactNode }) => (
      <h2 className="text-lg text-heading mt-4 mb-2">{children}</h2>
    ),
    h3: ({ children }: { children?: React.ReactNode }) => (
      <h3 className="text-base text-heading mt-3 mb-2">{children}</h3>
    ),
    p: ({ children }: { children?: React.ReactNode }) => (
      <p className="text-sm text-muted leading-relaxed mb-2">{children}</p>
    ),
    ul: ({ children }: { children?: React.ReactNode }) => (
      <ul className="space-y-1.5 text-sm text-muted list-disc pl-5 mb-2">
        {children}
      </ul>
    ),
    ol: ({ children }: { children?: React.ReactNode }) => (
      <ol className="space-y-1.5 text-sm text-muted list-decimal pl-5 mb-2">
        {children}
      </ol>
    ),
    li: ({ children }: { children?: React.ReactNode }) => (
      <li className="leading-relaxed">{children}</li>
    ),
    strong: ({ children }: { children?: React.ReactNode }) => (
      <strong className="text-title font-semibold">{children}</strong>
    ),
  };

  const handleManualStatus = (newStatus: "manual_pass" | "manual_fail") => {
    setPendingStatus(newStatus);
    setSaveError(null);
  };

  const handleSaveManualStatus = async () => {
    if (!selectedPage || !document || !pendingStatus) return;
    if (!manualReason.trim()) {
      setSaveError("Reason is required for manual overrides.");
      return;
    }

    setSaving(true);
    setSaveError(null);

    try {
      const response = await fetch(`/api/documents/${id}/page/${selectedPage.page_number}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: pendingStatus, reason: manualReason.trim() }),
      });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || "Failed to update page status");

      const updatedPages = document.pages?.map((p) =>
        p.page_number === selectedPage.page_number
          ? {
              ...p,
              status: pendingStatus,
              manual_pass_reason: pendingStatus === "manual_pass" ? manualReason.trim() : p.manual_pass_reason,
              manual_fail_reason: pendingStatus === "manual_fail" ? manualReason.trim() : p.manual_fail_reason,
            }
          : p
      ) || [];
      const updatedSelected = {
        ...selectedPage,
        status: pendingStatus,
        manual_pass_reason:
          pendingStatus === "manual_pass" ? manualReason.trim() : selectedPage.manual_pass_reason,
        manual_fail_reason:
          pendingStatus === "manual_fail" ? manualReason.trim() : selectedPage.manual_fail_reason,
      };

      setDocument({ ...document, pages: updatedPages });
      setSelectedPage(updatedSelected);
      setPendingStatus(null);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to update page status.");
    } finally {
      setSaving(false);
    }
  };

  const handleClearOverride = async () => {
    if (!selectedPage || !document) return;
    setSaving(true);
    setSaveError(null);
    try {
      const response = await fetch(`/api/documents/${id}/page/${selectedPage.page_number}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: "auto" }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || "Failed to clear override");

      const updatedPages = document.pages?.map((p) =>
        p.page_number === selectedPage.page_number
          ? {
              ...p,
              status: payload.status,
              manual_pass_reason: null,
              manual_fail_reason: null,
            }
          : p
      ) || [];

      setDocument({ ...document, pages: updatedPages });
      setSelectedPage({
        ...selectedPage,
        status: payload.status,
        manual_pass_reason: null,
        manual_fail_reason: null,
      });
      setPendingStatus(null);
      setManualReason("");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to clear override.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-muted text-center py-8">Loading document...</div>;
  if (error) return <div className="text-[var(--color-danger)] text-center py-8">{error}</div>;
  if (!document) return <div className="text-muted text-center py-8">Document not found</div>;

  const manualPassCount = document.pages?.filter((p) => p.status === "manual_pass").length || 0;
  const manualFailCount = document.pages?.filter((p) => p.status === "manual_fail").length || 0;
  const totalPassCount = (document.summary?.pass_count || 0) + manualPassCount;
  const totalFailCount = (document.summary?.fail_count || 0) + manualFailCount;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-6">
        <div>
          <p className="text-sm text-subtle">Document View</p>
          <h1 className="text-3xl text-title mt-1">{document.filename}</h1>
          <p className="text-sm text-muted">Document ID: {id}</p>
        </div>
        <button
          onClick={() => navigate(-1)}
          className="btn-primary px-3 py-2 text-sm"
          aria-label="Back"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card-shell p-4">
          <p className="text-xs text-subtle uppercase tracking-[0.2em]">Total Pages</p>
          <p className="text-2xl text-title mt-3">{document.summary?.total_pages || 0}</p>
          <p className="text-xs text-muted mt-1">Audited</p>
        </div>
        <div className="card-shell p-4">
          <p className="text-xs text-subtle uppercase tracking-[0.2em]">Pass Pages</p>
          <p className="text-2xl text-title mt-3">{totalPassCount}</p>
          <p className="text-xs text-muted mt-1">Verified</p>
        </div>
        <div className="card-shell p-4">
          <p className="text-xs text-subtle uppercase tracking-[0.2em]">Fail Pages</p>
          <p className="text-2xl text-title mt-3">{totalFailCount}</p>
          <p className="text-xs text-muted mt-1">Action needed</p>
        </div>
        <div className="card-shell p-4">
          <p className="text-xs text-subtle uppercase tracking-[0.2em]">Status</p>
          <div className="mt-3">
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${document.status === "completed" ? "badge-success" : "badge-warning"}`}>
              {document.status.toUpperCase()}
            </span>
          </div>
          <p className="text-xs text-muted mt-2">Overall</p>
        </div>
      </div>

      {/* Pages Grid */}
      <div>
        <h3 className="text-lg text-heading mb-4">Pages Audit Grid</h3>
        <div className="grid grid-cols-10 md:grid-cols-12 gap-3">
          {document.pages?.map((page) => (
            <button
              key={page.page_number}
              onClick={() => handlePageClick(page)}
              className={`w-11 h-11 text-base font-semibold page-tile ${
                page.status === "pass" || page.status === "manual_pass"
                  ? "page-tile-pass"
                  : page.status === "fail" || page.status === "manual_fail"
                    ? "page-tile-fail"
                    : ""
              }`}
            >
              <span className="text-base leading-none">{page.page_number}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Audit Content */}
      <div>
        <div className="min-h-[80vh] overflow-y-auto">
          <AuditPreview markdown={document.result} isStreaming={false} showPages={false} />
        </div>
      </div>

      {/* Page Detail Modal */}
      {showModal && selectedPage && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div
            className="card-shell w-full max-w-5xl max-h-[85vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
              <h2 className="text-xl text-title">Page {selectedPage.page_number}</h2>
              <button
                onClick={() => setShowModal(false)}
                className="btn-ghost text-xl"
              >
                ✕
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex border-b border-[var(--color-border)]">
              <button
                className={`flex-1 px-5 py-2.5 text-sm font-medium ${
                  activeTab === "info"
                    ? "text-title bg-[var(--color-surface-strong)]"
                    : "text-muted hover:text-[var(--color-text)]"
                }`}
                onClick={() => setActiveTab("info")}
              >
                Page Info
              </button>
              <button
                className={`flex-1 px-5 py-2.5 text-sm font-medium ${
                  activeTab === "details"
                    ? "text-title bg-[var(--color-surface-strong)]"
                    : "text-muted hover:text-[var(--color-text)]"
                }`}
                onClick={() => setActiveTab("details")}
              >
                Page Details
              </button>
              {user.role === "admin" && (
                <button
                  className={`flex-1 px-5 py-2.5 text-sm font-medium ${
                    activeTab === "issue"
                      ? "text-title bg-[var(--color-surface-strong)]"
                      : "text-muted hover:text-[var(--color-text)]"
                  }`}
                  onClick={() => setActiveTab("issue")}
                >
                  Raise Issue
                </button>
              )}
              <button
                className={`flex-1 px-5 py-2.5 text-sm font-medium ${
                  activeTab === "preview"
                    ? "text-title bg-[var(--color-surface-strong)]"
                    : "text-muted hover:text-[var(--color-text)]"
                }`}
                onClick={() => setActiveTab("preview")}
              >
                Page Preview
              </button>
            </div>

            {/* Modal Content - Details Tab */}
            {activeTab === "details" ? (
              <div className="px-6 py-5 grid gap-4">
                {typeof selectedPage.details?.summary === "string" && selectedPage.details.summary.trim() ? (
                  <div className="max-h-[58vh] overflow-auto">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={detailMarkdownComponents}
                    >
                      {selectedPage.details.summary}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <pre className="surface-strong p-4 rounded-lg text-xs text-muted overflow-auto max-h-[58vh]">
                    {JSON.stringify(selectedPage.details, null, 2)}
                  </pre>
                )}
              </div>
            ) : activeTab === "info" ? (
              <div className="px-6 py-5 grid gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-strong)] px-4 py-1.5">
                    <span className="text-xs uppercase tracking-wide text-subtle">Current</span>
                    <span
                      className={`px-2.5 py-1 rounded-full text-sm font-semibold ${
                        selectedPage.status === "pass" || selectedPage.status === "manual_pass"
                          ? "badge-success"
                          : "badge-danger"
                      }`}
                    >
                      {selectedPage.status.toUpperCase().replace("_", " ")}
                    </span>
                  </div>
                  {selectedPage.manual_pass_reason && (
                    <div className="text-xs text-[var(--color-success)]">Manual pass reason: {selectedPage.manual_pass_reason}</div>
                  )}
                  {selectedPage.manual_fail_reason && (
                    <div className="text-xs text-[var(--color-danger)]">Manual fail reason: {selectedPage.manual_fail_reason}</div>
                  )}
                </div>
                {user.role === "auditor" && (
                  <div className="grid gap-3">
                    <p className="text-xs uppercase tracking-wide text-subtle">
                      Manual Audit Override
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => handleManualStatus("manual_pass")}
                        className={`px-4 py-2 rounded-lg font-medium transition-all border ${
                          pendingStatus === "manual_pass" || selectedPage.status === "manual_pass"
                            ? "bg-[var(--color-success)] text-[#0b1a1d] border-transparent"
                            : "surface-strong text-body border-[var(--color-border)] hover:bg-[var(--color-surface-soft)]"
                        }`}
                      >
                        ✓ Manual Pass
                      </button>
                      <button
                        onClick={() => handleManualStatus("manual_fail")}
                        className={`px-4 py-2 rounded-lg font-medium transition-all border ${
                          pendingStatus === "manual_fail" || selectedPage.status === "manual_fail"
                            ? "bg-[var(--color-danger)] text-[#0b1a1d] border-transparent"
                            : "surface-strong text-body border-[var(--color-border)] hover:bg-[var(--color-surface-soft)]"
                        }`}
                      >
                        ✗ Manual Fail
                      </button>
                    </div>
                    <div className="grid gap-2">
                      <label className="text-xs uppercase tracking-wide text-subtle">
                        Reason (required for manual override)
                      </label>
                      <textarea
                        value={manualReason}
                        onChange={(event) => setManualReason(event.target.value)}
                        rows={3}
                        placeholder="Explain why you are overriding the audit result..."
                        className="w-full input-field px-3 py-2 text-sm"
                      />
                      {saveError && (
                        <p className="text-xs text-[var(--color-danger)]">{saveError}</p>
                      )}
                      <div className="flex justify-end">
                        <button
                          onClick={handleSaveManualStatus}
                          disabled={saving || !pendingStatus}
                          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                            saving || !pendingStatus
                              ? "surface-strong text-subtle cursor-not-allowed"
                              : "btn-primary"
                          }`}
                        >
                          {saving ? "Saving..." : "Save Override"}
                        </button>
                        <button
                          onClick={handleClearOverride}
                          disabled={
                            saving ||
                            (selectedPage.status !== "manual_pass" && selectedPage.status !== "manual_fail")
                          }
                          className={`ml-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                            saving || (selectedPage.status !== "manual_pass" && selectedPage.status !== "manual_fail")
                              ? "surface-strong text-subtle cursor-not-allowed"
                              : "btn-secondary"
                          }`}
                        >
                          Clear Override
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {user.role === "auditor" && (
                  <div className="grid gap-2">
                    <p className="text-xs uppercase tracking-wide text-subtle">
                      Issues
                    </p>
                    {issueLoading && <p className="text-xs text-muted">Loading issues...</p>}
                    {issueError && <p className="text-xs text-[var(--color-danger)]">{issueError}</p>}
                    {!issueLoading && issueList.length === 0 && (
                      <p className="text-xs text-muted">No issues raised.</p>
                    )}
                    {issueList.map((issue) => (
                      <div key={issue.id} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-3">
                        <div className="flex items-center justify-between text-xs text-subtle mb-1">
                          <span className="uppercase">{issue.severity}</span>
                          <span className="uppercase">{issue.status}</span>
                        </div>
                        <p className="text-sm text-body mb-2">{issue.reason}</p>
                        {issue.status === "pending" ? (
                          <div className="grid gap-2">
                            <textarea
                              value={issueNotes[issue.id] || ""}
                              onChange={(event) =>
                                setIssueNotes((prev) => ({ ...prev, [issue.id]: event.target.value }))
                              }
                              rows={2}
                              placeholder="Resolution notes (optional)"
                              className="w-full input-field px-3 py-2 text-xs"
                            />
                            <div className="flex gap-2 justify-end">
                              <button
                                onClick={() => handleResolveIssue(issue.id, "resolved")}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold btn-primary"
                              >
                                Resolve
                              </button>
                              <button
                                onClick={() => handleResolveIssue(issue.id, "rejected")}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ backgroundColor: "var(--color-danger)", color: "#0b1a1d" }}
                              >
                                Reject
                              </button>
                            </div>
                          </div>
                        ) : issue.resolution_notes ? (
                          <p className="text-xs text-muted">Notes: {issue.resolution_notes}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : activeTab === "issue" ? (
              <div className="px-6 py-5 grid gap-3">
                <p className="text-xs uppercase tracking-wide text-subtle">Raise Issue</p>
                {issueLoading && <p className="text-xs text-muted">Loading issues...</p>}
                {issueError && <p className="text-xs text-[var(--color-danger)]">{issueError}</p>}
                {!issueLoading && issueList.length > 0 && (
                  <div className="grid gap-2">
                    {issueList.map((issue) => (
                      <div key={issue.id} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-3">
                        <div className="flex items-center justify-between text-xs text-subtle mb-1">
                          <span className="uppercase">{issue.severity}</span>
                          <span className="uppercase">{issue.status}</span>
                        </div>
                        <p className="text-sm text-body">{issue.reason}</p>
                        {issue.resolution_notes && (
                          <p className="text-xs text-muted mt-1">Notes: {issue.resolution_notes}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {!issueLoading && issueList.length === 0 && (
                  <p className="text-xs text-muted">No issues raised yet.</p>
                )}
                <div className="grid gap-2">
                  <label className="text-xs uppercase tracking-wide text-subtle">Severity</label>
                  <select
                    value={issueSeverity}
                    onChange={(event) => setIssueSeverity(event.target.value)}
                    className="w-full input-field px-3 py-2 text-sm"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <div className="grid gap-2">
                  <label className="text-xs uppercase tracking-wide text-subtle">Reason</label>
                  <textarea
                    value={issueReason}
                    onChange={(event) => setIssueReason(event.target.value)}
                    rows={4}
                    placeholder="Describe the issue for this page..."
                    className="w-full input-field px-3 py-2 text-sm"
                  />
                </div>
                {issueError && <p className="text-xs text-[var(--color-danger)]">{issueError}</p>}
                <div className="flex justify-end">
                  <button
                    onClick={handleRaiseIssue}
                    disabled={issueLoading}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                      issueLoading
                        ? "surface-strong text-subtle cursor-not-allowed"
                        : "btn-primary"
                    }`}
                  >
                    {issueLoading ? "Saving..." : "Raise Issue"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="px-6 py-5">
                {pdfLoading ? (
                  <p className="text-sm text-muted">Loading PDF preview...</p>
                ) : pdfError ? (
                  <p className="text-sm text-[var(--color-danger)]">{pdfError}</p>
                ) : pdfUrl ? (
                  <iframe
                    title={`PDF preview page ${selectedPage.page_number}`}
                    className="w-full h-[520px] rounded-lg border border-[var(--color-border)] bg-black"
                    src={`${pdfUrl}#page=${selectedPage.page_number}`}
                  />
                ) : (
                  <p className="text-sm text-muted">Preview not available.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentDetailPage;
