/**
 * Safe, deterministic CSV report export.
 * Quoting and Excel formula protection are required for untrusted CSV text.
 */
export function csvCell(value) {
  let text = String(value ?? "");
  if (/^\s*[=+\-@\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

export function issuePresentation(item) {
  const labels = {
    TOKEN_MISMATCH: {
      title: "Formatting mismatch",
      fix: "Make sure both languages contain the same variables and markup.",
      severity: "blocking",
    },
    EMPTY_TRANSLATION: {
      title: "Missing translation",
      fix: "Add the translated text for this language.",
      severity: "blocking",
    },
    MISSING_SOURCE: {
      title: "Source text missing",
      fix: "Fill in the original source text before checking translations.",
      severity: "blocking",
    },
    DUPLICATE_KEY: {
      title: "Duplicate localization key",
      fix: "Use a unique key for every string, including capitalization variants.",
      severity: "blocking",
    },
    MISSING_KEY: {
      title: "Missing key",
      fix: "Give this string a unique localization key.",
      severity: "blocking",
    },
    ROW_WIDTH: {
      title: "Incorrect CSV column count",
      fix: "Check the number of commas and quote strings containing commas.",
      severity: "blocking",
    },
    ICU_REVIEW: {
      title: "ICU message needs review",
      fix: "Validate plural and select syntax with a dedicated ICU message tool.",
      severity: "review",
    },
  };
  return labels[item?.code] ?? {
    title: "Check this entry",
    fix: "Review this row against the source language.",
    severity: "review",
  };
}

export function exportIssuesCsv(report) {
  if (!report || !Array.isArray(report.findings)) {
    throw new TypeError("Invalid localization report");
  }
  const headings = [
    "Priority", "CSV row", "Key", "Language", "Problem",
    "Details", "Suggested fix"
  ];
  const rows = report.findings.map(item => {
    const issue = issuePresentation(item);
    return [
      issue.severity === "blocking" ? "Blocking" : "Review",
      item.row, item.key, item.locale, issue.title, item.details, issue.fix
    ];
  });
  return [headings, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
