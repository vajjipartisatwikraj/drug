import { useMemo } from "react";
import {
  extractSectionStatus,
  splitAuditMarkdown,
  type PageStatus,
} from "../utils/auditMarkdown";

interface PageNavProps {
  markdown: string;
  status: "idle" | "uploading" | "processing" | "completed" | "error";
  // Optional authoritative page status list (from backend). If provided this
  // will be used for counts and colouring instead of parsing the markdown.
  pages?: Array<{ number: number | string; status?: string }>;
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
      return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
    case "fail":
      return "bg-red-500/20 text-red-400 border-red-500/30";
    case "void":
      return "bg-amber-500/20 text-amber-300 border-amber-500/30";
    case "na":
      return "bg-slate-500/20 text-slate-300 border-slate-500/30";
    case "processing":
      return "bg-amber-500/20 text-amber-400 border-amber-500/30 animate-pulse";
    default:
      return "bg-slate-700/50 text-slate-400 border-slate-600";
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
  1: "bg-blue-500/15 text-blue-300 border-blue-500/30 hover:bg-blue-500/25",
  2: "bg-amber-500/15 text-amber-300 border-amber-500/30 hover:bg-amber-500/25",
  3: "bg-purple-500/15 text-purple-300 border-purple-500/30 hover:bg-purple-500/25",
  4: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30 hover:bg-cyan-500/25",
  5: "bg-orange-500/15 text-orange-300 border-orange-500/30 hover:bg-orange-500/25",
  6: "bg-red-500/15 text-red-300 border-red-500/30 hover:bg-red-500/25",
  7: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25",
  8: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30 hover:bg-indigo-500/25",
};

function tableColor(n: number): string {
  return (
    TABLE_COLORS[n] ??
    "bg-slate-700/30 text-slate-400 border-slate-600 hover:bg-slate-700/50"
  );
}

export function PageNav({ markdown, status, pages: pagesProp }: PageNavProps) {
  const sections = useMemo(() => splitAuditMarkdown(markdown), [markdown]);

  const pages = useMemo<PageInfo[]>(() => {
    if (pagesProp && pagesProp.length > 0) {
      return pagesProp.map((p) => {
        const num = typeof p.number === "number" ? String(p.number) : String(p.number || "");
        const st = (p.status || "unknown").toString().toLowerCase();
        const statusVal: PageInfo["status"] = st === "processing" ? "processing" : (st as PageInfo["status"]);
        return { number: num, status: statusVal };
      });
    }

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
  }, [sections, status, pagesProp]);

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
    <div className="rounded-2xl border border-slate-700 bg-slate-800/50 p-4 shadow-lg shadow-slate-950/20 space-y-4">
      {/* ── Table sections navigation ───────────────────────────────── */}
      {tables.length > 0 && (
        <div>
          <h3 className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
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
                className="w-full text-left flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all duration-150 bg-indigo-500/15 text-indigo-300 border-indigo-500/30 hover:bg-indigo-500/25"
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
            <h3 className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
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
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-emerald-300">
              {passCount} Pass
            </span>
            <span className="rounded-full border border-red-500/30 bg-red-500/15 px-2 py-0.5 text-red-300">
              {failCount} Fail
            </span>
            <span className="rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-amber-300">
              {voidCount} Void
            </span>
            <span className="rounded-full border border-slate-600 bg-slate-700/40 px-2 py-0.5 text-slate-300">
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
