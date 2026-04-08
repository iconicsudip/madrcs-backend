export enum RcsFunctionName {
  DIAL = 'dial',
  MEDIA = 'media',
  OPEN_URL = 'open_url',
  RICH_CARD = 'rich_card',
  SHARE_LOCATION = 'share_location',
  SUGGESTED_REPLIES = 'suggested_replies',
  VIEW_LOCATION = 'view_location',
  CALENDAR_EVENT = 'calendar_event',
  CAROUSEL = 'carousel',
  CUSTOMER_NUMBER_VARIABLES = 'customer_number_variables',
  TEXT_MESSAGE = 'text_message'
}

export enum RcsActionType {
  DIAL = 'dial',
  VIEW_LOCATION = 'view_location',
  CALENDAR_EVENT = 'calendar_event',
  OPEN_URL = 'open_url',
  SHARE_LOCATION = 'share_location'
}

export enum RcsEventType {
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  READ = 'READ',
  CLICKED = 'CLICKED',
  FAILED = 'FAILED',
  EXPIRED = 'EXPIRED'
}

export enum CampaignStatus {
  LIVE = 'LIVE',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
  PARTIALLY_COMPLETED = 'PARTIALLY_COMPLETED',
  SCHEDULED = 'SCHEDULED',
  DRAFT = 'DRAFT'
}
