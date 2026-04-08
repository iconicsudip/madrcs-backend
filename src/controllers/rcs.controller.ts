import { Request, Response } from 'express';
import { rcsService } from '../services/rcs';
import prisma from '../config/prisma';
import { RcsEventType, CampaignStatus } from '../enums/rcs.enum';
import { RcsProviderConfig, CreateTemplatePayload, RcsLogParams, SendMessagePayload } from '../services/rcs/rcs.interface';

export class RcsController {
  private static async getConfig(userId: string): Promise<RcsProviderConfig> {
    const apiKey = process.env.MSG91_API_KEY;
    if (!apiKey) {
      throw new Error('RCS Service API Key is not configured. Please contact administrator.');
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.msg91_project_id) {
      throw new Error('Your account is missing an RCS Project ID. Please contact support.');
    }
    
    return {
      apiKey: apiKey,
      projectId: user.msg91_project_id
    };
  }

  static async getTemplates(req: Request, res: Response) {
    try {
      const config = await RcsController.getConfig((req as any).user.id);
      const status = req.query.status as string | undefined;
      const response = await rcsService.getTemplates(config, status);
      res.status(200).json({ success: true, ...response });
    } catch (err: any) {
      console.error(err);
      res.status(400).json({ success: false, message: err.message });
    }
  }

  static async createTemplate(req: Request, res: Response) {
    try {
      const config = await RcsController.getConfig((req as any).user.id);
      const payload = req.body as CreateTemplatePayload;
      const response = await rcsService.createTemplate(payload, config);
      res.status(200).json({ success: true, ...response });
    } catch (err: any) {
      console.error(err);
      res.status(400).json({ success: false, message: err.message });
    }
  }

  static async sendMessage(req: Request, res: Response) {
    try {
      const config = await RcsController.getConfig((req as any).user.id);
      const payload = req.body as SendMessagePayload;
      const response = await rcsService.sendMessage(payload, config);
      res.status(200).json({ success: true, ...response });
    } catch (err: any) {
      console.error(err);
      res.status(400).json({ success: false, message: err.message });
    }
  }

  static async getLogs(req: Request, res: Response) {
    try {
      const config = await RcsController.getConfig((req as any).user.id);
      const params = req.query as unknown as RcsLogParams;
      
      // Basic validation for dates
      if (!params.startDate || !params.endDate) {
        throw new Error("startDate and endDate are required");
      }
      
      const response = await rcsService.getLogs(config, params);
      res.status(200).json({ success: true, ...response });
    } catch (err: any) {
      console.error(err);
      res.status(400).json({ success: false, message: err.message });
    }
  }

  // --- DRAFT MANAGEMENT ---
  
  static async saveDraft(req: Request, res: Response) {
    try {
      const userId = (req as any).user.id;
      const { name, category, payload } = req.body;
      
      if (!name || !payload) {
        throw new Error("Draft name and payload are required");
      }

      const draft = await prisma.templateDraft.create({
        data: {
          user_id: userId,
          name,
          category,
          payload
        }
      });
      res.status(201).json({ success: true, draft });
    } catch (err: any) {
      console.error(err);
      res.status(400).json({ success: false, message: err.message });
    }
  }

  static async getDrafts(req: Request, res: Response) {
    try {
      const userId = (req as any).user.id;
      const drafts = await prisma.templateDraft.findMany({
        where: { user_id: userId },
        orderBy: { created_at: 'desc' }
      });
      res.status(200).json({ success: true, drafts });
    } catch (err: any) {
      console.error(err);
      res.status(400).json({ success: false, message: err.message });
    }
  }

  static async deleteDraft(req: Request, res: Response) {
    try {
      const userId = (req as any).user.id;
      const draftId = req.params.id as string;
      
      await prisma.templateDraft.deleteMany({
        where: {
          id: draftId,
          user_id: userId
        }
      });
      
      res.status(200).json({ success: true, message: "Draft deleted" });
    } catch (err: any) {
      console.error(err);
      res.status(400).json({ success: false, message: err.message });
    }
  }

  static async getActivity(req: Request, res: Response) {
    try {
      const user = (req as any).user;
      const { limit, userId: queryUserId } = req.query;
      
      let targetUserId = user.id;
      
      // Admins can query other users' activities
      if (user.role === 'admin' && queryUserId) {
          targetUserId = queryUserId as string;
      }

      const activities = await prisma.activity.findMany({
        where: { user_id: targetUserId },
        orderBy: { created_at: 'desc' },
        take: limit ? parseInt(limit as string) : 100
      });
      res.status(200).json({ success: true, activities });
    } catch (err: any) {
      console.error(err);
      res.status(400).json({ success: false, message: err.message });
    }
  }

  static async checkCampaignName(req: Request, res: Response) {
    try {
      const userId = (req as any).user.id;
      const { name } = req.query;
      
      if (!name) {
          return res.status(200).json({ success: true, available: true });
      }

      const existing = await prisma.campaign.findFirst({
          where: { 
              user_id: userId,
              name: {
                  equals: name as string,
                  mode: 'insensitive' // Optional: allow case-insensitive check
              }
          }
      });

      res.status(200).json({ 
          success: true, 
          available: !existing 
      });
    } catch (err: any) {
        res.status(400).json({ success: false, message: err.message });
    }
  }

  // --- CAMPAIGN MANAGEMENT ---

  static async getCampaigns(req: Request, res: Response) {
    try {
      const userId = (req as any).user.id;
      const { page = 1, limit = 10, status, type, startDate, endDate, campaignId } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const where: any = { user_id: userId };
      
      if (status && status !== 'ALL') {
          where.status = status;
      }
      if (type && type !== 'all') {
          where.type = type;
      }
      if (campaignId && campaignId !== 'all') {
          where.id = campaignId;
      }
      if (startDate || endDate) {
          where.created_at = {};
          if (startDate) where.created_at.gte = new Date(startDate as string);
          if (endDate) where.created_at.lte = new Date(endDate as string);
      }

      const [campaigns, total] = await Promise.all([
        prisma.campaign.findMany({
          where,
          include: {
            _count: {
              select: {
                events: true
              }
            }
          },
          orderBy: { created_at: 'desc' },
          skip,
          take: Number(limit)
        }),
        prisma.campaign.count({ where })
      ]);

      // Map campaigns to include real-time status counts from events for the list view
      const campaignsWithStats = await Promise.all(campaigns.map(async (c) => {
        const [delivered, read, clicked] = await Promise.all([
          prisma.campaignEvent.count({ where: { campaign_id: c.id, delivered_at: { not: null } } }),
          prisma.campaignEvent.count({ where: { campaign_id: c.id, read_at: { not: null } } }),
          prisma.campaignEvent.count({ where: { campaign_id: c.id, event_type: RcsEventType.CLICKED } })
        ]);
        
        return {
          ...c,
          internal_sent_count: c._count.events,
          internal_delivered_count: delivered,
          internal_read_count: Math.max(read, clicked),
          internal_clicked_count: clicked
        };
      }));

      res.status(200).json({ success: true, campaigns: campaignsWithStats, total, page: Number(page) });
    } catch (err: any) {
      console.error(err);
      res.status(400).json({ success: false, message: err.message });
    }
  }

  static async createCampaign(req: Request, res: Response) {
    try {
      const userId = (req as any).user.id;
      const { name, template_name, namespace, type, contact_source, scheduled_at, contacts } = req.body;

      if (!name || !template_name || !type) {
        throw new Error("Campaign name, template, and type are required");
      }

      // Count contacts if source is provided
      let totalContacts = 0;
      let targetContacts: string[] = contacts || [];

      if (contact_source === 'ALL') {
          const allUserContacts = await prisma.contact.findMany({ where: { user_id: userId, status: 'ACTIVE' }, select: { phone_number: true } });
          totalContacts = allUserContacts.length;
          targetContacts = allUserContacts.map(c => c.phone_number);
      } else if (contact_source === 'DEMO' || Array.isArray(contacts)) {
          totalContacts = targetContacts.length;
      } else if (contact_source) {
          const group = await prisma.contactGroup.findFirst({
              where: { id: contact_source, user_id: userId },
              include: { contacts: { select: { phone_number: true } } }
          });
          totalContacts = group?.contacts.length || 0;
          targetContacts = group?.contacts.map(c => c.phone_number) || [];
      }
      
      // AUTO-SYNC NEW CONTACTS TO DATABASE
      if (targetContacts.length > 0) {
          (async () => {
              try {
                  for (const num of targetContacts) {
                      await prisma.contact.upsert({
                          where: { 
                              phone_number_user_id: { 
                                  phone_number: num, 
                                  user_id: userId 
                              } 
                          },
                          update: {}, // Don't change existing
                          create: {
                              phone_number: num,
                              user_id: userId,
                              name: `Contact ${num.slice(-4)}`, // Placeholder name
                              status: 'ACTIVE'
                          }
                      });
                  }
              } catch (err) {
                  console.error('[Contact Auto-Sync Error]:', err);
              }
          })();
      }

      const campaign = await prisma.campaign.create({
        data: {
          user_id: userId,
          name,
          template_name,
          type,
          contact_source: contact_source || 'CUSTOM',
          scheduled_at: scheduled_at ? new Date(scheduled_at) : null,
          status: scheduled_at ? CampaignStatus.SCHEDULED : CampaignStatus.LIVE,
          total_contacts: totalContacts,
          namespace
        }
      });

      // TRIGGER SENDING IF LIVE
      if (campaign.status === CampaignStatus.LIVE && targetContacts.length > 0) {
          // Trigger in background to not block response
          (async () => {
              try {
                  const config = await RcsController.getConfig(userId);
                  // For RCS, we usually use the template name (function_name in MSG91) 
                  // and pass the audience to 'to'
                  const rcsRes = await rcsService.sendMessage({
                      to: targetContacts.map(num => num.replace(/^\+/, '')),
                      function_name: 'template', // To trigger a template on MSG91
                      name: template_name,       // The internal name of your template
                      namespace: namespace       // Required for template resolution
                  }, config);

                  // Update sent count and MSG91 requestId for tracking reports
                  await prisma.campaign.update({
                      where: { id: campaign.id },
                      data: { 
                          sent_count: targetContacts.length,
                          msg91_request_id: rcsRes.result?.request_id || rcsRes.result?.data?.request_id || null
                      }
                  });

                  // INITIALIZE 'SENT' EVENTS FOR ALL NUMBERS
                  await prisma.campaignEvent.createMany({
                      data: targetContacts.map(num => ({
                          campaign_id: campaign.id,
                          phone_number: num,
                          event_type: RcsEventType.SENT
                          // created_at is automatic
                      })),
                      skipDuplicates: true
                  });
              } catch (err) {
                  console.error('[Campaign Background Send Error]:', err);
              }
          })();
      }

      res.status(201).json({ success: true, campaign });
    } catch (err: any) {
      console.error(err);
      res.status(400).json({ success: false, message: err.message });
    }
  }

  static async updateCampaignStatus(req: Request, res: Response) {
    try {
      const userId = (req as any).user.id;
      const campaignId = req.params.id as string;
      const { status } = req.body;

      const campaign = await prisma.campaign.updateMany({
        where: { id: campaignId, user_id: userId },
        data: { status }
      });

      res.status(200).json({ success: true, message: "Campaign updated" });
    } catch (err: any) {
      console.error(err);
      res.status(400).json({ success: false, message: err.message });
    }
  }

  static async getVolumeData(req: Request, res: Response) {
    try {
      const userId = (req as any).user.id;
      const { days = '30' } = req.query;
      const numDays = parseInt(days as string);
      
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - numDays);
      startDate.setHours(0, 0, 0, 0);

      // Group events by date part
      const events = await prisma.campaignEvent.findMany({
        where: {
          campaign: { user_id: userId },
          created_at: { gte: startDate }
        },
        select: {
          created_at: true,
          sent_at: true,
          delivered_at: true,
          read_at: true
        }
      });

      // Aggregate by day
      const dailyData: Record<string, any> = {};
      
      // Initialize all days in range to 0
      for (let i = 0; i <= numDays; i++) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + i);
        const dayLabel = d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
        dailyData[dayLabel] = { day: dayLabel, sent: 0, delivered: 0, read: 0 };
      }

      events.forEach(e => {
        const dayLabel = new Date(e.created_at).toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
        if (dailyData[dayLabel]) {
          if (e.sent_at) dailyData[dayLabel].sent += 1;
          if (e.delivered_at) dailyData[dayLabel].delivered += 1;
          if (e.read_at) dailyData[dayLabel].read += 1;
        }
      });

      res.status(200).json({ 
        success: true, 
        data: Object.values(dailyData) 
      });
    } catch (err: any) {
      console.error(err);
      res.status(400).json({ success: false, message: err.message });
    }
  }

  static async getCampaignStats(req: Request, res: Response) {
      try {
          const userId = (req as any).user.id;
          const { type, startDate, endDate, campaignId } = req.query;
          
          const where: any = { user_id: userId };
          if (type && type !== 'all') where.type = type;
          if (campaignId && campaignId !== 'all') where.id = campaignId;
          if (startDate || endDate) {
              where.created_at = {};
              if (startDate) where.created_at.gte = new Date(startDate as string);
              if (endDate) where.created_at.lte = new Date(endDate as string);
          }

          const campaigns = await prisma.campaign.findMany({ where });

          const eventWhere: any = { campaign: { user_id: userId } };
          if (type && type !== 'all') eventWhere.campaign.type = type;
          if (campaignId && campaignId !== 'all') eventWhere.campaign_id = campaignId;
          if (startDate || endDate) {
              eventWhere.created_at = {};
              if (startDate) eventWhere.created_at.gte = new Date(startDate as string);
              if (endDate) eventWhere.created_at.lte = new Date(endDate as string);
          }

          // Aggregate simple dashboard stats from Event source of truth
          const [totalEvents, totalDelivered, totalClicked, totalFailed, totalRead] = await Promise.all([
            prisma.campaignEvent.count({ where: { ...eventWhere, sent_at: { not: null } } }),
            prisma.campaignEvent.count({ where: { ...eventWhere, delivered_at: { not: null } } }),
            prisma.campaignEvent.count({ where: { ...eventWhere, event_type: 'CLICKED' } }),
            prisma.campaignEvent.count({ where: { ...eventWhere, event_type: 'FAILED' } }),
            prisma.campaignEvent.count({ where: { ...eventWhere, read_at: { not: null } } })
          ]);

          const stats = {
              total: campaigns.length,
              live: campaigns.filter(c => c.status === CampaignStatus.LIVE || c.status === CampaignStatus.PARTIALLY_COMPLETED).length,
              paused: campaigns.filter(c => c.status === CampaignStatus.PAUSED).length,
              completed: campaigns.filter(c => c.status === CampaignStatus.COMPLETED).length,
              audience: totalEvents,
              delivered: totalDelivered,
              read: Math.max(totalRead, totalClicked),
              clicked: totalClicked,
              failed: totalFailed,
              avgClick: totalEvents > 0 ? (totalClicked / totalEvents) * 100 : 0
          };

          res.status(200).json({ success: true, stats });
      } catch (err: any) {
          console.error(err);
          res.status(400).json({ success: false, message: err.message });
      }
  }

  static async resendCampaign(req: Request, res: Response) {
    try {
      const userId = (req as any).user.id;
      const campaignId = req.params.id as string;

      const campaign = await prisma.campaign.findUnique({
          where: { id: campaignId, user_id: userId }
      });

      if (!campaign) {
          return res.status(404).json({ success: false, message: 'Campaign not found' });
      }

      // Fetch contacts based on original source
      let targetContacts: string[] = [];
      if (campaign.contact_source === 'ALL') {
          const allUserContacts = await prisma.contact.findMany({ 
              where: { user_id: userId, status: 'ACTIVE' }, 
              select: { phone_number: true } 
          });
          targetContacts = allUserContacts.map(c => c.phone_number);
      } else if (campaign.contact_source === 'CUSTOM' || campaign.contact_source === 'DEMO') {
          const promotionalError = "Promotional messages are only allowed between 9 A.M. to 9 P.M.";
          
          const existingEvents = await prisma.campaignEvent.findMany({
              where: { 
                  campaign_id: campaign.id,
                  OR: [
                      { event_type: RcsEventType.SENT },
                      { 
                          event_type: RcsEventType.FAILED,
                          error_details: { contains: promotionalError }
                      }
                  ]
              },
              select: { phone_number: true },
              distinct: ['phone_number']
          });
          targetContacts = existingEvents.map(e => e.phone_number);
      } else if (campaign.contact_source) {
          const group = await prisma.contactGroup.findFirst({
              where: { id: campaign.contact_source, user_id: userId },
              include: { contacts: { select: { phone_number: true } } }
          });
          targetContacts = group?.contacts.map(c => c.phone_number) || [];
      }

      if (targetContacts.length === 0) {
          return res.status(400).json({ success: false, message: 'No contacts found to resend to' });
      }

      (async () => {
          try {
              const config = await RcsController.getConfig(userId);
              const rcsRes = await rcsService.sendMessage({
                  to: targetContacts.map(num => num.replace(/^\+/, '')),
                  function_name: 'template', // Consistent with createCampaign
                  name: campaign.template_name,
                  namespace: campaign.namespace || '' // Use existing if available
              }, config);

              // Update Campaign with latest requestId
              await prisma.campaign.update({
                  where: { id: campaign.id },
                  data: {
                      sent_count: { increment: targetContacts.length },
                      msg91_request_id: rcsRes.result?.request_id || rcsRes.result?.data?.request_id || null
                  }
              });

              // Reset/Initialize 'SENT' status for these numbers
              for (const phone of targetContacts) {
                  await prisma.campaignEvent.upsert({
                      where: {
                          campaign_id_phone_number: {
                              campaign_id: campaign.id,
                              phone_number: phone
                          }
                      },
                      update: {
                          event_type: RcsEventType.SENT,
                          error_details: null,
                          status_updated_at: null,
                          sent_at: null,
                          delivered_at: null,
                          read_at: null,
                          engagement: null,
                          created_at: new Date() // Record retry time
                      },
                      create: {
                          campaign_id: campaign.id,
                          phone_number: phone,
                          event_type: RcsEventType.SENT
                      }
                  });
              }
          } catch (err) {
              console.error('[Campaign Resend Error]:', err);
          }
      })();

      res.json({ success: true, message: 'Resend triggered successfully', target_count: targetContacts.length });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  static async getCampaignStatsSingle(req: Request, res: Response) {
    try {
      const userId = (req as any).user.id;
      const campaignId = req.params.id as string;

      const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId, user_id: userId }
      });

      if (!campaign) {
        return res.status(404).json({ success: false, message: 'Campaign not found' });
      }

      // Total unique contacts that this campaign has targeted
      const totalSent = await prisma.campaignEvent.count({
        where: { campaign_id: campaignId }
      });

      // Lifecycle-based aggregate counting
      const [sentCount, deliveredCount, readCount, clickedCount, failedCount, expiredCount] = await Promise.all([
        prisma.campaignEvent.count({ where: { campaign_id: campaignId, sent_at: { not: null } } }),
        prisma.campaignEvent.count({ where: { campaign_id: campaignId, delivered_at: { not: null } } }),
        prisma.campaignEvent.count({ where: { campaign_id: campaignId, read_at: { not: null } } }),
        prisma.campaignEvent.count({ where: { campaign_id: campaignId, event_type: RcsEventType.CLICKED } }),
        prisma.campaignEvent.count({ where: { campaign_id: campaignId, event_type: RcsEventType.FAILED } }),
        prisma.campaignEvent.count({ where: { campaign_id: campaignId, event_type: RcsEventType.EXPIRED } })
      ]);

      const counts = { 
        SENT: sentCount, 
        DELIVERED: deliveredCount, 
        READ: Math.max(readCount, clickedCount), // Clicked implies read
        CLICKED: clickedCount, 
        FAILED: failedCount, 
        EXPIRED: expiredCount 
      };

      res.status(200).json({ success: true, campaign, counts });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

  static async getCampaignEvents(req: Request, res: Response) {
    try {
      const userId = (req as any).user.id;
      const campaignId = req.params.id as string;
      const { page = 1, limit = 15, status, search } = req.query;

      const skip = (Number(page) - 1) * Number(limit);

      const eventWhere: any = { campaign_id: campaignId };
      
      if (status && status !== 'all') {
          switch (status) {
              case 'SENT':
                  eventWhere.sent_at = { not: null };
                  break;
              case 'DELIVERED':
                  eventWhere.delivered_at = { not: null };
                  break;
              case 'READ':
                  eventWhere.OR = [
                      { read_at: { not: null } },
                      { event_type: 'CLICKED' }
                  ];
                  break;
              case 'CLICKED':
                  eventWhere.event_type = 'CLICKED';
                  break;
              case 'FAILED':
                  eventWhere.event_type = 'FAILED';
                  break;
              case 'EXPIRED':
                  eventWhere.event_type = 'EXPIRED';
                  break;
              default:
                  eventWhere.event_type = status as string;
          }
      }
      
      if (search) {
          eventWhere.phone_number = { contains: search as string };
      }

      const [events, total] = await Promise.all([
        prisma.campaignEvent.findMany({
            where: eventWhere,
            skip,
            take: Number(limit),
            orderBy: { created_at: 'desc' }
        }),
        prisma.campaignEvent.count({ where: eventWhere })
      ]);

      res.status(200).json({ success: true, events, total, page: Number(page) });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message });
    }
  }
}
