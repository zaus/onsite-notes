/**
 * LLM Provider abstraction for pluggable local LLM backends.
 * Currently supports Ollama-compatible providers.
 */

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