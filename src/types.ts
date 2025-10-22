import { ChatCompletionAssistantMessageParam, ChatCompletionContentPart, ChatCompletionContentPartImage, ChatCompletionContentPartText, ChatCompletionSystemMessageParam, ChatCompletionUserMessageParam } from 'openai/resources/chat/completions';

export type AuthInfo = { apiKey?: string, apiUrl?: string };

export type Settings = {
  selectedInsideCodeblock?: boolean;
  codeblockWithLanguageId?: false;
  pasteOnClick?: boolean;
  keepConversation?: boolean;
  timeoutLength?: number;
  model?: string;
  apiUrl?: string;
  apiType?: 'chatCompletions' | 'responses';  
  options?: {
    [key: string]: any; // Allows for any number of properties with any value type
  };
};

export interface Model {
  name: string;            // Display in UI
  model_name: string;      // For API calls
  api?: 'chatCompletions' | 'responses'; // Which API to use
  tools?: any[];           // Optional tools for Responses API (provider-specific)  
  options: {
    [key: string]: any;
  };
}

export interface Provider {
  name: string;
  apiKey: string;
  apiUrl: string;                 // Fallback / legacy single URL
  chatCompletionsUrl?: string;    // Optional override for chat completions
  responsesUrl?: string;          // Optional URL for Responses API
  models: Model[];
}

export interface ProviderSettings {
  model: string;
  apiUrl: string;
  apiKey: string;
  apiType?: 'chatCompletions' | 'responses';  
  options: {
    [key: string]: any; // This allows options to have any number of properties with any types
  };
}

export interface Prompt {
  name: string;
  prompt: string;
}

export interface SystemMessage extends ChatCompletionSystemMessageParam {
  selected?: boolean;  // Additional property specific to Message
  collapsed?: boolean; // UI-only: whether to render collapsed by default
}

export interface UserMessage extends ChatCompletionUserMessageParam {
  selected?: boolean;  // Additional property specific to Message
  collapsed?: boolean; // UI-only: whether to render collapsed by default
}

export interface AssistantMessage extends ChatCompletionAssistantMessageParam {
  selected?: boolean;  // Additional property specific to Message
  collapsed?: boolean; // UI-only: whether to render collapsed by default
}

export type Message =
  | SystemMessage
  | UserMessage
  | AssistantMessage

export const BASE_URL = 'https://api.openai.com/v1';