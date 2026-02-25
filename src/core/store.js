export function createStore({ reducer, initialState }) {
  let state = initialState;
  const listeners = new Set();

  function getState() {
    return state;
  }

function dispatch(action) {
  const prev = state;
  state = reducer(state, action);

  if (state !== prev) {
    // Prevent full UI re-render on every keystroke.
    // Draft typing should not rebuild DOM (it kills focus).
    if (action?.type === "DRAFT_PATCH") return;

    for (const fn of listeners) fn(state, prev, action);
  }
}

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  return { getState, dispatch, subscribe };
}

