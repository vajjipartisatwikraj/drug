export type AuditSectionType = "page" | "summary" | "tableSection" | "other";

export type PageStatus = "pass" | "fail" | "void" | "na" | "unknown";

export interface AuditSection {
  type: AuditSectionType;
  title: string;
  body: string;
  pageNumber?: string;
  tableNumber?: number;
}

export function splitAuditMarkdown(markdown: string): AuditSection[] {
  const lines = markdown.split(/\r?\n/);
  const sections: AuditSection[] = [];

  let current: {
    type: AuditSectionType;
    title: string;
    bodyLines: string[];
    pageNumber?: string;
    tableNumber?: number;
  } | null = null;

  const pushCurrent = () => {
    if (!current) {
      return;
    }

    const body = current.bodyLines.join("\n").trim();
    if (current.type !== "other" || body) {
      sections.push({
        type: current.type,
        title: current.title,
        body,
        pageNumber: current.pageNumber,
        tableNumber: current.tableNumber,
      });
    }

    current = null;
  };

  for (const line of lines) {
    const normalizedLine = line
      .trim()
      .replace(/^\*+|\*+$/g, "")
      .trim();
    // Legacy + flexible: ## PAGE N, ## PAGE: N, ## PAGE N / 45, ## PAGE N - ...
    const pageMatch = normalizedLine.match(
      /^(?:#{1,6}\s*)?PAGE\s*[:\-]?\s*(\d+)(?:\s*\/\s*\d+)?(?:\s+.*)?$/i,
    );
    // Final audit summary
    const summaryMatch = /^(?:#{1,6}\s*)?FINAL\s+AUDIT\s+SUMMARY(?:\s*[:\-].*)?\s*$/i.test(
      normalizedLine,
    );
    // New structured output: ## Reasoning: Table N — Title
    const reasoningMatch = normalizedLine.match(
      /^(?:#{1,6}\s*)?Reasoning:\s+Table\s+(\d+)\s*[—:-]\s*(.*)$/i,
    );

    if (pageMatch) {
      pushCurrent();
      current = {
        type: "page",
        title: `PAGE ${pageMatch[1]}`,
        pageNumber: pageMatch[1],
        bodyLines: [],
      };
      continue;
    }

    if (summaryMatch) {
      pushCurrent();
      current = {
        type: "summary",
        title: "FINAL AUDIT SUMMARY",
        bodyLines: [],
      };
      continue;
    }

    if (reasoningMatch) {
      pushCurrent();
      const tableNum = parseInt(reasoningMatch[1], 10);
      const title = reasoningMatch[2].trim();
      current = {
        type: "tableSection",
        title,
        tableNumber: tableNum,
        bodyLines: [],
      };
      continue;
    }

    if (!current) {
      current = {
        type: "other",
        title: "",
        bodyLines: [],
      };
    }

    current.bodyLines.push(line);
  }

  pushCurrent();

  return sections;
}

export function extractSectionStatus(body: string): PageStatus {
  const normalizedBody = body.replace(/<[^>]+>/g, " ");
  const patterns = [
    /(?:^|\n)\s*(?:[-*]\s*)?\*{0,2}Status\*{0,2}(?:\s*\([^)]+\))?\s*[:\-]\s*(?:[^A-Za-z0-9\n]{0,8}\s*)?\*{0,2}(PASS|FAIL|VOIDED|VOID|N\/A|NA)\*{0,2}\b/i,
    /(?:^|\n)\s*Status(?:\s*\([^)]+\))?\s+(PASS|FAIL|VOIDED|VOID|N\/A|NA)\b/i,
    /\|\s*Status(?:\s*\([^)]+\))?\s*\|\s*(?:[^A-Za-z0-9\n]{0,3}\s*)?\*{0,2}(PASS|FAIL|VOIDED|VOID|N\/A|NA)\*{0,2}\b/i,
    /(?:^|\n)\s*(?:[-*]\s*)?\*{0,2}(PASS|FAIL|VOIDED|VOID|N\/A|NA)\*{0,2}\s*$/im,
  ];

  for (const pattern of patterns) {
    const match = normalizedBody.match(pattern);
    if (!match) continue;
    const status = match[1].toUpperCase();
    if (status === "PASS") return "pass";
    if (status === "FAIL") return "fail";
    if (status.startsWith("VOID")) return "void";
    if (status === "N/A" || status === "NA") return "na";
  }

  if (/(?:^|\n)\s*\*{0,2}Fail Reason\*{0,2}\s*:/i.test(normalizedBody)) {
    return "fail";
  }

  return "unknown";
}

export function extractFailReason(body: string): string | null {
  const normalizedBody = body.replace(/<[^>]+>/g, " ");
  const match = body.match(/(?:^|\n)\s*\*{0,2}Fail Reason:\*{0,2}\s*(.+)\s*$/i);

  if (match) {
    return match[1].trim();
  }

  const htmlMatch = normalizedBody.match(/(?:^|\n)\s*Fail Reason:\s*(.+)\s*$/i);

  return htmlMatch ? htmlMatch[1].trim() : null;
}

export function stripSectionMetadata(body: string): string {
  return body
    .replace(
      /^(?:\s*\*{0,2}Status:\*{0,2}\s*(?:PASS|FAIL|VOIDED|VOID|N\/A|NA).*?)$/gim,
      "",
    )
    .replace(/^(?:\s*\*{0,2}Fail Reason:\*{0,2}\s*.*)$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Get a human-readable table label used in the sidebar nav */
export function getTableLabel(section: AuditSection): string {
  if (section.tableNumber !== undefined) {
    return `T${section.tableNumber}`;
  }
  return section.title.slice(0, 10);
}
