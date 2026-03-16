// DBStatus is now just a re-export shim — the actual status is shown via APIStatusDot in App.tsx
// and the DataManager panel. This file is kept so old imports don't break.
export default function DBStatus() { return null; }
export function DBWriteFlash() { return null; }
