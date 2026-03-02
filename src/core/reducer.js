import { buildNewTxnDraft, addSplitRow, removeSplitRow } from "../domain/expenseModel.js";

export const ACTIONS = {
  HYDRATE: "HYDRATE",
  SET_ACTIVE_MONTH: "SET_ACTIVE_MONTH",

  DRAFT_PATCH: "DRAFT_PATCH",
  DRAFT_ADD_SPLIT: "DRAFT_ADD_SPLIT",
  DRAFT_REMOVE_SPLIT: "DRAFT_REMOVE_SPLIT",
  DRAFT_RESET: "DRAFT_RESET",
  DRAFT_SET: "DRAFT_SET",
  SET_ERRORS: "SET_ERRORS",
  SET_STORAGE_STATUS: "SET_STORAGE_STATUS",
  SET_BUDGETS: "SET_BUDGETS",
  UI_TOGGLE_PANEL: "UI_TOGGLE_PANEL",
  UI_TOGGLE_QUICK_ADD_EXAMPLES: "UI_TOGGLE_QUICK_ADD_EXAMPLES",
  UI_CLOSE_QUICK_ADD_EXAMPLES: "UI_CLOSE_QUICK_ADD_EXAMPLES",
  SHOW_TOAST: "SHOW_TOAST",
  CLEAR_TOAST: "CLEAR_TOAST",

  ADD_TXN: "ADD_TXN",
  DELETE_TXN: "DELETE_TXN",
};

export function initialState(nowISO) {
  const activeMonth = nowISO.slice(0, 7);
  return {
    schemaVersion: 1,
    settings: {
      currency: "USD",
      dateFormat: "MM-DD-YYYY",
      activeMonth,
      budgets: {
        thresholds: { warn: 0.8, hard: 1.0 },
        monthly: {},
        weekly: {},
      },
    },
    catalogs: null, // filled on boot
    txns: {
      byId: {},
      allIds: [],
    },
    ui: {
      draft: buildNewTxnDraft({ dateISO: nowISO }),
      errors: {},
      storageStatus: { persistent: true, message: "" },
      panels: { budgetsOpen: false, netOutflowOpen: false },
      quickAddExamplesOpen: false,
      toast: { message: null, kind: null },
    },
  };
}

export function reducer(state, action) {
  switch (action.type) {
    case ACTIONS.HYDRATE: {
      // payload: full state except UI draft/errors
      const next = structuredClone(state);
      const persisted = action.payload;
      next.schemaVersion = persisted.schemaVersion ?? next.schemaVersion;
      next.settings = { ...next.settings, ...(persisted.settings || {}) };
      next.settings.budgets = {
        thresholds: {
          ...next.settings.budgets.thresholds,
          ...(persisted.settings?.budgets?.thresholds || {}),
        },
        monthly: {
          ...next.settings.budgets.monthly,
          ...(persisted.settings?.budgets?.monthly || {}),
        },
        weekly: {
          ...next.settings.budgets.weekly,
          ...(persisted.settings?.budgets?.weekly || {}),
        },
      };
      next.catalogs = persisted.catalogs ?? next.catalogs;
      next.txns = persisted.txns ?? next.txns;
      return next;
    }

    case ACTIONS.SET_ACTIVE_MONTH: {
      return {
        ...state,
        settings: { ...state.settings, activeMonth: action.payload },
      };
    }

    case ACTIONS.DRAFT_PATCH: {
      return {
        ...state,
        ui: {
          ...state.ui,
          draft: { ...state.ui.draft, ...action.payload },
        },
      };
    }

    case ACTIONS.DRAFT_SET: {
      return {
        ...state,
        ui: {
          ...state.ui,
          draft: { ...state.ui.draft, ...action.payload },
          errors: {},
        },
      };
    }

    case ACTIONS.DRAFT_ADD_SPLIT: {
      return {
        ...state,
        ui: {
          ...state.ui,
          draft: addSplitRow(state.ui.draft),
        },
      };
    }

    case ACTIONS.DRAFT_REMOVE_SPLIT: {
      return {
        ...state,
        ui: {
          ...state.ui,
          draft: removeSplitRow(state.ui.draft, action.payload),
        },
      };
    }

    case ACTIONS.DRAFT_RESET: {
      const nowISO = action.payload?.nowISO || state.ui.draft.dateISO;
      return {
        ...state,
        ui: {
          ...state.ui,
          draft: buildNewTxnDraft({
            dateISO: nowISO,
            accountId: state.ui.draft.accountId,
            typeId: state.ui.draft.typeId,
          }),
          errors: {},
        },
      };
    }

    case ACTIONS.SET_ERRORS: {
      return {
        ...state,
        ui: { ...state.ui, errors: action.payload || {} },
      };
    }

    case ACTIONS.SET_STORAGE_STATUS: {
      return {
        ...state,
        ui: { ...state.ui, storageStatus: action.payload || { persistent: true, message: "" } },
      };
    }

    case ACTIONS.SET_BUDGETS: {
      return {
        ...state,
        settings: {
          ...state.settings,
          budgets: {
            thresholds: {
              ...state.settings.budgets.thresholds,
              ...(action.payload?.thresholds || {}),
            },
            monthly: {
              ...state.settings.budgets.monthly,
              ...(action.payload?.monthly || {}),
            },
            weekly: {
              ...state.settings.budgets.weekly,
              ...(action.payload?.weekly || {}),
            },
          },
        },
      };
    }

    case ACTIONS.UI_TOGGLE_PANEL: {
      const key = action.payload?.key;
      if (!key || !(key in (state.ui.panels || {}))) return state;
      return {
        ...state,
        ui: {
          ...state.ui,
          panels: {
            ...state.ui.panels,
            [key]: !state.ui.panels[key],
          },
        },
      };
    }

    case ACTIONS.UI_TOGGLE_QUICK_ADD_EXAMPLES: {
      return {
        ...state,
        ui: { ...state.ui, quickAddExamplesOpen: !state.ui.quickAddExamplesOpen },
      };
    }

    case ACTIONS.UI_CLOSE_QUICK_ADD_EXAMPLES: {
      if (!state.ui.quickAddExamplesOpen) return state;
      return {
        ...state,
        ui: { ...state.ui, quickAddExamplesOpen: false },
      };
    }

    case ACTIONS.SHOW_TOAST: {
      return {
        ...state,
        ui: {
          ...state.ui,
          toast: {
            message: action.payload?.message || null,
            kind: action.payload?.kind || "ok",
          },
        },
      };
    }

    case ACTIONS.CLEAR_TOAST: {
      return {
        ...state,
        ui: { ...state.ui, toast: { message: null, kind: null } },
      };
    }

    case ACTIONS.ADD_TXN: {
      const txn = action.payload;
      const next = structuredClone(state);
      next.txns.byId[txn.id] = txn;
      next.txns.allIds.unshift(txn.id);
      // keep active month aligned to the txn date month for speed
      next.settings.activeMonth = txn.monthKey;
      return next;
    }

    case ACTIONS.DELETE_TXN: {
      const id = action.payload;
      const next = structuredClone(state);
      delete next.txns.byId[id];
      next.txns.allIds = next.txns.allIds.filter((x) => x !== id);
      return next;
    }

    default:
      return state;
  }
}
