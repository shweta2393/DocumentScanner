/**
 * PIN hashing for native: use expo-crypto.
 */
import * as Crypto from 'expo-crypto';

export async function hashPin(pin) {
  const normalized = String(pin).trim();
  if (!normalized) return null;
  try {
    return await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      normalized,
      { encoding: Crypto.CryptoEncoding.HEX }
    );
  } catch (e) {
    console.error('Error hashing PIN:', e);
    return null;
  }
}
