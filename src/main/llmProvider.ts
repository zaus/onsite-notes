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
  embeddingModel: string;
}

export namespace LLMProviderConfig {
  export function isSame(a: LLMProviderConfig, b: LLMProviderConfig): boolean {
    return (
      a.provider === b.provider &&
      a.baseUrl === b.baseUrl &&
      a.model === b.model &&
      a.embeddingModel === b.embeddingModel
    );
  }

  export function getCacheKey(config: LLMProviderConfig, inputHash: string): string {
    return `${config.provider}|${config.baseUrl}|${config.embeddingModel}|${inputHash}`;
  }
}

export interface LLMSession {
  context: string;
  provider: LLMProvider;
  providerConfig: LLMProviderConfig;
  scope: 'loaded' | 'full';
  loadedFiles: string[];
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

  /**
   * Generate an embedding vector for semantic retrieval.
   * @param input Text to embed
   */
  abstract embed(
    input: string
  ): Promise<number[] | null>;
}