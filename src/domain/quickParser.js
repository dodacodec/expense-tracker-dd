// src/domain/quickParser.js

function toNum(tok) {
  const n = Number(String(tok).replace(/^\$/, ""));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function buildCategoryMap(categories) {
  const map = new Map();
  for (const c of categories) {
    map.set(c.id.toLowerCase(), c.id);
    map.set(c.name.toLowerCase(), c.id);
  }
  return map;
}

export function parseQuickEntry(input, catalogs) {
  const text = String(input || "").trim();
  if (!text) return { ok: false, error: "Type something like: 6 starbucks food" };

  const tokens = text
    .replace(/\s+/g, " ")
    .split(" ")
    .map((t) => t.trim())
    .filter(Boolean);

  const categories = catalogs?.categories || [];
  const catMap = buildCategoryMap(categories);

  const splitIdx = tokens.findIndex((t) => t.toLowerCase() === "split");

  // Identify total amount:
  // - If first token is number => amount first
  // - Else if last token is number => amount last
  // - Else fail
  let amount = null;
  let amountPos = -1;

  const firstNum = toNum(tokens[0]);
  const lastNum = toNum(tokens[tokens.length - 1]);

  if (firstNum != null) {
    amount = firstNum;
    amountPos = 0;
  } else if (lastNum != null) {
    amount = lastNum;
    amountPos = tokens.length - 1;
  } else {
    return { ok: false, error: "Couldn't find an amount. Example: 6 starbucks food" };
  }

  // Determine merchant + optional category (non-split)
  // Strategy:
  // - Remove "split" portion if present for merchant/category scan
  const preSplitTokens = splitIdx >= 0 ? tokens.slice(0, splitIdx) : tokens.slice();

  // Remove the amount token from that slice
  const pre = preSplitTokens.filter((_, idx) => idx !== amountPos);

  // Find a category token anywhere in remaining pre-split tokens
  let categoryId = null;
  let categoryTokenIndex = -1;
  for (let i = 0; i < pre.length; i++) {
    const key = pre[i].toLowerCase();
    if (catMap.has(key)) {
      categoryId = catMap.get(key);
      categoryTokenIndex = i;
      break;
    }
  }

  // Merchant tokens are whatever remains excluding category token
  const merchantTokens = pre.filter((_, idx) => idx !== categoryTokenIndex);
  const merchant = merchantTokens.join(" ").trim();

  // Parse splits if "split" exists
  let hasSplits = false;
  let splits = [];

  if (splitIdx >= 0) {
    hasSplits = true;
    const after = tokens.slice(splitIdx + 1);

    // Parse pairs: <label> <amount> <label> <amount>...
    // label is single token for now (keep it simple)
    let i = 0;
    while (i < after.length) {
      const label = after[i];
      const maybeAmt = after[i + 1];
      const a = toNum(maybeAmt);

      if (!label || a == null) break;

      // Allow category keyword as label too (e.g., gas 40)
      // and treat label as the split label; category defaults to uncategorized unless it matches category list
      const key = label.toLowerCase();
      const splitCat = catMap.get(key) || "uncategorized";

      splits.push({
        id: `sp_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36)}`,
        categoryId: splitCat,
        label: catMap.has(key) ? "" : label, // if label matches category, keep label blank
        amount: a.toFixed(2),
      });

      i += 2;
    }
  }

  // If no merchant was detected, default to blank; category defaults uncategorized
  if (!categoryId) categoryId = "uncategorized";

  // Build patch for draft
  const patch = {
    merchant,
    amount: amount.toFixed(2),
    categoryId,
    label: "",
    hasSplits,
    splits,
  };

  return { ok: true, patch };
}
