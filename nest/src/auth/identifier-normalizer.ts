export function normalizeIdentifier(identifier: string | undefined): string {
  return (identifier ?? '').trim().toLowerCase();
}

export function normalizeIdentifierInput(raw: string) {
  return normalizeIdentifier(raw);
}
