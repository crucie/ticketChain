import type { PoolClient } from 'pg';
import { pool } from '../../shared/db/postgres.service.js';
import type {
  OrganisationDetail,
  OrganisationSummary,
  OrgMemberResponse,
  InviteResponse,
} from '@ticketchain/shared';

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  banner_url: string | null;
  website_url: string | null;
  brand_primary_color: string | null;
  brand_secondary_color: string | null;
  tax_id: string | null;
  gst_number: string | null;
  registration_number: string | null;
  org_type: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  postal_code: string | null;
  founder_name: string | null;
  founder_phone: string | null;
  pending_founder_email: string | null;
  kyc_documents: unknown;
  super_admin_id: string | null;
  super_admin_wallet_address: string | null;
  org_registry_contract_address: string | null;
  chain_id: number;
  subscription_plan: string;
  status: string;
  verification_status: string;
  platform_commission_bps: number;
  verified_at: Date | null;
  wallet_confirmed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function mapOrgSummary(row: OrgRow): OrganisationSummary {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status as OrganisationSummary['status'],
    verificationStatus: row.verification_status as OrganisationSummary['verificationStatus'],
    subscriptionPlan: row.subscription_plan as OrganisationSummary['subscriptionPlan'],
    platformCommissionBps: row.platform_commission_bps,
    country: row.country,
    city: row.city,
    orgType: row.org_type as OrganisationSummary['orgType'],
    createdAt: row.created_at.toISOString(),
  };
}

function parseKycDocuments(raw: unknown): OrganisationDetail['kycDocuments'] {
  if (!raw) return null;
  const value = typeof raw === 'string' ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : raw;
  if (!Array.isArray(value)) return null;
  const docs = value
    .filter((d): d is { type?: unknown; label?: unknown; url?: unknown } => Boolean(d) && typeof d === 'object')
    .map((d) => ({
      type: String(d.type ?? 'other'),
      label: String(d.label ?? d.type ?? 'Document'),
      url: String(d.url ?? ''),
    }))
    .filter((d) => Boolean(d.url));
  return docs.length > 0 ? docs : null;
}

function mapOrgDetail(row: OrgRow): OrganisationDetail {
  return {
    ...mapOrgSummary(row),
    description: row.description,
    logoUrl: row.logo_url,
    bannerUrl: row.banner_url,
    websiteUrl: row.website_url,
    brandPrimaryColor: row.brand_primary_color,
    brandSecondaryColor: row.brand_secondary_color,
    taxId: row.tax_id,
    gstNumber: row.gst_number,
    registrationNumber: row.registration_number,
    state: row.state,
    postalCode: row.postal_code,
    founderName: row.founder_name,
    founderPhone: row.founder_phone,
    pendingFounderEmail: row.pending_founder_email,
    superAdminId: row.super_admin_id,
    superAdminWalletAddress: row.super_admin_wallet_address,
    orgRegistryContractAddress: row.org_registry_contract_address,
    chainId: row.chain_id,
    platformCommissionBps: row.platform_commission_bps,
    verifiedAt: row.verified_at?.toISOString() ?? null,
    walletConfirmedAt: row.wallet_confirmed_at?.toISOString() ?? null,
    updatedAt: row.updated_at.toISOString(),
    kycDocuments: parseKycDocuments(row.kyc_documents),
  };
}

const ORG_SELECT = `
  id, name, slug, description, logo_url, banner_url, website_url,
  brand_primary_color, brand_secondary_color,
  tax_id, gst_number, registration_number, org_type,
  country, state, city, postal_code,
  founder_name, founder_phone, pending_founder_email, kyc_documents,
  super_admin_id, super_admin_wallet_address, org_registry_contract_address,
  chain_id, subscription_plan, status, verification_status, platform_commission_bps,
  verified_at, wallet_confirmed_at, created_at, updated_at
`;

export async function findUserByEmail(email: string): Promise<{
  id: string;
  email: string;
  wallet_address: string;
} | null> {
  const result = await pool.query<{ id: string; email: string; wallet_address: string }>(
    `SELECT id, email, wallet_address FROM users WHERE email = $1 AND deleted_at IS NULL`,
    [email.toLowerCase()]
  );
  return result.rows[0] ?? null;
}

export async function listOrganisations(params: {
  offset: number;
  limit: number;
  status?: string;
}): Promise<{ rows: OrganisationSummary[]; total: number }> {
  const values: unknown[] = [params.limit, params.offset];
  let where = 'deleted_at IS NULL';
  if (params.status) {
    values.push(params.status);
    where += ` AND status = $${values.length}`;
  }

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM organisations WHERE ${where}`,
    params.status ? [params.status] : []
  );

  const result = await pool.query<OrgRow>(
    `SELECT ${ORG_SELECT} FROM organisations WHERE ${where}
     ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
    values
  );

  return {
    rows: result.rows.map(mapOrgSummary),
    total: Number(countResult.rows[0]?.count ?? 0),
  };
}

export async function findOrganisationById(orgId: string): Promise<OrganisationDetail | null> {
  const result = await pool.query<OrgRow>(
    `SELECT ${ORG_SELECT} FROM organisations WHERE id = $1 AND deleted_at IS NULL`,
    [orgId]
  );
  const row = result.rows[0];
  return row ? mapOrgDetail(row) : null;
}

export async function findOrganisationBySlug(slug: string): Promise<OrganisationDetail | null> {
  const result = await pool.query<OrgRow>(
    `SELECT ${ORG_SELECT} FROM organisations WHERE slug = $1 AND deleted_at IS NULL`,
    [slug]
  );
  const row = result.rows[0];
  return row ? mapOrgDetail(row) : null;
}

export async function userHasOrgAsSuperAdmin(userId: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT id FROM organisations WHERE super_admin_id = $1 AND deleted_at IS NULL`,
    [userId]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function createOrganisation(
  client: PoolClient,
  params: {
    name: string;
    slug: string;
    description?: string;
    superAdminId?: string | null;
    superAdminWalletAddress?: string | null;
    country?: string;
    state?: string;
    city?: string;
    postalCode?: string;
    orgType?: string;
    taxId?: string;
    gstNumber?: string;
    registrationNumber?: string;
    founderName?: string;
    founderPhone?: string;
    pendingFounderEmail?: string;
    platformNotes?: string;
    platformCommissionBps?: number;
    subscriptionPlan?: string;
    chainId?: number;
  }
): Promise<OrganisationDetail> {
  const result = await client.query<OrgRow>(
    `INSERT INTO organisations (
       name, slug, description, super_admin_id, super_admin_wallet_address,
       country, state, city, postal_code, org_type,
       tax_id, gst_number, registration_number,
       founder_name, founder_phone, pending_founder_email, platform_notes,
       platform_commission_bps, subscription_plan, chain_id, status, verification_status
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,'pending_verification','unverified')
     RETURNING ${ORG_SELECT}`,
    [
      params.name,
      params.slug,
      params.description ?? null,
      params.superAdminId ?? null,
      params.superAdminWalletAddress?.toLowerCase() ?? null,
      params.country ?? null,
      params.state ?? null,
      params.city ?? null,
      params.postalCode ?? null,
      params.orgType ?? null,
      params.taxId ?? null,
      params.gstNumber ?? null,
      params.registrationNumber ?? null,
      params.founderName ?? null,
      params.founderPhone ?? null,
      params.pendingFounderEmail?.toLowerCase() ?? null,
      params.platformNotes ?? null,
      params.platformCommissionBps ?? 200,
      params.subscriptionPlan ?? 'starter',
      params.chainId ?? 4545,
    ]
  );

  const org = mapOrgDetail(result.rows[0]);

  if (params.superAdminId) {
    await client.query(
      `INSERT INTO org_members (org_id, user_id, role, assigned_by_id, status)
       VALUES ($1, $2, 3, $2, 'active')`,
      [org.id, params.superAdminId]
    );
  }

  return org;
}

export async function assignSuperAdminToOrg(
  client: PoolClient,
  params: {
    orgId: string;
    userId: string;
    walletAddress: string;
  }
): Promise<void> {
  await client.query(
    `UPDATE organisations SET
       super_admin_id = $1,
       super_admin_wallet_address = $2,
       pending_founder_email = NULL,
       updated_at = NOW()
     WHERE id = $3`,
    [params.userId, params.walletAddress.toLowerCase(), params.orgId]
  );
}

export async function updateOrganisation(
  orgId: string,
  fields: Record<string, unknown>
): Promise<OrganisationDetail | null> {
  const allowed = [
    'name',
    'description',
    'logo_url',
    'banner_url',
    'website_url',
    'brand_primary_color',
    'brand_secondary_color',
    'tax_id',
    'gst_number',
    'registration_number',
    'org_type',
    'country',
    'state',
    'city',
    'postal_code',
    'founder_phone',
    'subscription_plan',
    'platform_commission_bps',
    'kyc_documents',
    'super_admin_wallet_address',
    'wallet_confirmed_at',
    'platform_notes',
  ] as const;

  const sets: string[] = [];
  const values: unknown[] = [];
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      values.push(fields[key]);
      sets.push(`${key} = $${values.length}`);
    }
  }
  if (sets.length === 0) return findOrganisationById(orgId);

  values.push(orgId);
  const result = await pool.query<OrgRow>(
    `UPDATE organisations SET ${sets.join(', ')}, updated_at = NOW()
     WHERE id = $${values.length} AND deleted_at IS NULL
     RETURNING ${ORG_SELECT}`,
    values
  );
  const row = result.rows[0];
  return row ? mapOrgDetail(row) : null;
}

export async function softDeleteOrganisation(orgId: string): Promise<boolean> {
  const result = await pool.query(
    `UPDATE organisations SET deleted_at = NOW(), status = 'inactive', updated_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL`,
    [orgId]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function updateOrganisationStatus(
  orgId: string,
  status: string
): Promise<OrganisationDetail | null> {
  const result = await pool.query<OrgRow>(
    `UPDATE organisations SET status = $1, updated_at = NOW()
     WHERE id = $2 AND deleted_at IS NULL
     RETURNING ${ORG_SELECT}`,
    [status, orgId]
  );
  const row = result.rows[0];
  return row ? mapOrgDetail(row) : null;
}

export async function verifyOrganisationKyc(
  orgId: string,
  params: {
    action: 'approve' | 'reject';
    verifiedById: string;
  }
): Promise<OrganisationDetail | null> {
  const verificationStatus = params.action === 'approve' ? 'verified' : 'rejected';
  const status = params.action === 'approve' ? 'active' : 'pending_verification';
  const verifiedAt = params.action === 'approve' ? new Date() : null;

  const result = await pool.query<OrgRow>(
    `UPDATE organisations SET
       verification_status = $1,
       status = $2,
       verified_at = $3,
       verified_by_id = $4,
       updated_at = NOW()
     WHERE id = $5 AND deleted_at IS NULL
     RETURNING ${ORG_SELECT}`,
    [verificationStatus, status, verifiedAt, params.verifiedById, orgId]
  );
  const row = result.rows[0];
  return row ? mapOrgDetail(row) : null;
}

export async function submitOrganisationKyc(orgId: string, kycDocuments: unknown): Promise<OrganisationDetail | null> {
  const result = await pool.query<OrgRow>(
    `UPDATE organisations SET
       kyc_documents = $1,
       verification_status = 'under_review',
       updated_at = NOW()
     WHERE id = $2 AND deleted_at IS NULL
     RETURNING ${ORG_SELECT}`,
    [JSON.stringify(kycDocuments), orgId]
  );
  const row = result.rows[0];
  return row ? mapOrgDetail(row) : null;
}

export async function listOrgMembers(orgId: string): Promise<OrgMemberResponse[]> {
  const result = await pool.query<{
    id: string;
    user_id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    role: number;
    status: string;
    assigned_at: Date;
  }>(
    `SELECT m.id, m.user_id, u.email, u.first_name, u.last_name, m.role, m.status, m.assigned_at
     FROM org_members m
     JOIN users u ON u.id = m.user_id
     WHERE m.org_id = $1 AND m.deleted_at IS NULL AND u.deleted_at IS NULL
     ORDER BY m.role DESC, m.assigned_at ASC`,
    [orgId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    role: row.role,
    status: row.status as OrgMemberResponse['status'],
    assignedAt: row.assigned_at.toISOString(),
  }));
}

export async function findOrgMember(orgId: string, memberId: string): Promise<OrgMemberResponse | null> {
  const result = await pool.query<{
    id: string;
    user_id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    role: number;
    status: string;
    assigned_at: Date;
  }>(
    `SELECT m.id, m.user_id, u.email, u.first_name, u.last_name, m.role, m.status, m.assigned_at
     FROM org_members m
     JOIN users u ON u.id = m.user_id
     WHERE m.org_id = $1 AND m.id = $2 AND m.deleted_at IS NULL`,
    [orgId, memberId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    role: row.role,
    status: row.status as OrgMemberResponse['status'],
    assignedAt: row.assigned_at.toISOString(),
  };
}

export async function updateOrgMember(
  orgId: string,
  memberId: string,
  fields: { role?: number; status?: string }
): Promise<OrgMemberResponse | null> {
  const sets: string[] = [];
  const values: unknown[] = [];
  if (fields.role !== undefined) {
    values.push(fields.role);
    sets.push(`role = $${values.length}`);
  }
  if (fields.status !== undefined) {
    values.push(fields.status);
    sets.push(`status = $${values.length}`);
  }
  if (sets.length === 0) return findOrgMember(orgId, memberId);

  values.push(orgId, memberId);
  await pool.query(
    `UPDATE org_members SET ${sets.join(', ')}, updated_at = NOW()
     WHERE org_id = $${values.length - 1} AND id = $${values.length} AND deleted_at IS NULL`,
    values
  );
  return findOrgMember(orgId, memberId);
}

export async function removeOrgMember(orgId: string, memberId: string): Promise<boolean> {
  const result = await pool.query(
    `UPDATE org_members SET deleted_at = NOW(), status = 'inactive', updated_at = NOW()
     WHERE org_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [orgId, memberId]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function createInvite(params: {
  orgId: string;
  invitedById: string;
  inviteeEmail: string;
  inviteeName?: string;
  roleToAssign: number;
  eventId?: string;
  inviteToken: string;
  expiresAt: Date;
  includeToken?: boolean;
}): Promise<InviteResponse> {
  const result = await pool.query<{
    id: string;
    invitee_email: string;
    invitee_name: string | null;
    role_to_assign: number;
    event_id: string | null;
    invite_token: string;
    status: string;
    token_expires_at: Date;
    created_at: Date;
  }>(
    `INSERT INTO invites (
       org_id, invited_by_id, invitee_email, invitee_name, role_to_assign, event_id,
       invite_token, token_expires_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, invitee_email, invitee_name, role_to_assign, event_id, invite_token,
               status, token_expires_at, created_at`,
    [
      params.orgId,
      params.invitedById,
      params.inviteeEmail.toLowerCase(),
      params.inviteeName ?? null,
      params.roleToAssign,
      params.eventId ?? null,
      params.inviteToken,
      params.expiresAt,
    ]
  );

  const row = result.rows[0];
  return {
    id: row.id,
    inviteeEmail: row.invitee_email,
    inviteeName: row.invitee_name,
    roleToAssign: row.role_to_assign,
    eventId: row.event_id,
    status: row.status as InviteResponse['status'],
    tokenExpiresAt: row.token_expires_at.toISOString(),
    inviteToken: params.includeToken ? row.invite_token : undefined,
    createdAt: row.created_at.toISOString(),
  };
}

export async function listPendingInvites(orgId: string): Promise<InviteResponse[]> {
  const result = await pool.query<{
    id: string;
    invitee_email: string;
    role_to_assign: number;
    status: string;
    token_expires_at: Date;
    created_at: Date;
  }>(
    `SELECT id, invitee_email, role_to_assign, status, token_expires_at, created_at
     FROM invites WHERE org_id = $1 AND status = 'pending'
     ORDER BY created_at DESC`,
    [orgId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    inviteeEmail: row.invitee_email,
    inviteeName: null,
    roleToAssign: row.role_to_assign,
    eventId: null,
    status: row.status as InviteResponse['status'],
    tokenExpiresAt: row.token_expires_at.toISOString(),
    createdAt: row.created_at.toISOString(),
  }));
}

export async function listInvitesForEmail(email: string) {
  if (!email?.trim()) return [];

  const result = await pool.query<{
    id: string;
    org_id: string;
    org_name: string;
    role_to_assign: number;
    status: string;
    token_expires_at: Date;
    created_at: Date;
    invite_token: string;
  }>(
    `SELECT i.id, i.org_id, o.name as org_name, i.role_to_assign, i.status, i.token_expires_at, i.created_at, i.invite_token
     FROM invites i
     JOIN organisations o ON i.org_id = o.id
     WHERE i.invitee_email = $1 AND i.status = 'pending' AND i.token_expires_at > NOW()
     ORDER BY i.created_at DESC`,
    [email.toLowerCase().trim()]
  );

  return result.rows.map((row) => ({
    id: row.id,
    orgId: row.org_id,
    orgName: row.org_name,
    roleToAssign: row.role_to_assign,
    status: row.status,
    tokenExpiresAt: row.token_expires_at.toISOString(),
    createdAt: row.created_at.toISOString(),
    inviteToken: row.invite_token,
  }));
}


export async function countOrgInvites(orgId: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM invites WHERE org_id = $1`,
    [orgId]
  );
  return Number(result.rows[0]?.count ?? 0);
}

export async function orgHasKycDocuments(orgId: string): Promise<boolean> {
  const result = await pool.query<{ kyc_documents: unknown }>(
    `SELECT kyc_documents FROM organisations WHERE id = $1`,
    [orgId]
  );
  const docs = result.rows[0]?.kyc_documents;
  return Array.isArray(docs) && docs.length > 0;
}

export async function findInviteByToken(token: string): Promise<{
  id: string;
  orgId: string;
  invitedById: string;
  inviteeEmail: string;
  roleToAssign: number;
  eventId: string | null;
  status: string;
  tokenExpiresAt: Date;
} | null> {
  const result = await pool.query<{
    id: string;
    org_id: string;
    invited_by_id: string;
    invitee_email: string;
    role_to_assign: number;
    event_id: string | null;
    status: string;
    token_expires_at: Date;
  }>(
    `SELECT id, org_id, invited_by_id, invitee_email, role_to_assign, event_id, status, token_expires_at
     FROM invites WHERE invite_token = $1`,
    [token]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    orgId: row.org_id,
    invitedById: row.invited_by_id,
    inviteeEmail: row.invitee_email,
    roleToAssign: row.role_to_assign,
    eventId: row.event_id,
    status: row.status,
    tokenExpiresAt: row.token_expires_at,
  };
}

export async function acceptInvite(
  client: PoolClient,
  params: {
    inviteId: string;
    userId: string;
    orgId: string;
    role: number;
    assignedById: string;
    walletAddress?: string;
    eventId?: string | null;
  }
): Promise<void> {
  await client.query(
    `INSERT INTO org_members (org_id, user_id, role, assigned_by_id, status)
     VALUES ($1, $2, $3, $4, 'active')
     ON CONFLICT (org_id, user_id) DO UPDATE SET
       role = EXCLUDED.role,
       status = 'active',
       deleted_at = NULL,
       updated_at = NOW()`,
    [params.orgId, params.userId, params.role, params.assignedById]
  );

  if (params.role === 3 && params.walletAddress) {
    await assignSuperAdminToOrg(client, {
      orgId: params.orgId,
      userId: params.userId,
      walletAddress: params.walletAddress,
    });
  }

  // Volunteer invite tied to an event → grant scanner access
  if (params.role === 1 && params.eventId) {
    await client.query(
      `INSERT INTO volunteer_event_assignments (
         event_id, user_id, org_id, permitted_zones, assigned_by_id, status
       ) VALUES ($1, $2, $3, '{}', $4, 'active')
       ON CONFLICT (event_id, user_id) DO UPDATE SET
         status = 'active',
         assigned_by_id = EXCLUDED.assigned_by_id,
         updated_at = NOW()`,
      [params.eventId, params.userId, params.orgId, params.assignedById]
    );
  }

  await client.query(
    `UPDATE invites SET status = 'accepted', accepted_at = NOW(), accepted_by_id = $1, updated_at = NOW()
     WHERE id = $2`,
    [params.userId, params.inviteId]
  );
}

export async function expireStaleInvites(): Promise<void> {
  await pool.query(
    `UPDATE invites SET status = 'expired', updated_at = NOW()
     WHERE status = 'pending' AND token_expires_at < NOW()`
  );
}
