export type OrgStatus = 'pending_verification' | 'active' | 'suspended' | 'inactive';
export type OrgVerificationStatus = 'unverified' | 'under_review' | 'verified' | 'rejected';
export type SubscriptionPlan = 'starter' | 'growth' | 'enterprise';
export type OrgMemberStatus = 'active' | 'inactive' | 'suspended';
export type InviteStatus = 'pending' | 'accepted' | 'rejected' | 'expired';
export type OrgType = 'promoter' | 'venue' | 'university' | 'sports' | 'corporate' | 'other';

export interface OrganisationSummary {
  id: string;
  name: string;
  slug: string;
  status: OrgStatus;
  verificationStatus: OrgVerificationStatus;
  subscriptionPlan: SubscriptionPlan;
  platformCommissionBps: number;
  country: string | null;
  city: string | null;
  orgType: OrgType | null;
  createdAt: string;
}

export interface OrganisationDetail extends OrganisationSummary {
  description: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  websiteUrl: string | null;
  brandPrimaryColor: string | null;
  brandSecondaryColor: string | null;
  taxId: string | null;
  gstNumber: string | null;
  registrationNumber: string | null;
  state: string | null;
  postalCode: string | null;
  founderName: string | null;
  founderPhone: string | null;
  pendingFounderEmail: string | null;
  superAdminId: string | null;
  superAdminWalletAddress: string | null;
  orgRegistryContractAddress: string | null;
  chainId: number;
  verifiedAt: string | null;
  walletConfirmedAt: string | null;
  updatedAt: string;
  /** Submitted KYC document metadata (platform review). */
  kycDocuments: OrgKycDocument[] | null;
}

export interface OrgKycDocument {
  type: string;
  label: string;
  url: string;
}

export interface OrgMemberResponse {
  id: string;
  userId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: number;
  status: OrgMemberStatus;
  assignedAt: string;
}

export interface InviteResponse {
  id: string;
  inviteeEmail: string;
  inviteeName: string | null;
  roleToAssign: number;
  eventId: string | null;
  status: InviteStatus;
  tokenExpiresAt: string;
  inviteToken?: string;
  createdAt: string;
}

export interface OnboardingStatus {
  profileComplete: boolean;
  profilePercent: number;
  kycSubmitted: boolean;
  kycVerified: boolean;
  walletConfirmed: boolean;
  teamInvited: boolean;
  readyForEvents: boolean;
  verificationStatus: OrgVerificationStatus;
}
