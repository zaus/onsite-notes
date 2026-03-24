/**
 * LLM Provider abstraction for pluggable local LLM backends.
 * Currently supports Ollama-compatible providers.
 */

import type { RetrievalDocument } from './retrievalService';

export interface LLMMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LLMProviderConfig {
  provider: string;
  baseUrl: string;
  model: string;
}

export interface LLMSession {
  context: string;
  provider: LLMProvider;
  providerConfig: LLMProviderConfig;
  scope: 'loaded' | 'full';
  contextBefore: number;
  contextAfter: number;
  messages: LLMMessage[];
  retrieved: RetrievalDocument[];
}

/**
 * Abstract base class for LLM providers.
 * All providers must implement health checks and streaming chat.
 */
export abstract class LLMProvider {
  /**
   * Check provider health and availability.
   */
  abstract checkHealth(): Promise<{ available: boolean; error?: string }>;

  /**
   * Stream chat response tokens.
   * @param messages Conversation history
   * @param context Optional context/retrieved documents
   * @returns Async generator yielding response tokens
   */
  abstract chat(
    messages: LLMMessage[],
    context?: string
  ): AsyncIterable<string>;
}