import { randomBytes } from 'crypto';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { pool } from '../../shared/db/postgres.service.js';
import {
  getNativeBalanceWei,
  isFaucetConfigured,
  sendNativeTmstc,
} from '../../shared/blockchain/mst.service.js';
import { findUserById, findUserByWallet, getOrgMemberships, resolveAdminOrgIds, resolveSessionRole, updateUserWallet } from '../auth/auth.repository.js';
import { createRefreshToken, signAccessToken } from '../auth/token.service.js';

const faucetBodySchema = z.object({
  targetAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
});

const updateProfileSchema = z.object({
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  phoneNumber: z.string().max(20).optional(),
  bio: z.string().max(500).optional(),
});

function generateReferralCode(): string {
  return randomBytes(4).toString('hex').toUpperCase();
}

export async function ensureReferralCode(userId: string): Promise<string> {
  const existing = await pool.query<{ referral_code: string | null }>(
    `SELECT referral_code FROM users WHERE id = $1`,
    [userId]
  );
  if (existing.rows[0]?.referral_code) {
    return existing.rows[0].referral_code;
  }

  const code = generateReferralCode();
  await pool.query(`UPDATE users SET referral_code = $1, updated_at = NOW() WHERE id = $2`, [
    code,
    userId,
  ]);
  return code;
}

export async function listUserRewards(userId: string) {
  const result = await pool.query<{
    id: string;
    reward_type: string;
    reward_metadata: Record<string, unknown> | null;
    token_id: number | null;
    contract_address: string | null;
    issued_at: Date;
  }>(
    `SELECT id, reward_type, reward_metadata, token_id, contract_address, issued_at
     FROM loyalty_rewards WHERE user_id = $1 ORDER BY issued_at DESC`,
    [userId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    rewardType: row.reward_type,
    rewardMetadata: row.reward_metadata,
    tokenId: row.token_id,
    contractAddress: row.contract_address,
    issuedAt: row.issued_at.toISOString(),
  }));
}

export async function updateUserProfile(userId: string, body: unknown) {
  const parsed = updateProfileSchema.safeParse(body);
  if (!parsed.success) {
    return { error: 'Invalid profile data', status: 400 as const };
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (parsed.data.firstName !== undefined) {
    fields.push(`first_name = $${idx++}`);
    values.push(parsed.data.firstName.trim() || null);
  }
  if (parsed.data.lastName !== undefined) {
    fields.push(`last_name = $${idx++}`);
    values.push(parsed.data.lastName.trim() || null);
  }
  if (parsed.data.phoneNumber !== undefined) {
    fields.push(`phone_number = $${idx++}`);
    values.push(parsed.data.phoneNumber.trim() || null);
  }
  if (parsed.data.bio !== undefined) {
    fields.push(`bio = $${idx++}`);
    values.push(parsed.data.bio.trim() || null);
  }

  if (fields.length === 0) {
    return { error: 'No fields to update', status: 400 as const };
  }

  values.push(userId);
  const result = await pool.query<{
    id: string;
    email: string;
    wallet_address: string;
    first_name: string | null;
    last_name: string | null;
    phone_number: string | null;
    bio: string | null;
  }>(
    `UPDATE users SET ${fields.join(', ')}, updated_at = NOW()
     WHERE id = $${idx} AND deleted_at IS NULL
     RETURNING id, email, wallet_address, first_name, last_name, phone_number, bio`,
    values
  );

  const row = result.rows[0];
  if (!row) {
    return { error: 'User not found', status: 404 as const };
  }

  return {
    profile: {
      id: row.id,
      email: row.email,
      walletAddress: row.wallet_address,
      firstName: row.first_name,
      lastName: row.last_name,
      phoneNumber: row.phone_number,
      bio: row.bio,
    },
    status: 200 as const,
  };
}

export async function getWalletInfo(userId: string) {
  const user = await findUserById(userId);
  if (!user) return { error: 'User not found', status: 404 as const };

  const balanceWei = await getNativeBalanceWei(user.wallet_address);

  return {
    walletAddress: user.wallet_address,
    balanceWei,
    symbol: 'tMSTC',
    chainId: env.MST_CHAIN_ID,
    rpcUrl: env.MST_RPC_URL,
  };
}

export async function getReferralStats(userId: string) {
  const code = await ensureReferralCode(userId);

  const referrals = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM users
     WHERE referred_by_id = $1 AND deleted_at IS NULL`,
    [userId]
  );

  const rewards = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM loyalty_rewards WHERE user_id = $1`,
    [userId]
  );

  return {
    referralCode: code,
    referralsCount: Number(referrals.rows[0]?.count ?? 0),
    rewardsCount: Number(rewards.rows[0]?.count ?? 0),
  };
}

const linkWalletSchema = z.object({
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
});

export async function linkWalletToAccount(userId: string, body: unknown) {
  const parsed = linkWalletSchema.safeParse(body);
  if (!parsed.success) {
    return { error: 'Valid walletAddress (0x…) is required', status: 400 as const };
  }

  const normalized = parsed.data.walletAddress.toLowerCase();
  const conflict = await findUserByWallet(normalized);
  if (conflict && conflict.id !== userId) {
    return { error: 'This wallet is already linked to another account', status: 409 as const };
  }

  const client = await pool.connect();
  try {
    await updateUserWallet(client, userId, normalized);
  } finally {
    client.release();
  }

  const user = await findUserById(userId);
  if (!user) return { error: 'User not found', status: 404 as const };

  const memberships = await getOrgMemberships(userId);
  const role = resolveSessionRole(memberships);
  const orgIds = resolveAdminOrgIds(memberships);

  const accessToken = await signAccessToken({
    userId: user.id,
    role,
    walletAddress: normalized,
    orgIds,
    isPlatformAdmin: false,
  });
  const refreshToken = await createRefreshToken(userId);

  return {
    walletAddress: normalized,
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      walletAddress: normalized,
      role,
      orgIds,
      firstName: user.first_name,
      lastName: user.last_name,
      phoneNumber: user.phone_number,
      bio: user.bio ?? null,
      profileImage: user.profile_image ?? null,
    },
  };
}

export async function requestFaucetFunds(userId: string, body: unknown) {
  const parsed = faucetBodySchema.safeParse(body);
  if (!parsed.success) {
    return { error: 'Valid targetAddress (0x…) is required', status: 400 as const };
  }

  const target = parsed.data.targetAddress.toLowerCase();
  const externalUrl = env.MST_FAUCET_EXTERNAL_URL;

  if (!isFaucetConfigured()) {
    return {
      mode: 'external' as const,
      externalUrl,
      targetAddress: target,
      message: 'In-app faucet is not configured. Use the MST testnet faucet.',
    };
  }

  const cooldownHours = env.MST_FAUCET_COOLDOWN_HOURS;
  const recent = await pool.query<{ id: string }>(
    `SELECT id FROM faucet_claims
     WHERE user_id = $1 AND created_at > NOW() - ($2::text || ' hours')::interval
     ORDER BY created_at DESC LIMIT 1`,
    [userId, String(cooldownHours)]
  );
  if (recent.rows[0]) {
    return {
      error: `Faucet cooldown active. Try again in ${cooldownHours} hours.`,
      status: 429 as const,
    };
  }

  const balanceWei = await getNativeBalanceWei(target);
  if (BigInt(balanceWei) >= BigInt(env.MST_FAUCET_MAX_BALANCE_WEI)) {
    return {
      error: 'Wallet already has sufficient test tMSTC',
      status: 400 as const,
    };
  }

  const amountWei = env.MST_FAUCET_AMOUNT_WEI;
  let txHash: string;
  try {
    txHash = await sendNativeTmstc(target, amountWei);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Faucet transfer failed';
    return { error: message, status: 503 as const };
  }

  await pool.query(
    `INSERT INTO faucet_claims (user_id, target_address, amount_wei, tx_hash)
     VALUES ($1, $2, $3, $4)`,
    [userId, target, amountWei, txHash]
  );

  const newBalanceWei = await getNativeBalanceWei(target);

  return {
    mode: 'in_app' as const,
    txHash,
    amountWei,
    targetAddress: target,
    balanceWei: newBalanceWei,
    symbol: 'tMSTC',
  };
}
