/**
 * ForgeFrame Labs Localization QA — deterministic CSV validator.
 * No network access, dependency imports or persistent storage.
 * Rows: key,en,pl,de,... (source locale may be changed by caller).
 */
export function parseCsv(input) {
  if (typeof input !== "string") throw new TypeError("CSV input must be text");
  const text = input.replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  let afterQuote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else { quoted = false; afterQuote = true; }
      } else { cell += c; }
      continue;
    }
    if (afterQuote) {
      if (c === ",") { row.push(cell); cell = ""; afterQuote = false; continue; }
      if (c === "\r" || c === "\n") {
        row.push(cell); rows.push(row); row = []; cell = ""; afterQuote = false;
        if (c === "\r" && text[i + 1] === "\n") i++;
        continue;
      }
      if (c === " " || c === "\t") continue;
      throw new Error("Unexpected character after quoted CSV cell (character " + (i + 1) + ")");
    }
    if (c === '"') {
      if (cell.length !== 0) throw new Error("Quote inside unquoted CSV cell (character " + (i + 1) + ")");
      quoted = true;
    } else if (c === ",") {
      row.push(cell); cell = "";
    } else if (c === "\r" || c === "\n") {
      row.push(cell); rows.push(row); row = []; cell = "";
      if (c === "\r" && text[i + 1] === "\n") i++;
    } else { cell += c; }
  }
  if (quoted) throw new Error("Unterminated quoted CSV cell");
  if (afterQuote || cell !== "" || row.length > 0) { row.push(cell); rows.push(row); }
  return rows;
}

const COUNT = (a) => {
  const m = new Map();
  for (const x of a) m.set(x, (m.get(x) ?? 0) + 1);
  return m;
};
function signature(text) {
  const named = [...text.matchAll(/\{([a-zA-Z_][a-zA-Z0-9_.]*)\}/g)].map(x => "{" + x[1] + "}");
  const printf = [];
  for (const m of text.matchAll(/%%|%(?:([1-9][0-9]*)\$)?(?:[-+0 #]*)?(?:[0-9]+)?(?:\.[0-9]+)?([sdif])/g)) {
    if (m[0] === "%%") continue;
    printf.push("%" + (m[1] ? m[1] + "$" : "") + m[2]);
  }
  const tags = [...text.matchAll(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g)].map(m => (m[0].startsWith("</") ? "</" : "<") + m[1].toLowerCase() + ">");
  return COUNT([...named,...printf,...tags]);
}
function signatureDiff(base, target) {
  const keys = [...new Set([...base.keys(),...target.keys()])].sort();
  return keys.filter(k => base.get(k) !== target.get(k))
    .map(k => ({token:k,source:base.get(k) ?? 0,translation:target.get(k) ?? 0}));
}

/**
 * @returns {{summary: object, findings: Array<object>, locales: string[]}}
 */
export function inspectLocalizationCsv(raw, options = {}) {
  const sourceLocale = String(options.sourceLocale || "en").trim();
  if (!/^[a-z]{2,3}(?:-[A-Za-z0-9]+)*$/.test(sourceLocale)) {
    throw new Error("Invalid source locale");
  }
  const rows = parseCsv(raw);
  if (!rows.length) throw new Error("Empty CSV");
  const headers = rows[0].map(x => x.trim());
  if (!headers.length || headers[0].toLowerCase() !== "key") throw new Error("First column must be 'key'");
  if (headers.some(h => !h)) throw new Error("Empty column header");
  if (new Set(headers.map(h => h.toLowerCase())).size !== headers.length) throw new Error("Duplicate CSV column header");
  const src = headers.findIndex(h => h.toLowerCase() === sourceLocale.toLowerCase());
  if (src < 1) throw new Error("Source locale column '" + sourceLocale + "' not found");
  if (headers.length < 3) throw new Error("CSV needs one source and at least one target locale");
  const languages = headers.slice(1).filter(h => h.toLowerCase() !== sourceLocale.toLowerCase());
  const found = [];
  const observed = new Map();
  let validRowCount = 0;
  function add(row, key, locale, code, details) {
    found.push({row,key,locale,code,details});
  }
  for (let i = 1; i < rows.length; i++) {
    const rowNo = i + 1;
    const row = rows[i];
    if (row.length === 1 && !row[0].trim()) continue;
    const key = (row[0] || "").trim();
    if (row.length !== headers.length) {
      add(rowNo,key,"", "ROW_WIDTH", "Expected " + headers.length + " cells, found " + row.length);
      continue;
    }
    validRowCount++;
    if (!key) add(rowNo,"","key","MISSING_KEY","Localization key is empty");
    else if (observed.has(key.toLowerCase()))
      add(rowNo,key,"key","DUPLICATE_KEY","Also found on row " + observed.get(key.toLowerCase()));
    else observed.set(key.toLowerCase(),rowNo);
    const base = row[src];
    if (!base.trim()) {
      add(rowNo,key,sourceLocale,"MISSING_SOURCE","Source locale value is empty");
      continue;
    }
    const bSig = signature(base);
    for (let col=1; col<headers.length; col++) {
      if (col===src) continue;
      const value=row[col];
      const locale=headers[col];
      if (!value.trim()) {
        add(rowNo,key,locale,"EMPTY_TRANSLATION","Missing translated string");
        continue;
      }
      const diff=signatureDiff(bSig,signature(value));
      if (diff.length) add(rowNo,key,locale,"TOKEN_MISMATCH",
        diff.map(x=>x.token+" ("+x.source+" → "+x.translation+")").join(", "));
      if (/\{[^{}]+,\s*(plural|select|selectordinal)\b/.test(base+value))
        add(rowNo,key,locale,"ICU_REVIEW","ICU message syntax requires a dedicated ICU parser");
    }
  }
  const counts={};
  for(const f of found) counts[f.code]=(counts[f.code]||0)+1;
  return {
    summary:{totalRows:rows.length-1,parsedRows:validRowCount,uniqueKeys:observed.size,
      findings:found.length,counts,sourceLocale},
    locales:languages,
    findings:found
  };
}
