import { LLMProvider } from './llmProvider';
import { OllamaProvider } from './OllamaProvider';


/**
 * LLM provider factory function type.
 */
export type LLMProviderFactory = (config: {
  provider: string;
  baseUrl?: string;
  model?: string;
  embeddingModel?: string;
}) => LLMProvider;

/**
 * Create an LLM provider instance based on configuration.
 * Kept in a separate file to avoid circular imports between
 * llmProvider (base class) and OllamaProvider (subclass).
 */
export function createLLMProvider(config: {
  provider: string;
  baseUrl?: string;
  model?: string;
  embeddingModel?: string;
}): LLMProvider {
  if (config.provider === 'ollama') {
    return new OllamaProvider(config.baseUrl, config.model, config.embeddingModel);
  }
  throw new Error(
    `Unknown LLM provider: ${config.provider}. Supported: ollama`
  );
}
