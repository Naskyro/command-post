/** Display names only. Stable module keys continue to identify saved grants and links. */
export function moduleLabel(module: string): string {
  if (module === 'Accounts') return 'Account Hub';
  if (module === 'SOP Library') return 'School House';
  return module;
}
