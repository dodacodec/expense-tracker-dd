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
    },
    catalogs: null, // filled on boot
    txns: {
      byId: {},
      allIds: [],
    },
    ui: {
      draft: buildNewTxnDraft({ dateISO: nowISO }),
      errors: {},
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
