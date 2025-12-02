
export interface CodexItem {
  id: string;
  title: string;
  content: string;
  tags: string[]; // Tags that trigger injection
  isGlobal?: boolean; // Always inject if true
}

export interface Character {
  id: string;
  name: string; // For identification in UI
  aliases: string[]; // Triggers for injection
  description: string; // Content sent to LLM
  isGlobal: boolean;
  image: string | null; // Base64 data URL
}

export interface Chapter {
  id: string;
  title: string;
  summary: string;
  content: string;
  order: number;
}

export interface Book {
  id: string;
  title: string;
  coverImage: string | null; // Base64 data URL
  chapters: Chapter[];
  codex: CodexItem[];
  characters: Character[];
  lastModified: number;
  pov: string; // Point of View configuration
  tense: string; // Tense configuration
}

export interface Message {
  role: 'user' | 'model' | 'system';
  content: string;
}

export type LLMProvider = 'google' | 'openrouter' | 'lmstudio' | 'venice';

// Configuration for a specific provider (API keys, caching models)
export interface LLMConfig {
  provider: LLMProvider;
  apiKey: string;
  modelName: string; // Default model fallback
  baseUrl?: string; // For local/openrouter
  availableModels?: string[]; // Cached list of models
  maxTokens?: number;
  temperature?: number;
  responseMimeType?: string;
}

// Configuration for the Brainstorming feature
export interface BrainstormConfig {
  provider: LLMProvider;
  model: string;
  systemRole: string; // The Persona
  instruction: string; // The Task/Template
}

// Configuration for Auto Summary
export interface SummaryConfig {
  provider: LLMProvider;
  model: string;
  systemRole: string;
  instruction: string;
}

export interface SuggestionMode {
  id: string;
  name: string;
  systemRole: string;
  instruction: string;
}

// Configuration for Story Suggestions
export interface SuggestionConfig {
  provider: LLMProvider;
  model: string;
  systemRole: string;
  instruction: string;
  count: number;
  typingSpeed?: number; // ms per word
  activeModeId?: string; // ID of the currently active SuggestionMode
  rephrase: {
      systemRole: string;
      instruction: string;
  };
  expand: {
      systemRole: string;
      instruction: string;
  };
}

export type BrainstormContextType = 'none' | 'current_chapter' | 'all_summaries' | 'selected_summaries';

export interface PromptKind {
  id: string;
  name: string;
  description?: string;
  systemRole: string;
  instruction: string;
  provider: LLMProvider;
  model: string; 
  maxTokens?: number;
  temperature?: number;
}

export type ProviderConfigs = Record<LLMProvider, LLMConfig>;

export interface AppState {
  view: 'library' | 'editor';
  activeBookId: string | null;
  activeChapterId: string | null;
  books: Book[];
  
  // Active settings for Brainstorming
  brainstormConfig: BrainstormConfig; 
  
  // Active settings for Summaries
  summaryConfig: SummaryConfig;

  // Active settings for Suggestions
  suggestionConfig: SuggestionConfig;
  
  // Available Suggestion Modes
  suggestionModes: SuggestionMode[];

  // Global repository of settings per provider
  providerConfigs: ProviderConfigs;

  promptKinds: PromptKind[];
  
  // History of user prompts
  promptHistory: string[];
}
