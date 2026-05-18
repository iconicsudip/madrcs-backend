import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../config/prisma";
import { CampaignStatus, RcsEventType, RcsProvider, RcsTemplateStatus, RcsFunctionName } from "../enums/rcs.enum";
import { RcsServiceFactory } from "../services/rcs";
import {
  CreateTemplatePayload,
  RcsLogParams,
  RcsProviderConfig,
  SendMessagePayload,
} from "../services/rcs/rcs.interface";
import { CapabilityResultRow } from "../services/rcs/jiocx.service";
import { ShortUrlService } from "../services/short-url.service";

import { formatPhoneNumber } from "../utils/phone.util";

export class RcsController {
  private static readonly CONTACT_SYNC_BATCH_SIZE = 50;

  private static async getConfig(userId: string): Promise<RcsProviderConfig> {
    const user = (await prisma.user.findUnique({ where: { id: userId } })) as any;
    if (!user) {
      throw new Error("User not found.");
    }

    const provider = (user.rcs_api as RcsProvider) || RcsProvider.MSG91;

    if (provider === RcsProvider.JIOCX) {
      if (!user.jiocx_api_key || !user.jiocx_project_id) {
        throw new Error(
          "Your account is missing JioCX credentials. Please contact admin to configure your JioCX API key and project ID.",
        );
      }
      return {
        apiKey: user.jiocx_api_key,
        projectId: user.jiocx_project_id,
        provider: RcsProvider.JIOCX,
        userId: userId,
      };
    }

    // Default to MSG91
    const apiKey = process.env.MSG91_API_KEY;
    if (!apiKey) {
      throw new Error(
        "RCS Service API Key is not configured. Please contact administrator.",
      );
    }

    if (!user.msg91_project_id) {
      throw new Error(
        "Your account is missing an RCS Project ID. Please contact support.",
      );
    }

    return {
      apiKey: apiKey,
      projectId: user.msg91_project_id,
      provider: provider,
      userId: userId,
    };
  }

  /**
   * Build a JioCX config from the authenticated user's stored credentials.
   * jiocx_project_id is used as the JioCX agentId header value.
   */
  private static async getJiocxConfig(userId: string): Promise<RcsProviderConfig> {
    const jiocxCredentialSelect: any = {
      jiocx_api_key: true,
      jiocx_project_id: true,
    };

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: jiocxCredentialSelect,
    }) as any;

    if (!user?.jiocx_api_key || !user?.jiocx_project_id) {
      throw new Error(
        "Your account is missing JioCX credentials. Please contact admin to configure your JioCX API key and project ID.",
      );
    }

    return {
      apiKey: user.jiocx_api_key,
      projectId: user.jiocx_project_id,
      provider: RcsProvider.JIOCX,
    };
  }

  private static sanitizeCapabilityInput(phoneNumbers: unknown): string | string[] {
    if (typeof phoneNumbers === "string") {
      const normalizedPhone = formatPhoneNumber(phoneNumbers);
      if (!normalizedPhone) {
        throw new Error("phoneNumbers cannot be empty.");
      }
      return normalizedPhone;
    }

    if (!Array.isArray(phoneNumbers)) {
      throw new Error("phoneNumbers must be a string (single) or an array of strings (bulk).");
    }

    const normalizedPhones = phoneNumbers
      .map((phone) => {
        if (typeof phone !== "string") {
          throw new Error("Each phone number must be a string.");
        }
        return formatPhoneNumber(phone);
      })
      .filter(Boolean);

    if (normalizedPhones.length === 0) {
      throw new Error("phoneNumbers array cannot be empty.");
    }

    return normalizedPhones;
  }

  private static async syncCapabilityContacts(userId: string, rows: CapabilityResultRow[]) {
    const dedupedRows = Array.from(
      new Map(
        rows
          .filter((row) => Boolean(row.phoneNumber))
          .map((row) => [row.phoneNumber, row]),
      ).values(),
    );

    const summary = {
      processed: dedupedRows.length,
      rcsEnabled: 0,
      rcsDisabled: 0,
      unknown: 0,
    };

    for (const row of dedupedRows) {
      if (row.rcsCapable === true) {
        summary.rcsEnabled += 1;
      } else if (row.rcsCapable === false) {
        summary.rcsDisabled += 1;
      } else {
        summary.unknown += 1;
      }
    }

    // Process upserts in the background without blocking the response
    (async () => {
      for (let i = 0; i < dedupedRows.length; i += RcsController.CONTACT_SYNC_BATCH_SIZE) {
        const batch = dedupedRows.slice(i, i + RcsController.CONTACT_SYNC_BATCH_SIZE);
        try {
          await prisma.$transaction(
            batch.map((row) => {
              const updateData = {
                rcs_capable: row.rcsCapable,
              } as unknown as Prisma.ContactUpdateInput;

              const createData = {
                phone_number: row.phoneNumber,
                user_id: userId,
                name: `Contact ${row.phoneNumber.slice(-4)}`,
                status: "ACTIVE",
                rcs_capable: row.rcsCapable,
              } as unknown as Prisma.ContactUncheckedCreateInput;

              return prisma.contact.upsert({
                where: {
                  phone_number_user_id: {
                    phone_number: row.phoneNumber,
                    user_id: userId,
                  },
                },
                update: updateData,
                create: createData,
              });
            }),
            {
              timeout: 30000,
            }
          );
        } catch (err: any) {
          console.error(`[Background Contact Sync Batch Error]:`, err.message);
        }
      }
    })().catch((err) => console.error("[Background Contact Sync Error]:", err.message));

    return summary;
  }

  static async getTemplates(req: Request, res: Response) {
    try {
      const userId = (req as any).user.id;
      const config = await RcsController.getConfig(userId);
      const { status, page = 1, limit = 10, search } = req.query;
      const p = Number(page);
      const l = Number(limit);
      const skip = (p - 1) * l;

      let allTemplates: any[] = [];
      let totalCount = 0;

      const service = RcsServiceFactory.getService(config.provider);

      // Handle 'Draft' status specifically from local DB
      const isDraftRequested = status?.toString().toLowerCase() === 'draft' || status?.toString().toLowerCase() === 'drafts';
      const isDeletedRequested = status?.toString().toLowerCase() === 'deleted';
      
      if (isDraftRequested) {
        const where: any = { user_id: userId, deleted_at: null };
        if (search) {
          where.name = { contains: search as string, mode: 'insensitive' };
        }
        const [drafts, total] = await Promise.all([
          prisma.templateDraft.findMany({
            where,
            orderBy: { created_at: "desc" } as any,
            skip,
            take: l,
          }),
          prisma.templateDraft.count({ where })
        ]);
        
        allTemplates = drafts.map(d => ({
          ...d,
          template_name: d.name,
          function_name: d.category,
          status: RcsTemplateStatus.DRAFT,
          isDraft: true,
          provider: config.provider // Include current provider for drafts
        }));
        totalCount = total;
      } 
      else if (isDeletedRequested) {
        // Fetch soft-deleted templates and drafts
        const [deletedTemplates, deletedDrafts] = await Promise.all([
          prisma.rcsTemplate.findMany({
            where: { user_id: userId, deleted_at: { not: null } } as any,
            orderBy: { deleted_at: "desc" } as any
          }),
          prisma.templateDraft.findMany({
            where: { user_id: userId, deleted_at: { not: null } } as any,
            orderBy: { deleted_at: "desc" } as any
          })
        ]);

        const mappedTemplates = deletedTemplates.map(t => ({
          ...t,
          template_name: t.name,
          function_name: t.category,
          isDeleted: true
        }));

        const mappedDrafts = deletedDrafts.map(d => ({
          ...d,
          template_name: d.name,
          function_name: d.category,
          status: RcsTemplateStatus.DRAFT,
          isDraft: true,
          isDeleted: true
        }));

        allTemplates = [...mappedTemplates, ...mappedDrafts];
        totalCount = allTemplates.length;
      }
      // Handle 'All' or specific API status
      else if (status && status.toString().toLowerCase() !== 'all') {
        // Specific API Status (APPROVED, PENDING, REJECTED)
        const resTemplates = await service.getTemplates(config, status as string, p, l);
        allTemplates = resTemplates.templates || resTemplates.result?.data || [];
        totalCount = resTemplates.total || resTemplates.count || allTemplates.length;
      }
      else {
        // 'All' Status - Merging API and Drafts with chained pagination
        // Step 1: Get API templates and total API count
        const apiRes = await service.getTemplates(config, undefined, p, l);
        const apiList = apiRes.templates || apiRes.result?.data || [];
        const apiTotal = apiRes.total || apiRes.count || apiList.length;
        
        // Step 2: Get total Draft count
        const draftTotal = await prisma.templateDraft.count({ where: { user_id: userId, deleted_at: null } as any });
        
        totalCount = apiTotal + draftTotal;

        // Step 3: Decide what to return based on page and limit
        const apiCountInThisPage = apiList.length;
        
        if (apiCountInThisPage >= l) {
          // Current page is fully satisfied by API templates
          allTemplates = apiList;
        } else if (apiCountInThisPage > 0) {
          // Current page is partially satisfied by API, fill the rest with Drafts
          const remainingLimit = l - apiCountInThisPage;
          const drafts = await prisma.templateDraft.findMany({
            where: { user_id: userId, deleted_at: null } as any,
            orderBy: { created_at: "desc" } as any,
            take: remainingLimit,
            skip: 0
          });
          allTemplates = [...apiList, ...drafts.map(d => ({
            ...d,
            template_name: d.name,
            function_name: d.category,
            status: RcsTemplateStatus.DRAFT,
            isDraft: true,
            provider: config.provider
          }))];
        } else {
          // Current page is beyond API templates, fetch only from Drafts
          // Calculate how many API templates were skipped
          const draftSkip = (p - 1) * l - apiTotal;
          const drafts = await prisma.templateDraft.findMany({
            where: { user_id: userId, deleted_at: null } as any,
            orderBy: { created_at: "desc" } as any,
            take: l,
            skip: Math.max(0, draftSkip)
          });
          allTemplates = drafts.map(d => ({
            ...d,
            template_name: d.name,
            function_name: d.category,
            status: RcsTemplateStatus.DRAFT,
            isDraft: true,
            provider: config.provider
          }));
        }
      }

      res.status(200).json({ 
        success: true, 
        templates: allTemplates, 
        total: totalCount,
        page: p,
        limit: l
      });
    } catch (err: any) {
      console.error(err);
      res.status(400).json({ success: false, message: err.message });
    }
  }

  static async createTemplate(req: Request, res: Response) {
    try {
      const userId = (req as any).user.id;
      const config = await RcsController.getConfig(userId);
      let payload = req.body as CreateTemplatePayload;

      // Shorten URLs in payload
      payload = await ShortUrlService.shortenUrlsInObject(payload, userId);

      const service = RcsServiceFactory.getService(config.provider);
      const response = await service.createTemplate(payload, config);

      if (response.success) {
        if (payload.id) {
          // Update existing template
          await prisma.rcsTemplate.update({
            where: { id: payload.id },
            data: {
              name: payload.template_name,
              category: (payload.function_name as string) || RcsFunctionName.RICH_CARD,
              payload: payload.content as any,
              status: 'APPROVED'
            }
          });
        } else {
          // Create new template
          await prisma.rcsTemplate.create({
            data: {
              user_id: userId,
              provider: config.provider,
              name: payload.template_name,
              category: (payload.function_name as string) || RcsFunctionName.RICH_CARD,
              payload: payload.content as any,
              status: 'APPROVED'
            }
          });
        }
      }

      res.status(200).json({ success: true, ...response });
    } catch (err: any) {
      console.error(err);
      res.status(400).json({ success: false, message: err.message });
    }
  }

  static async deleteTemplate(req: Request, res: Response) {
    try {
      const userId = (req as any).user.id;
      const templateId = req.params.id as string;

      // Only allow deleting templates that belong to the user
      const template = await prisma.rcsTemplate.findFirst({
        where: { id: templateId, user_id: userId }
      });

      if (!template) {
        throw new Error("Template not found or unauthorized");
      }

      if ((template as any).deleted_at) {
        // Permanent delete if already soft-deleted
        await prisma.rcsTemplate.delete({
          where: { id: templateId }
        });
        return res.status(200).json({ success: true, message: "Template permanently deleted" });
      }

      // Soft delete
      await prisma.rcsTemplate.update({
        where: { id: templateId },
        data: { deleted_at: new Date() } as any
      });

      res.status(200).json({ success: true, message: "Template moved to trash" });
    } catch (err: any) {
      console.error(err);
      res.status(400).json({ success: false, message: err.message });
    }
  }

  static async restoreTemplate(req: Request, res: Response) {
    try {
      const userId = (req as any).user.id;
      const templateId = req.params.id as string;

      const template = await prisma.rcsTemplate.findFirst({
        where: { id: templateId, user_id: userId }
      });

      if (!template) {
        throw new Error("Template not found or unauthorized");
      }

      await prisma.rcsTemplate.update({
        where: { id: templateId },
        data: { deleted_at: null } as any
      });

      res.status(200).json({ success: true, message: "Template restored successfully" });
    } catch (err: any) {
      console.error(err);
      res.status(400).json({ success: false, message: err.message });
    }
  }

  static async sendMessage(req: Request, res: Response) {
    try {
      const userId = (req as any).user.id;
      const config = await RcsController.getConfig(userId);
      let payload = req.body as SendMessagePayload;

      // Shorten URLs in payload
      payload = await ShortUrlService.shortenUrlsInObject(payload, userId);

      const service = RcsServiceFactory.getService(config.provider);
      const response = await service.sendMessage(payload, config);
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

      const service = RcsServiceFactory.getService(config.provider);
      const response = await service.getLogs(config, params);
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
      const { id, name, category, payload } = req.body;

      if (!name || !payload) {
        throw new Error("Draft name and payload are required");
      }

      let draft;
      if (id) {
        draft = await prisma.templateDraft.update({
          where: { id, user_id: userId },
          data: {
            name,
            category,
            payload,
          },
        });
      } else {
        draft = await prisma.templateDraft.create({
          data: {
            user_id: userId,
            name,
            category,
            payload,
          },
        });
      }
      res.status(201).json({ success: true, draft });
    } catch (err: any) {
      console.error(err);
      res.status(400).json({ success: false, message: err.message });
    }
  }


  static async deleteDraft(req: Request, res: Response) {
    try {
      const userId = (req as any).user.id;
      const draftId = req.params.id as string;

      const draft = await prisma.templateDraft.findFirst({
        where: { id: draftId, user_id: userId }
      });

      if (!draft) {
        throw new Error("Draft not found or unauthorized");
      }

      if ((draft as any).deleted_at) {
        // Permanent delete
        await prisma.templateDraft.delete({
          where: { id: draftId }
        });
        return res.status(200).json({ success: true, message: "Draft permanently deleted" });
      }

      // Soft delete
      await prisma.templateDraft.update({
        where: { id: draftId },
        data: { deleted_at: new Date() } as any
      });

      res.status(200).json({ success: true, message: "Draft moved to trash" });
    } catch (err: any) {
      console.error(err);
      res.status(400).json({ success: false, message: err.message });
    }
  }

  static async restoreDraft(req: Request, res: Response) {
    try {
      const userId = (req as any).user.id;
      const draftId = req.params.id as string;

      const draft = await prisma.templateDraft.findFirst({
        where: { id: draftId, user_id: userId }
      });

      if (!draft) {
        throw new Error("Draft not found or unauthorized");
      }

      await prisma.templateDraft.update({
        where: { id: draftId },
        data: { deleted_at: null } as any
      });

      res.status(200).json({ success: true, message: "Draft restored successfully" });
    } catch (err: any) {
      console.error(err);
      res.status(400).json({ success: false, message: err.message });
    }
  }

  static async getActivity(req: Request, res: Response) {
    try {
      const authUser = (req as any).user;
      const { page, limit, userId, search } = req.query;

      const p = Number(page) || 1;
      const l = Number(limit) || 20;
      const skip = (p - 1) * l;

      let where: any = {};

      // If user is not admin, they can ONLY see their own activities
      if (authUser.role !== 'admin') {
        where.user_id = authUser.id;
      } 
      // If user is admin
      else {
        if (userId) {
          where.user_id = userId as string;
        }
        // If no userId, admin sees everything (where = {})
      }

      // Add search filter if present
      if (search) {
        where.OR = [
          { title: { contains: search as string, mode: 'insensitive' } },
          { description: { contains: search as string, mode: 'insensitive' } },
          { user: { full_name: { contains: search as string, mode: 'insensitive' } } }
        ];
      }

      const [activities, total] = await Promise.all([
        prisma.activity.findMany({
          where,
          include: {
            user: {
              select: {
                full_name: true,
                email: true,
                role: true
              }
            }
          },
          orderBy: { created_at: "desc" },
          skip,
          take: l,
        }),
        prisma.activity.count({ where })
      ]);

      res.status(200).json({ 
        success: true, 
        activities, 
        total, 
        page: p, 
        limit: l 
      });
    } catch (err: any) {
      console.error("[GetActivity Error]:", err);
      res.status(400).json({ success: false, message: err.message });
    }
  }


  // --- CAMPAIGN MANAGEMENT ---

  static async getCampaigns(req: Request, res: Response) {
    try {
      const userId = (req as any).user.id;
      const {
        page = 1,
        limit = 10,
        status,
        type,
        startDate,
        endDate,
        campaignId,
        messageId,
      } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const where: any = { user_id: userId };

      if (status && status !== "ALL") {
        where.status = status;
      }
      if (type && type !== "all") {
        where.type = type;
      }
      if (campaignId && campaignId !== "all") {
        where.id = campaignId;
      }
      if (messageId) {
        where.request_id = messageId;
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
                events: true,
              },
            },
          },
          orderBy: { created_at: "desc" },
          skip,
          take: Number(limit),
        }),
        prisma.campaign.count({ where }),
      ]);

      // Bulk aggregate counts for all retrieved campaigns to avoid N+1 queries
      const campaignIds = campaigns.map((c) => c.id);
      const [deliveredCounts, readCounts, clickedCounts] = await Promise.all([
        prisma.campaignEvent.groupBy({
          by: ["campaign_id"],
          where: {
            campaign_id: { in: campaignIds },
            delivered_at: { not: null },
          },
          _count: true,
        }),
        prisma.campaignEvent.groupBy({
          by: ["campaign_id"],
          where: { campaign_id: { in: campaignIds }, read_at: { not: null } },
          _count: true,
        }),
        prisma.campaignEvent.groupBy({
          by: ["campaign_id"],
          where: {
            campaign_id: { in: campaignIds },
            event_type: RcsEventType.CLICKED,
          },
          _count: true,
        }),
      ]);

      const campaignsWithStats = campaigns.map((c) => {
        const delivered =
          deliveredCounts.find((d) => d.campaign_id === c.id)?._count || 0;
        const read =
          readCounts.find((r) => r.campaign_id === c.id)?._count || 0;
        const clicked =
          clickedCounts.find((cl) => cl.campaign_id === c.id)?._count || 0;

        return {
          ...c,
          internal_sent_count: c._count.events,
          internal_delivered_count: delivered,
          internal_read_count: Math.max(read, clicked),
          internal_clicked_count: clicked,
        };
      });

      res
        .status(200)
        .json({
          success: true,
          campaigns: campaignsWithStats,
          total,
          page: Number(page),
        });
    } catch (err: any) {
      console.error(err);
      res.status(400).json({ success: false, message: err.message });
    }
  }

  static async createCampaign(req: Request, res: Response) {
    try {
      const userId = (req as any).user.id;
      const {
        name,
        template_name,
        template_id,
        namespace,
        type,
        contact_source,
        scheduled_at,
        contacts,
      } = req.body;

      if (!name || !template_name || !type) {
        throw new Error("Campaign name, template, and type are required");
      }

      // Count contacts if source is provided
      let totalContacts = 0;
      let targetContacts: string[] = contacts || [];

      if (contact_source === "ALL") {
        const allUserContacts = await prisma.contact.findMany({
          where: { user_id: userId, status: "ACTIVE" },
          select: { phone_number: true },
        });
        totalContacts = allUserContacts.length;
        targetContacts = allUserContacts.map((c) => c.phone_number);
      } else if (contact_source === "DEMO" || Array.isArray(contacts)) {
        totalContacts = targetContacts.length;
      } else if (contact_source) {
        const group = await prisma.contactGroup.findFirst({
          where: { id: contact_source, user_id: userId },
          include: { contacts: { select: { phone_number: true } } },
        });
        totalContacts = group?.contacts.length || 0;
        targetContacts = group?.contacts.map((c) => c.phone_number) || [];
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
                    user_id: userId,
                  },
                },
                update: {}, // Don't change existing
                create: {
                  phone_number: num,
                  user_id: userId,
                  name: `Contact ${num.slice(-4)}`, // Placeholder name
                  status: "ACTIVE",
                },
              });
            }
          } catch (err) {
            console.error("[Contact Auto-Sync Error]:", err);
          }
        })();
      }

      const campaign = await prisma.campaign.create({
        data: {
          user_id: userId,
          name,
          template_name,
          template_id,
          type,
          contact_source: contact_source || "CUSTOM",
          scheduled_at: scheduled_at ? new Date(scheduled_at) : null,
          status: scheduled_at ? CampaignStatus.SCHEDULED : CampaignStatus.LIVE,
          total_contacts: totalContacts,
          namespace,
        } as any,
      });

      // TRIGGER SENDING IF LIVE
      if (
        campaign.status === CampaignStatus.LIVE &&
        targetContacts.length > 0
      ) {
        // Trigger in background to not block response
        (async () => {
          try {
            const config = await RcsController.getConfig(userId);
            // For RCS, we usually use the template name (function_name in MSG91)
            // and pass the audience to 'to'
            const service = RcsServiceFactory.getService(config.provider);
            const rcsRes = await service.sendMessage(
              {
                to: targetContacts.map((num) => num.replace(/^\+/, "")),
                function_name: "template", // To trigger a template on MSG91
                name: template_name, // The internal name of your template
                template_id: template_id, // For JioCX lookup
                namespace: namespace, // Required for template resolution
              },
              config,
            );

            // Update sent count and request ID for tracking reports
            await prisma.campaign.update({
              where: { id: campaign.id },
              data: {
                sent_count: targetContacts.length,
                request_id:
                  rcsRes.messageID ||
                  rcsRes.result?.request_id ||
                  rcsRes.result?.data?.request_id ||
                  null,
              } as any,
            });

            // INITIALIZE 'SENT' EVENTS FOR ALL NUMBERS
            await prisma.campaignEvent.createMany({
              data: targetContacts.map((num) => ({
                campaign_id: campaign.id,
                phone_number: num,
                event_type: RcsEventType.SENT,
                // created_at is automatic
              })),
              skipDuplicates: true,
            });
          } catch (err) {
            console.error("[Campaign Background Send Error]:", err);
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
        data: { status },
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
      const { days = "30" } = req.query;
      const numDays = parseInt(days as string);

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - numDays);
      startDate.setHours(0, 0, 0, 0);

      // Optimized aggregation using raw SQL for date grouping in the database
      const volumeData: any[] = await prisma.$queryRaw`
        SELECT 
          TO_CHAR(DATE_TRUNC('day', ce.created_at), 'Mon DD') as day,
          COUNT(ce.sent_at) as sent,
          COUNT(ce.delivered_at) as delivered,
          COUNT(ce.read_at) as read
        FROM campaign_events ce
        JOIN campaigns c ON ce.campaign_id = c.id
        WHERE c.user_id = ${userId}
        AND ce.created_at >= ${startDate}
        GROUP BY DATE_TRUNC('day', ce.created_at)
        ORDER BY DATE_TRUNC('day', ce.created_at) ASC
      `;

      // Convert BigInt counts from PostgreSQL to Numbers for JSON serialization
      const formattedData = volumeData.map((d) => ({
        day: d.day,
        sent: Number(d.sent),
        delivered: Number(d.delivered),
        read: Number(d.read),
      }));

      res.status(200).json({
        success: true,
        data: formattedData,
      });
    } catch (err: any) {
      console.error(err);
      res.status(400).json({ success: false, message: err.message });
    }
  }

  static async getCampaignStats(req: Request, res: Response) {
    try {
      const userId = (req as any).user.id;
      const { type, startDate, endDate, campaignId, messageId } = req.query;

      const where: any = { user_id: userId };
      if (type && type !== "all") where.type = type;
      if (campaignId && campaignId !== "all") where.id = campaignId;
      if (messageId) where.request_id = messageId;
      if (startDate || endDate) {
        where.created_at = {};
        if (startDate) where.created_at.gte = new Date(startDate as string);
        if (endDate) where.created_at.lte = new Date(endDate as string);
      }

      const campaigns = await prisma.campaign.findMany({ where });

      const eventWhere: any = { campaign: { user_id: userId } };
      if (type && type !== "all") eventWhere.campaign.type = type;
      if (campaignId && campaignId !== "all")
        eventWhere.campaign_id = campaignId;
      if (messageId) eventWhere.campaign.request_id = messageId;
      if (startDate || endDate) {
        eventWhere.created_at = {};
        if (startDate)
          eventWhere.created_at.gte = new Date(startDate as string);
        if (endDate) eventWhere.created_at.lte = new Date(endDate as string);
      }

      // Aggregate simple dashboard stats from Event source of truth
      const [
        totalEvents,
        totalDelivered,
        totalClicked,
        totalFailed,
        totalRead,
      ] = await Promise.all([
        prisma.campaignEvent.count({
          where: { ...eventWhere, sent_at: { not: null } },
        }),
        prisma.campaignEvent.count({
          where: { ...eventWhere, delivered_at: { not: null } },
        }),
        prisma.campaignEvent.count({
          where: { ...eventWhere, event_type: "CLICKED" },
        }),
        prisma.campaignEvent.count({
          where: { ...eventWhere, event_type: "FAILED" },
        }),
        prisma.campaignEvent.count({
          where: { ...eventWhere, read_at: { not: null } },
        }),
      ]);

      const stats = {
        total: campaigns.length,
        live: campaigns.filter(
          (c) =>
            c.status === CampaignStatus.LIVE ||
            c.status === CampaignStatus.PARTIALLY_COMPLETED,
        ).length,
        paused: campaigns.filter((c) => c.status === CampaignStatus.PAUSED)
          .length,
        completed: campaigns.filter(
          (c) => c.status === CampaignStatus.COMPLETED,
        ).length,
        audience: totalEvents,
        delivered: totalDelivered,
        read: Math.max(totalRead, totalClicked),
        clicked: totalClicked,
        failed: totalFailed,
        avgClick: totalEvents > 0 ? (totalClicked / totalEvents) * 100 : 0,
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
        where: { id: campaignId, user_id: userId },
      });

      if (!campaign) {
        return res
          .status(404)
          .json({ success: false, message: "Campaign not found" });
      }

      // Fetch contacts based on original source
      let targetContacts: string[] = [];
      if (campaign.contact_source === "ALL") {
        const allUserContacts = await prisma.contact.findMany({
          where: { user_id: userId, status: "ACTIVE" },
          select: { phone_number: true },
        });
        targetContacts = allUserContacts.map((c) => c.phone_number);
      } else if (
        campaign.contact_source === "CUSTOM" ||
        campaign.contact_source === "DEMO"
      ) {
        const promotionalError =
          "Promotional messages are only allowed between 9 A.M. to 9 P.M.";

        const existingEvents = await prisma.campaignEvent.findMany({
          where: {
            campaign_id: campaign.id,
            OR: [
              { event_type: RcsEventType.SENT },
              {
                event_type: RcsEventType.FAILED,
                error_details: { contains: promotionalError },
              },
            ],
          },
          select: { phone_number: true },
          distinct: ["phone_number"],
        });
        targetContacts = existingEvents.map((e) => e.phone_number);
      } else if (campaign.contact_source) {
        const group = await prisma.contactGroup.findFirst({
          where: { id: campaign.contact_source, user_id: userId },
          include: { contacts: { select: { phone_number: true } } },
        });
        targetContacts = group?.contacts.map((c) => c.phone_number) || [];
      }

      if (targetContacts.length === 0) {
        return res
          .status(400)
          .json({ success: false, message: "No contacts found to resend to" });
      }

      (async () => {
        try {
          const config = await RcsController.getConfig(userId);
          const service = RcsServiceFactory.getService(config.provider);
          const rcsRes = await service.sendMessage(
            {
              to: targetContacts.map((num) => num.replace(/^\+/, "")),
              function_name: "template", // Consistent with createCampaign
              name: campaign.template_name,
              template_id: (campaign as any).template_id, // Added template_id for resend
              namespace: campaign.namespace || "", // Use existing if available
            },
            config,
          );

          // Update Campaign with latest requestId
          await prisma.campaign.update({
            where: { id: campaign.id },
            data: {
              sent_count: { increment: targetContacts.length },
              request_id:
                rcsRes.result?.request_id ||
                rcsRes.result?.data?.request_id ||
                null,
            } as any,
          });

          // Reset/Initialize 'SENT' status for these numbers
          for (const phone of targetContacts) {
            await prisma.campaignEvent.upsert({
              where: {
                campaign_id_phone_number: {
                  campaign_id: campaign.id,
                  phone_number: phone,
                },
              },
              update: {
                event_type: RcsEventType.SENT,
                error_details: null,
                status_updated_at: null,
                sent_at: null,
                delivered_at: null,
                read_at: null,
                engagement: null,
                created_at: new Date(), // Record retry time
              },
              create: {
                campaign_id: campaign.id,
                phone_number: phone,
                event_type: RcsEventType.SENT,
              },
            });
          }
        } catch (err) {
          console.error("[Campaign Resend Error]:", err);
        }
      })();

      res.json({
        success: true,
        message: "Resend triggered successfully",
        target_count: targetContacts.length,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  static async getCampaignStatsSingle(req: Request, res: Response) {
    try {
      const userId = (req as any).user.id;
      const campaignId = req.params.id as string;

      const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId, user_id: userId },
      });

      if (!campaign) {
        return res
          .status(404)
          .json({ success: false, message: "Campaign not found" });
      }

      // Total unique contacts that this campaign has targeted
      const totalSent = await prisma.campaignEvent.count({
        where: { campaign_id: campaignId },
      });

      // Lifecycle-based aggregate counting
      const [
        sentCount,
        deliveredCount,
        readCount,
        clickedCount,
        failedCount,
        expiredCount,
      ] = await Promise.all([
        prisma.campaignEvent.count({
          where: { campaign_id: campaignId, sent_at: { not: null } },
        }),
        prisma.campaignEvent.count({
          where: { campaign_id: campaignId, delivered_at: { not: null } },
        }),
        prisma.campaignEvent.count({
          where: { campaign_id: campaignId, read_at: { not: null } },
        }),
        prisma.campaignEvent.count({
          where: { campaign_id: campaignId, event_type: RcsEventType.CLICKED },
        }),
        prisma.campaignEvent.count({
          where: { campaign_id: campaignId, event_type: RcsEventType.FAILED },
        }),
        prisma.campaignEvent.count({
          where: { campaign_id: campaignId, event_type: RcsEventType.EXPIRED },
        }),
      ]);

      const counts = {
        SENT: sentCount,
        DELIVERED: deliveredCount,
        READ: Math.max(readCount, clickedCount), // Clicked implies read
        CLICKED: clickedCount,
        FAILED: failedCount,
        EXPIRED: expiredCount,
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

      if (status && status !== "all") {
        switch (status) {
          case "SENT":
            eventWhere.sent_at = { not: null };
            break;
          case "DELIVERED":
            eventWhere.delivered_at = { not: null };
            break;
          case "READ":
            eventWhere.OR = [
              { read_at: { not: null } },
              { event_type: "CLICKED" },
            ];
            break;
          case "CLICKED":
            eventWhere.event_type = "CLICKED";
            break;
          case "FAILED":
            eventWhere.event_type = "FAILED";
            break;
          case "EXPIRED":
            eventWhere.event_type = "EXPIRED";
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
          orderBy: { created_at: "desc" },
        }),
        prisma.campaignEvent.count({ where: eventWhere }),
      ]);

      res
        .status(200)
        .json({ success: true, events, total, page: Number(page) });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

  // ------------------------------------------------------------------ //
  //  JioCX – Number Capability Check
  // ------------------------------------------------------------------ //

  /**
   * POST /api/rcs/check-capability
   *
   * Body:
   *   { "phoneNumbers": "+919800000000" }              ← single (string)
   *   { "phoneNumbers": ["+91980...", "+91981...", ...] } ← bulk (array, 500–10000+)
   *
   * Rules enforced here:
   *   - Array length < 500   → reject with 400
   *   - Array length > 10000 → chunked automatically inside JiocxRcsService
   */
  static async checkCapability(req: Request, res: Response) {
    try {
      const userId = (req as any).user.id;
      const { phoneNumbers } = req.body;

      if (phoneNumbers === undefined || phoneNumbers === null) {
        return res.status(400).json({
          success: false,
          message: 'phoneNumbers is required in the request body.',
        });
      }

      const sanitizedPhoneNumbers = RcsController.sanitizeCapabilityInput(phoneNumbers);

      // Validate array constraints
      if (Array.isArray(sanitizedPhoneNumbers)) {
        if (sanitizedPhoneNumbers.length < 500) {
          return res.status(400).json({
            success: false,
            message:
              `Bulk mode requires at least 500 numbers (received ${sanitizedPhoneNumbers.length}). ` +
              'For a single number pass a string, not an array.',
          });
        }
      }

      const config  = await RcsController.getJiocxConfig(userId);
      const service = RcsServiceFactory.getService(RcsProvider.JIOCX);

      if (!service.checkCapability) {
        return res.status(501).json({
          success: false,
          message: 'checkCapability is not supported by this provider.',
        });
      }

      const result = await service.checkCapability(sanitizedPhoneNumbers, config);
      const contactSync = await RcsController.syncCapabilityContacts(userId, result.rows || []);
      res.status(200).json({ ...result, contactSync });
    } catch (err: any) {
      console.error('[checkCapability Error]:', err.message);
      res.status(400).json({ success: false, message: err.message });
    }
  }

  static async campaignPrecheck(req: Request, res: Response) {
    try {
      const userId = (req as any).user.id;
      const { phoneNumbers } = req.body;

      if (!Array.isArray(phoneNumbers)) {
        return res.status(400).json({
          success: false,
          message: 'phoneNumbers must be an array of strings.',
        });
      }

      const sanitizedPhoneNumbers = RcsController.sanitizeCapabilityInput(phoneNumbers);
      const config  = await RcsController.getJiocxConfig(userId);
      const service = RcsServiceFactory.getService(RcsProvider.JIOCX);

      if (!service.campaignPrecheck) {
        return res.status(501).json({
          success: false,
          message: 'campaignPrecheck is not supported by this provider.',
        });
      }

      const result = await service.campaignPrecheck(sanitizedPhoneNumbers as string[], config);
      const contactSync = await RcsController.syncCapabilityContacts(userId, result.rows || []);
      res.status(200).json({ ...result, contactSync });
    } catch (err: any) {
      console.error('[campaignPrecheck Error]:', err.message);
      res.status(400).json({ success: false, message: err.message });
    }
  }

  static async getUserMessages(req: Request, res: Response) {
    try {
      const userId = (req as any).user.id;
      const { page = 1, limit = 10, phoneNumber } = req.query;
      const p = parseInt(page as string);
      const l = parseInt(limit as string);
      const skip = (p - 1) * l;

      const where: any = { user_id: userId };
      if (phoneNumber) {
        where.phone_number = { contains: phoneNumber as string };
      }

      const [messages, total] = await Promise.all([
        (prisma as any).userMessage.findMany({
          where,
          orderBy: { created_at: 'desc' },
          skip,
          take: l,
        }),
        (prisma as any).userMessage.count({ where })
      ]);

      res.status(200).json({
        success: true,
        messages,
        total,
        page: p,
        limit: l
      });
    } catch (err: any) {
      console.error('[GetUserMessages Error]:', err.message);
      res.status(400).json({ success: false, message: err.message });
    }
  }

  static async getConversations(req: Request, res: Response) {
    try {
      const userId = (req as any).user.id;
      const { search } = req.query;

      // Use raw SQL for grouping unique phone numbers with their latest message
      // We use Prisma.sql to build the query safely
      const searchCondition = search
        ? Prisma.sql`AND phone_number LIKE ${`%${search}%`}`
        : Prisma.empty;
      
      const conversations: any[] = await prisma.$queryRaw`
        SELECT DISTINCT ON (phone_number)
          id,
          phone_number,
          text,
          suggestion_data,
          created_at
        FROM user_messages
        WHERE user_id = ${userId}
        ${searchCondition}
        ORDER BY phone_number, created_at DESC
      `;

      // Sort by latest message overall
      conversations.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      res.status(200).json({
        success: true,
        conversations
      });
    } catch (err: any) {
      console.error('[GetConversations Error]:', err.message);
      res.status(400).json({ success: false, message: err.message });
    }
  }
}
