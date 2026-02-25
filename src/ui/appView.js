import { ACTIONS } from "../core/reducer.js";
import { validateDraft, draftToTxn, computeSplitSum } from "../domain/expenseModel.js";
import { selectMonthSummary, formatMoneyUSD } from "../core/selectors.js";
import { parseQuickEntry } from "../domain/quickParser.js";

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

    const merchantDatalist = el("datalist", { id: "merchant-list" }, 
    recentMerchants.map((m) => el("option", { value: m }, []))
    );

    const draft = state.ui.draft;
    const errors = state.ui.errors;

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
          el("div", { class: "small" }, ["Filter the list + totals by month"]),
        ]),
        el("div", {}, [
          el("label", {}, ["Quick stats"]),
          el("div", { class: "pill" }, [
            `Income: ${formatMoneyUSD(summary.incomeTotal)} · Net outflow: ${formatMoneyUSD(summary.expenseTotal - summary.incomeTotal)}`
          ]),
        ]),
      ]),
    ]);

    const form = el("form", { class: "card", onsubmit: onSubmit }, [
      el("div", { class: "kpi" }, [
        el("div", { class: "item-title" }, ["Add transaction"]),
        el("div", { class: "small" }, ["v1 — bank-truth parent + optional splits"]),
      ]),

      // Quick Add (parser)
      el("div", { class: "row cols-2", style: "margin-top:10px" }, [
        el("div", {}, [
          el("label", {}, ["Quick add"]),
          el("input", {
            id: "quick-add",
            placeholder: "Examples: 6 starbucks food  |  60 costco split gas 40 incense 20",
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
          el("div", { class: "small" }, ["Tip: use 'split' then pairs like: gas 40 snacks 20"]),
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
          el("div", { class: "small", style: "margin-top:8px" }, ["Then tap Save transaction"]),
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
          el("select", { onchange: (e) => patchDraft({ accountId: e.target.value }), value: draft.accountId }, [
            ...optionList(accounts, draft.accountId),
          ]),
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
        el("button", { id: "btn-save", type: "button", class: "primary", onclick: onSave }, ["Save transaction"]),
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

    const sticky = el("div", { class: "sticky-bar" }, [
      el("div", { class: "sticky-inner" }, [
        el("div", { class: "small" }, ["Net outflow (month)"]),
        el("div", { class: "value mono" }, [formatMoneyUSD(summary.expenseTotal - summary.incomeTotal)]),
      ]),
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

    // Rebuild DOM
    root.innerHTML = "";
    root.appendChild(header);
    root.appendChild(form);
    root.appendChild(breakdown);
    root.appendChild(list);
    root.appendChild(sticky);

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
