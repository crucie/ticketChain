export const ROLES = {
  CONSUMER: 0,
  VOLUNTEER: 1,
  ADMIN: 2,
  SUPER_ADMIN: 3,
  PLATFORM_ADMIN: 99,
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export type { AccessTokenPayload, AuthUserResponse } from './types/auth.types.js';
export type {
  InviteResponse,
  InviteStatus,
  OnboardingStatus,
  OrgMemberResponse,
  OrgMemberStatus,
  OrganisationDetail,
  OrgKycDocument,
  OrganisationSummary,
  OrgStatus,
  OrgType,
  OrgVerificationStatus,
  SubscriptionPlan,
} from './types/org.types.js';
export type {
  EventDetail,
  EventStatus,
  EventSummary,
  TierResponse,
  TierStatus,
} from './types/event.types.js';
export type {
  MintIdempotencyStatus,
  MintTicketResponse,
  QrPayloadResponse,
  TicketDetail,
  TicketStatus,
  TicketSummary,
} from './types/ticket.types.js';
export type {
  CheckoutResponse,
  OrderStatus,
  PaymentMethod,
  PaymentProvider,
  TicketOrderSummary,
} from './types/payment.types.js';
export type {
  VolunteerCheckinResult,
  VolunteerCheckinStats,
  VolunteerCheckinHistoryItem,
  VolunteerEventAssignment,
} from './types/volunteer.types.js';

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  meta?: {
    page: number;
    limit: number;
    total: number;
    nextCursor?: string;
  };
}
