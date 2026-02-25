export function selectTxnsForMonth(state, monthKey) {
  const out = [];
  for (const id of state.txns.allIds) {
    const t = state.txns.byId[id];
    if (t && t.monthKey === monthKey) out.push(t);
  }
  return out;
}

export function txnEffectiveLines(txn) {
  // returns lines that count toward category totals
  if (!txn.hasSplits) {
    return [
      {
        categoryId: txn.categoryId || "uncategorized",
        label: txn.label || "",
        amount: txn.amount,
      },
    ];
  }
  return txn.splits.map((s) => ({
    categoryId: s.categoryId || "uncategorized",
    label: s.label || "",
    amount: s.amount,
  }));
}

export function selectMonthSummary(state, monthKey) {
  const txns = selectTxnsForMonth(state, monthKey);

  let expenseTotal = 0;
  let incomeTotal = 0;

  const byCategory = {}; // categoryId -> netOutflow (expense adds, income subtracts)

  for (const t of txns) {
    const sign = t.typeId === "income" ? -1 : t.typeId === "expense" ? 1 : 0;

    if (t.typeId === "expense") expenseTotal += t.amount;
    if (t.typeId === "income") incomeTotal += t.amount;

    if (sign !== 0) {
      const lines = txnEffectiveLines(t);
      for (const line of lines) {
        byCategory[line.categoryId] = (byCategory[line.categoryId] || 0) + sign * line.amount;
      }
    }
  }

  // round
  expenseTotal = Math.round(expenseTotal * 100) / 100;
  incomeTotal = Math.round(incomeTotal * 100) / 100;

  for (const k of Object.keys(byCategory)) {
    byCategory[k] = Math.round(byCategory[k] * 100) / 100;
  }

  return { txns, expenseTotal, incomeTotal, byCategory };
}

export function formatMoneyUSD(n) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}
