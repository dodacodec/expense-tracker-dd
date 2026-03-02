import { ACTIONS } from "../core/reducer.js";
import { validateDraft, draftToTxn, computeSplitSum, isoToday } from "../domain/expenseModel.js";
import { selectMonthSummary, formatMoneyUSD } from "../core/selectors.js";
import { selectSpendByCategoryForMonth, selectSpendByCategoryForCurrentWeek, budgetStatus } from "../core/budgetSelectors.js";
import { parseQuickEntry } from "../domain/quickParser.js";
import { buildCsv, downloadCsv } from "../domain/csvExport.js";

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (v === true) node.setAttribute(k, "");
    else if (v !== false && v != null) node.setAttribute(k, String(v));
  }
  for (const child of children) {
    if (child == null) continue;
    node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

function optionList(items, selectedId) {
  return items.map((x) =>
    el("option", { value: x.id, selected: x.id === selectedId }, [x.name])
  );
}

function renderDraftErrors(errors) {
  const msgs = Object.values(errors || {});
  if (!msgs.length) return null;
  return el("div", { class: "small bad" }, [msgs[0]]);
}

export function mountApp({ root, store }) {
  const unsubscribe = store.subscribe(() => render());

  function patchDraft(patch) {
    store.dispatch({ type: ACTIONS.DRAFT_PATCH, payload: patch });
  }

  function onSubmit(e) {
    e.preventDefault();
    const state = store.getState();
    const draft = state.ui.draft;

    const res = validateDraft(draft);
    store.dispatch({ type: ACTIONS.SET_ERRORS, payload: res.errors });

    if (!res.ok) return;

    const txn = draftToTxn(draft);
    store.dispatch({ type: ACTIONS.ADD_TXN, payload: txn });
    store.dispatch({ type: ACTIONS.DRAFT_RESET, payload: { nowISO: draft.dateISO } });
  }

  function onDeleteTxn(id) {
    if (!confirm("Delete this transaction?")) return;
    store.dispatch({ type: ACTIONS.DELETE_TXN, payload: id });
  }

  function render() {
    const state = store.getState();
    const { accounts, txnTypes, categories } = state.catalogs;

    const recentMerchants = [];
    const seen = new Set();
    for (const id of state.txns.allIds) {
     const t = state.txns.byId[id];
     const m = (t?.merchant || "").trim();
     if (!m) continue;
     const key = m.toLowerCase();
     if (seen.has(key)) continue;
     seen.add(key);
     recentMerchants.push(m);
     if (recentMerchants.length >= 20) break;
    }

    const monthKey = state.settings.activeMonth;
    const summary = selectMonthSummary(state, monthKey);
    const todayISO = isoToday();
    const monthSpend = selectSpendByCategoryForMonth(state, monthKey);
    const weekSpend = selectSpendByCategoryForCurrentWeek(state, todayISO);
    const budgets = state.settings.budgets || { thresholds: { warn: 0.8, hard: 1.0 }, monthly: {}, weekly: {} };

    const merchantDatalist = el("datalist", { id: "merchant-list" }, 
    recentMerchants.map((m) => el("option", { value: m }, []))
    );

    const draft = state.ui.draft;
    const errors = state.ui.errors;
    const storageStatus = state.ui.storageStatus;
    const panels = state.ui.panels || { budgetsOpen: false, netOutflowOpen: false };
    const quickAddExamplesOpen = !!state.ui.quickAddExamplesOpen;
    const toast = state.ui.toast || { message: null, kind: null };

    const splitSum = draft.hasSplits ? computeSplitSum(draft) : 0;
    const totalAmt = Number(String(draft.amount).replace(/[^0-9.-]/g, "")) || 0;
    const remaining = draft.hasSplits ? Math.round((totalAmt - splitSum) * 100) / 100 : 0;

    const header = el("div", { class: "card" }, [
      el("div", { class: "kpi" }, [
        el("div", {}, [
          el("div", { class: "small" }, ["Active Month"]),
          el("div", { class: "value mono" }, [monthKey]),
        ]),
        el("div", {}, [
          el("div", { class: "small" }, ["Spend (month)"]),
          el("div", { class: "value" }, [formatMoneyUSD(summary.expenseTotal)]),
        ]),
      ]),
      el("div", { class: "row cols-2", style: "margin-top:10px" }, [
        el("div", {}, [
          el("label", {}, ["Month"]),
          el(
            "input",
            {
              type: "month",
              value: monthKey,
              onchange: (e) => store.dispatch({ type: ACTIONS.SET_ACTIVE_MONTH, payload: e.target.value }),
            },
            []
          ),

          el("div", { class: "small" }, [""]),
        ]),
        el("div", {}, [
          el("label", {}, [""]),
          el("div", { class: "pill" }, [
            `Income: ${formatMoneyUSD(summary.incomeTotal)} · Net outflow: ${formatMoneyUSD(summary.expenseTotal - summary.incomeTotal)}`
          ]),
        ]),
      ]),
    ]);

    const toolsCard = el("div", { class: "card" }, [
      el("div", { class: "kpi" }, [
        el("div", { class: "item-title" }, ["Tools"]),
        toast.message
          ? el("div", { class: `pill tools-status ${toast.kind === "warn" ? "tools-status-warn" : "tools-status-ok"}` }, [toast.message])
          : el("div", { class: "small" }, ["Actions for this month"]),
      ]),
      el(
        "button",
        {
          type: "button",
          class: "secondary",
          style: "margin-top:10px",
          onclick: () => {
            try {
              const s = store.getState();
              const csvText = buildCsv({ state: s, scope: "month" });
              const month = s.settings?.activeMonth || "all";
              downloadCsv({
                csvText,
                filename: `expenses_${month}.csv`,
              });
              store.dispatch({ type: ACTIONS.SHOW_TOAST, payload: { message: "CSV exported ✓", kind: "ok" } });
            } catch (err) {
              console.warn("Export failed:", err);
              store.dispatch({ type: ACTIONS.SHOW_TOAST, payload: { message: "Export failed", kind: "warn" } });
            }

            clearTimeout(mountApp.__toastTimer);
            mountApp.__toastTimer = setTimeout(() => {
              store.dispatch({ type: ACTIONS.CLEAR_TOAST });
            }, 1700);
          },
        },
        ["Export CSV"]
      ),
    ]);

    const budgetsContent = el("div", { class: "list", style: "margin-top:10px" }, [
      ...categories.map((cat) => {
        const monthlyCap = budgets.monthly?.[cat.id] ?? "";
        const weeklyCap = budgets.weekly?.[cat.id] ?? "";
        const monthlySpent = monthSpend[cat.id] || 0;
        const weeklySpent = weekSpend[cat.id] || 0;

        const mStatus = budgetStatus(monthlySpent, monthlyCap, budgets.thresholds);
        const wStatus = budgetStatus(weeklySpent, weeklyCap, budgets.thresholds);
        const rowStatus = mStatus.status === "over" || wStatus.status === "over"
          ? "over"
          : (mStatus.status === "warn" || wStatus.status === "warn" ? "warn" : "ok");

        const leftMonthly = Number(monthlyCap) > 0 ? Number(monthlyCap) - monthlySpent : null;
        const leftWeekly = Number(weeklyCap) > 0 ? Number(weeklyCap) - weeklySpent : null;

        const rowClass = `budget-row ${rowStatus === "warn" ? "budget-row-warn" : rowStatus === "over" ? "budget-row-over" : ""}`;
        const pillClass = `pill ${rowStatus === "warn" ? "warn" : rowStatus === "over" ? "bad" : "good"}`;
        const pillText = rowStatus === "over" ? "OVER" : rowStatus === "warn" ? "Approaching" : "OK";
        const isOpen = mountApp.__budgetOpenCategoryId === cat.id;

        return el("div", { class: rowClass }, [
          el("button", {
            type: "button",
            class: "budget-row-head",
            onclick: () => {
              mountApp.__budgetOpenCategoryId = isOpen ? null : cat.id;
              render();
            },
          }, [
            el("div", { class: "item-title" }, [cat.name]),
            el("div", { class: "budget-row-right" }, [
              el("span", { class: pillClass }, [pillText]),
              el("span", { class: "small mono" }, [`M: ${leftMonthly == null ? "—" : formatMoneyUSD(leftMonthly)}`]),
              el("span", { class: "small mono" }, [`W: ${leftWeekly == null ? "—" : formatMoneyUSD(leftWeekly)}`]),
            ]),
          ]),
          isOpen
            ? el("div", { class: "budget-row-details" }, [
                el("div", { class: "row cols-2" }, [
                  el("div", {}, [
                    el("label", {}, ["Monthly cap"]),
                    el("input", {
                      inputmode: "decimal",
                      placeholder: "e.g., 200",
                      value: monthlyCap,
                      oninput: (e) => {
                        const val = e.target.value;
                        const normalized = val === "" ? "" : (Number(String(val).replace(/[^0-9.]/g, "")) || 0);
                        store.dispatch({
                          type: ACTIONS.SET_BUDGETS,
                          payload: { monthly: { [cat.id]: normalized } },
                        });
                      },
                    }),
                  ]),
                  el("div", {}, [
                    el("label", {}, ["Weekly cap"]),
                    el("input", {
                      inputmode: "decimal",
                      placeholder: "e.g., 60",
                      value: weeklyCap,
                      oninput: (e) => {
                        const val = e.target.value;
                        const normalized = val === "" ? "" : (Number(String(val).replace(/[^0-9.]/g, "")) || 0);
                        store.dispatch({
                          type: ACTIONS.SET_BUDGETS,
                          payload: { weekly: { [cat.id]: normalized } },
                        });
                      },
                    }),
                  ]),
                ]),
                el("button", {
                  type: "button",
                  class: "secondary",
                  style: "margin-top:8px",
                  onclick: () => {
                    mountApp.__budgetOpenCategoryId = null;
                    render();
                  },
                }, ["Done"]),
              ])
            : null,
        ]);
      }),
    ]);

    const budgetsPanel = el("div", { class: "card" }, [
      el("button", {
        type: "button",
        class: "collapsible-head",
        onclick: () => store.dispatch({ type: ACTIONS.UI_TOGGLE_PANEL, payload: { key: "budgetsOpen" } }),
      }, [
        el("span", { class: "item-title" }, ["Budgets"]),
        el("span", { class: "small mono" }, [panels.budgetsOpen ? "▼" : "▶"]),
      ]),
      panels.budgetsOpen ? budgetsContent : null,
    ]);

    const form = el("form", { class: "card", onsubmit: onSubmit }, [
      el("div", { class: "kpi" }, [
        el("div", { class: "item-title" }, ["Add transaction"]),
        el("div", { class: "small" }, [""]),
      ]),

      // Quick Add (parser)
      el("div", { class: "row cols-2", style: "margin-top:10px" }, [
        el("div", {}, [
          el("label", {}, ["Quick add"]),
          el("input", {
            id: "quick-add",
            placeholder: "Ex: 6 starbucks food  |  60 costco split gas 40 incense 20",
            onkeydown: (e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              const catalogs = store.getState().catalogs;
              const res = parseQuickEntry(e.target.value, catalogs);
              if (!res.ok) {
                store.dispatch({ type: ACTIONS.SET_ERRORS, payload: { quick: res.error } });
                return;
              }
              store.dispatch({ type: ACTIONS.DRAFT_SET, payload: res.patch });              
              // iOS: remove focus to avoid staying zoomed
              if (document.activeElement && typeof document.activeElement.blur === "function") {
                document.activeElement.blur();
              }
            },
          }),
          errors.quick ? renderDraftErrors({ quick: errors.quick }) : null,
          el("div", { class: "quick-helper-row" }, [
            el("div", { class: "small" }, ["Use 'split' then pairs like: gas 40 snacks 20"]),
            el("div", { class: "quick-examples-wrap" }, [
              el("button", {
                type: "button",
                class: "quick-examples-link",
                onmousedown: (e) => e.preventDefault(),
                onclick: (e) => {
                  e.stopPropagation();
                  store.dispatch({ type: ACTIONS.UI_TOGGLE_QUICK_ADD_EXAMPLES });
                },
              }, ["Examples"]),
              quickAddExamplesOpen
                ? el("div", { class: "quick-examples-tip", onclick: (e) => e.stopPropagation() }, [
                    el("div", { class: "mono small" }, ['"6 starbucks food"']),
                    el("div", { class: "mono small" }, ['"40 wawa split 10 coffee 30 gas"']),
                    el("div", { class: "mono small" }, ['"60 costco split gas 40 snacks 20"']),
                    el("div", { class: "mono small" }, ['"23 amazon house parts"']),
                  ])
                : null,
            ]),
          ]),
        ]),
        el("div", {}, [
          el(
            "button",
            {
              type: "button",
              class: "primary",
              onclick: () => {
                const input = document.getElementById("quick-add");
                const catalogs = store.getState().catalogs;
                const res = parseQuickEntry(input?.value || "", catalogs);
                if (!res.ok) {
                  store.dispatch({ type: ACTIONS.SET_ERRORS, payload: { quick: res.error } });
                  return;
                }
                store.dispatch({ type: ACTIONS.DRAFT_SET, payload: res.patch });

                // iOS: remove focus to avoid staying zoomed
                if (document.activeElement && typeof document.activeElement.blur === "function") {
                  document.activeElement.blur();
                }

                // 👇 ADD THIS RIGHT HERE
                const saveBtn = document.getElementById("btn-save");
                if (saveBtn) {
                  saveBtn.scrollIntoView({ behavior: "smooth", block: "center" });
                }
                
              },
            },
            ["Parse → Fill form"]
          ),
          el("div", { class: "small", style: "margin-top:8px" }, [""]),
        ]),
      ]),

      el("div", { class: "row cols-3", style: "margin-top:10px" }, [
        el("div", {}, [
          el("label", {}, ["Type"]),
          el("select", { onchange: (e) => patchDraft({ typeId: e.target.value }), value: draft.typeId }, [
            ...optionList(txnTypes, draft.typeId),
          ]),
        ]),
        el("div", {}, [
          el("label", {}, ["Account"]),
          el("select", { onchange: (e) => patchDraft({ accountId: e.target.value }), value: draft.accountId || "" }, [
            el("option", { value: "" }, ["Select account…"]),
            ...optionList(accounts, draft.accountId),
          ]),
          errors.accountId ? renderDraftErrors({ account: errors.accountId }) : null,
        ]),
        el("div", {}, [
          el("label", {}, ["Posted date"]),
          el("input", {
            id: "draft-date",
            type: "date",
            value: draft.dateISO,
            onchange: (e) => patchDraft({ dateISO: e.target.value }),
          }),
          errors.dateISO ? renderDraftErrors({ date: errors.dateISO }) : null,
        ]),
      ]),

      el("div", { class: "row cols-2", style: "margin-top:10px" }, [
      // Merchant
      el("div", {}, [
        merchantDatalist,
        el("label", {}, ["Merchant (optional)"]),
        el("input", {
          id: "draft-merchant",
          list: "merchant-list",
          placeholder: "e.g., Racetrack, Aldi, Amazon",
          value: draft.merchant,
          oninput: (e) => patchDraft({ merchant: e.target.value }),
        }),
      ]),

      // Parent Total Amount (THIS is the missing one)
      el("div", {}, [
        el("label", {}, ["Total amount"]),
        el("input", {
          id: "draft-amount",
          inputmode: "decimal",
          placeholder: "e.g., 38.50",
          value: draft.amount,
          oninput: (e) => patchDraft({ amount: e.target.value }),
        }),
        errors.amount ? renderDraftErrors({ amount: errors.amount }) : null,
      ]),
    ]),

el("div", { class: "row cols-2", style: "margin-top:10px" }, [
  el("div", {}, [
    el("label", {}, ["Note (optional)"]),
    el("textarea", {
      id: "draft-note",
      placeholder: "Any context you’ll want later…",
      value: draft.note,
      oninput: (e) => patchDraft({ note: e.target.value }),
    }),
  ]),
  el("div", {}, [
    // You can leave this empty (keeps layout aligned) or put something later
  ]),
]),

el("div", { class: "row cols-2", style: "margin-top:10px" }, [
  el("div", {}, [
    el("div", { class: "pill mono" }, [
      draft.hasSplits
        ? `Split sum: ${splitSum.toFixed(2)} · Remaining: ${remaining.toFixed(2)}`
        : "Splits: none",
    ]),
    errors.splitsSum ? renderDraftErrors({ splitsSum: errors.splitsSum }) : null,
    errors.splits ? renderDraftErrors({ splits: errors.splits }) : null,
  ]),
  el("div", {}, [
    el(
      "button",
      {
        type: "button",
        class: "primary",
        onclick: () => {
          // Use latest state at click-time
          const curDraft = store.getState().ui.draft;

          // Enter split mode if not already
          if (!curDraft.hasSplits) patchDraft({ hasSplits: true });

          // If we're entering split mode (or there are no rows yet), start with 2 rows
          const shouldCreateTwo = !curDraft.hasSplits || (curDraft.splits?.length ?? 0) === 0;

          store.dispatch({ type: ACTIONS.DRAFT_ADD_SPLIT });
          if (shouldCreateTwo) store.dispatch({ type: ACTIONS.DRAFT_ADD_SPLIT });
        },
      },
      ["+ Add split"]
    ),
  ]),
]),

      !draft.hasSplits
        ? el("div", { class: "row cols-2", style: "margin-top:10px" }, [
            el("div", {}, [
              el("label", {}, ["Category"]),
              el("select", {
                id: "draft-category",
                onchange: (e) => patchDraft({ categoryId: e.target.value }), value: draft.categoryId }, [
                ...optionList(categories, draft.categoryId),
              ]),
            ]),
            el("div", {}, [
              el("label", {}, ["Label / Subcategory (optional)"]),
              el("input", {
                id: "draft-label",
                placeholder: "e.g., Snacks, Food, Dog treats, Parts",
                value: draft.label,
                oninput: (e) => patchDraft({ label: e.target.value }),
              }),
            ]),
          ])
        : el("div", { class: "split-box" }, [          
            ...draft.splits.map((s) =>
              el("div", { class: "split-row" }, [
                el("div", {}, [
                  el("label", {}, ["Category"]),
                  el("select", {
                    onchange: (e) => {
                      const curSplits = store.getState().ui.draft.splits;
                      const nextSplits = curSplits.map((x) =>
                        x.id === s.id ? { ...x, categoryId: e.target.value } : x
                      );
                      patchDraft({ splits: nextSplits });
                    },
                    value: s.categoryId,
                  }, [...optionList(categories, s.categoryId)]),
                ]),
                el("div", {}, [
                  el("label", {}, ["Label"]),
                  el("input", {
                    placeholder: "Gas / Snacks / Parts",
                    value: s.label,
                    oninput: (e) => {
                      const curSplits = store.getState().ui.draft.splits;
                      const nextSplits = curSplits.map((x) =>
                        x.id === s.id ? { ...x, label: e.target.value } : x
                      );
                      patchDraft({ splits: nextSplits });
                    },
                  }),
                ]),
                el("div", {}, [
                  el("label", {}, ["Amount"]),
                  el("input", {
                    id: `split-amount-${s.id}`,
                    inputmode: "decimal",
                    placeholder: "e.g., 22.00",
                    value: s.amount,
                    oninput: (e) => {
                      const curSplits = store.getState().ui.draft.splits;
                      const nextSplits = curSplits.map((x) =>
                        x.id === s.id ? { ...x, amount: e.target.value } : x
                      );
                      patchDraft({ splits: nextSplits });
                    },
                  }),
                ]),
                el(
                  "button",
                  { type: "button", class: "danger del", onclick: () => store.dispatch({ type: ACTIONS.DRAFT_REMOVE_SPLIT, payload: s.id }) },
                  ["Remove"]
                ),
              ])
            ),
          ]),

      el("div", { class: "row cols-2", style: "margin-top:10px" }, [
        el("button", { id: "btn-save", type: "submit", class: "primary"}, ["Save transaction"]),
        el("button", { type: "button", onclick: () => store.dispatch({ type: ACTIONS.DRAFT_RESET, payload: { nowISO: draft.dateISO } }) }, ["Reset form"]),
      ]),
    ]);

    // Category breakdown
    const breakdownEntries = Object.entries(summary.byCategory)
      .filter(([, v]) => v !== 0)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));

    const breakdown = el("div", { class: "card" }, [
      el("div", { class: "kpi" }, [
        el("div", { class: "item-title" }, ["Category breakdown (net outflow)"]),
        el("div", { class: "small" }, ["Expenses add, income subtracts. Transfers ignored."]),
      ]),
      el("div", { class: "list", style: "margin-top:10px" }, [
        ...(breakdownEntries.length
          ? breakdownEntries.map(([catId, val]) => {
              const catName = categories.find((c) => c.id === catId)?.name || catId;
              return el("div", { class: "item" }, [
                el("div", { class: "item-top" }, [
                  el("div", { class: "item-title" }, [catName]),
                  el("div", { class: `mono ${val > 0 ? "" : "good"}` }, [formatMoneyUSD(val)]),
                ]),
              ]);
            })
          : [el("div", { class: "small" }, ["No categorized activity for this month yet."])])
      ]),
    ]);

    const list = el("div", { class: "card" }, [
      el("div", { class: "kpi" }, [
        el("div", { class: "item-title" }, ["Transactions"]),
        el("div", { class: "small" }, [`${summary.txns.length} in ${monthKey}`]),
      ]),
      el("div", { class: "list", style: "margin-top:10px" }, [
        ...(summary.txns.length
          ? summary.txns.map((t) => {
              const acctName = accounts.find((a) => a.id === t.accountId)?.name || t.accountId;
              const typeName = txnTypes.find((x) => x.id === t.typeId)?.name || t.typeId;

              const lines = t.hasSplits ? t.splits : [{ categoryId: t.categoryId, label: t.label, amount: t.amount }];
              const linesUI = lines.map((ln) => {
                const cn = categories.find((c) => c.id === ln.categoryId)?.name || ln.categoryId;
                const label = ln.label ? ` · ${ln.label}` : "";
                return `${cn}${label}: ${formatMoneyUSD(ln.amount)}`;
              });

              return el("div", { class: "item" }, [
                el("div", { class: "item-top" }, [
                  el("div", {}, [
                    el("div", { class: "item-title" }, [
                      `${t.merchant ? t.merchant : "(no merchant)"} · ${acctName}`
                    ]),
                    el("div", { class: "item-meta" }, [
                      `${t.dateISO} · ${typeName} · ${t.hasSplits ? "Split" : "Single"}`
                    ]),
                  ]),
                  el("div", { class: "mono" }, [
                    t.typeId === "income" ? `+${formatMoneyUSD(t.amount)}` :
                    t.typeId === "expense" ? `-${formatMoneyUSD(t.amount)}` :
                    `${formatMoneyUSD(t.amount)}`
                  ]),
                ]),
                el("div", { class: "small", style: "margin-top:8px" }, [linesUI.join(" | ")]),
                t.note ? el("div", { class: "small", style: "margin-top:6px" }, [`Note: ${t.note}`]) : null,
                el("div", { class: "inline", style: "margin-top:10px" }, [
                  el("button", { type: "button", class: "danger", onclick: () => onDeleteTxn(t.id) }, ["Delete"]),
                ]),
              ]);
            })
          : [el("div", { class: "small" }, ["No transactions in this month yet."])])
      ]),
    ]);

    const netOutflowPanel = el("div", { class: "card" }, [
      el("button", {
        type: "button",
        class: "collapsible-head",
        onclick: () => store.dispatch({ type: ACTIONS.UI_TOGGLE_PANEL, payload: { key: "netOutflowOpen" } }),
      }, [
        el("span", { class: "item-title" }, ["Net outflow"]),
        el("span", { class: "small mono" }, [panels.netOutflowOpen ? "▼" : "▶"]),
      ]),
      panels.netOutflowOpen
        ? el("div", { class: "pill", style: "margin-top:10px" }, [
            `Net outflow (month): ${formatMoneyUSD(summary.expenseTotal - summary.incomeTotal)}`
          ])
        : null,
    ]);

    // --- preserve focus + cursor across full re-renders ---
    const active = document.activeElement;
    const activeId = active && active.id ? active.id : null;

    let selStart = null;
    let selEnd = null;
    if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) {
      try {
        selStart = active.selectionStart;
        selEnd = active.selectionEnd;
      } catch (_) {}
    }

    const storageBanner = storageStatus && !storageStatus.persistent
      ? el("div", { class: "card", style: "border-color:#7f1d1d;background:#fff1f2" }, [
          el("div", { class: "bad", style: "font-weight:600" }, ["Storage warning"]),
          el("div", { class: "small" }, [storageStatus.message || "Storage may not persist in this browser session."]),
        ])
      : null;

    // Rebuild DOM
    root.innerHTML = "";
    if (storageBanner) root.appendChild(storageBanner);
    root.appendChild(header);
    root.appendChild(form);
    root.appendChild(breakdown);
    root.appendChild(list);
    root.appendChild(toolsCard);
    root.appendChild(budgetsPanel);
    root.appendChild(netOutflowPanel);

    root.onclick = (e) => {
      if (!quickAddExamplesOpen) return;
      if (e.target.closest(".quick-examples-wrap")) return;
      store.dispatch({ type: ACTIONS.UI_CLOSE_QUICK_ADD_EXAMPLES });
    };

    // Restore focus
    if (activeId) {
      const nextEl = document.getElementById(activeId);
      if (nextEl) {
        nextEl.focus({ preventScroll: true });
        if (selStart != null && (nextEl.tagName === "INPUT" || nextEl.tagName === "TEXTAREA")) {
          try {
            nextEl.setSelectionRange(selStart, selEnd ?? selStart);
          } catch (_) {}
        }
      }
    }


    
  }

  render();
  return () => unsubscribe();
}
