import { newId } from "../utils/id.js";

export function isoToday() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function monthKeyFromISO(isoDate) {
  // isoDate: YYYY-MM-DD
  return isoDate.slice(0, 7);
}

export function normalizeAmount(input) {
  // user may type 38.50 or -38.50 — we normalize depending on txn type later.
  const n = Number(String(input).replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

export function buildNewTxnDraft(defaults = {}) {
  return {
    typeId: "expense",
    accountId: "bofa_cc",
    dateISO: isoToday(),
    merchant: "",
    note: "",
    amount: "",
    hasSplits: false,
    categoryId: "uncategorized",
    label: "",
    splits: [],
    ...defaults,
  };
}

export function addSplitRow(draft) {
  const next = structuredClone(draft);
  next.splits.push({
    id: newId("sp"),
    categoryId: "uncategorized",
    label: "",
    amount: "",
  });
  return next;
}

export function removeSplitRow(draft, splitId) {
  const next = structuredClone(draft);
  next.splits = next.splits.filter((s) => s.id !== splitId);
  return next;
}

export function computeSplitSum(draft) {
  let sum = 0;
  for (const s of draft.splits) {
    const a = normalizeAmount(s.amount);
    if (a != null) sum += a;
  }
  return Math.round(sum * 100) / 100;
}

export function validateDraft(draft) {
  const errors = {};

  const amt = normalizeAmount(draft.amount);
  if (amt == null || amt === 0) errors.amount = "Enter a valid amount.";

  if (!draft.dateISO || !/^\d{4}-\d{2}-\d{2}$/.test(draft.dateISO)) {
    errors.dateISO = "Date must be YYYY-MM-DD.";
  }

  if (!draft.typeId) errors.typeId = "Pick a type.";
  if (!draft.accountId) errors.accountId = "Pick an account.";

  if (draft.hasSplits) {
    if (draft.splits.length === 0) errors.splits = "Add at least one split.";
    // validate split fields
    for (const s of draft.splits) {
      const sa = normalizeAmount(s.amount);
      if (sa == null || sa <= 0) {
        errors[`split_${s.id}_amount`] = "Split amount must be > 0.";
      }
    }
    // sum must equal parent amount for expense/income (not required for transfer, but we can still enforce)
    if (amt != null) {
      const sum = computeSplitSum(draft);
      const diff = Math.round((amt - sum) * 100) / 100;
      if (diff !== 0) errors.splitsSum = `Splits must equal total. Remaining: ${diff.toFixed(2)}`;
    }
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

export function draftToTxn(draft) {
  const amt = normalizeAmount(draft.amount);
  if (amt == null) throw new Error("Invalid amount");

  // Store amount as positive for expense and income; transfers positive.
  // For summaries, we treat expense as outflow, income as inflow.
  const txn = {
    id: newId("txn"),
    typeId: draft.typeId,
    accountId: draft.accountId,
    dateISO: draft.dateISO,
    monthKey: monthKeyFromISO(draft.dateISO),
    merchant: draft.merchant.trim(),
    note: draft.note.trim(),
    amount: Math.abs(amt),
    hasSplits: !!draft.hasSplits,
    categoryId: draft.hasSplits ? null : draft.categoryId,
    label: draft.hasSplits ? "" : (draft.label || "").trim(),
    splits: [],
    createdAt: Date.now(),
  };

  if (draft.hasSplits) {
    txn.splits = draft.splits.map((s) => ({
      id: s.id,
      categoryId: s.categoryId,
      label: (s.label || "").trim(),
      amount: Math.abs(normalizeAmount(s.amount) ?? 0),
    }));
  }

  return txn;
}
