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
  options?: {
    [key: string]: any; // Allows for any number of properties with any value type
  };
};

export interface Model {
  name: string;
  options: {
    [key: string]: any; // Allows the `options` object to have any string keys with any value types
  };
}

export interface Provider {
  name: string;
  apiKey: string;
  apiUrl: string;
  models: Model[];
}

export interface ProviderSettings {
  model: string;
  apiUrl: string;
  apiKey: string;
  options: {
    [key: string]: any; // This allows options to have any number of properties with any types
  };
}

export interface Prompt {
  name: string;
  prompt: string;
}

export interface MCPServerConfig {
  command: string;
  args: string[];
  env?: { [key: string]: string };
}

export type MCPServersConfig = {
  [serverName: string]: MCPServerConfig;
};

export interface SystemMessage extends ChatCompletionSystemMessageParam {
  selected?: boolean;  // Additional property specific to Message
}

export interface UserMessage extends ChatCompletionUserMessageParam {
  selected?: boolean;  // Additional property specific to Message
}

export interface AssistantMessage extends ChatCompletionAssistantMessageParam {
  selected?: boolean;  // Additional property specific to Message
}

export type Message =
  | SystemMessage
  | UserMessage
  | AssistantMessage

export const BASE_URL = 'https://api.openai.com/v1';
