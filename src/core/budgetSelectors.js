function startOfWeekMonday(isoDate) {
  const [y, m, d] = String(isoDate || "").split("-").map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d);
  const day = date.getDay(); // 0 Sun ... 6 Sat
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfWeekMonday(isoDate) {
  const start = startOfWeekMonday(isoDate);
  if (!start) return null;
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

function parseISODate(isoDate) {
  const [y, m, d] = String(isoDate || "").split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function detectTypeIds(catalogs) {
  const txnTypes = catalogs?.txnTypes || [];
  let transferId = null;
  let incomeId = null;
  let expenseId = null;

  for (const t of txnTypes) {
    const id = String(t.id || "").toLowerCase();
    const name = String(t.name || "").toLowerCase();

    if (!transferId && (name.includes("transfer") || id === "transfer")) transferId = t.id;
    if (!incomeId && (name.includes("income") || name.includes("refund") || id === "income")) incomeId = t.id;
    if (!expenseId && (name.includes("expense") || id === "expense")) expenseId = t.id;
  }

  return { transferId, incomeId, expenseId };
}

function isSpendTxn(txn, typeIds) {
  if (!txn) return false;
  if (typeIds.transferId && txn.typeId === typeIds.transferId) return false;
  if (typeIds.incomeId && txn.typeId === typeIds.incomeId) return false;
  if (!typeIds.incomeId && txn.typeId === "income") return false;
  if (typeIds.expenseId) return txn.typeId === typeIds.expenseId;
  return txn.typeId !== "transfer";
}

function effectiveLines(txn) {
  if (!txn.hasSplits) {
    return [{ categoryId: txn.categoryId || "uncategorized", amount: Number(txn.amount) || 0 }];
  }

  return (txn.splits || []).map((s) => ({
    categoryId: s.categoryId || "uncategorized",
    amount: Number(s.amount) || 0,
  }));
}

function spendByCategoryFromTxns(state, predicate) {
  const byCategory = {};
  const byId = state.txns?.byId || {};
  const allIds = state.txns?.allIds || [];
  const typeIds = detectTypeIds(state.catalogs);

  for (const id of allIds) {
    const txn = byId[id];
    if (!txn) continue;
    if (!predicate(txn)) continue;
    if (!isSpendTxn(txn, typeIds)) continue;

    const lines = effectiveLines(txn);
    for (const line of lines) {
      byCategory[line.categoryId] = (byCategory[line.categoryId] || 0) + line.amount;
    }
  }

  for (const key of Object.keys(byCategory)) {
    byCategory[key] = Math.round(byCategory[key] * 100) / 100;
  }

  return byCategory;
}

export function selectSpendByCategoryForMonth(state, monthKey) {
  return spendByCategoryFromTxns(state, (txn) => txn.monthKey === monthKey);
}

export function selectSpendByCategoryForCurrentWeek(state, todayISO) {
  const start = startOfWeekMonday(todayISO);
  const end = endOfWeekMonday(todayISO);
  if (!start || !end) return {};

  return spendByCategoryFromTxns(state, (txn) => {
    const d = parseISODate(txn.dateISO);
    if (!d) return false;
    return d >= start && d <= end;
  });
}

export function budgetStatus(spent, cap, thresholds = { warn: 0.8, hard: 1.0 }) {
  const nCap = Number(cap);
  const nSpent = Number(spent) || 0;

  if (!Number.isFinite(nCap) || nCap <= 0) {
    return { pct: 0, status: "none" };
  }

  const pct = nSpent / nCap;
  if (pct >= (thresholds.hard ?? 1.0)) return { pct, status: "over" };
  if (pct >= (thresholds.warn ?? 0.8)) return { pct, status: "warn" };
  return { pct, status: "ok" };
}
