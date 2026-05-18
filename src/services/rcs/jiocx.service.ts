import axios from 'axios';
import crypto from 'crypto';
import prisma from '../../config/prisma';
import { RcsProvider, RcsFunctionName } from '../../enums/rcs.enum';
import {
  IRcsService,
  RcsProviderConfig,
  SendMessagePayload,
  RcsLogParams,
  CreateTemplatePayload,
} from './rcs.interface';
import { formatPhoneNumber } from '../../utils/phone.util';

const JIOCX_BASE_URL = process.env.JIOCX_BASE_URL || 'https://rcsapi-uat.jiocx.com/api/v1';
const CAPABILITY_CHUNK_SIZE = 10000; // max per JioCX API call
const CAPABILITY_BULK_MIN = 500;   // min required when using array mode
const CAPABILITY_DISCOVERY_DEPTH = 4;

export interface CapabilityResultRow {
  phoneNumber: string;
  rcsCapable: boolean | null;
  status: string;
  raw: any;
}

export interface CapabilityCheckResult {
  success: boolean;
  provider: RcsProvider.JIOCX;
  totalRequested: number;
  chunksProcessed?: number;
  rows?: CapabilityResultRow[];
  result?: any;
  results?: any[];
  error?: any;
}

const normalizeCapabilityPhone = (phone: unknown): string | null => {
  if (typeof phone !== 'string' && typeof phone !== 'number') {
    return null;
  }
  return formatPhoneNumber(String(phone));
};

const extractCapabilityValue = (item: any): boolean | null => {
  if (typeof item === 'boolean') {
    return item;
  }

  const candidates = [
    item?.isRcsCapable,
    item?.isRCSCapable,
    item?.capable,
    item?.rcsCapable,
    item?.rcs_capable,
    item?.rcsEnabled,
    item?.rcs_enabled,
    item?.isEnabled,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'boolean') {
      return candidate;
    }

    if (typeof candidate === 'string') {
      const value = candidate.trim().toLowerCase();
      if (['true', 'yes', 'enabled', 'rcs_enabled', 'capable', 'supported'].includes(value)) {
        return true;
      }
      if (['false', 'no', 'disabled', 'rcs_disabled', 'not_capable', 'unsupported'].includes(value)) {
        return false;
      }
    }
  }

  const status = typeof item?.status === 'string' ? item.status.trim().toLowerCase() : '';
  if (['enabled', 'capable', 'supported', 'rcs enabled', 'rcs capable'].includes(status)) {
    return true;
  }
  if (['disabled', 'not capable', 'unsupported', 'rcs disabled', 'not supported'].includes(status)) {
    return false;
  }

  return null;
};

const extractCapabilityStatus = (item: any, rcsCapable: boolean | null): string => {
  const statusCandidate =
    item?.status ||
    item?.Status ||
    item?.message ||
    item?.Message;

  if (typeof statusCandidate === 'string' && statusCandidate.trim()) {
    return statusCandidate.trim();
  }

  if (rcsCapable === true) {
    return 'RCS Enabled';
  }

  if (rcsCapable === false) {
    return 'RCS Disabled';
  }

  return 'Unknown';
};

const isCapabilityLeaf = (value: any): boolean => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const hasPhoneNumber = Boolean(
    value.PhoneNumber ||
    value.phoneNumber ||
    value.msisdn ||
    value.phone ||
    value.number,
  );
  const hasCapabilitySignal =
    value.isRcsCapable !== undefined ||
    value.capable !== undefined ||
    value.rcsCapable !== undefined ||
    value.rcs_enabled !== undefined ||
    value.rcsEnabled !== undefined;

  return Boolean(
    hasPhoneNumber || hasCapabilitySignal,
  );
};

const collectCapabilityItems = (value: any, depth = 0): any[] => {
  if (depth > CAPABILITY_DISCOVERY_DEPTH || value === null || value === undefined) {
    return [];
  }

  if (Array.isArray(value)) {
    const items = value.flatMap((entry) => collectCapabilityItems(entry, depth + 1));
    if (items.length > 0) {
      return items;
    }
    // If it's an array of primitives (like [true]), return them as items
    return value.map((v) => (typeof v === 'object' && v !== null ? v : { capable: v, status: String(v) }));
  }

  if (typeof value !== 'object') {
    return [{ capable: value, status: String(value) }];
  }

  const candidateKeys = [
    'data',
    'result',
    'results',
    'numbers',
    'phoneNumbers',
    'PhoneNumbers',
    'response',
    'capabilities',
    'contacts',
    'payload',
  ];

  for (const key of candidateKeys) {
    if (key in value) {
      const items = collectCapabilityItems(value[key], depth + 1);
      if (items.length > 0) {
        return items;
      }
    }
  }

  if (isCapabilityLeaf(value)) {
    return [value];
  }

  return [];
};

const buildCapabilityRows = (
  payload: any,
  requestedNumbers: string[],
): CapabilityResultRow[] => {
  const requested = requestedNumbers
    .map((phone) => normalizeCapabilityPhone(phone))
    .filter((phone): phone is string => Boolean(phone));
  const items = collectCapabilityItems(payload);
  const rows: CapabilityResultRow[] = [];
  const seen = new Set<string>();

  items.forEach((item, index) => {
    const fallbackPhone =
      requested.length === 1
        ? requested[0]
        : requested[index];
    const phoneNumber = normalizeCapabilityPhone(
      item?.PhoneNumber ||
      item?.phoneNumber ||
      item?.msisdn ||
      item?.phone ||
      item?.number ||
      fallbackPhone,
    );

    if (!phoneNumber || seen.has(phoneNumber)) {
      return;
    }

    const rcsCapable = extractCapabilityValue(item);
    rows.push({
      phoneNumber,
      rcsCapable,
      status: extractCapabilityStatus(item, rcsCapable),
      raw: item,
    });
    seen.add(phoneNumber);
  });

  requested.forEach((phoneNumber) => {
    if (!seen.has(phoneNumber)) {
      rows.push({
        phoneNumber,
        rcsCapable: null,
        status: 'Unknown',
        raw: null,
      });
    }
  });

  return rows;
};

export class JiocxRcsService implements IRcsService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = JIOCX_BASE_URL;
  }

  // ------------------------------------------------------------------ //
  //  Number Capability Check
  // ------------------------------------------------------------------ //
  /**
   * Check RCS capability for one or more phone numbers.
   *
   *  - Single number  → send as a plain string in `PhoneNumbers`
   *  - Multiple numbers (≥ 500) → send as an array; if count > 10,000 the
   *    method automatically splits into chunks of 10,000 and merges results.
   */
  async checkCapability(
    phoneNumbers: string | string[],
    config: RcsProviderConfig,
  ): Promise<CapabilityCheckResult> {
    const apiKey = config.apiKey;
    const agentId = config.projectId;

    if (!apiKey || !agentId) {
      throw new Error('JioCX Provider: x-apikey and agentid are required.');
    }

    const headers = {
      'x-apikey': apiKey,
      'agentid': agentId,
      'Content-Type': 'application/json',
    };

    // ── Single number ──────────────────────────────────────────────────
    if (typeof phoneNumbers === 'string') {
      const formattedNumber = this.formatPhoneNumber(phoneNumbers);
      try {
        const response = await axios.post(
          `${this.baseUrl}/checkCapability`,
          { PhoneNumbers: formattedNumber },
          { headers },
        );
        const rows = buildCapabilityRows(response.data, [formattedNumber]);
        return {
          success: true,
          provider: RcsProvider.JIOCX,
          totalRequested: 1,
          rows,
          result: response.data,
        };
      } catch (err: any) {
        console.error('[JioCX] checkCapability single error:', err?.response?.data || err.message);
        return {
          success: false,
          provider: RcsProvider.JIOCX,
          totalRequested: 1,
          error: err?.response?.data || err.message,
        };
      }
    }

    // ── Multiple numbers ───────────────────────────────────────────────
    const rawNumbers = Array.isArray(phoneNumbers) ? phoneNumbers : [phoneNumbers];
    const numbers = rawNumbers.map(n => this.formatPhoneNumber(n));

    if (numbers.length < CAPABILITY_BULK_MIN) {
      throw new Error(
        `JioCX bulk capability check requires at least ${CAPABILITY_BULK_MIN} numbers. ` +
        `Received ${numbers.length}. For a single number use a string instead of an array.`,
      );
    }

    // Split into chunks of 10,000
    const chunks: string[][] = [];
    for (let i = 0; i < numbers.length; i += CAPABILITY_CHUNK_SIZE) {
      chunks.push(numbers.slice(i, i + CAPABILITY_CHUNK_SIZE));
    }

    const allResults: any[] = [];
    let allSuccess = true;

    for (let idx = 0; idx < chunks.length; idx++) {
      const chunk = chunks[idx];
      console.log(
        `[JioCX] checkCapability chunk ${idx + 1}/${chunks.length} (${chunk.length} numbers)`,
      );
      try {
        const response = await axios.post(
          `${this.baseUrl}/checkCapability`,
          { PhoneNumbers: chunk },
          { headers },
        );
        allResults.push({
          chunk: idx + 1,
          count: chunk.length,
          data: response.data,
          rows: buildCapabilityRows(response.data, chunk),
        });
      } catch (err: any) {
        console.error(`[JioCX] checkCapability chunk ${idx + 1} error:`, err?.response?.data || err.message);
        allSuccess = false;
        allResults.push({
          chunk: idx + 1,
          count: chunk.length,
          error: err?.response?.data || err.message,
        });
      }
    }

    return {
      success: allSuccess,
      provider: RcsProvider.JIOCX,
      totalRequested: numbers.length,
      chunksProcessed: chunks.length,
      rows: allResults.flatMap((entry) => entry.rows || []),
      results: allResults,
    };
  }

  async campaignPrecheck(
    phoneNumbers: string[],
    config: RcsProviderConfig,
  ): Promise<CapabilityCheckResult> {
    const apiKey = config.apiKey;
    const agentId = config.projectId;

    if (!apiKey || !agentId) {
      throw new Error('JioCX Provider: x-apikey and agentid are required.');
    }

    const headers = {
      'x-apikey': apiKey,
      'agentid': agentId,
      'Content-Type': 'application/json',
    };

    const numbers = phoneNumbers.map(n => this.formatPhoneNumber(n));

    // If single number or <500, check individually
    if (numbers.length < CAPABILITY_BULK_MIN) {
      const rows: CapabilityResultRow[] = [];
      const allResults: any[] = [];
      let allSuccess = true;

      for (const num of numbers) {
        try {
          const response = await axios.post(
            `${this.baseUrl}/checkCapability`,
            { PhoneNumbers: num },
            { headers },
          );
          const singleRows = buildCapabilityRows(response.data, [num]);
          rows.push(...singleRows);
          allResults.push({ count: 1, data: response.data, rows: singleRows });
        } catch (err: any) {
          console.error('[JioCX] campaignPrecheck single loop error:', err?.response?.data || err.message);
          allSuccess = false;
          rows.push({
            phoneNumber: num,
            rcsCapable: null,
            status: 'Unknown / Error',
            raw: null,
          });
          allResults.push({ count: 1, error: err?.response?.data || err.message });
        }
      }

      return {
        success: allSuccess,
        provider: RcsProvider.JIOCX,
        totalRequested: numbers.length,
        chunksProcessed: numbers.length,
        rows,
        results: allResults,
      };
    }

    // If >= 500 numbers, use bulk chunking
    const chunks: string[][] = [];
    for (let i = 0; i < numbers.length; i += CAPABILITY_CHUNK_SIZE) {
      chunks.push(numbers.slice(i, i + CAPABILITY_CHUNK_SIZE));
    }

    const allResults: any[] = [];
    let allSuccess = true;

    for (let idx = 0; idx < chunks.length; idx++) {
      const chunk = chunks[idx];
      try {
        const response = await axios.post(
          `${this.baseUrl}/checkCapability`,
          { PhoneNumbers: chunk },
          { headers },
        );
        allResults.push({
          chunk: idx + 1,
          count: chunk.length,
          data: response.data,
          rows: buildCapabilityRows(response.data, chunk),
        });
      } catch (err: any) {
        console.error(`[JioCX] campaignPrecheck chunk ${idx + 1} error:`, err?.response?.data || err.message);
        allSuccess = false;
        allResults.push({
          chunk: idx + 1,
          count: chunk.length,
          error: err?.response?.data || err.message,
        });
      }
    }

    return {
      success: allSuccess,
      provider: RcsProvider.JIOCX,
      totalRequested: numbers.length,
      chunksProcessed: chunks.length,
      rows: allResults.flatMap((entry) => entry.rows || []),
      results: allResults,
    };
  }

  // ------------------------------------------------------------------ //
  //  Send Message
  // ------------------------------------------------------------------ //

  async sendMessage(payload: SendMessagePayload, config: RcsProviderConfig): Promise<any> {
    const apiKey = config.apiKey;
    const agentId = config.projectId;

    if (!apiKey || !agentId) {
      throw new Error('JioCX Provider: x-apikey and agentid are required.');
    }

    const headers = {
      'x-apikey': apiKey,
      'Content-Type': 'application/json',
    };

    const rawContacts = Array.isArray(payload.to) ? payload.to : [payload.to];
    const allContacts = rawContacts.map((num) => this.formatPhoneNumber(num));
    // Use the provided messageID or generate a new one. 
    // The user wants this to be the same for all batches in a bulk send.
    const messageID = (payload as any).messageID || crypto.randomUUID();
    const campaignID = (payload as any).campaignID || 'Campaign_' + Date.now();

    const jiocxData = await this.mapToJiocxData(payload, config.userId);

    // JioCX supports up to 50 numbers in the contacts array at a time.
    const CHUNK_SIZE = 50;
    const chunks: string[][] = [];
    for (let i = 0; i < allContacts.length; i += CHUNK_SIZE) {
      chunks.push(allContacts.slice(i, i + CHUNK_SIZE));
    }

    const results: any[] = [];
    let allSuccess = true;

    for (const chunk of chunks) {
      const requestBody: any = {
        messageID, // Same messageID for all batches as requested
        agentID: agentId,
        campaignID,
        contacts: chunk,
        data: { content: jiocxData },
      };

      try {
        const response = await axios.post(
          `${this.baseUrl}/sendMessage`,
          requestBody,
          { headers },
        );
        results.push(response.data);
      } catch (err: any) {
        console.error('[JioCX] sendMessage batch error:', err?.response?.data || err.message);
        allSuccess = false;
        results.push({
          error: err?.response?.data || err.message,
          contacts: chunk
        });
      }
    }

    return {
      success: allSuccess,
      provider: RcsProvider.JIOCX,
      messageID, // Return the same messageID used for all batches
      results,
    };
  }

  private async mapToJiocxData(payload: SendMessagePayload, userId?: string): Promise<any> {
    // If it's a template trigger, fetch the template payload from DB
    if (payload.function_name === 'template' && (payload.template_id || payload.name) && userId) {
      const where: any = {
        user_id: userId,
        provider: RcsProvider.JIOCX,
        deleted_at: null
      };

      if (payload.template_id) {
        where.id = payload.template_id;
      } else {
        where.name = payload.name;
      }

      const template = await prisma.rcsTemplate.findFirst({
        where,
        orderBy: { created_at: 'desc' }
      });

      if (template && template.payload) {
        return this.ensurePostbackSuffix(template.payload);
      }
    }

    // If payload already has the JioCX structure in 'content', use it
    if (payload.content && (payload.content.plainText || payload.content.richCardDetails)) {
      return this.ensurePostbackSuffix(payload.content);
    }

    const data: any = { content: {} };

    // Handle TTL/Expiry
    if (payload.ttl) {
      data.ttl = typeof payload.ttl === 'number' ? `${payload.ttl}s` : payload.ttl;
    } else if ((payload as any).expireTime) {
      data.expireTime = (payload as any).expireTime;
    }

    const {
      function_name,
      text,
      text_to_show,
      media_url,
      replies_list,
      actions,
      image_urls,
      titles,
      descriptions,
      replies_list_of_list,
      actions_list_of_list,
    } = payload;

    // 1. Carousel
    if (function_name === RcsFunctionName.CAROUSEL || (image_urls && image_urls.length > 1)) {
      const contents = (image_urls || []).map((url, idx) => ({
        cardTitle: (titles && titles[idx]) || (payload.title || 'Title'),
        cardDescription: (descriptions && descriptions[idx]) || (payload.description || 'Description'),
        cardMedia: {
          mediaHeight: 'MEDIUM',
          contentInfo: { fileUrl: url },
        },
        suggestions: this.mapActionsToJiocx(
          (actions_list_of_list && actions_list_of_list[idx]) || actions || [],
          (replies_list_of_list && replies_list_of_list[idx]) || (idx === 0 ? replies_list : []),
        ),
      }));

      data.content.richCardDetails = {
        carousel: {
          cardWidth: 'MEDIUM_WIDTH',
          contents,
        },
      };
      return data;
    }

    // 2. Rich Card (Standalone)
    if (function_name === RcsFunctionName.RICH_CARD || media_url) {
      data.content.richCardDetails = {
        standalone: {
          cardOrientation: 'VERTICAL',
          content: {
            cardTitle: payload.title || text_to_show || 'Title',
            cardDescription: payload.description || text || 'Description',
            cardMedia: {
              mediaHeight: 'MEDIUM',
              contentInfo: { fileUrl: media_url },
            },
            suggestions: this.mapActionsToJiocx(actions, replies_list),
          },
        },
      };
      return data;
    }

    // 3. Plain Text with optional suggestions
    data.content.plainText = text || text_to_show || 'Hello';
    const suggestions = this.mapActionsToJiocx(actions, replies_list);
    if (suggestions.length > 0) {
      data.content.suggestions = suggestions;
    }

    return data;
  }

  private mapActionsToJiocx(actions?: any[], replies?: string[]): any[] {
    const suggestions: any[] = [];

    if (replies) {
      replies.forEach((replyText) => {
        suggestions.push({
          reply: {
            plainText: replyText,
            postBack: { data: `${replyText}{{$50}}` },
          },
        });
      });
    }

    if (actions) {
      actions.forEach((action) => {
        const jiocxAction: any = {
          plainText: action.text_to_show || action.title || 'Click',
          postBack: { data: `${action.postback_data || action.text_to_show || 'action'}{{$50}}` },
        };

        if (action.url || action.type === RcsFunctionName.OPEN_URL) {
          jiocxAction.openUrl = { url: action.url };
          if (action.application === 'WEBVIEW') {
            jiocxAction.openUrl.application = 'WEBVIEW';
            jiocxAction.openUrl.webviewViewMode = action.webviewViewMode || 'FULL';
          }
        } else if (action.dial_number || action.type === RcsFunctionName.DIAL) {
          jiocxAction.dialerAction = { phoneNumber: action.dial_number };
        } else if (action.type === RcsFunctionName.CALENDAR_EVENT) {
          jiocxAction.createCalendarEvent = {
            startTime: action.start_time,
            endTime: action.end_time,
            title: action.title,
            description: action.description,
          };
        } else if (action.type === RcsFunctionName.VIEW_LOCATION || action.type === 'show_location') {
          jiocxAction.showLocation = {
            coordinates: {
              latitude: action.latitude,
              longitude: action.longitude,
            },
            label: action.label || 'Location',
          };
        }

        suggestions.push({ action: jiocxAction });
      });
    }

    return suggestions;
  }

  private ensurePostbackSuffix(content: any): any {
    const processSuggestions = (suggestions: any[]) => {
      if (!Array.isArray(suggestions)) return;
      suggestions.forEach((s) => {
        const item = s.action || s.reply;
        if (item && item.postBack) {
          if (typeof item.postBack.data === 'string' && !item.postBack.data.includes('{{$50}}')) {
            item.postBack.data = `${item.postBack.data}{{$50}}`;
          } else if (!item.postBack.data) {
            item.postBack.data = '{{$50}}';
          }
        }
      });
    };

    if (content.suggestions) {
      processSuggestions(content.suggestions);
    }

    if (content.richCardDetails) {
      if (content.richCardDetails.standalone?.content?.suggestions) {
        processSuggestions(content.richCardDetails.standalone.content.suggestions);
      }
      if (content.richCardDetails.carousel?.contents) {
        content.richCardDetails.carousel.contents.forEach((card: any) => {
          if (card.suggestions) processSuggestions(card.suggestions);
        });
      }
    }

    return content;
  }

  async getTemplates(
    config: RcsProviderConfig,
    status?: string,
    page?: number,
    limit?: number,
  ): Promise<any> {
    const userId = config.userId;
    if (!userId) {
      return { success: true, provider: RcsProvider.JIOCX, templates: [], count: 0 };
    }

    const p = Number(page || 1);
    const l = Number(limit || 10);
    const skip = (p - 1) * l;

    const where: any = {
      user_id: userId,
      provider: RcsProvider.JIOCX,
      deleted_at: null,
    };

    if (status && status !== 'all') {
      where.status = status.toUpperCase();
    }

    try {
      const [templates, total] = await Promise.all([
        prisma.rcsTemplate.findMany({
          where,
          orderBy: { created_at: 'desc' },
          skip,
          take: l,
        }),
        prisma.rcsTemplate.count({ where }),
      ]);

      return {
        success: true,
        provider: RcsProvider.JIOCX,
        templates: templates.map((t) => ({
          id: t.id,
          name: t.name,
          status: t.status,
          provider: t.provider,
          function_name: t.category,
          content: t.payload,
          created_at: t.created_at,
          updated_at: t.updated_at,
        })),
        total,
        count: templates.length,
      };
    } catch (err: any) {
      console.error('[JioCX] getTemplates error:', err.message);
      return {
        success: false,
        provider: RcsProvider.JIOCX,
        error: err.message,
      };
    }
  }

  async createTemplate(payload: CreateTemplatePayload, config: RcsProviderConfig): Promise<any> {
    // As per user instructions: "template content will be approved immediately when template created"
    // and "in this json content data is template".
    // We don't have a JioCX API for this, so we just return success.
    // The controller will save the payload to our local database.
    return {
      success: true,
      provider: RcsProvider.JIOCX,
      status: 'APPROVED',
      message: 'Template created and approved immediately.',
      result: payload.content,
    };
  }

  async getLogs(config: RcsProviderConfig, params: RcsLogParams): Promise<any> {
    throw new Error('JioCX getLogs not yet implemented.');
  }

  private formatPhoneNumber(num: string): string {
    const cleaned = num.toString().replace(/\s/g, '');
    if (cleaned.startsWith('+')) return cleaned;
    if (cleaned.length === 10) return `+91${cleaned}`;
    if (cleaned.length === 12 && cleaned.startsWith('91')) return `+${cleaned}`;
    return `+${cleaned.replace(/^\+/, '')}`;
  }
}
