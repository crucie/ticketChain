export interface VolunteerCheckinResult {
  success: boolean;
  ticketId: string;
  eventId: string;
  checkinId?: string;
  failureCode?: string;
  failureReason?: string;
  transactionHash?: string | null;
  chainStatus?: 'pending' | 'confirmed' | 'failed' | null;
  explorerUrl?: string | null;
  attendee?: {
    walletAddress: string;
    ticketTier: string;
    zone: string | null;
    seatNumber: string | null;
    tokenId: number;
  };
  checkedInAt?: string;
}

export interface VolunteerCheckinStats {
  eventId: string;
  eventName: string;
  totalTicketsSold: number;
  totalCheckedIn: number;
  percentage: number;
}

export interface VolunteerCheckinHistoryItem {
  id: string;
  ticketId: string;
  eventId: string;
  zone: string | null;
  scanMethod: string;
  verificationSuccess: boolean;
  failureReason: string | null;
  transactionHash?: string | null;
  chainStatus?: string | null;
  createdAt: string;
}

export interface VolunteerEventAssignment {
  id: string;
  eventId: string;
  eventName: string;
  eventDate: string;
  eventStatus: string;
  venueName: string | null;
  city: string | null;
  permittedZones: string[];
  totalTicketsSold: number;
  totalCheckedIn: number;
  assignedAt: string;
}
