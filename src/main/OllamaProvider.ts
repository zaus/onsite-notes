import { LLMProvider, type LLMMessage } from "./llmProvider";

/**
 * Ollama-compatible provider implementation.
 * Connects to local Ollama instance or other OpenAI-compatible endpoints.
 */

export class OllamaProvider extends LLMProvider {
	private baseUrl: string;
	private model: string;

	constructor(baseUrl: string = 'http://localhost:11434', model: string = 'llama3.2') {
		super();
		this.baseUrl = baseUrl;
		this.model = model;
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
