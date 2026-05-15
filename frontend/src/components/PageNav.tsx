import { useMemo } from "react";
import {
  extractSectionStatus,
  splitAuditMarkdown,
  type PageStatus,
} from "../utils/auditMarkdown";

interface PageNavProps {
  markdown: string;
  status: "idle" | "uploading" | "processing" | "completed" | "error";
}

interface PageInfo {
  number: string;
  status: PageStatus | "processing";
}

interface TableInfo {
  number: number;
  title: string;
}

function statusClass(status: PageInfo["status"]): string {
  switch (status) {
    case "pass":
      return "badge-success";
    case "fail":
      return "badge-danger";
    case "void":
      return "badge-warning";
    case "na":
      return "badge-neutral";
    case "processing":
      return "badge-warning animate-pulse";
    default:
      return "badge-neutral";
  }
}

function statusLabel(status: PageInfo["status"]): string {
  switch (status) {
    case "pass":
      return "PASS";
    case "fail":
      return "FAIL";
    case "void":
      return "VOID";
    case "na":
      return "N/A";
    case "processing":
      return "…";
    default:
      return "N/A";
  }
}

const TABLE_COLORS: Record<number, string> = {
  1: "surface-soft text-body border-[var(--color-border)] hover:bg-[var(--color-surface-strong)]",
  2: "surface-soft text-body border-[var(--color-border)] hover:bg-[var(--color-surface-strong)]",
  3: "surface-soft text-body border-[var(--color-border)] hover:bg-[var(--color-surface-strong)]",
  4: "surface-soft text-body border-[var(--color-border)] hover:bg-[var(--color-surface-strong)]",
  5: "surface-soft text-body border-[var(--color-border)] hover:bg-[var(--color-surface-strong)]",
  6: "surface-soft text-body border-[var(--color-border)] hover:bg-[var(--color-surface-strong)]",
  7: "surface-soft text-body border-[var(--color-border)] hover:bg-[var(--color-surface-strong)]",
  8: "surface-soft text-body border-[var(--color-border)] hover:bg-[var(--color-surface-strong)]",
};

function tableColor(n: number): string {
  return (
    TABLE_COLORS[n] ??
    "surface-soft text-body border-[var(--color-border)] hover:bg-[var(--color-surface-strong)]"
  );
}

export function PageNav({ markdown, status }: PageNavProps) {
  const sections = useMemo(() => splitAuditMarkdown(markdown), [markdown]);

  const pages = useMemo<PageInfo[]>(() => {
    return sections
      .filter((section) => section.type === "page")
      .map((section, index) => {
        const pageStatus = extractSectionStatus(section.body);
        return {
          number: section.pageNumber?.trim() || String(index + 1),
          status:
            pageStatus === "unknown" && status === "processing"
              ? "processing"
              : pageStatus,
        };
      });
  }, [sections, status]);

  const tables = useMemo<TableInfo[]>(() => {
    return sections
      .filter((section) => section.type === "tableSection")
      .map((section) => ({
        number: section.tableNumber ?? 0,
        title: section.title.replace(/^Table\s+\d+:\s*/i, ""),
      }));
  }, [sections]);

  const hasSummary = sections.some((section) => section.type === "summary");
  const hasContent = pages.length > 0 || tables.length > 0 || hasSummary;

  if (!hasContent) {
    return null;
  }

  const scrollTo = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const passCount = pages.filter((p) => p.status === "pass").length;
  const failCount = pages.filter((p) => p.status === "fail").length;
  const voidCount = pages.filter((p) => p.status === "void").length;

  return (
    <div className="rounded-2xl surface p-4 space-y-4">
      {/* ── Table sections navigation ───────────────────────────────── */}
      {tables.length > 0 && (
        <div>
          <h3 className="flex items-center gap-2 text-xs font-semibold text-subtle uppercase tracking-wider mb-2">
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 10h16M4 14h16M4 18h16"
              />
            </svg>
            Audit Tables
          </h3>
          <div className="space-y-1">
            {tables.map((table) => (
              <button
                key={table.number}
                onClick={() => scrollTo(`table-${table.number}`)}
                className={`w-full text-left flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all duration-150 ${tableColor(table.number)}`}
              >
                <span className="font-mono font-bold shrink-0">
                  T{table.number}
                </span>
                <span className="truncate">{table.title}</span>
              </button>
            ))}
            {hasSummary && (
              <button
                onClick={() => scrollTo("final-summary")}
                className="w-full text-left flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all duration-150 surface-soft text-body border-[var(--color-border)] hover:bg-[var(--color-surface-strong)]"
              >
                <span className="font-mono font-bold shrink-0">∑</span>
                <span>Final Summary</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Page navigation ─────────────────────────────────────────── */}
      {pages.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="flex items-center gap-2 text-xs font-semibold text-subtle uppercase tracking-wider">
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              Pages Audited
            </h3>
          </div>

          {/* Status counts */}
          <div className="flex flex-wrap gap-1.5 mb-2 text-xs">
            <span className="rounded-full px-2 py-0.5 badge-success">
              {passCount} Pass
            </span>
            <span className="rounded-full px-2 py-0.5 badge-danger">
              {failCount} Fail
            </span>
            <span className="rounded-full px-2 py-0.5 badge-warning">
              {voidCount} Void
            </span>
            <span className="rounded-full px-2 py-0.5 badge-neutral">
              {pages.length} Total
            </span>
          </div>

          {/* Page grid */}
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5 lg:grid-cols-6">
            {pages.map((page, index) => (
              <button
                key={`${page.number}-${index}`}
                onClick={() => scrollTo(`page-${page.number}`)}
                className={`flex aspect-square w-full flex-col items-center justify-center rounded-xl border text-xs font-mono transition-all duration-150 hover:scale-105 ${statusClass(page.status)}`}
                title={`Page ${page.number} - ${statusLabel(page.status)}`}
              >
                <span className="text-base leading-none">{page.number}</span>
                <span className="text-[9px] mt-0.5 opacity-70">
                  {statusLabel(page.status)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Summary only (no pages/tables yet) ──────────────────────── */}
      {pages.length === 0 && tables.length === 0 && hasSummary && (
        <button
          onClick={() => scrollTo("final-summary")}
          className="w-full text-center rounded-xl border border-indigo-500/30 bg-indigo-500/15 px-3 py-2 text-xs font-medium text-indigo-300 transition-colors hover:bg-indigo-500/25"
        >
          Jump to Summary
        </button>
      )}
    </div>
  );
}
