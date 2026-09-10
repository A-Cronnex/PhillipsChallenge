/** Kept only in memory. Never put credentials in EXPO_PUBLIC_* or SQLite. */
let accessToken = '';
export function setSyncToken(token: string): void { accessToken = token.trim(); }
export function getSyncToken(): string { return accessToken; }
