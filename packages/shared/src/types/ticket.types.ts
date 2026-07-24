export type TicketStatus = 'valid' | 'used' | 'cancelled' | 'transferred' | 'listed_for_resale';
export type MintIdempotencyStatus = 'pending' | 'confirmed' | 'failed';

export interface TicketSummary {
  id: string;
  eventId: string;
  tierId: string;
  tierIndex: number;
  ownerWalletAddress: string;
  tokenId: number;
  contractAddress: string;
  status: TicketStatus;
  mintedAt: string;
  /** 9-char gate backup code (owner-facing). */
  checkinCode?: string;
}

export interface TicketDetail extends TicketSummary {
  transactionHash: string;
  seatNumber: string | null;
  promoCodeUsed: string | null;
  discountAppliedBps: number | null;
  usedAt: string | null;
  createdAt: string;
}

export interface MintTicketResponse {
  tickets: TicketSummary[];
  transactionHash: string;
  totalPaidWei: string;
}

export interface QrPayloadResponse {
  payload: string;
  expiresIn: number;
  checkinCode?: string;
}
