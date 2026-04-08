export interface RcsProviderConfig {
  apiKey: string;
  projectId?: string;
  [key: string]: any;
}

import { RcsActionType, RcsFunctionName } from '../../enums/rcs.enum';

export interface RcsAction {
  type: RcsActionType | string;
  text_to_show: string;
  dial_number?: string;
  location_query?: string;
  start_time?: string;
  end_time?: string;
  title?: string;
  description?: string;
  url?: string;
  [key: string]: any;
}

export interface SendMessagePayload {
  to: string | string[];
  function_name: RcsFunctionName | string;
  text?: string;
  text_to_show?: string;
  media_url?: string;
  dial_number?: string;
  url?: string;
  title?: string;
  description?: string;
  start_time?: string;
  end_time?: string;
  location_query?: string;
  replies_list?: string[];
  actions?: RcsAction[];
  ttl?: string | number;
  namespace?: string;
  name?: string;
  customer_number_variables?: any[];
  image_urls?: string[];
  titles?: string[];
  descriptions?: string[];
  replies_list_of_list?: string[][];
  actions_list_of_list?: RcsAction[][];
  [key: string]: any;
}

export interface SendCampaignPayload {
  name: string;
  contacts: string[];
  templateId: string;
  variables?: Record<string, string>;
  [key: string]: any;
}

export interface RcsLogParams {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  limit?: number;
  fields?: string;
  requestId?: string;
}

export interface CreateTemplatePayload {
  template_name: string;
  function_name: RcsFunctionName | string;
  ttl?: string | number;
  language?: string;
  click_count?: boolean;
  content: {
    text?: string;
    text_to_show?: string;
    media_url?: string;
    dial_number?: string;
    location_query?: string;
    start_time?: string;
    end_time?: string;
    title?: string;
    description?: string;
    url?: string;
    replies_list?: string[];
    actions?: RcsAction[];
    image_urls?: string[];
    video_urls?: string[];
    titles?: string[];
    descriptions?: string[];
    replies_list_of_list?: string[][];
    actions_list_of_list?: any[][]; // or RcsAction[][] but sticking to any for flexibility with complex nested arrays
    [key: string]: any;
  };
  [key: string]: any;
}

export interface IRcsService {
  sendMessage(payload: SendMessagePayload, config: RcsProviderConfig): Promise<any>;
  getTemplates(config: RcsProviderConfig, status?: string): Promise<any>;
  createTemplate(payload: CreateTemplatePayload, config: RcsProviderConfig): Promise<any>;
  getLogs(config: RcsProviderConfig, params: RcsLogParams): Promise<any>;
}
