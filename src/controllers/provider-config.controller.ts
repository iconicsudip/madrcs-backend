import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { RcsProvider, RcsFunctionName } from '../enums/rcs.enum';

export class ProviderConfigController {
  private static async ensureDefaults() {
    const msg91Config = await prisma.providerConfig.findUnique({ where: { provider: RcsProvider.MSG91 } });
    if (!msg91Config) {
      await prisma.providerConfig.create({
        data: {
          provider: RcsProvider.MSG91,
          allowed_templates: [
            RcsFunctionName.TEXT_MESSAGE,
            RcsFunctionName.TEXT_WITH_ACTIONS,
            RcsFunctionName.RICH_CARD,
            RcsFunctionName.CAROUSEL
          ]
        }
      });
    }

    const jiocxConfig = await prisma.providerConfig.findUnique({ where: { provider: RcsProvider.JIOCX } });
    if (!jiocxConfig) {
      await prisma.providerConfig.create({
        data: {
          provider: RcsProvider.JIOCX,
          allowed_templates: [
            RcsFunctionName.TEXT_MESSAGE,
            RcsFunctionName.TEXT_WITH_ACTIONS,
            RcsFunctionName.RICH_CARD,
            RcsFunctionName.CAROUSEL,
            RcsFunctionName.OPEN_URL,
            RcsFunctionName.DIAL,
            RcsFunctionName.CALENDAR_EVENT,
            RcsFunctionName.SHARE_LOCATION,
            RcsFunctionName.VIEW_LOCATION
          ]
        }
      });
    }
  }

  static async getConfig(req: Request, res: Response) {
    try {
      await ProviderConfigController.ensureDefaults();
      
      const user = await prisma.user.findUnique({ where: { id: (req as any).user.id } });
      const provider = user?.rcs_api || RcsProvider.MSG91;

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
