import { Client } from '@mstblockchain/mst-sdk';
import { Wallet, JsonRpcProvider } from 'ethers';
import { env } from '../../config/env.js';

let readOnlyClient: Client | null = null;
let faucetWallet: Wallet | null = null;

/** Read-only MST client (no private key) for health checks and block number. */
export function getMstReadClient(): Client {
  if (!readOnlyClient) {
    readOnlyClient = Client.createRandom(env.MST_RPC_URL);
  }
  return readOnlyClient;
}

function getFaucetWallet(): Wallet {
  const privateKey = env.MST_FAUCET_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('MST_FAUCET_PRIVATE_KEY is not configured');
  }
  if (!faucetWallet) {
    faucetWallet = new Wallet(privateKey, new JsonRpcProvider(env.MST_RPC_URL));
  }
  return faucetWallet;
}

export async function checkMstRpcConnection(): Promise<{ ok: boolean; blockNumber?: number }> {
  try {
    const client = getMstReadClient();
    const blockNumber = await client.provider.getBlockNumber();
    return { ok: true, blockNumber };
  } catch {
    return { ok: false };
  }
}

/** Native chain balance (tMSTC on MST testnet) in wei. */
export async function getNativeBalanceWei(walletAddress: string): Promise<string> {
  const client = getMstReadClient();
  const balance = await client.provider.getBalance(walletAddress);
  return balance.toString();
}

/** Send native tMSTC from the faucet wallet. */
export async function sendNativeTmstc(to: string, amountWei: string): Promise<string> {
  const wallet = getFaucetWallet();
  const tx = await wallet.sendTransaction({ to, value: BigInt(amountWei) });
  const receipt = await tx.wait();
  if (!receipt?.hash) {
    throw new Error('Faucet transfer failed');
  }
  return receipt.hash;
}

export function isFaucetConfigured(): boolean {
  return Boolean(env.MST_FAUCET_PRIVATE_KEY);
}
