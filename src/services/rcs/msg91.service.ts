import axios from 'axios';
import { IRcsService, RcsProviderConfig, SendCampaignPayload, SendMessagePayload, RcsLogParams, CreateTemplatePayload } from './rcs.interface';

export class Msg91RcsService implements IRcsService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = process.env.MSG91_BASE_URL || 'https://control.msg91.com/api/v5/rcs';
  }

  async sendMessage(payload: SendMessagePayload, config: RcsProviderConfig): Promise<any> {
    console.log('[MSG91 Service] Preparing to send message via function:', payload.function_name);

    if (!config.apiKey || !config.projectId) {
      throw new Error("Msg91 Provider: API Key and Project ID are required in config.");
    }
    // Determine the exact endpoint. The bulk endpoint is generally used for most MSG91 RCS requests
    const endpoint = `${this.baseUrl}/send-rcs-message/bulk/`;

    // Map to the EXACT JSON format required for MSG91 campaign/bulk sending 
    // Format: {"name": "...", "namespace": "...", "project_id": "...", "function_name": "...", "customer_number_variables": [{"customer_number": [...], "variables": {}}]}
    const { to, function_name, name, namespace, ...other } = payload;
    
    // Format 'to' numbers to remove the '+' sign as required by MSG91 API
    const recipientList = (Array.isArray(to) ? to : [to]).map(num => num.replace(/^\+/, ''));
    
    const msg91Payload: any = {
      name: name || function_name, 
      namespace: namespace || 'default',
      project_id: config.projectId,
      function_name: function_name || 'template',
      first_row_header: 0,
      customer_number_variables: [
        {
          customer_number: recipientList,
          variables: {} // Default empty variables for now
        }
      ],
      ...other
    };

    try {
      const response = await axios.post(endpoint, msg91Payload, {
        headers: {
          'authkey': config.apiKey,
          'Content-Type': 'application/json',
          'accept': 'application/json'
        }
      });
      
      return { success: true, provider: 'msg91', result: response.data };
    } catch (error: any) {
      console.error('[MSG91 Send Error]:', error?.response?.data || error.message);
      return { success: false, provider: 'msg91', error: error?.response?.data || error.message };
    }
  }

  async getTemplates(config: RcsProviderConfig, status?: string): Promise<any> {
    console.log('[MSG91 Service] Fetching templates with status:', status || 'all');

    if (!config.apiKey || !config.projectId) {
      throw new Error("Msg91 Provider: API Key and Project ID are required in config.");
    }

    let endpoint = `${this.baseUrl}/rcs-client-panel/template/?project_id=${config.projectId}`;
    if (status) {
      endpoint += `&status=${status}`;
    }

    try {
      const response = await axios.get(endpoint, {
        headers: {
          'authkey': config.apiKey,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
      
      const msg91Data = response.data;
      
      // Standardize the response based on the provided JSON structure
      // The templates are located at result.data.template_data
      if (msg91Data?.status === 'success' && msg91Data?.data?.template_data) {
        const mappedTemplates = msg91Data.data.template_data.map((tpl: any) => ({
          id: tpl.id,
          name: tpl.name,
          namespace: tpl.namespace,
          status: tpl.status,
          function_name: tpl.function_name,
          content: tpl.content,
          project_id: tpl.project_id,
          created_at: tpl.created_at,
          vendor: tpl.vendor
        }));

        return { 
          success: true, 
          provider: 'msg91', 
          templates: mappedTemplates,
          count: msg91Data.data.template_count,
          total: msg91Data.data.total_template_count
        };
      }
      
      return { success: true, provider: 'msg91', templates: [], count: 0 };
    } catch (error: any) {
      console.error('[MSG91 Fetch Template Error]:', error?.response?.data || error.message);
      return { success: false, provider: 'msg91', error: error?.response?.data || error.message };
    }
  }

  async createTemplate(payload: CreateTemplatePayload, config: RcsProviderConfig): Promise<any> {
    console.log('[MSG91 Service] Creating new template:', payload.template_name);

    if (!config.apiKey || !config.projectId) {
      throw new Error("Msg91 Provider: API Key and Project ID are required in config.");
    }

    const endpoint = `${this.baseUrl}/rcs-client-panel/template/`;

    // Map our generic payload to MSG91 specific format
    const { function_name, content, ...rest } = payload;
    let msg91FunctionName = function_name;
    
    // Map 'text_with_actions' back to 'suggested_replies' for MSG91
    if (function_name === 'text_with_actions') {
      msg91FunctionName = 'suggested_replies';
    }

    const msg91Payload: any = {
      project_id: config.projectId,
      function_name: msg91FunctionName,
      template_name: rest.template_name || rest.name,
      content: content 
    };

    try {
      const response = await axios.post(endpoint, msg91Payload, {
        headers: {
          'authkey': config.apiKey,
          'Content-Type': 'application/json'
        }
      });
      
      return { success: true, provider: 'msg91', result: response.data };
    } catch (error: any) {
      console.error('[MSG91 Create Template Error]:', error?.response?.data || error.message);
      return { success: false, provider: 'msg91', error: error?.response?.data || error.message };
    }
  }

  async getLogs(config: RcsProviderConfig, params: RcsLogParams): Promise<any> {
    console.log(`[MSG91 Service] Fetching RCS logs for date range: ${params.startDate} to ${params.endDate}`);

    if (!config.apiKey) {
      throw new Error("Msg91 Provider: API Key is required in config to fetch logs.");
    }

    // MSG91 logs endpoint requires the base domain without /rcs at the end
    // E.g., https://control.msg91.com/api/v5/report/logs/rcs
    const reportBase = this.baseUrl.replace(/\/rcs\/?$/, '') + '/report/logs/rcs';

    // Construct exactly as the screenshot API defines
    const queryParams = new URLSearchParams({
      startDate: params.startDate,
      endDate: params.endDate
    });
    
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.fields) queryParams.append('fields', params.fields);
    if (params.requestId) queryParams.append('requestId', params.requestId);

    const endpoint = `${reportBase}?${queryParams.toString()}`;

    try {
      // MSG91 requests this via POST with headers accepting JSON and containing the authkey
      const response = await axios.post(endpoint, {}, {
        headers: {
          'authkey': config.apiKey,
          'accept': 'application/json'
        }
      });
      
      return { success: true, provider: 'msg91', result: response.data };
    } catch (error: any) {
      console.error('[MSG91 Fetch Logs Error]:', error?.response?.data || error.message);
      return { success: false, provider: 'msg91', error: error?.response?.data || error.message };
    }
  }
}
