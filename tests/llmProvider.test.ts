import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OllamaProvider } from '../src/main/OllamaProvider';
import { createLLMProvider } from '../src/main/llmProviderFactory';
import { LLMProviderConfig } from '../src/main/llmProvider';

// Mock fetch for testing
global.fetch = vi.fn();

describe('OllamaProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('checkHealth', () => {
    it('should return available=false when no models', async () => {
      const mockResponse = {
        status: 200,
        json: async () => ({ models: [] }),
      };
      (global.fetch as any).mockResolvedValueOnce(mockResponse);

      const provider = new OllamaProvider('http://localhost:11434', 'llama2');
      const health = await provider.checkHealth();

      expect(health.available).toBe(false);
      expect(health.error).toContain('no models are installed');
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/tags',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should return available=true when Ollama responds with 200', async () => {
      const mockResponse = {
        status: 200,
        json: async () => ({ models: [{ name: 'llama2' }, { name: 'mistral:latest' }] }),
      };
      (global.fetch as any).mockResolvedValueOnce(mockResponse);

      const provider = new OllamaProvider('http://localhost:11434', 'llama2');
      const health = await provider.checkHealth();

      expect(health.available).toBe(true);
      expect(health.error).toBeUndefined();
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/tags',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should return available=false when connection fails', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Connection refused'));

      const provider = new OllamaProvider('http://localhost:11434', 'llama2');
      const health = await provider.checkHealth();

      expect(health.available).toBe(false);
      expect(health.error).toContain('Connection refused');
    });

    it('should return available=false on non-200 response', async () => {
      const mockResponse = {
        status: 500,
        statusText: 'Internal Server Error',
      };
      (global.fetch as any).mockResolvedValueOnce(mockResponse);

      const provider = new OllamaProvider('http://localhost:11434', 'llama2');
      const health = await provider.checkHealth();

      expect(health.available).toBe(false);
      expect(health.error).toContain('500');
    });
  });

  describe('chat', () => {
    it('should stream tokens from chat response', async () => {
      const messageChunk = {
        message: { content: 'Hello ' },
        done: false,
      };

      const mockResponse = {
        ok: true,
        body: {
          getReader: () => ({
            read: vi.fn()
              .mockResolvedValueOnce({ value: new TextEncoder().encode(JSON.stringify(messageChunk) + '\n'), done: false })
              .mockResolvedValueOnce({ value: new TextEncoder().encode(JSON.stringify({ message: { content: 'world' }, done: true }) + '\n'), done: false })
              .mockResolvedValueOnce({ done: true }),
            releaseLock: vi.fn(),
          }),
        },
      };

      (global.fetch as any).mockResolvedValueOnce(mockResponse);

      const provider = new OllamaProvider('http://localhost:11434', 'llama2');
      const messages = [{ role: 'user' as const, content: 'Hello' }];

      let result = '';
      for await (const token of provider.chat(messages)) {
        result += token;
      }

      expect(result).toContain('Hello');
      expect(result).toContain('world');
    });

    it('should throw on connection error', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      const provider = new OllamaProvider('http://localhost:11434', 'llama2');
      const messages = [{ role: 'user' as const, content: 'Hello' }];

      let errorThrown = false;
      try {
        for await (const _token of provider.chat(messages)) {
          // consume stream
        }
      } catch (err) {
        errorThrown = true;
        expect((err as Error).message).toContain('LLM chat failed');
      }

      expect(errorThrown).toBe(true);
    });
  });
});

describe('createLLMProvider', () => {
  it('should create OllamaProvider when provider=ollama', () => {
    const provider = createLLMProvider({
      provider: 'ollama',
      baseUrl: 'http://localhost:11434',
      model: 'llama2',
    });

    expect(provider).toBeInstanceOf(OllamaProvider);
  });

  it('should throw for unknown provider', () => {
    expect(() => {
      createLLMProvider({
        provider: 'unknown',
      });
    }).toThrow('Unknown LLM provider');
  });

  it('should use default baseUrl and model when not provided', () => {
    const provider = createLLMProvider({
      provider: 'ollama',
    });

    expect(provider).toBeInstanceOf(OllamaProvider);
  });
});

describe('LLMProviderConfig helpers', () => {
  it('isSame returns true for equal configs', () => {
    const left: LLMProviderConfig = {
      provider: 'ollama',
      baseUrl: 'http://localhost:11434',
      model: 'llama3.2',
      embeddingModel: 'nomic-embed-text',
    };

    const right: LLMProviderConfig = {
      provider: 'ollama',
      baseUrl: 'http://localhost:11434',
      model: 'llama3.2',
      embeddingModel: 'nomic-embed-text',
    };

    expect(LLMProviderConfig.isSame(left, right)).toBe(true);
  });

  it('isSame returns false when any key differs', () => {
    const left: LLMProviderConfig = {
      provider: 'ollama',
      baseUrl: 'http://localhost:11434',
      model: 'llama3.2',
      embeddingModel: 'nomic-embed-text',
    };

    const right: LLMProviderConfig = {
      provider: 'ollama',
      baseUrl: 'http://localhost:11434',
      model: 'llama3.3',
      embeddingModel: 'nomic-embed-text',
    };

    expect(LLMProviderConfig.isSame(left, right)).toBe(false);
  });

  it('getCacheKey includes provider, baseUrl, embedding model and input hash', () => {
    const config: LLMProviderConfig = {
      provider: 'ollama',
      baseUrl: 'http://localhost:11434',
      model: 'llama3.2',
      embeddingModel: 'nomic-embed-text',
    };

    const key = LLMProviderConfig.getCacheKey(config, 'abc123');
    expect(key).toBe('ollama|http://localhost:11434|nomic-embed-text|abc123');
  });
});
