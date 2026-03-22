/**
 * LLM Provider abstraction for pluggable local LLM backends.
 * Currently supports Ollama-compatible providers.
 */

import { OllamaProvider } from "./OllamaProvider";

export interface LLMMessage {
  role: 'user' | 'assistant';
  content: string;
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

/**
 * LLM provider factory function type.
 */
export type LLMProviderFactory = (config: {
  provider: string;
  baseUrl?: string;
  model?: string;
}) => LLMProvider;

/**
 * Create LLM provider based on configuration.
 */
export function createLLMProvider(config: {
  provider: string;
  baseUrl?: string;
  model?: string;
}): LLMProvider {
  if (config.provider === 'ollama') {
    return new OllamaProvider(config.baseUrl, config.model);
  }
  throw new Error(
    `Unknown LLM provider: ${config.provider}. Supported: ollama`
  );
}
