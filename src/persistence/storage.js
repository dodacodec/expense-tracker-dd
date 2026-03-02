const KEY = "expense_app_state_v1";

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed;
  } catch (e) {
    console.warn("Failed to load state:", e);
    return null;
  }
}

export function saveState(state) {
  // Persist only what we need (exclude UI draft/errors)
  const persisted = {
    schemaVersion: state.schemaVersion,
    settings: state.settings,
    catalogs: state.catalogs,
    txns: state.txns,
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(persisted));
  } catch (e) {
    console.warn("Failed to save state:", e);
  }
}

export function clearState() {
  localStorage.removeItem(KEY);
}


export function detectStorageStatus() {
  const probeKey = `${KEY}__probe`;
  const probeVal = `ok_${Date.now()}`;

  try {
    localStorage.setItem(probeKey, probeVal);
    const roundTrip = localStorage.getItem(probeKey);
    localStorage.removeItem(probeKey);

    if (roundTrip !== probeVal) {
      return {
        persistent: false,
        message: "Storage may not persist on this device/browser session.",
      };
    }

    return { persistent: true, message: "" };
  } catch (e) {
    return {
      persistent: false,
      message: "Storage is unavailable. Entries may be lost after refresh.",
    };
  }
}
