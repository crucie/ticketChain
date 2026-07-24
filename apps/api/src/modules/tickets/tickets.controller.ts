import type { Request, Response } from 'express';
import { env } from '../../config/env.js';
import {
  cancelResaleListing,
  createResaleListing,
} from '../marketplace/marketplace.service.js';
import {
  generateTicketQr,
  getMyTickets,
  getTicket,
  mintTickets,
} from './tickets.service.js';
import { transferTicket } from './tickets.transfer.service.js';
import { validatePromoCode } from '../promo/promo.repository.js';

export async function mintHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return;
  }

  if (env.NODE_ENV === 'production' && !env.ALLOW_DIRECT_MINT) {
    res.status(403).json({
      success: false,
      error: 'Direct mint is disabled in production. Use POST /api/tickets/checkout',
      code: 'USE_CHECKOUT',
    });
    return;
  }

  const idempotencyKey = req.header('idempotency-key');
  if (!idempotencyKey || idempotencyKey.length < 8) {
    res.status(400).json({
      success: false,
      error: 'Idempotency-Key header is required (min 8 characters)',
      code: 'MISSING_IDEMPOTENCY_KEY',
    });
    return;
  }

  const result = await mintTickets({
    userId: req.user.userId,
    idempotencyKey,
    body: req.body,
  });

  if ('error' in result) {
    res.status(result.status).json({
      success: false,
      error: result.error,
      code: result.code,
    });
    return;
  }

  res.status(201).json({
    success: true,
    data: {
      tickets: result.tickets,
      transactionHash: result.transactionHash,
      totalPaidWei: result.totalPaidWei,
    },
  });
}

export async function listMyTicketsHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return;
  }

  const result = await getMyTickets(req.user.userId, req.query as Record<string, string | undefined>);
  res.json({ success: true, data: result.rows, meta: result.meta });
}

export async function getTicketHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return;
  }

  const result = await getTicket(req.user.userId, req.params.ticketId as string);
  if ('error' in result) {
    res.status(result.status ?? 404).json({ success: false, error: result.error });
    return;
  }
  res.json({ success: true, data: result.ticket });
}

export async function getTicketQrHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return;
  }

  const result = await generateTicketQr(req.user.userId, req.params.ticketId as string);
  if ('error' in result) {
    res.status(result.status ?? 400).json({
      success: false,
      error: result.error,
      code: 'code' in result ? result.code : undefined,
    });
    return;
  }
  res.json({ success: true, data: result });
}

export async function transferTicketHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return;
  }

  const result = await transferTicket({
    userId: req.user.userId,
    ticketId: req.params.ticketId as string,
    body: req.body,
  });

  if ('error' in result) {
    res.status(result.status).json({
      success: false,
      error: result.error,
      code: 'code' in result ? result.code : undefined,
    });
    return;
  }

  res.json({
    success: true,
    data: {
      transactionHash: result.transactionHash,
      explorerUrl: result.explorerUrl,
    },
  });
}

export async function resellTicketHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return;
  }

  const result = await createResaleListing({
    userId: req.user.userId,
    ticketId: req.params.ticketId as string,
    body: req.body,
  });

  if ('error' in result) {
    res.status(result.status).json({ success: false, error: result.error });
    return;
  }

  res.status(201).json({ success: true, data: result.listing });
}

export async function validatePromoHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return;
  }
  const { code, tierId } = req.body as { code?: string; tierId?: string };
  if (!code || !tierId) {
    res.status(400).json({ success: false, error: 'code and tierId required' });
    return;
  }
  const result = await validatePromoCode(code, tierId, req.user.userId);
  res.json({ success: true, data: result });
}

export async function getTicketPdfHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return;
  }
  const result = await getTicket(req.user.userId, req.params.ticketId as string);
  if ('error' in result) {
    res.status(result.status ?? 404).json({ success: false, error: result.error });
    return;
  }
  const t = result.ticket;
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Ticket ${t.id}</title>
<style>body{font-family:system-ui,sans-serif;padding:2rem;max-width:480px;margin:0 auto}
h1{font-size:1.25rem}.meta{color:#555;font-size:0.875rem}</style></head><body>
<h1>TicketChain — Digital Ticket</h1>
<p class="meta">Ticket ID: ${t.id}</p>
<p class="meta">Event: ${t.eventId}</p>
<p class="meta">Status: ${t.status}</p>
<p class="meta">Present this ticket at the gate. QR available in your wallet.</p>
</body></html>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="ticket-${t.id}.html"`);
  res.send(html);
}

export async function cancelResellHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return;
  }

  const result = await cancelResaleListing({
    userId: req.user.userId,
    ticketId: req.params.ticketId as string,
  });

  if ('error' in result) {
    res.status(result.status).json({ success: false, error: result.error });
    return;
  }

  res.json({ success: true });
}
