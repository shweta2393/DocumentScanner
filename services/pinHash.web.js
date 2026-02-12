/**
 * PIN hashing for web: use browser Crypto API.
 * This file is used only when bundling for web so expo-crypto is never loaded.
 */
export async function hashPin(pin) {
  const normalized = String(pin).trim();
  if (!normalized) return null;
  try {
    if (typeof crypto === 'undefined' || !crypto.subtle) return null;
    const encoder = new TextEncoder();
    const data = encoder.encode(normalized);
    const buf = await crypto.subtle.digest('SHA-256', data);
    const arr = new Uint8Array(buf);
    return [...arr].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch (e) {
    console.error('Error hashing PIN:', e);
    return null;
  }
}
