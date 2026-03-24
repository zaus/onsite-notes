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
  /** Checks if two LLMProviderConfig objects are the same */
  export function isSame(a: LLMProviderConfig, b: LLMProviderConfig): boolean {
    return (
      a.provider === b.provider &&
      a.baseUrl === b.baseUrl &&
      a.model === b.model &&
      a.embeddingModel === b.embeddingModel
    );
  }

  /** Generates a cache key for a given config and input hash */
  export function getCacheKey(config: LLMProviderConfig, inputHash: string): string {
    return `${config.provider}|${config.baseUrl}|${config.embeddingModel}|${inputHash}`;
  }
}

export interface LLMSession {
  /** What's included as context in the current session */
  context: string;
  /** The provider instance powering this session */
  provider: LLMProvider;
  /** The configuration used to create the provider instance; if changed will reload context */
  providerConfig: LLMProviderConfig;
  /** What files are included in the current session */
  scope: 'loaded' | 'full';
  /** Tracks the current context window settings to know when to refresh retrieved documents and/or context. Format: [contextBefore, contextAfter] */
  contextWindow: number[];
  /** The files currently loaded in the session to be used as context */
  loadedFiles: string[];
  /** A history of messages exchanged in the session */
  messages: LLMMessage[];
  /** Documents retrieved for the session */
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