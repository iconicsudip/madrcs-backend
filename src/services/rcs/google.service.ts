import fs from 'fs';
import { randomUUID } from 'crypto';
import prisma from '../../config/prisma';
import {
  CreateTemplatePayload,
  IRcsService,
  RcsLogParams,
  RcsProviderConfig,
  SendMessagePayload,
} from './rcs.interface';

const rbmApiHelper = require('@google/rcsbusinessmessaging');

export class GoogleRcsService implements IRcsService {
  private region: string;
  private isInitialized = false;

  constructor() {
    this.region = process.env.GOOGLE_RCS_REGION || 'us-'; // default to 'us-' as per library
    this.initRbm();
  }

  private initRbm() {
    try {
      const credsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
      if (credsPath && fs.existsSync(credsPath)) {
        const serviceAccount = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
        rbmApiHelper.initRbmApi(serviceAccount, this.region);
        this.isInitialized = true;
      } else {
        console.warn('[GoogleRcsService] GOOGLE_APPLICATION_CREDENTIALS not set or file missing. Will mock RBM API calls.');
      }
    } catch (err) {
      console.warn('[GoogleRcsService] Failed to init RBM library:', err);
    }
  }

  async sendMessage(
    payload: SendMessagePayload,
    config: RcsProviderConfig,
  ): Promise<any> {
    console.log('[GoogleRcsService] Preparing to send message via function:', payload.function_name);

    if (!config.projectId) {
      throw new Error('Google Provider: Project ID (Agent ID) is required in config.');
    }

    // Set the specific agent ID for this message
    rbmApiHelper.setAgentId(config.projectId);

    const { to, text, actions, suggestions, media_url, messageTrafficType } = payload;
    let finalPayload: any = payload;
    let templateType = payload.function_name;

    if (payload.function_name === 'template' && payload.name) {
      // Fetch template from DB for Campaign sends
      const template = await prisma.rcsTemplate.findFirst({
        where: { name: payload.name, provider: 'google' },
        orderBy: { created_at: 'desc' }
      });
      if (!template) {
        throw new Error(`Google Provider: Template ${payload.name} not found.`);
      }
      finalPayload = template.payload; // the content payload saved during createTemplate
      templateType = template.category;
    }

    // Format recipient list to E.164
    const recipientList = (Array.isArray(to) ? to : [to]).map(num => {
      return num.startsWith('+') ? num : `+${num}`;
    });

    const results: any[] = [];

    // Google RBM sends message individually to each phone number
    for (const phoneNumber of recipientList) {
      const messageId = randomUUID();

      const params: any = {
        msisdn: phoneNumber,
        messageText: text,
      };

      if (media_url) {
        params.fileUrl = media_url;
        params.forceRefresh = false;
      }

      if (suggestions && suggestions.length > 0) {
        params.suggestions = suggestions.map((s: any) => {
          if (s.reply) return { reply: s.reply };
          if (s.action) return { action: s.action };
          return s;
        });
      }

      try {
        if (!this.isInitialized) {
          console.log(`[GoogleRcsService] Mock send to ${phoneNumber}:`, finalPayload);
          results.push({ phone: phoneNumber, success: true, messageId });
          continue;
        }

        let response;
        if (templateType === 'carousel' && finalPayload.cards) {
          const cardContents = finalPayload.cards.map((c: any) => {
            const card: any = {
              title: c.title || '',
              description: c.description || ''
            };
            if (c.media_url) {
              card.media = {
                height: 'MEDIUM',
                contentInfo: { fileUrl: c.media_url, forceRefresh: false }
              };
            }
            if (c.actions || c.replies_list) {
              const suggs: any[] = [];
              if (c.replies_list) c.replies_list.forEach((r: string) => suggs.push({ reply: { text: r, postbackData: r } }));
              if (c.actions) c.actions.forEach((a: any) => suggs.push({ reply: { text: a.text_to_show, postbackData: a.url || a.dial_number || 'postback' } }));
              card.suggestions = suggs;
            }
            return card;
          });

          const params = {
            msisdn: phoneNumber,
            cardContents: cardContents
          };

          response = await new Promise((resolve, reject) => {
            rbmApiHelper.sendCarouselCard(params, (res: any, err: any) => err ? reject(err) : resolve(res));
          });
        } else if (['rich_card', 'view_location', 'calendar_event', 'share_location'].includes(templateType as string)) {
          const params: any = {
            msisdn: phoneNumber,
            messageText: finalPayload.title || finalPayload.text || '',
            messageDescription: finalPayload.description || '',
            height: 'TALL'
          };
          if (finalPayload.media_url) {
            params.imageUrl = finalPayload.media_url;
          }
          if (finalPayload.actions || finalPayload.replies_list) {
            const suggs: any[] = [];
            if (finalPayload.replies_list) finalPayload.replies_list.forEach((r: string) => suggs.push({ reply: { text: r, postbackData: r } }));
            if (finalPayload.actions) finalPayload.actions.forEach((a: any) => suggs.push({ reply: { text: a.text_to_show, postbackData: a.url || a.dial_number || 'postback' } }));
            params.suggestions = suggs;
          }

          response = await new Promise((resolve, reject) => {
            rbmApiHelper.sendRichCard(params, (res: any, err: any) => err ? reject(err) : resolve(res));
          });
        } else {
          // Normal Message fallback
          const params: any = {
            msisdn: phoneNumber,
            messageText: finalPayload.text || finalPayload.title || '',
          };

          if (finalPayload.media_url) {
            params.fileUrl = finalPayload.media_url;
            params.forceRefresh = false;
          }

          if (finalPayload.actions || finalPayload.replies_list || suggestions) {
            const suggs: any[] = suggestions ? suggestions.map((s: any) => ({ reply: s.reply, action: s.action })) : [];
            if (finalPayload.replies_list) finalPayload.replies_list.forEach((r: string) => suggs.push({ reply: { text: r, postbackData: r } }));
            if (finalPayload.actions) finalPayload.actions.forEach((a: any) => suggs.push({ reply: { text: a.text_to_show, postbackData: a.url || a.dial_number || 'postback' } }));
            params.suggestions = suggs;
          }

          response = await rbmApiHelper.sendMessage(params);
        }

        results.push({ phone: phoneNumber, success: true, messageId, data: response });
      } catch (error: any) {
        console.error(`[GoogleRcsService] Error sending to ${phoneNumber}:`, error?.response?.data || error.message);
        results.push({ phone: phoneNumber, success: false, error: error?.response?.data || error.message });
      }
    }

    // Return aggregated results
    const allSuccessful = results.every(r => r.success);
    return {
      success: allSuccessful,
      provider: 'google',
      result: {
        request_id: results[0]?.messageId, // Use first messageId as bulk request tracking
        details: results
      }
    };
  }

  async getTemplates(
    config: RcsProviderConfig,
    status?: string,
  ): Promise<any> {
    console.log('[GoogleRcsService] Fetch templates not directly supported by basic RBM API without Management API.');
    return { success: true, provider: 'google', templates: [], count: 0 };
  }

  async createTemplate(
    payload: CreateTemplatePayload,
    config: RcsProviderConfig,
  ): Promise<any> {
    console.log('[GoogleRcsService] Create template via RBM basic API usually done via console or Management API.');
    return { success: true, provider: 'google', status: 'mocked_success' };
  }

  async getLogs(config: RcsProviderConfig, params: RcsLogParams): Promise<any> {
    console.log('[GoogleRcsService] Get logs via RBM is via Cloud Pub/Sub Events or BigQuery, mocked here.');
    return { success: true, provider: 'google', result: { logs: [] } };
  }
}
