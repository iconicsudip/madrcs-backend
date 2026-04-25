import { Request, Response } from 'express';
import { ShortUrlService } from '../services/short-url.service';

export class ShortUrlController {
  static async redirect(req: Request, res: Response) {
    try {
      const shortCode = req.params.shortCode as string;
      const originalUrl = await ShortUrlService.getOriginalUrl(shortCode);

      if (originalUrl) {
        return res.redirect(originalUrl);
      }

      res.status(404).send('Short URL not found');
    } catch (err: any) {
      console.error('Redirect error:', err);
      res.status(500).send('Server Error');
    }
  }
}
