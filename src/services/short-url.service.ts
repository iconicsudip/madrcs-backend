import prisma from "../config/prisma";
import crypto from "crypto";

export class ShortUrlService {
  private static generateCode(length: number = 6): string {
    return crypto.randomBytes(length).toString('base64url').slice(0, length);
  }

  static async getOrCreateShortUrl(originalUrl: string, userId?: string): Promise<string> {
    // Check if it already exists
    const existing = await prisma.shortUrl.findUnique({
      where: { original_url: originalUrl }
    });

    if (existing) {
      return existing.short_code;
    }

    // Generate a unique code
    let shortCode = this.generateCode();
    let isUnique = false;
    let attempts = 0;

    while (!isUnique && attempts < 10) {
      const conflict = await prisma.shortUrl.findUnique({
        where: { short_code: shortCode }
      });

      if (!conflict) {
        isUnique = true;
      } else {
        shortCode = this.generateCode();
        attempts++;
      }
    }

    if (!isUnique) {
      throw new Error("Failed to generate a unique short code after 10 attempts.");
    }

    const shortUrl = await prisma.shortUrl.create({
      data: {
        original_url: originalUrl,
        short_code: shortCode,
        user_id: userId
      }
    });

    return shortUrl.short_code;
  }

  static async getOriginalUrl(shortCode: string): Promise<string | null> {
    const record = await prisma.shortUrl.findUnique({
      where: { short_code: shortCode }
    });

    if (record) {
      // Increment clicks asynchronously
      prisma.shortUrl.update({
        where: { id: record.id },
        data: { clicks: { increment: 1 } }
      }).catch(err => console.error("Error updating click count:", err));

      return record.original_url;
    }

    return null;
  }

  static async shortenUrlsInObject(obj: any, userId?: string, key?: string): Promise<any> {
    if (obj === null || obj === undefined) return obj;

    const baseUrl = process.env.BASE_URL || 'http://localhost:5001';

    // If it's a string that looks like a URL, shorten it ONLY if the key is 'url' and it's not an image
    if (typeof obj === 'string' && obj.startsWith('http')) {
      // Basic check to see if the URL points to an image file
      const isImage = /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(obj.split('?')[0]);

      // Only shorten if it's not already a short URL, the key is 'url', and it's NOT an image
      if (key === 'url' && !obj.includes('/s/') && !isImage) {
        try {
          const shortCode = await this.getOrCreateShortUrl(obj, userId);
          return `${baseUrl}/s/${shortCode}`;
        } catch (err) {
          console.error("Error shortening URL:", obj, err);
          return obj;
        }
      }
      return obj;
    }

    // If not an object or array, return as is
    if (typeof obj !== 'object') return obj;

    // Handle arrays (recursively process each element, preserving the key)
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        obj[i] = await this.shortenUrlsInObject(obj[i], userId, key);
      }
      return obj;
    }

    // Handle objects (recursively process each property, passing the key)
    const newObj: any = {};
    for (const k in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, k)) {
        newObj[k] = await this.shortenUrlsInObject(obj[k], userId, k);
      }
    }
    return newObj;
  }
}
