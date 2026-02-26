// src/domain/csvExport.js

function esc(v) {
  const s = v == null ? "" : String(v);
  // Escape quotes; wrap in quotes if contains comma/newline/quote
  const needs = /[",\n\r]/.test(s);
  const out = s.replace(/"/g, '""');
  return needs ? `"${out}"` : out;
}

function fmt2(n) {
  if (n == null || n === "") return "";
  const num = Number(n);
  if (!Number.isFinite(num)) return "";
  return num.toFixed(2);
}

function monthOf(dateISO) {
  // expects YYYY-MM-DD
  return (dateISO || "").slice(0, 7);
}

export function buildCsv({ state, scope = "month" }) {
  const catalogs = state.catalogs || { accounts: [], txnTypes: [], categories: [] };
  const byId = state.txns?.byId || {};
  const allIds = state.txns?.allIds || [];
  const activeMonth = state.settings?.activeMonth || "";

  const accountName = new Map((catalogs.accounts || []).map((a) => [a.id, a.name]));
  const typeName = new Map((catalogs.txnTypes || []).map((t) => [t.id, t.name]));
  const catName = new Map((catalogs.categories || []).map((c) => [c.id, c.name]));

  const rows = [];
  const header = [
    "rowType",          // PARENT | SPLIT
    "txnId",
    "parentTxnId",
    "postedDate",
    "month",
    "account",
    "type",
    "merchant",
    "parentAmount",
    "category",
    "label",
    "splitAmount",
    "note",
    "createdAt"
  ];
  rows.push(header);

  // newest first (matches UI)
  for (const id of allIds) {
    const t = byId[id];
    if (!t) continue;

    if (scope === "month" && activeMonth) {
      if (monthOf(t.dateISO) !== activeMonth) continue;
    }

    const acct = accountName.get(t.accountId) || t.accountId || "";
    const typ = typeName.get(t.typeId) || t.typeId || "";
    const merch = (t.merchant || "").trim();
    const m = monthOf(t.dateISO);

    const hasSplits = !!t.hasSplits && Array.isArray(t.splits) && t.splits.length > 0;

    // PARENT row (total goes here)
    rows.push([
      "PARENT",
      t.id,
      "",
      t.dateISO || "",
      m,
      acct,
      typ,
      merch,
      fmt2(t.amount),
      hasSplits ? "" : (catName.get(t.categoryId) || t.categoryId || ""),
      hasSplits ? "" : (t.label || ""),
      "",
      t.note || "",
      t.createdAt || ""
    ]);

    // SPLIT rows (detail goes here)
    if (hasSplits) {
      for (const s of t.splits) {
        rows.push([
          "SPLIT",
          s.id || "",
          t.id,
          t.dateISO || "",
          m,
          acct,
          typ,
          merch,
          "", // blank to avoid double-count
          catName.get(s.categoryId) || s.categoryId || "",
          s.label || "",
          fmt2(s.amount),
          t.note || "",
          t.createdAt || ""
        ]);
      }
    }
  }

  return rows.map((r) => r.map(esc).join(",")).join("\n");
}

export function downloadCsv({ csvText, filename = "expenses.csv" }) {
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
