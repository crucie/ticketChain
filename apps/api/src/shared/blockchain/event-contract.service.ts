import { Client } from '@mstblockchain/mst-sdk';
import { Contract, Wallet, JsonRpcProvider, getAddress, keccak256, toUtf8Bytes, type InterfaceAbi } from 'ethers';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { env } from '../../config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface EventTicketsArtifact {
  abi: InterfaceAbi;
  bytecode: string;
}

let deployerClient: Client | null = null;
let artifact: EventTicketsArtifact | null = null;

function loadArtifact(): EventTicketsArtifact {
  if (!artifact) {
    const artifactPath = path.resolve(__dirname, '../blockchain/abis/EventTickets1155.json');
    artifact = JSON.parse(readFileSync(artifactPath, 'utf8')) as EventTicketsArtifact;
  }
  return artifact;
}

export function getMstDeployerClient(): Client {
  if (!env.MST_DEPLOYER_PRIVATE_KEY) {
    throw new Error('MST_DEPLOYER_PRIVATE_KEY is not configured');
  }
  if (!deployerClient) {
    deployerClient = new Client(env.MST_RPC_URL, env.MST_DEPLOYER_PRIVATE_KEY);
  }
  return deployerClient;
}

function getEthersProvider(): JsonRpcProvider {
  return new JsonRpcProvider(env.MST_RPC_URL);
}

function getDeployerWallet(): Wallet {
  if (!env.MST_DEPLOYER_PRIVATE_KEY) {
    throw new Error('MST_DEPLOYER_PRIVATE_KEY is not configured');
  }
  return new Wallet(env.MST_DEPLOYER_PRIVATE_KEY, getEthersProvider());
}

export async function deployEventContract(params: {
  orgWallet: string;
  eventId: string;
  baseUri: string;
}): Promise<{ address: string; txHash: string }> {
  const client = getMstDeployerClient();
  if (!client.signer) throw new Error('Deployer signer unavailable');

  const { abi, bytecode } = loadArtifact();
  const txHash = await client.signer.deploy(abi as unknown[], bytecode, [
    params.orgWallet,
    params.eventId,
    params.baseUri,
  ]);

  const receipt = await client.provider.waitForTransaction(txHash);
  const contractAddress =
    receipt && typeof receipt === 'object' && 'contractAddress' in receipt
      ? (receipt as { contractAddress: string | null }).contractAddress
      : null;

  if (!contractAddress) {
    throw new Error('Contract deployment did not return an address');
  }

  return { address: contractAddress, txHash };
}

export async function configureTierOnChain(params: {
  contractAddress: string;
  tierIndex: number;
  supply: number;
  priceWei: string;
  isTransferable: boolean;
  royaltyBps: number;
}): Promise<string> {
  const wallet = getDeployerWallet();
  const { abi } = loadArtifact();
  const contract = new Contract(params.contractAddress, abi, wallet);

  const tx = await contract.setTier(
    params.tierIndex,
    params.supply,
    params.priceWei,
    params.isTransferable,
    params.royaltyBps
  );
  const receipt = await tx.wait();
  return receipt.hash as string;
}

export async function mintTicketOnChain(params: {
  contractAddress: string;
  toWallet: string;
  tierIndex: number;
  quantity: number;
  priceWei: string;
}): Promise<{ txHash: string }> {
  const wallet = getDeployerWallet();
  const { abi } = loadArtifact();
  const contract = new Contract(params.contractAddress, abi, wallet);

  const totalValue = BigInt(params.priceWei) * BigInt(params.quantity);
  const tx = await contract.mintTicket(
    params.toWallet,
    params.tierIndex,
    params.quantity,
    { value: totalValue }
  );
  const receipt = await tx.wait();
  return { txHash: receipt.hash as string };
}

export async function adminMintOnChain(params: {
  contractAddress: string;
  toWallet: string;
  tierIndex: number;
  quantity: number;
}): Promise<{ txHash: string }> {
  const wallet = getDeployerWallet();
  const { abi } = loadArtifact();
  const contract = new Contract(params.contractAddress, abi, wallet);

  const tx = await contract.adminMint(params.toWallet, params.tierIndex, params.quantity);
  const receipt = await tx.wait();
  return { txHash: receipt.hash as string };
}

export function getDeployerAddress(): Promise<string> {
  const wallet = getDeployerWallet();
  return Promise.resolve(wallet.address);
}

export async function adminTransferOnChain(params: {
  contractAddress: string;
  fromWallet: string;
  toWallet: string;
  tierIndex: number;
  quantity?: number;
}): Promise<string> {
  const wallet = getDeployerWallet();
  const { abi } = loadArtifact();
  const contract = new Contract(params.contractAddress, abi, wallet);

  const tx = await contract.adminTransfer(
    params.fromWallet,
    params.toWallet,
    params.tierIndex,
    params.quantity ?? 1
  );
  const receipt = await tx.wait();
  return receipt.hash as string;
}

/**
 * Record gate check-in on the per-event ticket contract.
 * Gas is paid by the platform deployer (onlyOwner).
 */
export async function checkInTicketOnChain(params: {
  contractAddress: string;
  ticketId: string;
  ownerWallet: string;
  tierIndex: number;
}): Promise<string> {
  const wallet = getDeployerWallet();
  const { abi } = loadArtifact();
  const contract = new Contract(params.contractAddress, abi, wallet);

  const ticketIdHash = keccak256(toUtf8Bytes(params.ticketId));
  const tx = await contract.checkInTicket(
    ticketIdHash,
    getAddress(params.ownerWallet),
    params.tierIndex
  );
  const receipt = await tx.wait();
  return receipt.hash as string;
}

export function getExplorerTxUrl(txHash: string): string {
  const base = env.MST_BLOCK_EXPLORER_URL.replace(/\/$/, '');
  return `${base}/tx/${txHash}`;
}

/**
 * Returns true if the given transaction hash has been mined and succeeded
 * on the MST chain (receipt exists with status === 1).
 */
export async function checkTxConfirmed(txHash: string): Promise<boolean> {
  try {
    const provider = getEthersProvider();
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) return false;
    return receipt.status === 1;
  } catch {
    return false;
  }
}
