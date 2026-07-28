import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool } from '../../shared/db/postgres.service.js';
import { ROLES, type AccessTokenPayload, type AuthUserResponse } from '@ticketchain/shared';
import {
  acceptInvite,
  expireStaleInvites,
  findInviteByToken,
} from '../org/org.repository.js';
import {
  createWeb3AuthUser,
  findUserById,
  findUserByWeb3AuthSub,
  getOrgMemberships,
  resolveAdminOrgIds,
  resolveSessionRole,
  updateUserWallet,
} from './auth.repository.js';
import {
  createRefreshToken,
  revokeRefreshToken,
  rotateRefreshToken,
  signAccessToken,
} from './token.service.js';
import { verifyWeb3AuthIdToken } from './web3auth.service.js';

const verifyBodySchema = z.object({
  idToken: z.string().min(1),
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
});

const platformLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const acceptInviteSchema = z.object({
  inviteToken: z.string().min(1),
});

function deriveEmail(sub: string, email?: string, verifierId?: string): string {
  if (email) return email.toLowerCase();
  if (verifierId && verifierId.includes('@')) return verifierId.toLowerCase();
  return `${sub.replace(/[^a-zA-Z0-9]/g, '_')}@web3auth.local`;
}

function splitName(name?: string): { firstName: string | null; lastName: string | null } {
  if (!name) return { firstName: null, lastName: null };
  const parts = name.trim().split(/\s+/);
  return {
    firstName: parts[0] ?? null,
    lastName: parts.slice(1).join(' ') || null,
  };
}

export async function verifyWeb3AuthLogin(
  idToken: string,
  walletAddress: string
): Promise<{ accessToken: string; refreshToken: string; user: AuthUserResponse }> {
  const claims = await verifyWeb3AuthIdToken(idToken);
  const normalizedWallet = walletAddress.toLowerCase();
  const email = deriveEmail(claims.sub, claims.email, claims.verifierId);
  const { firstName, lastName } = splitName(claims.name);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let user = await findUserByWeb3AuthSub(claims.sub);
    const isNewUser = !user;

    if (!user) {
      user = await createWeb3AuthUser(client, {
        sub: claims.sub,
        email,
        walletAddress: normalizedWallet,
        firstName: firstName ?? undefined,
        lastName: lastName ?? undefined,
      });
    } else if (user.wallet_address.toLowerCase() !== normalizedWallet) {
      await updateUserWallet(client, user.id, normalizedWallet);
      user.wallet_address = normalizedWallet;
    }

    await client.query('COMMIT');

    const memberships = await getOrgMemberships(user.id);
    const role = resolveSessionRole(memberships);
    const orgIds = resolveAdminOrgIds(memberships);

    const tokenPayload: AccessTokenPayload = {
      userId: user.id,
      role,
      walletAddress: user.wallet_address,
      orgIds,
      isPlatformAdmin: false,
    };

    const accessToken = await signAccessToken(tokenPayload);
    const refreshToken = await createRefreshToken(user.id);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        walletAddress: user.wallet_address,
        role,
        orgIds,
        firstName: user.first_name,
        lastName: user.last_name,
        phoneNumber: user.phone_number,
        bio: user.bio,
        profileImage: user.profile_image,
        isNewUser,
      },
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function refreshSession(
  refreshToken: string
): Promise<{ accessToken: string; refreshToken: string } | null> {
  const rotated = await rotateRefreshToken(refreshToken);
  if (!rotated) return null;

  const platformAdmin = await getPlatformAdminMe(rotated.userId);
  if (platformAdmin) {
    const accessToken = await signAccessToken({
      userId: platformAdmin.id,
      role: ROLES.PLATFORM_ADMIN,
      walletAddress: '',
      orgIds: [],
      isPlatformAdmin: true,
    });
    return { accessToken, refreshToken: rotated.newToken };
  }

  const user = await findUserById(rotated.userId);
  if (!user) return null;

  const memberships = await getOrgMemberships(user.id);
  const role = resolveSessionRole(memberships);
  const orgIds = resolveAdminOrgIds(memberships);

  const accessToken = await signAccessToken({
    userId: user.id,
    role,
    walletAddress: user.wallet_address,
    orgIds,
    isPlatformAdmin: false,
  });

  return { accessToken, refreshToken: rotated.newToken };
}

export async function logoutSession(refreshToken: string | undefined): Promise<void> {
  if (refreshToken) {
    await revokeRefreshToken(refreshToken);
  }
}

export async function getMe(userId: string): Promise<AuthUserResponse | null> {
  const user = await findUserById(userId);
  if (!user) return null;

  const memberships = await getOrgMemberships(user.id);
  const role = resolveSessionRole(memberships);
  const orgIds = resolveAdminOrgIds(memberships);

  return {
    id: user.id,
    email: user.email,
    walletAddress: user.wallet_address,
    role,
    orgIds,
    firstName: user.first_name,
    lastName: user.last_name,
    phoneNumber: user.phone_number,
    bio: user.bio,
    profileImage: user.profile_image,
  };
}

export async function getPlatformAdminMe(adminId: string): Promise<AuthUserResponse | null> {
  const result = await pool.query<{
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    status: string;
  }>(
    `SELECT id, email, first_name, last_name, status FROM platform_admins WHERE id = $1`,
    [adminId]
  );

  const admin = result.rows[0];
  if (!admin || admin.status !== 'active') return null;

  return {
    id: admin.id,
    email: admin.email,
    walletAddress: '',
    role: ROLES.PLATFORM_ADMIN,
    orgIds: [],
    firstName: admin.first_name,
    lastName: admin.last_name,
    phoneNumber: null,
    bio: null,
    profileImage: null,
  };
}

export async function acceptInviteSession(
  userId: string,
  inviteToken: string
): Promise<{ accessToken: string; refreshToken: string; user: AuthUserResponse } | { error: string; status: number }> {
  const parsed = acceptInviteSchema.safeParse({ inviteToken });
  if (!parsed.success) {
    return { error: 'Invalid invite token', status: 400 };
  }

  await expireStaleInvites();

  const invite = await findInviteByToken(parsed.data.inviteToken);
  if (!invite) {
    return { error: 'Invite not found', status: 404 };
  }
  if (invite.status !== 'pending') {
    return { error: 'Invite is no longer valid', status: 410 };
  }
  if (invite.tokenExpiresAt.getTime() < Date.now()) {
    return { error: 'Invite has expired', status: 410 };
  }

  const user = await findUserById(userId);
  if (!user) {
    return { error: 'User not found', status: 404 };
  }
  if (user.email.toLowerCase() !== invite.inviteeEmail.toLowerCase()) {
    return { error: 'Invite email does not match your account', status: 403 };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await acceptInvite(client, {
      inviteId: invite.id,
      userId: user.id,
      orgId: invite.orgId,
      role: invite.roleToAssign,
      assignedById: invite.invitedById,
      walletAddress: user.wallet_address,
      eventId: invite.eventId,
    });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  const memberships = await getOrgMemberships(user.id);
  const role = resolveSessionRole(memberships);
  const orgIds = resolveAdminOrgIds(memberships);

  const tokenPayload: AccessTokenPayload = {
    userId: user.id,
    role,
    walletAddress: user.wallet_address,
    orgIds,
    isPlatformAdmin: false,
  };

  const accessToken = await signAccessToken(tokenPayload);
  const refreshToken = await createRefreshToken(user.id);

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      walletAddress: user.wallet_address,
      role,
      orgIds,
      firstName: user.first_name,
      lastName: user.last_name,
      phoneNumber: user.phone_number,
      bio: user.bio,
      profileImage: user.profile_image,
    },
  };
}

export async function platformAdminLogin(
  email: string,
  password: string
): Promise<{ accessToken: string; refreshToken: string; adminId: string } | null> {
  const result = await pool.query<{ id: string; password_hash: string; status: string }>(
    `SELECT id, password_hash, status FROM platform_admins WHERE email = $1`,
    [email.toLowerCase()]
  );

  const admin = result.rows[0];
  if (!admin || admin.status !== 'active') return null;

  const valid = await bcrypt.compare(password, admin.password_hash);
  if (!valid) return null;

  await pool.query(`UPDATE platform_admins SET last_login_at = NOW() WHERE id = $1`, [admin.id]);

  const accessToken = await signAccessToken({
    userId: admin.id,
    role: ROLES.PLATFORM_ADMIN,
    walletAddress: '',
    orgIds: [],
    isPlatformAdmin: true,
  });
  const refreshToken = await createRefreshToken(admin.id);

  return { accessToken, refreshToken, adminId: admin.id };
}

export { verifyBodySchema, platformLoginSchema, acceptInviteSchema };
