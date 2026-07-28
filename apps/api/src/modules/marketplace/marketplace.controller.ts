import type { Request, Response } from 'express';
import {
  buyResaleListing,
  listMarketplace,
} from './marketplace.service.js';

export async function listMarketplaceHandler(_req: Request, res: Response): Promise<void> {
  const listings = await listMarketplace();
  res.json({ success: true, data: listings });
}

export async function buyListingHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return;
  }

  const result = await buyResaleListing({
    userId: req.user.userId,
    listingId: req.params.listingId as string,
  });

  if ('error' in result) {
    res.status(result.status).json({ success: false, error: result.error });
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
