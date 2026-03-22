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

/**
 * Ollama-compatible provider implementation.
 * Connects to local Ollama instance or other OpenAI-compatible endpoints.
 */
export class OllamaProvider extends LLMProvider {
  private baseUrl: string;
  private model: string;

  constructor(baseUrl: string = 'http://localhost:11434', model: string = 'llama2') {
    super();
    this.baseUrl = baseUrl;
    this.model = model;
  }

  async checkHealth(): Promise<{ available: boolean; error?: string }> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      try {
        const response = await fetch(`${this.baseUrl}/api/tags`, {
          method: 'GET',
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.status === 200) {
          return { available: true };
        }
        return {
          available: false,
          error: `Ollama returned status ${response.status}`,
        };
      } catch (err) {
        clearTimeout(timeoutId);
        throw err;
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        available: false,
        error: `Cannot connect to Ollama at ${this.baseUrl}: ${errorMsg}. Make sure Ollama is running.`,
      };
    }
  }

  async *chat(
    messages: LLMMessage[],
    context?: string
  ): AsyncIterable<string> {
    try {
      // Build system prompt with context
      const systemContent = context
        ? `You are a helpful assistant analyzing notebook entries. Consider the following retrieved context:\n\n${context}\n\nBased on this context, answer the user's question concisely.`
        : 'You are a helpful assistant analyzing notebook entries. Keep responses concise and relevant.';

      const messagesPayload = [
        { role: 'system' as const, content: systemContent },
        ...messages,
      ];

      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages: messagesPayload,
          stream: true,
        }),
      });

      if (!response.ok) {
        throw new Error(
          `Ollama returned ${response.status}: ${response.statusText}`
        );
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');

          // Keep last incomplete line in buffer
          buffer = lines[lines.length - 1] || '';

          // Process complete lines
          for (let lineIdx = 0; lineIdx < lines.length - 1; lineIdx++) {
            const line = lines[lineIdx]?.trim();
            if (!line) continue;

            try {
              const data = JSON.parse(line);
              if (data.message?.content) {
                yield data.message.content;
              }
            } catch {
              // Skip malformed JSON lines
            }
          }
        }

        // Flush remaining buffer
        if (buffer.trim()) {
          try {
            const data = JSON.parse(buffer);
            if (data.message?.content) {
              yield data.message.content;
            }
          } catch {
            // Ignore
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      throw new Error(`LLM chat failed: ${errorMsg}`);
    }
  }
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
