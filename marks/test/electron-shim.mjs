// Only what the modules under test touch. `getPath` is never reached because
// MARKS_DATA_DIR takes priority, but it throws loudly if that ever stops being true.
export const app = {
  getPath() { throw new Error('MARKS_DATA_DIR must be set when running outside Electron') },
}

// `parseMeta` is pure; nothing in the tests performs a fetch.
export const net = {
  fetch() { throw new Error('no network in tests') },
}
