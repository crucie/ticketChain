const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000';

export interface AuthUser {
  id: string;
  email: string;
  walletAddress: string;
  role: number;
  orgIds: string[];
  firstName?: string | null;
  lastName?: string | null;
  phoneNumber?: string | null;
  bio?: string | null;
  profileImage?: string | null;
  isNewUser?: boolean;
}

export function getPostLoginPath(role: number): string {
  return role === 99 ? '/platform' : '/events';
}

export interface EventSummary {
  id: string;
  orgId?: string;
  orgName?: string;
  name: string;
  category: string | null;
  city: string | null;
  country: string | null;
  eventDate: string;
  status: string;
  imageIpfsUrl: string | null;
  totalTicketsSold: number;
  updatedAt?: string;
  createdAt?: string;
}

export interface PublicOrgProfile {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  websiteUrl: string | null;
  brandPrimaryColor: string | null;
  brandSecondaryColor: string | null;
  city: string | null;
  country: string | null;
  status: string;
}

export async function getPublicOrgBySlug(slug: string): Promise<PublicOrgProfile | null> {
  const res = await fetch(`${API_URL}/api/orgs/slug/${encodeURIComponent(slug)}`, { cache: 'no-store' });
  if (res.status === 404) return null;
  const parsed = await parseJson<PublicOrgProfile>(res);
  return parsed.data ?? null;
}

export interface TierResponse {
  id: string;
  eventId: string;
  tierIndex: number;
  name: string;
  description: string | null;
  zone: string | null;
  totalSupply: number;
  minted: number;
  maxPerWallet: number;
  priceWei: string;
  priceDisplay: number | null;
  isTransferable: boolean;
  metadataIpfsHash: string | null;
  metadataIpfsUri: string | null;
  status: string;
}

export interface EventDetail extends EventSummary {
  description: string | null;
  venueName: string | null;
  contractAddress: string | null;
  resaleEnabled?: boolean;
  tiers?: TierResponse[];
}

export interface CheckoutResponse {
  orderId: string;
  paymentUrl: string;
  amountFiat: number;
  currency: string;
  expiresAt: string;
  paymentMethod: 'chainpay' | 'fiat_gateway';
}

export interface TicketOrderSummary {
  id: string;
  eventId: string;
  tierId: string;
  quantity: number;
  amountFiat: number;
  currency: string;
  paymentMethod: string;
  status: string;
  paymentUrl: string | null;
  transactionHash: string | null;
  expiresAt: string;
  paidAt: string | null;
  completedAt: string | null;
}

export interface TicketSummary {
  id: string;
  eventId: string;
  tierId: string;
  tierIndex: number;
  ownerWalletAddress: string;
  tokenId: number;
  contractAddress: string;
  status: string;
  mintedAt: string;
}

async function parseJson<T>(res: Response): Promise<{ ok: boolean; data?: T; error?: string; code?: string }> {
  try {
    const text = await res.text();
    const json = JSON.parse(text);
    if (!res.ok || !json.success) {
      return { ok: false, error: json.error ?? json.detail ?? 'Request failed', code: json.code };
    }
    return { ok: true, data: json.data as T };
  } catch {
    if (res.status === 413) {
      return { ok: false, error: 'File too large — use an image under 10MB' };
    }
    return { ok: false, error: `Unexpected response (HTTP ${res.status})` };
  }
}

let isRefreshing = false;
let refreshSubscribers: ((success: boolean) => void)[] = [];

function subscribeTokenRefresh(cb: (success: boolean) => void) {
  refreshSubscribers.push(cb);
}

function onRefreshed(success: boolean) {
  refreshSubscribers.forEach((cb) => cb(success));
  refreshSubscribers = [];
}

export async function fetchWithAuth(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const mergedInit = {
    ...init,
    credentials: init?.credentials ?? 'include',
  };

  const response = await globalThis.fetch(input, mergedInit);

  // Token refresh relies on browser cookies — only attempt in the client
  if (response.status === 401 && typeof window !== 'undefined') {
    const urlString = typeof input === 'string' ? input : (input instanceof URL ? input.toString() : input.url);
    if (urlString.includes('/api/auth/refresh')) {
      return response;
    }

    if (!isRefreshing) {
      isRefreshing = true;
      try {
        const refreshRes = await globalThis.fetch(`${API_URL}/api/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        });
        if (refreshRes.ok) {
          onRefreshed(true);
          isRefreshing = false;
          return globalThis.fetch(input, mergedInit);
        } else {
          onRefreshed(false);
          isRefreshing = false;
        }
      } catch {
        onRefreshed(false);
        isRefreshing = false;
      }
    } else {
      const refreshSuccess = await new Promise<boolean>((resolve) => {
        subscribeTokenRefresh((success) => resolve(success));
      });
      if (refreshSuccess) {
        return globalThis.fetch(input, mergedInit);
      }
    }
  }

  return response;
}

const fetch = fetchWithAuth;

export async function verifySession(idToken: string, walletAddress: string): Promise<AuthUser> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/auth/verify`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken, walletAddress }),
    });
  } catch {
    throw new Error(
      `Cannot reach the API at ${API_URL}. Ensure "pnpm run dev:api" is running and NEXT_PUBLIC_API_URL matches.`
    );
  }

  const parsed = await parseJson<AuthUser>(res);
  if (!parsed.ok || !parsed.data) {
    throw new Error(parsed.error ?? 'Session verification failed');
  }
  return parsed.data;
}

export async function getMe(): Promise<AuthUser | null> {
  try {
    const res = await fetch(`${API_URL}/api/auth/me`, { credentials: 'include', cache: 'no-store' });
    if (!res.ok) return null;
    const parsed = await parseJson<AuthUser>(res);
    return parsed.ok && parsed.data ? parsed.data : null;
  } catch {
    // Network error (API down / connection refused) — don't crash
    return null;
  }
}

export async function listEvents(sort?: string): Promise<EventSummary[]> {
  const url = sort ? `${API_URL}/api/events?sort=${sort}` : `${API_URL}/api/events`;
  const res = await fetch(url, { next: { revalidate: 30 } });
  const parsed = await parseJson<EventSummary[]>(res);
  return parsed.data ?? [];
}

export async function getEvent(eventId: string): Promise<EventDetail | null> {
  const res = await fetch(`${API_URL}/api/events/${eventId}`, { cache: 'no-store' });
  const parsed = await parseJson<EventDetail>(res);
  return parsed.data ?? null;
}

export async function createCheckout(params: {
  tierId: string;
  quantity: number;
  paymentMethod: 'chainpay' | 'fiat_gateway';
  idempotencyKey: string;
}): Promise<CheckoutResponse> {
  const res = await fetch(`${API_URL}/api/tickets/checkout`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': params.idempotencyKey,
    },
    body: JSON.stringify({
      tierId: params.tierId,
      quantity: params.quantity,
      paymentMethod: params.paymentMethod,
    }),
  });

  const parsed = await parseJson<CheckoutResponse>(res);
  if (!parsed.ok || !parsed.data) {
    throw new Error(parsed.error ?? 'Checkout failed');
  }
  return parsed.data;
}

export async function getOrder(orderId: string): Promise<TicketOrderSummary | null> {
  const res = await fetch(`${API_URL}/api/tickets/orders/${orderId}`, {
    credentials: 'include',
    cache: 'no-store',
  });
  const parsed = await parseJson<TicketOrderSummary>(res);
  return parsed.data ?? null;
}

export async function mintTickets(params: {
  tierId: string;
  quantity: number;
  idempotencyKey: string;
}): Promise<{ tickets: TicketSummary[]; transactionHash: string }> {
  const res = await fetch(`${API_URL}/api/tickets/mint`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': params.idempotencyKey,
    },
    body: JSON.stringify({ tierId: params.tierId, quantity: params.quantity }),
  });

  const parsed = await parseJson<{ tickets: TicketSummary[]; transactionHash: string }>(res);
  if (!parsed.ok || !parsed.data) {
    throw new Error(parsed.error ?? 'Mint failed');
  }
  return parsed.data;
}

export async function listMyTickets(): Promise<TicketSummary[]> {
  const res = await fetch(`${API_URL}/api/tickets`, { credentials: 'include', cache: 'no-store' });
  const parsed = await parseJson<TicketSummary[]>(res);
  return parsed.data ?? [];
}

export async function getTicketQr(ticketId: string): Promise<{ payload: string; expiresIn: number }> {
  const res = await fetch(`${API_URL}/api/tickets/${ticketId}/qr`, { credentials: 'include', cache: 'no-store' });
  const parsed = await parseJson<{ payload: string; expiresIn: number }>(res);
  if (!parsed.ok || !parsed.data) {
    throw new Error(parsed.error ?? 'Failed to get QR payload');
  }
  return parsed.data;
}

export async function transferTicket(ticketId: string, recipient: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/tickets/${ticketId}/transfer`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipientEmailOrWallet: recipient }),
  });
  const parsed = await parseJson<void>(res);
  if (!parsed.ok) {
    throw new Error(parsed.error ?? 'Transfer failed');
  }
}

export async function listTicketForResale(ticketId: string, askPriceWei: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/tickets/${ticketId}/resell`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ askPriceWei }),
  });
  const parsed = await parseJson<void>(res);
  if (!parsed.ok) {
    throw new Error(parsed.error ?? 'Resale listing failed');
  }
}

export async function cancelResaleListing(ticketId: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/tickets/${ticketId}/resell`, {
    method: 'DELETE',
    credentials: 'include',
  });
  const parsed = await parseJson<void>(res);
  if (!parsed.ok) {
    throw new Error(parsed.error ?? 'Resale cancellation failed');
  }
}

export interface ResaleListing {
  id: string;
  ticketId: string;
  eventId: string;
  tierId: string;
  sellerUserId: string;
  sellerWallet: string;
  facePriceWei: string;
  askPriceWei: string;
  maxPriceWei: string;
  status: string;
  createdAt: string;
}

export async function listResaleMarketplace(): Promise<ResaleListing[]> {
  const res = await fetch(`${API_URL}/api/marketplace`, { cache: 'no-store' });
  const parsed = await parseJson<ResaleListing[]>(res);
  return parsed.data ?? [];
}

export async function buyResaleListing(params: {
  listingId: string;
  idempotencyKey: string;
}): Promise<void> {
  const res = await fetch(`${API_URL}/api/marketplace/${params.listingId}/buy`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': params.idempotencyKey,
    },
  });
  const parsed = await parseJson<void>(res);
  if (!parsed.ok) {
    throw new Error(parsed.error ?? 'Purchase failed');
  }
}

export interface LoyaltyReward {
  id: string;
  rewardType: string;
  rewardMetadata: {
    badge_name?: string;
    event_date?: string;
    tier?: string;
    discount_percent?: number;
  } | null;
  tokenId: number | null;
  contractAddress: string | null;
  issuedAt: string;
}

export interface ReferralStats {
  referralCode: string;
  referralsCount: number;
  rewardsCount: number;
}

export interface WalletInfo {
  walletAddress: string;
  balanceWei: string;
  symbol: string;
  chainId: number;
  rpcUrl: string;
}

export async function getWalletBalance(): Promise<WalletInfo | null> {
  const res = await fetch(`${API_URL}/api/profile/wallet`, { credentials: 'include', cache: 'no-store' });
  if (!res.ok) return null;
  const parsed = await parseJson<WalletInfo>(res);
  return parsed.data ?? null;
}

export type FaucetResult =
  | {
      mode: 'in_app';
      txHash: string;
      amountWei: string;
      targetAddress: string;
      balanceWei: string;
      symbol: string;
    }
  | {
      mode: 'external';
      externalUrl: string;
      targetAddress: string;
      message: string;
    };

export async function linkWalletToAccount(walletAddress: string): Promise<{ walletAddress: string }> {
  const res = await fetch(`${API_URL}/api/profile/wallet/link`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletAddress }),
  });
  const parsed = await parseJson<{ walletAddress: string; user: AuthUser }>(res);
  if (!parsed.ok || !parsed.data) {
    throw new Error(parsed.error ?? 'Failed to link wallet');
  }
  return { walletAddress: parsed.data.walletAddress };
}

export async function requestFaucetFunds(targetAddress: string): Promise<FaucetResult> {
  const res = await fetch(`${API_URL}/api/profile/faucet`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetAddress }),
  });
  const parsed = await parseJson<FaucetResult>(res);
  if (!parsed.ok || !parsed.data) {
    throw new Error(parsed.error ?? 'Faucet request failed');
  }
  return parsed.data;
}

export async function listMyRewards(): Promise<LoyaltyReward[]> {
  const res = await fetch(`${API_URL}/api/profile/rewards`, { credentials: 'include', cache: 'no-store' });
  const parsed = await parseJson<LoyaltyReward[]>(res);
  return parsed.data ?? [];
}

export async function getReferralStats(): Promise<ReferralStats | null> {
  const res = await fetch(`${API_URL}/api/profile/referral`, { credentials: 'include', cache: 'no-store' });
  if (!res.ok) return null;
  const parsed = await parseJson<ReferralStats>(res);
  return parsed.data ?? null;
}

export async function updateProfile(body: {
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  bio?: string;
}): Promise<Pick<AuthUser, 'id' | 'email' | 'walletAddress' | 'firstName' | 'lastName' | 'phoneNumber' | 'bio'>> {
  const res = await fetch(`${API_URL}/api/profile`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const parsed = await parseJson<Pick<AuthUser, 'id' | 'email' | 'walletAddress' | 'firstName' | 'lastName' | 'phoneNumber' | 'bio'>>(res);
  if (!parsed.ok || !parsed.data) {
    throw new Error(parsed.error ?? 'Failed to update profile');
  }
  return parsed.data;
}

export interface VolunteerEvent {
  id: string;
  name: string;
  eventDate: string;
  city: string | null;
  permittedZones: string[];
}

export interface VerifyCheckinResult {
  success: boolean;
  reason?: string;
  ticket?: {
    id: string;
    tokenId: number;
    ownerWalletAddress: string;
    zone: string;
  };
}

export interface CheckinStats {
  totalCheckedIn: number;
  totalTicketsSold: number;
  remainingCount: number;
}

export interface CheckinHistoryItem {
  id: string;
  ticketId: string;
  tokenId: number;
  zoneAccessed: string;
  verificationSuccess: boolean;
  failureReason: string | null;
  createdAt: string;
}

export async function getVolunteerEvents(): Promise<VolunteerEvent[]> {
  const res = await fetch(`${API_URL}/api/volunteer/events`, { credentials: 'include', cache: 'no-store' });
  const parsed = await parseJson<VolunteerEvent[]>(res);
  return parsed.data ?? [];
}

export async function verifyCheckin(qrPayload: string, deviceId: string): Promise<VerifyCheckinResult> {
  const res = await fetch(`${API_URL}/api/volunteer/checkin/verify`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ qrPayload, deviceId }),
  });
  const parsed = await parseJson<VerifyCheckinResult>(res);
  if (!parsed.ok || !parsed.data) {
    throw new Error(parsed.error ?? 'Verification failed');
  }
  return parsed.data;
}

export async function getCheckinStats(eventId: string): Promise<CheckinStats> {
  const res = await fetch(`${API_URL}/api/volunteer/checkin/stats?eventId=${eventId}`, { credentials: 'include', cache: 'no-store' });
  const parsed = await parseJson<CheckinStats>(res);
  if (!parsed.ok || !parsed.data) {
    throw new Error(parsed.error ?? 'Failed to fetch stats');
  }
  return parsed.data;
}

export async function getCheckinHistory(eventId: string): Promise<CheckinHistoryItem[]> {
  const res = await fetch(`${API_URL}/api/volunteer/checkin/history?eventId=${eventId}`, { credentials: 'include', cache: 'no-store' });
  const parsed = await parseJson<CheckinHistoryItem[]>(res);
  return parsed.data ?? [];
}

export type OrgType = 'promoter' | 'venue' | 'university' | 'sports' | 'corporate' | 'other';

export interface AdminOrgDetails {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  bannerUrl?: string | null;
  websiteUrl?: string | null;
  brandPrimaryColor?: string | null;
  brandSecondaryColor?: string | null;
  taxId?: string | null;
  gstNumber?: string | null;
  registrationNumber?: string | null;
  orgType?: OrgType | null;
  country?: string | null;
  state?: string | null;
  city?: string | null;
  postalCode?: string | null;
  founderName?: string | null;
  founderPhone?: string | null;
  pendingFounderEmail?: string | null;
  superAdminWalletAddress?: string | null;
  verificationStatus?: string;
  walletConfirmedAt?: string | null;
  subscriptionPlan: string;
  status: string;
  platformCommissionBps: number;
}

export interface OnboardingStatus {
  profileComplete: boolean;
  profilePercent: number;
  kycSubmitted: boolean;
  kycVerified: boolean;
  walletConfirmed: boolean;
  teamInvited: boolean;
  readyForEvents: boolean;
  verificationStatus: string;
}

export interface AdminEventSummary {
  id: string;
  name: string;
  eventDate: string;
  status: string;
  contractAddress: string | null;
  totalTicketsSold: number;
  totalCheckedIn: number;
  totalRevenueWei: string;
  updatedAt?: string;
  imageIpfsUrl?: string | null;
}

export interface AdminMember {
  id: string;
  role: number;
  status: string;
  assignedAt: string;
  email: string;
  saralUserId: string;
}

export interface AdminEarnings {
  grossRevenueWei: string;
  commissionWei: string;
  refundsWei: string;
  netPayoutWei: string;
}

export async function getAdminOrganisation(): Promise<AdminOrgDetails> {
  const res = await fetch(`${API_URL}/api/admin/organisation`, { credentials: 'include', cache: 'no-store' });
  const parsed = await parseJson<AdminOrgDetails>(res);
  if (!parsed.ok || !parsed.data) {
    throw new Error(parsed.error ?? 'Failed to fetch organisation details');
  }
  return parsed.data;
}

export async function getAdminEvents(): Promise<AdminEventSummary[]> {
  const res = await fetch(`${API_URL}/api/admin/events`, { credentials: 'include', cache: 'no-store' });
  const parsed = await parseJson<AdminEventSummary[]>(res);
  return parsed.data ?? [];
}

export async function getAdminEvent(eventId: string): Promise<EventDetail | null> {
  const res = await fetch(`${API_URL}/api/admin/events/${eventId}`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (res.status === 404) return null;
  const parsed = await parseJson<EventDetail>(res);
  return parsed.data ?? null;
}

export async function updateAdminOrganisation(body: Partial<AdminOrgDetails> & {
  brandPrimaryColor?: string;
  brandSecondaryColor?: string;
  postalCode?: string;
  founderPhone?: string;
}): Promise<AdminOrgDetails> {
  const res = await fetch(`${API_URL}/api/admin/organisation`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const parsed = await parseJson<AdminOrgDetails>(res);
  if (!parsed.ok || !parsed.data) {
    throw new Error(parsed.error ?? 'Failed to update organisation');
  }
  return parsed.data;
}

export async function submitOrgKyc(documents: Array<{
  type: 'registration_certificate' | 'tax_id' | 'id_proof' | 'address_proof' | 'other';
  label: string;
  url: string;
}>): Promise<void> {
  const res = await fetch(`${API_URL}/api/admin/organisation/kyc`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ documents }),
  });
  const parsed = await parseJson<void>(res);
  if (!parsed.ok) {
    throw new Error(parsed.error ?? 'KYC submission failed');
  }
}

export function inferFileMimeType(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
  };
  return map[ext] ?? 'application/octet-stream';
}

export async function uploadKycDocument(params: {
  fileName: string;
  mimeType: string;
  contentBase64: string;
}): Promise<{ url: string }> {
  const res = await fetch(`${API_URL}/api/admin/organisation/upload-asset`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...params, assetType: 'kyc_document' }),
  });
  const parsed = await parseJson<{ url?: string; ipfsUri?: string; asset?: { gatewayUrl?: string; uri?: string } }>(res);
  if (!parsed.ok || !parsed.data) {
    throw new Error(parsed.error ?? 'KYC document upload failed');
  }
  const url =
    parsed.data.url ??
    parsed.data.asset?.gatewayUrl ??
    parsed.data.asset?.uri ??
    parsed.data.ipfsUri;
  if (!url) {
    throw new Error('KYC document upload failed — server did not return a URL');
  }
  return { url };
}

export async function uploadOrgAsset(params: {
  fileName: string;
  mimeType: string;
  contentBase64: string;
  assetType: 'logo' | 'banner';
}): Promise<{ org: AdminOrgDetails }> {
  const res = await fetch(`${API_URL}/api/admin/organisation/upload-asset`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const parsed = await parseJson<{ org: AdminOrgDetails }>(res);
  if (!parsed.ok || !parsed.data) {
    throw new Error(parsed.error ?? 'Upload failed');
  }
  return parsed.data;
}

export async function getOnboardingStatus(): Promise<OnboardingStatus> {
  const res = await fetch(`${API_URL}/api/admin/onboarding/status`, { credentials: 'include', cache: 'no-store' });
  const parsed = await parseJson<OnboardingStatus>(res);
  if (!parsed.ok || !parsed.data) {
    throw new Error(parsed.error ?? 'Failed to fetch onboarding status');
  }
  return parsed.data;
}

export async function confirmOrgWallet(walletAddress: string): Promise<OnboardingStatus> {
  const res = await fetch(`${API_URL}/api/admin/onboarding/confirm-wallet`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletAddress }),
  });
  const parsed = await parseJson<OnboardingStatus>(res);
  if (!parsed.ok || !parsed.data) {
    throw new Error(parsed.error ?? 'Wallet confirmation failed');
  }
  return parsed.data;
}

export async function createAdminEvent(body: {
  name: string;
  description?: string;
  eventDate: string;
  eventEndDate?: string;
  venueName: string;
  city: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  category: string;
  ageRestriction?: number;
  tags?: string[];
  resaleEnabled?: boolean;
  resalePriceCapBps?: number;
  resaleRoyaltyBps?: number;
  zones?: string[];
}): Promise<{ id: string }> {
  const res = await fetch(`${API_URL}/api/admin/events`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const parsed = await parseJson<{ id: string }>(res);
  if (!parsed.ok || !parsed.data) {
    throw new Error(parsed.error ?? 'Failed to create event');
  }
  return parsed.data;
}

export async function createAdminTier(
  eventId: string,
  body: {
    name: string;
    description?: string;
    zone?: string;
    totalSupply: number;
    maxPerWallet?: number;
    priceWei: string;
    priceDisplay?: number;
    isTransferable?: boolean;
  }
): Promise<TierResponse> {
  const res = await fetch(`${API_URL}/api/admin/events/${eventId}/tiers`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const parsed = await parseJson<TierResponse>(res);
  if (!parsed.ok || !parsed.data) {
    throw new Error(parsed.error ?? 'Failed to create ticket tier');
  }
  return parsed.data;
}

export async function deleteAdminTier(eventId: string, tierId: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/admin/events/${eventId}/tiers/${tierId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  const parsed = await parseJson<void>(res);
  if (!parsed.ok) {
    throw new Error(parsed.error ?? 'Failed to delete ticket tier');
  }
}

export async function uploadAdminEventBanner(
  eventId: string,
  params: { fileName: string; mimeType: string; contentBase64: string }
): Promise<void> {
  const res = await fetch(`${API_URL}/api/admin/events/${eventId}/upload-banner`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const parsed = await parseJson<void>(res);
  if (!parsed.ok) {
    throw new Error(parsed.error ?? 'Failed to upload event image');
  }
}

export async function uploadAdminTierImage(
  eventId: string,
  tierId: string,
  params: { fileName: string; mimeType: string; contentBase64: string }
): Promise<TierResponse> {
  const res = await fetch(`${API_URL}/api/admin/events/${eventId}/tiers/${tierId}/upload-image`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const parsed = await parseJson<TierResponse>(res);
  if (!parsed.ok || !parsed.data) {
    throw new Error(parsed.error ?? 'Failed to upload tier image');
  }
  return parsed.data;
}

export async function updateEventStatus(eventId: string, action: 'deploy' | 'publish' | 'go-live' | 'end' | 'cancel'): Promise<void> {
  const res = await fetch(`${API_URL}/api/admin/events/${eventId}/${action}`, {
    method: 'POST',
    credentials: 'include',
  });
  const parsed = await parseJson<void>(res);
  if (!parsed.ok) {
    throw new Error(parsed.error ?? `Failed to perform action: ${action}`);
  }
}

export async function getAdminMembers(): Promise<AdminMember[]> {
  const res = await fetch(`${API_URL}/api/admin/members`, { credentials: 'include', cache: 'no-store' });
  const parsed = await parseJson<AdminMember[]>(res);
  return parsed.data ?? [];
}

export async function inviteAdminMember(body: {
  email: string;
  role: number;
  eventId?: string;
  name?: string;
}): Promise<void> {
  const res = await fetch(`${API_URL}/api/admin/members/invite`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const parsed = await parseJson<void>(res);
  if (!parsed.ok) {
    throw new Error(parsed.error ?? 'Failed to send invite');
  }
}

export async function getAdminEarnings(): Promise<AdminEarnings> {
  const res = await fetch(`${API_URL}/api/admin/finance/earnings`, { credentials: 'include', cache: 'no-store' });
  const parsed = await parseJson<AdminEarnings>(res);
  if (!parsed.ok || !parsed.data) {
    throw new Error(parsed.error ?? 'Failed to fetch earnings');
  }
  return parsed.data;
}

export interface PlatformKPIs {
  totalTicketsSold: number;
  grossRevenueWei: string;
  commissionRevenueWei: string;
  activeTenants: number;
  rpcHealth: string;
  dbHealth: string;
}

export interface PlatformTenant {
  id: string;
  name: string;
  slug: string;
  subscriptionPlan: string;
  status: string;
  verificationStatus: string;
  platformCommissionBps: number;
  country: string | null;
  city: string | null;
  createdAt: string;
}

export interface PlatformSettlement {
  id: string;
  eventId: string;
  eventName: string;
  organisationName: string;
  grossRevenueWei: string;
  commissionWei: string;
  netPayoutWei: string;
  status: 'pending' | 'completed';
}

export interface FraudAlert {
  id: string;
  ticketId: string;
  eventName: string;
  severity: 'high' | 'medium' | 'low';
  message: string;
  timestamp: string;
  walletAddress: string;
  blacklisted: boolean;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  userId: string;
  action: string;
  ipAddress: string;
  details: string;
}

export async function getPlatformKPIs(): Promise<PlatformKPIs> {
  const res = await fetch(`${API_URL}/api/platform/kpis`, { credentials: 'include', cache: 'no-store' });
  const parsed = await parseJson<PlatformKPIs>(res);
  if (!parsed.ok || !parsed.data) {
    throw new Error(parsed.error ?? 'Failed to fetch platform KPIs');
  }
  return parsed.data;
}

export async function getPlatformTenants(): Promise<PlatformTenant[]> {
  const res = await fetch(`${API_URL}/api/platform/organisations`, { credentials: 'include', cache: 'no-store' });
  const parsed = await parseJson<PlatformTenant[]>(res);
  if (!parsed.ok) {
    throw new Error(parsed.error ?? 'Failed to fetch organisations');
  }
  return parsed.data ?? [];
}

export async function updateTenantKyc(tenantId: string, status: 'verified' | 'suspended' | 'pending'): Promise<void> {
  const action = status === 'verified' ? 'approve' : 'reject';
  const res = await fetch(`${API_URL}/api/platform/organisations/${tenantId}/verify`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action })
  });
  const parsed = await parseJson<void>(res);
  if (!parsed.ok) {
    throw new Error(parsed.error ?? 'Failed to update tenant KYC');
  }
}

export async function updateTenantCommission(tenantId: string, bps: number): Promise<void> {
  const res = await fetch(`${API_URL}/api/platform/organisations/${tenantId}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ platformCommissionBps: bps })
  });
  const parsed = await parseJson<void>(res);
  if (!parsed.ok) {
    throw new Error(parsed.error ?? 'Failed to update commission rate');
  }
}

export async function getPlatformSettlements(): Promise<PlatformSettlement[]> {
  const res = await fetch(`${API_URL}/api/platform/settlements`, { credentials: 'include', cache: 'no-store' });
  const parsed = await parseJson<PlatformSettlement[]>(res);
  if (!parsed.ok) {
    throw new Error(parsed.error ?? 'Failed to fetch settlements');
  }
  return parsed.data ?? [];
}

export async function approvePlatformSettlement(settlementId: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/platform/settlements/${settlementId}/approve`, {
    method: 'POST',
    credentials: 'include'
  });
  const parsed = await parseJson<void>(res);
  if (!parsed.ok) {
    throw new Error(parsed.error ?? 'Failed to approve payout');
  }
}

export async function getPlatformFraudAlerts(): Promise<FraudAlert[]> {
  const res = await fetch(`${API_URL}/api/platform/fraud`, { credentials: 'include', cache: 'no-store' });
  const parsed = await parseJson<FraudAlert[]>(res);
  if (!parsed.ok) {
    throw new Error(parsed.error ?? 'Failed to fetch fraud alerts');
  }
  return parsed.data ?? [];
}

export async function toggleWalletBlacklist(walletAddress: string, blacklist: boolean): Promise<void> {
  const res = await fetch(`${API_URL}/api/platform/fraud/blacklist`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletAddress, blacklist })
  });
  const parsed = await parseJson<void>(res);
  if (!parsed.ok) {
    throw new Error(parsed.error ?? 'Failed to update blacklist status');
  }
}

export async function getPlatformAuditLogs(): Promise<AuditLog[]> {
  const res = await fetch(`${API_URL}/api/platform/audit`, { credentials: 'include', cache: 'no-store' });
  const parsed = await parseJson<AuditLog[]>(res);
  if (!parsed.ok) {
    throw new Error(parsed.error ?? 'Failed to fetch audit logs');
  }
  return parsed.data ?? [];
}

export async function createPlatformOrganisation(body: {
  name: string;
  slug?: string;
  description?: string;
  superAdminEmail: string;
  founderName: string;
  founderPhone?: string;
  country?: string;
  state?: string;
  city?: string;
  postalCode?: string;
  orgType: OrgType;
  registrationNumber?: string;
  taxId?: string;
  gstNumber?: string;
  subscriptionPlan?: 'starter' | 'growth' | 'enterprise';
  platformCommissionBps?: number;
  platformNotes?: string;
}): Promise<{ org: PlatformTenant; founderInvite?: { inviteToken: string; inviteUrl: string } }> {
  const res = await fetch(`${API_URL}/api/platform/organisations`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json() as {
    success: boolean;
    data?: PlatformTenant;
    founderInvite?: { inviteToken: string; inviteUrl: string };
    error?: string;
  };
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.error ?? 'Failed to create organisation');
  }
  return { org: json.data, founderInvite: json.founderInvite };
}

export async function logoutSession(): Promise<void> {
  const res = await fetch(`${API_URL}/api/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  });
  const parsed = await parseJson<void>(res);
  if (!parsed.ok) {
    throw new Error(parsed.error ?? 'Logout failed');
  }
}

// --- Venues ---
export interface VenueSummary {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  country: string | null;
  capacity: number | null;
  seatMap: unknown;
}

export async function getAdminVenues(): Promise<VenueSummary[]> {
  const res = await fetch(`${API_URL}/api/admin/venues`, { credentials: 'include', cache: 'no-store' });
  const parsed = await parseJson<VenueSummary[]>(res);
  return parsed.data ?? [];
}

export async function createAdminVenue(body: {
  name: string;
  address?: string;
  city?: string;
  country?: string;
  capacity?: number;
  seatMap?: unknown;
}): Promise<VenueSummary> {
  const res = await fetch(`${API_URL}/api/admin/venues`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const parsed = await parseJson<VenueSummary>(res);
  if (!parsed.ok || !parsed.data) throw new Error(parsed.error ?? 'Failed to create venue');
  return parsed.data;
}

export async function deleteAdminVenue(venueId: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/admin/venues/${venueId}`, { method: 'DELETE', credentials: 'include' });
  const parsed = await parseJson<void>(res);
  if (!parsed.ok) throw new Error(parsed.error ?? 'Failed to delete venue');
}

// --- Promo codes ---
export interface PromoCodeSummary {
  id: string;
  code: string;
  discountType: 'percentage' | 'fixed_wei';
  discountValue: string;
  eventId: string | null;
  tierId: string | null;
  maxUses: number | null;
  usesRemaining: number | null;
  status: string;
}

export async function getAdminPromoCodes(): Promise<PromoCodeSummary[]> {
  const res = await fetch(`${API_URL}/api/admin/promo-codes`, { credentials: 'include', cache: 'no-store' });
  const parsed = await parseJson<PromoCodeSummary[]>(res);
  return parsed.data ?? [];
}

export async function createAdminPromoCode(body: {
  code: string;
  discountType: 'percentage' | 'fixed_wei';
  discountValue: string;
  maxUses?: number;
}): Promise<PromoCodeSummary> {
  const res = await fetch(`${API_URL}/api/admin/promo-codes`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const parsed = await parseJson<PromoCodeSummary>(res);
  if (!parsed.ok || !parsed.data) throw new Error(parsed.error ?? 'Failed to create promo code');
  return parsed.data;
}

export async function updateAdminPromoCode(promoId: string, body: { status?: string }): Promise<void> {
  const res = await fetch(`${API_URL}/api/admin/promo-codes/${promoId}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const parsed = await parseJson<void>(res);
  if (!parsed.ok) throw new Error(parsed.error ?? 'Failed to update promo code');
}

export async function validatePromoCode(code: string, tierId: string): Promise<{
  valid: boolean;
  discountWei: string;
  reason?: string;
}> {
  const res = await fetch(`${API_URL}/api/tickets/mint/validate-promo`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, tierId }),
  });
  const parsed = await parseJson<{ valid: boolean; discountWei: string; reason?: string }>(res);
  if (!parsed.ok || !parsed.data) throw new Error(parsed.error ?? 'Promo validation failed');
  return parsed.data;
}

export async function listFeaturedEvents(): Promise<EventSummary[]> {
  const res = await fetch(`${API_URL}/api/events/featured`, { cache: 'no-store' });
  const parsed = await parseJson<EventSummary[]>(res);
  return parsed.data ?? [];
}

export async function downloadTicketPdf(ticketId: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/tickets/${ticketId}/pdf`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to download ticket');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ticket-${ticketId}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

// --- Event insights ---
export interface EventAnalytics {
  eventId: string;
  totalTicketsSold: number;
  totalCheckedIn: number;
  totalRevenueWei: string;
  attendanceRate: number;
  tierBreakdown: Array<{ tierName: string; totalSupply: number; minted: number; revenueWei: string }>;
}

export async function getEventAnalytics(eventId: string): Promise<EventAnalytics> {
  const res = await fetch(`${API_URL}/api/admin/events/${eventId}/analytics`, { credentials: 'include', cache: 'no-store' });
  const parsed = await parseJson<EventAnalytics>(res);
  if (!parsed.ok || !parsed.data) throw new Error(parsed.error ?? 'Failed to load analytics');
  return parsed.data;
}

export async function getEventTicketsAdmin(eventId: string): Promise<Array<{
  id: string;
  tierName: string;
  ownerWallet: string;
  status: string;
  createdAt: string;
}>> {
  const res = await fetch(`${API_URL}/api/admin/events/${eventId}/tickets`, { credentials: 'include', cache: 'no-store' });
  const parsed = await parseJson<Array<{ id: string; tierName: string; ownerWallet: string; status: string; createdAt: string }>>(res);
  return parsed.data ?? [];
}

export async function getEventCheckinsAdmin(eventId: string): Promise<Array<{
  id: string;
  ticketId: string;
  zoneAccessed: string | null;
  scanMethod: string;
  success: boolean;
  createdAt: string;
}>> {
  const res = await fetch(`${API_URL}/api/admin/events/${eventId}/checkins`, { credentials: 'include', cache: 'no-store' });
  const parsed = await parseJson<Array<{ id: string; ticketId: string; zoneAccessed: string | null; scanMethod: string; success: boolean; createdAt: string }>>(res);
  return parsed.data ?? [];
}

// --- Platform catalog ---
export async function getPlatformEvents(): Promise<Array<{
  id: string;
  orgName: string;
  name: string;
  status: string;
  eventDate: string;
  city: string | null;
  totalTicketsSold: number;
}>> {
  const res = await fetch(`${API_URL}/api/platform/events`, { credentials: 'include', cache: 'no-store' });
  const parsed = await parseJson<Array<{ id: string; orgName: string; name: string; status: string; eventDate: string; city: string | null; totalTicketsSold: number }>>(res);
  return parsed.data ?? [];
}

export async function getPlatformTickets(): Promise<Array<{
  id: string;
  eventName: string;
  orgName: string;
  tierName: string;
  ownerWallet: string;
  status: string;
}>> {
  const res = await fetch(`${API_URL}/api/platform/tickets`, { credentials: 'include', cache: 'no-store' });
  const parsed = await parseJson<Array<{ id: string; eventName: string; orgName: string; tierName: string; ownerWallet: string; status: string }>>(res);
  return parsed.data ?? [];
}

export async function getPlatformAdmins(): Promise<Array<{
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  status: string;
}>> {
  const res = await fetch(`${API_URL}/api/platform/admins`, { credentials: 'include', cache: 'no-store' });
  const parsed = await parseJson<Array<{ id: string; email: string; firstName: string | null; lastName: string | null; status: string }>>(res);
  return parsed.data ?? [];
}

export async function getPlatformRefunds(): Promise<Array<{
  id: string;
  eventName: string;
  orgName: string;
  refundAmountWei: string;
  refundReason: string | null;
  status: string;
}>> {
  const res = await fetch(`${API_URL}/api/platform/refunds`, { credentials: 'include', cache: 'no-store' });
  const parsed = await parseJson<Array<{ id: string; eventName: string; orgName: string; refundAmountWei: string; refundReason: string | null; status: string }>>(res);
  return parsed.data ?? [];
}

export async function reviewPlatformRefund(refundId: string, action: 'approve' | 'reject'): Promise<void> {
  const res = await fetch(`${API_URL}/api/platform/refunds/${refundId}/review`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  });
  const parsed = await parseJson<void>(res);
  if (!parsed.ok) throw new Error(parsed.error ?? 'Failed to review refund');
}

export async function getBlockchainHealth(): Promise<{
  rpcHealth: string;
  chainId: number;
  rpcUrl: string;
  deployerConfigured: boolean;
}> {
  const res = await fetch(`${API_URL}/api/platform/blockchain/health`, { credentials: 'include', cache: 'no-store' });
  const parsed = await parseJson<{ rpcHealth: string; chainId: number; rpcUrl: string; deployerConfigured: boolean }>(res);
  if (!parsed.ok || !parsed.data) throw new Error(parsed.error ?? 'Failed to fetch blockchain health');
  return parsed.data;
}

export async function acceptOrgInvite(token: string): Promise<{ org: any; role: number }> {
  const res = await fetch(`${API_URL}/api/orgs/accept-invite`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  const parsed = await parseJson<{ org: any; role: number }>(res);
  if (!parsed.ok || !parsed.data) {
    throw new Error(parsed.error ?? 'Failed to accept invitation');
  }
  return parsed.data;
}

export async function getMyPendingInvites(): Promise<Array<{ id: string; orgId: string; orgName: string; roleToAssign: number; status: string; tokenExpiresAt: string; createdAt: string; inviteToken: string }>> {
  const res = await fetch(`${API_URL}/api/orgs/invites/pending`, { credentials: 'include', cache: 'no-store' });
  const parsed = await parseJson<Array<{ id: string; orgId: string; orgName: string; roleToAssign: number; status: string; tokenExpiresAt: string; createdAt: string; inviteToken: string }>>(res);
  return parsed.data ?? [];
}








