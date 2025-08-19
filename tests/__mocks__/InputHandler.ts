// test-only stub
export type UnitSelectionEvent = any;
export const InputEvents: Record<string, string> = new Proxy(
  {},
  { get: (_t, p: string | symbol) => String(p) },
);
export default {};
