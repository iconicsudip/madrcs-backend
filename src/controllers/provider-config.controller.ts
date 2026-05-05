import { Request, Response } from 'express';
import prisma from '../config/prisma';

export class ProviderConfigController {
  private static async ensureDefaults() {
    const msg91Config = await prisma.providerConfig.findUnique({ where: { provider: 'msg91' } });
    if (!msg91Config) {
      await prisma.providerConfig.create({
        data: {
          provider: 'msg91',
          allowed_templates: ['text_message', 'text_with_actions', 'rich_card', 'carousel']
        }
      });
    }

    const googleConfig = await prisma.providerConfig.findUnique({ where: { provider: 'google' } });
    if (!googleConfig) {
      await prisma.providerConfig.create({
        data: {
          provider: 'google',
          allowed_templates: ['rich_card', 'carousel']
        }
      });
    }
  }

  static async getConfig(req: Request, res: Response) {
    try {
      await ProviderConfigController.ensureDefaults();
      
      const user = await prisma.user.findUnique({ where: { id: (req as any).user.id } });
      const provider = user?.rcs_api || 'msg91';

      const config = await prisma.providerConfig.findUnique({
        where: { provider }
      });
      res.status(200).json({ success: true, provider, allowed_templates: config?.allowed_templates || [] });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ success: false, message: err.message });
    }
  }

  static async getAllConfigs(req: Request, res: Response) {
    try {
      await ProviderConfigController.ensureDefaults();
      const configs = await prisma.providerConfig.findMany();
      res.status(200).json({ success: true, configs });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ success: false, message: err.message });
    }
  }

  static async updateConfig(req: Request, res: Response) {
    try {
      const provider = req.params.provider as string;
      const { allowed_templates } = req.body;

      if (!Array.isArray(allowed_templates)) {
        return res.status(400).json({ success: false, message: 'allowed_templates must be an array' });
      }

      const updated = await prisma.providerConfig.upsert({
        where: { provider },
        update: { allowed_templates },
        create: { provider, allowed_templates }
      });

      res.status(200).json({ success: true, config: updated });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ success: false, message: err.message });
    }
  }
}
