// Identity helpers: ed25519 (AXL peer IDs) + secp256k1 (EVM signer + ECIES).
import * as fs from 'node:fs';
import { execSync } from 'node:child_process';
import { ethers } from 'ethers';
import { PRIVATE_KEY, RPC_URL } from './config.js';

/**
 * Derive raw ed25519 public key (32 bytes hex) from a PEM-encoded private key.
 * AXL uses this hex string as the peer identifier.
 */
export function loadEd25519PubkeyHex(pemPath: string): string {
  if (!fs.existsSync(pemPath)) throw new Error(`pem not found: ${pemPath}`);
  // openssl prints the raw 32-byte pubkey as the trailing bytes of the SubjectPublicKeyInfo.
  // -text gives parseable output; we extract the hex bytes after "pub:".
  const txt = execSync(`openssl pkey -in "${pemPath}" -pubout -text -noout`, { encoding: 'utf8' });
  const m = txt.match(/pub:\s*\n((?:\s*[0-9a-f:]+\s*\n)+)/i);
  if (!m) throw new Error('could not parse ed25519 pubkey');
  const hex = m[1].replace(/[:\s\n]/g, '');
  if (hex.length !== 64) throw new Error(`unexpected pubkey length ${hex.length}`);
  return hex;
}

let _wallet: ethers.Wallet | null = null;
export function getWallet(): ethers.Wallet {
  if (_wallet) return _wallet;
  if (!PRIVATE_KEY) throw new Error('PRIVATE_KEY missing');
  _wallet = new ethers.Wallet(PRIVATE_KEY, new ethers.JsonRpcProvider(RPC_URL));
  return _wallet;
}
