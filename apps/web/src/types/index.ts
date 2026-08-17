export interface User {
  id: string;
  username: string;
  email?: string;
  role: 'PENDING' | 'USER' | 'ADMIN';
  status: 'ACTIVE' | 'DISABLED' | 'BANNED';
  created_at?: string;
  updated_at?: string;
}

export interface Model {
  id: string;
  model_id: string;
  real_model_id: string;
  display_name: string;
  channel_id: string;
  channel_name?: string;
  capabilities_json: string; // JSON array of: text, vision, web_search, image, reasoning
  is_visible_in_chat: number;
  enable_search_fallback: number;
  enable_followup: number;
  followup_model_id: string;
  is_active: number;
  order_index: number;
}

export interface Channel {
  id: string;
  name: string;
  base_url: string;
  api_key: string;
  type: string;
  priority: number;
  status: number;
  config_json: string;
  created_at: string;
}

export interface Conversation {
  id: string;
  user_id: string;
  title: string;
  model_ids_json: string;
  is_pinned: number;
  created_at: string;
  updated_at: string;
}

export interface MessageAttachment {
  id?: string;
  name: string;
  url?: string;
  text?: string;
  type: string;
  size?: number;
  isImage?: boolean;
}

export interface Message {
  id: string;
  conversation_id: string;
  user_id?: string;
  parent_id?: string;
  role: 'user' | 'assistant' | 'system';
  model_id?: string;
  content: string;
  reasoning_content?: string;
  search_results_json?: string;
  followup_suggestions_json?: string;
  image_params_json?: string;
  attachments_json?: string;
  token_count?: number;
  created_at: string;
  // UI states
  isStreaming?: boolean;
}

export interface AuditLog {
  id: string;
  user_id: string;
  username: string;
  model_id: string;
  channel_id: string;
  channel_name?: string;
  prompt_tokens: number;
  completion_tokens: number;
  duration_ms: number;
  status_code: number;
  error_message: string;
  ip: string;
  created_at: string;
}

export interface MediaUpload {
  id: string;
  user_id: string;
  username?: string;
  file_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  extracted_text?: string;
  is_generated_image: number;
  created_at: string;
}

export interface SystemStats {
  total_tokens_today: number;
  total_requests_today: number;
  active_channels: number;
  pending_users: number;
  total_users: number;
}

export interface AnalyticsData {
  timeRange: string;
  summary: {
    total_requests: number;
    success_requests: number;
    success_rate: string;
    total_tokens: number;
    total_prompt_tokens: number;
    total_completion_tokens: number;
    avg_duration_ms: number;
    active_users: number;
    total_images: number;
  };
  dailyTrends: Array<{
    date: string;
    requests: number;
    success_count: number;
    tokens: number;
    avg_duration: number;
  }>;
  topModels: Array<{
    model_id: string;
    call_count: number;
    total_tokens: number;
    avg_duration: number;
    success_count: number;
  }>;
  channelDistribution: Array<{
    channel_id: string;
    channel_name: string;
    call_count: number;
    success_count: number;
    error_count: number;
    avg_duration: number;
  }>;
  topUsers: Array<{
    username: string;
    request_count: number;
    total_tokens: number;
    last_active_at: string;
  }>;
  statusDistribution: Array<{
    status_code: number;
    count: number;
  }>;
}
