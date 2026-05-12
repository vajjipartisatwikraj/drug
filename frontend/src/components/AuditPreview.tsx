import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  extractFailReason,
  extractSectionStatus,
  splitAuditMarkdown,
  stripSectionMetadata,
  type AuditSection,
  type PageStatus,
} from "../utils/auditMarkdown";

interface AuditPreviewProps {
  markdown: string;
  isStreaming?: boolean;
}

type DisplayStatus = PageStatus | "processing";

// ── Table section icon map ──────────────────────────────────────────────────
function TableIcon({ tableNumber }: { tableNumber?: number }) {
  const icons: Record<number, JSX.Element> = {
    1: (
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"
        />
      </svg>
    ),
    2: (
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
        />
      </svg>
    ),
    3: (
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
        />
      </svg>
    ),
    4: (
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
      </svg>
    ),
    5: (
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
        />
      </svg>
    ),
    6: (
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
        />
      </svg>
    ),
    7: (
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
        />
      </svg>
    ),
    8: (
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
  };
  return icons[tableNumber ?? 0] ?? null;
}

// ── Table section colour accent map ──────────────────────────────────────────
function tableSectionAccent(tableNumber?: number): string {
  const accents: Record<number, string> = {
    1: "from-blue-900/40 to-slate-900/60 border-blue-700/40",
    2: "from-amber-900/30 to-slate-900/60 border-amber-700/40",
    3: "from-purple-900/30 to-slate-900/60 border-purple-700/40",
    4: "from-cyan-900/30 to-slate-900/60 border-cyan-700/40",
    5: "from-orange-900/30 to-slate-900/60 border-orange-700/40",
    6: "from-red-900/30 to-slate-900/60 border-red-700/40",
    7: "from-emerald-900/30 to-slate-900/60 border-emerald-700/40",
    8: "from-indigo-900/40 to-slate-900/60 border-indigo-700/40",
  };
  return (
    accents[tableNumber ?? 0] ??
    "from-slate-800/40 to-slate-900/60 border-slate-700/40"
  );
}

function tableSectionIconColor(tableNumber?: number): string {
  const colors: Record<number, string> = {
    1: "text-blue-400",
    2: "text-amber-400",
    3: "text-purple-400",
    4: "text-cyan-400",
    5: "text-orange-400",
    6: "text-red-400",
    7: "text-emerald-400",
    8: "text-indigo-400",
  };
  return colors[tableNumber ?? 0] ?? "text-slate-400";
}

// ── Markdown components ────────────────────────────────────────────────────
const markdownComponents = {
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 className="text-2xl font-bold text-white mb-4 mt-6 pb-2 border-b border-slate-600">
      {children}
    </h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="text-xl font-semibold text-blue-300 mb-3 mt-5">
      {children}
    </h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="text-lg font-medium text-emerald-300 mb-2 mt-4">
      {children}
    </h3>
  ),
  h4: ({ children }: { children?: React.ReactNode }) => (
    <h4 className="text-base font-medium text-amber-300 mb-2 mt-3">
      {children}
    </h4>
  ),
  p: ({
    children,
    ...props
  }: {
    children?: React.ReactNode;
    [key: string]: unknown;
  }) => {
    const text = String(children);
    if (text.includes("<span")) {
      return <p {...props} dangerouslySetInnerHTML={{ __html: text }} />;
    }
    return (
      <p className="mb-3 text-slate-300 leading-relaxed" {...props}>
        {children}
      </p>
    );
  },
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-white">{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <em className="italic text-slate-400">{children}</em>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="mb-3 pl-5 text-slate-300 list-disc">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="mb-3 pl-5 text-slate-300 list-decimal">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="mb-1">{children}</li>
  ),
  code: ({
    className,
    children,
    ...props
  }: {
    className?: string;
    children?: React.ReactNode;
    [key: string]: unknown;
  }) => {
    const isInline = !className;
    if (isInline) {
      return (
        <code
          className="rounded bg-slate-800 px-2 py-0.5 text-amber-400 font-mono text-sm"
          {...props}
        >
          {children}
        </code>
      );
    }
    return (
      <code className={`${className} block font-mono text-sm`} {...props}>
        {children}
      </code>
    );
  },
  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre className="bg-slate-900 rounded-lg p-4 mb-4 overflow-x-auto border border-slate-700 text-emerald-400 text-sm font-mono">
      {children}
    </pre>
  ),
};

// ── Status helpers ─────────────────────────────────────────────────────────
function statusLabel(status: DisplayStatus): string {
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
      return "PROCESSING";
    default:
      return "UNKNOWN";
  }
}

function statusClass(status: DisplayStatus): string {
  switch (status) {
    case "pass":
      return "audit-status-pass";
    case "fail":
      return "audit-status-fail";
    case "void":
      return "audit-status-void";
    case "na":
      return "audit-status-na";
    case "processing":
      return "audit-status-processing";
    default:
      return "audit-status-unknown";
  }
}

function renderMarkdown(content: string) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={markdownComponents as never}
    >
      {content}
    </ReactMarkdown>
  );
}

// ── Section renderers ──────────────────────────────────────────────────────

function renderTableSection(section: AuditSection) {
  const accent = tableSectionAccent(section.tableNumber);
  const iconColor = tableSectionIconColor(section.tableNumber);

  return (
    <section
      key={`table-${section.tableNumber}-${section.title}`}
      id={`table-${section.tableNumber}`}
      className={`overflow-hidden rounded-2xl border bg-gradient-to-br shadow-xl shadow-slate-950/30 ${accent} scroll-mt-6`}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-white/5">
        <span className={iconColor}>
          <TableIcon tableNumber={section.tableNumber} />
        </span>
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-slate-500 mb-0.5">
            {section.tableNumber ? `Table ${section.tableNumber}` : "Section"}
          </p>
          <h2 className="text-base font-semibold text-white leading-tight">
            {section.title.replace(/^Table\s+\d+:\s*/i, "")}
          </h2>
        </div>
      </div>

      {/* Body */}
      <div className="audit-page-body overflow-x-auto">
        {section.body ? (
          renderMarkdown(section.body)
        ) : (
          <p className="text-slate-500 text-sm italic py-2">
            No data for this section.
          </p>
        )}
      </div>
    </section>
  );
}

function renderPageSection(section: AuditSection, isStreaming?: boolean) {
  const status = extractSectionStatus(section.body);
  const failReason = extractFailReason(section.body);
  const body = stripSectionMetadata(section.body);
  const displayStatus: DisplayStatus =
    status === "unknown" && isStreaming ? "processing" : status;

  return (
    <section
      key={`${section.type}-${section.pageNumber}`}
      id={`page-${section.pageNumber}`}
      className="audit-page scroll-mt-6"
    >
      <div className="audit-page-header">
        <div>
          <p className="audit-page-kicker">PAGE</p>
          <h2 className="audit-page-title">Page {section.pageNumber}</h2>
        </div>

        <div className="audit-page-meta">
          <span className={`audit-page-status ${statusClass(displayStatus)}`}>
            {statusLabel(displayStatus)}
          </span>
        </div>
      </div>

      <div className="audit-page-body">
        {body ? renderMarkdown(body) : null}
      </div>

      {failReason && (
        <div className="audit-fail-reason">
          <span className="audit-fail-label">Fail Reason</span>
          <p className="mt-2 text-sm leading-6 text-red-100">{failReason}</p>
        </div>
      )}
    </section>
  );
}

function renderSummarySection(section: AuditSection) {
  return (
    <section
      key={`${section.type}-${section.title}`}
      id="final-summary"
      className="audit-summary scroll-mt-6"
    >
      <div className="audit-summary-header">
        <div>
          <p className="audit-page-kicker">SUMMARY</p>
          <h2 className="audit-page-title">FINAL AUDIT SUMMARY</h2>
        </div>

        <span className="audit-page-status audit-status-na">S0–S10</span>
      </div>

      <div className="audit-page-body">{renderMarkdown(section.body)}</div>
    </section>
  );
}

function renderFreeformSection(section: AuditSection, key: string) {
  const body = stripSectionMetadata(section.body);

  if (!body) {
    return null;
  }

  return (
    <section key={key} className="audit-freeform scroll-mt-6">
      <div className="audit-page-body">{renderMarkdown(body)}</div>
    </section>
  );
}

// ── Main export ──────────────────────────────────────────────────────────────
export function AuditPreview({ markdown, isStreaming }: AuditPreviewProps) {
  const sections = useMemo(() => splitAuditMarkdown(markdown), [markdown]);

  if (!markdown) {
    if (isStreaming) {
      return (
        <div className="flex h-full items-center justify-center text-slate-300">
          <div className="max-w-xl text-center">
            <div className="mx-auto mb-6 relative w-16 h-16">
              <div className="absolute inset-0 rounded-full border-2 border-slate-700" />
              <div className="absolute inset-0 rounded-full border-t-2 border-emerald-400 animate-spin" />
              <div
                className="absolute inset-2 rounded-full border-t-2 border-blue-400 animate-spin"
                style={{
                  animationDuration: "1.5s",
                  animationDirection: "reverse",
                }}
              />
            </div>
            <p className="text-lg font-semibold text-slate-100 mb-1">
              Audit Running
            </p>
            <p className="text-sm text-slate-400">
              Gemma 4 31B is processing the document. Local Math Engine is
              verifying calculations...
            </p>
            <div className="mt-4 flex justify-center gap-1.5">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex h-full items-center justify-center text-slate-500">
        <div className="text-center">
          <svg
            className="mx-auto mb-4 h-16 w-16 opacity-30"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <p className="text-lg font-medium text-slate-400">
            Upload a BMR to begin audit
          </p>
          <p className="text-sm text-slate-600 mt-1">
            Supported: PDF up to 100 MB
          </p>
        </div>
      </div>
    );
  }

  const hasStructuredSections = sections.some(
    (section) => section.type !== "other",
  );

  if (!hasStructuredSections) {
    // Raw markdown fallback — render everything as-is
    return (
      <div
        className={`markdown-preview ${isStreaming ? "streaming-cursor" : ""}`}
      >
        {renderMarkdown(markdown)}
      </div>
    );
  }

  return (
    <div
      className={`markdown-preview ${isStreaming ? "streaming-cursor" : ""} space-y-5`}
    >
      {sections.map((section, index) => {
        if (section.type === "tableSection") {
          return renderTableSection(section);
        }

        if (section.type === "page") {
          return renderPageSection(section, isStreaming);
        }

        if (section.type === "summary") {
          return renderSummarySection(section);
        }

        return renderFreeformSection(section, `freeform-${index}`);
      })}
    </div>
  );
}
