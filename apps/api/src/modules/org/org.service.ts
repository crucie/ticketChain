import { z } from 'zod';
import { pool } from '../../shared/db/postgres.service.js';
import {
  acceptInvite,
  findInviteByToken,
  findOrganisationById,
  findOrganisationBySlug,
  listOrganisations,
  listOrgMembers,
  listInvitesForEmail,
} from './org.repository.js';

export async function getMyInvites(email: string) {
  return listInvitesForEmail(email);
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

export const listMyOrgsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const acceptInviteSchema = z.object({
  token: z.string().min(1),
});

// ─── Service Functions ────────────────────────────────────────────────────────

/**
 * Returns all organisations the given user is a member of.
 */
export async function getMyOrganisations(userId: string): Promise<{
  orgs: Array<{
    id: string;
    name: string;
    slug: string;
    status: string;
    role: number;
    logoUrl: string | null;
  }>;
}> {
  const result = await pool.query<{
    id: string;
    name: string;
    slug: string;
    status: string;
    logo_url: string | null;
    role: number;
  }>(
    `SELECT o.id, o.name, o.slug, o.status, o.logo_url, m.role
     FROM organisations o
     JOIN org_members m ON m.org_id = o.id
     WHERE m.user_id = $1
       AND m.deleted_at IS NULL
       AND m.status = 'active'
       AND o.deleted_at IS NULL
     ORDER BY m.assigned_at ASC`,
    [userId]
  );

  return {
    orgs: result.rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      status: r.status,
      role: r.role,
      logoUrl: r.logo_url,
    })),
  };
}

/**
 * Returns public-facing org details (any authenticated member may call this).
 * Verifies the requesting user is actually a member before returning.
 */
export async function getOrgProfile(orgId: string, userId: string) {
  const members = await listOrgMembers(orgId);
  const isMember = members.some((m) => m.userId === userId && m.status === 'active');
  if (!isMember) {
    return { error: 'Not a member of this organisation', status: 403 as const };
  }

  const org = await findOrganisationById(orgId);
  if (!org) return { error: 'Organisation not found', status: 404 as const };

  return { org };
}

/**
 * Accepts an invite token — creates the org_member row.
 * Called from /api/auth/accept-invite (auth module) BUT also
 * exposed here so the org module has the logic isolated.
 */
export async function acceptOrgInvite(params: {
  token: string;
  userId: string;
}) {
  const invite = await findInviteByToken(params.token);
  if (!invite) return { error: 'Invite not found or already used', status: 404 as const };
  if (invite.status !== 'pending') {
    return { error: 'Invite is no longer valid', status: 409 as const };
  }
  if (new Date() > new Date(invite.tokenExpiresAt)) {
    return { error: 'Invite has expired', status: 409 as const };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await acceptInvite(client, {
      inviteId: invite.id,
      userId: params.userId,
      orgId: invite.orgId,
      role: invite.roleToAssign,
      assignedById: invite.invitedById,
      eventId: invite.eventId,
    });
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const org = await findOrganisationById(invite.orgId);
  return { org, orgId: invite.orgId, role: invite.roleToAssign };
}

/**
 * Returns the public profile of an org by slug (no auth required).
 */
export async function getPublicOrgBySlug(slug: string) {
  const org = await findOrganisationBySlug(slug);
  if (!org || org.status !== 'active') {
    return { error: 'Organisation not found', status: 404 as const };
  }
  // Strip sensitive fields from public response
  const { superAdminId, superAdminWalletAddress, platformCommissionBps, ...publicOrg } = org;
  return { org: publicOrg };
}

export { listOrganisations, findOrganisationById };
