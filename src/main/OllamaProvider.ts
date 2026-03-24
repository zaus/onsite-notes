import { LLMProvider, type LLMMessage } from "./llmProvider";

/**
 * Ollama-compatible provider implementation.
 * Connects to local Ollama instance or other OpenAI-compatible endpoints.
 */

export class OllamaProvider extends LLMProvider {
	private baseUrl: string;
	private model: string;
	private embeddingModel: string;

	constructor(baseUrl: string = 'http://localhost:11434', model: string = 'llama3.2', embeddingModel: string = 'nomic-embed-text') {
		super();
		this.baseUrl = baseUrl;
		this.model = model;
		this.embeddingModel = embeddingModel;
	}

	async checkHealth(): Promise<{ available: boolean; error?: string; }> {
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
					const data = await response.json() as { models?: Array<{ name: string }> };
					const models = data?.models ?? [];
					if (models.length === 0) {
						return {
							available: false,
							error: `Ollama is running but no models are installed. Run: 'ollama pull ${this.model}'`,
						};
					}
					const installed = models.some(m => m.name === this.model || m.name.startsWith(this.model + ':'));
					if (!installed) {
						const names = models.map(m => m.name).join(', ');
						return {
							available: false,
							error: `Model "${this.model}" not installed. Installed: ${names}. Run: 'ollama pull ${this.model}'`,
						};
					}
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
			const systemContent = 'You are a helpful assistant answering questions about local notebook entries.  Keep responses concise and relevant.' + (context
				? `Only use retrieved context, not general knowledge, to answer questions:\n\n${context}`
				: 'No additional context provided; answer based on your general knowledge.');

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
				const errorText = await response.text();
				
				// check for common failures and provide more helpful error messages

				if (response.status === 404 && errorText.includes('model')) {
					const tagsResponse = await fetch(`${this.baseUrl}/api/tags`);
					if (tagsResponse.ok) {
						const tagsData = await tagsResponse.json() as { models?: Array<{ name: string }> };
						const availableModels = tagsData?.models?.map(m => m.name).join(', ') || 'none';
						throw new Error(
							`Ollama returned ${response.status}: Model "${this.model}" not found. Available models: ${availableModels}`
						);
					}
				}
				
				throw new Error(
					`Ollama returned ${response.status}: ${response.statusText}. ${errorText}`
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

	async embed(input: string): Promise<number[] | null> {
		const model = this.embeddingModel;

		const tryEmbedEndpoint = async (): Promise<number[] | null> => {
			const response = await fetch(`${this.baseUrl}/api/embed`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ model, input })
			});

			if (!response.ok) {
				return null;
			}

			const data = await response.json() as { embeddings?: number[][]; embedding?: number[] };
			if (Array.isArray(data.embedding)) {
				return data.embedding;
			}

			if (Array.isArray(data.embeddings) && Array.isArray(data.embeddings[0])) {
				return data.embeddings[0] || null;
			}

			return null;
		};

		const tryEmbeddingsEndpoint = async (): Promise<number[] | null> => {
			const response = await fetch(`${this.baseUrl}/api/embeddings`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ model, prompt: input })
			});

			if (!response.ok) {
				return null;
			}

			const data = await response.json() as { embedding?: number[] };
			return Array.isArray(data.embedding) ? data.embedding : null;
		};

		try {
			return await tryEmbedEndpoint() ?? await tryEmbeddingsEndpoint();
		} catch {
			return null;
		}
	}
}
