import * as fs from 'fs';
import * as path from 'path';
import { toPositiveInt } from './utilities';

export type AppSettings = {
  priorDays?: number;
  loadMoreDays?: number;
  llmProvider?: string;
  llmBaseUrl?: string;
  llmModel?: string;
  llmSearchScope?: 'loaded' | 'full';
  llmContextBefore?: number;
  llmContextAfter?: number;
  llmEmbeddingModel?: string;
};

export type AppSettingKey = keyof AppSettings;
type AppSettingValue<K extends AppSettingKey> = NonNullable<AppSettings[K]>;

export class AppSettingsStore {
  private settings: AppSettings = {};
  private readonly settingsPath: string;

  constructor(userDataDir: string) {
    this.settingsPath = path.join(userDataDir, 'settings.json');
    this.settings = this.load();
  }

  load(): AppSettings {
    if (!fs.existsSync(this.settingsPath)) {
      return {};
    }

    try {
      const raw = fs.readFileSync(this.settingsPath, 'utf-8');
      const parsed = JSON.parse(raw) as AppSettings;
      this.settings = parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      this.settings = {};
    }

    return this.settings;
  }

  save(): void {
    fs.mkdirSync(path.dirname(this.settingsPath), { recursive: true });
    fs.writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2), 'utf-8');
  }

  setPriorDays(days: number): number {
    return this.setAppSetting('priorDays', days);
  }

  setLoadMoreDays(days: number): number {
    return this.setAppSetting('loadMoreDays', days);
  }

  getPriorDays(fallback = 3): number {
    return this.resolveIntSetting(process.env.ONSITE_PRIOR_DAYS, this.settings.priorDays, fallback);
  }

  getLoadMoreDays(fallback: number): number {
    return this.resolveIntSetting(process.env.ONSITE_LOAD_MORE_CHUNK_DAYS, this.settings.loadMoreDays, fallback);
  }

  getLLMProvider(): string {
    return this.settings.llmProvider || 'ollama';
  }

  getLLMBaseUrl(): string {
    return this.settings.llmBaseUrl || 'http://localhost:11434';
  }

  getLLMModel(): string {
    return this.settings.llmModel || 'llama3.2';
  }

  getLLMSearchScope(): 'loaded' | 'full' {
    return this.settings.llmSearchScope || 'loaded';
  }

  getLLMEmbeddingModel(): string {
    return this.settings.llmEmbeddingModel || 'nomic-embed-text';
  }

  getLLMContextBefore(fallback = 150): number {
    return this.resolveIntSetting(process.env.ONSITE_LLM_CONTEXT_BEFORE, this.settings.llmContextBefore, fallback);
  }

  getLLMContextAfter(fallback = 300): number {
    return this.resolveIntSetting(process.env.ONSITE_LLM_CONTEXT_AFTER, this.settings.llmContextAfter, fallback);
  }

  setLLMProvider(provider: string): void {
    this.setAppSetting('llmProvider', provider);
  }

  setLLMBaseUrl(url: string): void {
    this.setAppSetting('llmBaseUrl', url);
  }

  setLLMModel(model: string): void {
    this.setAppSetting('llmModel', model);
  }

  setLLMSearchScope(scope: 'loaded' | 'full'): void {
    this.setAppSetting('llmSearchScope', scope);
  }

  setLLMEmbeddingModel(model: string): void {
    this.setAppSetting('llmEmbeddingModel', model);
  }

  setLLMContextBefore(chars: number): void {
    this.setAppSetting('llmContextBefore', chars);
  }

  setLLMContextAfter(chars: number): void {
    this.setAppSetting('llmContextAfter', chars);
  }

  setAppSetting<K extends AppSettingKey>(key: K, value: AppSettingValue<K>): AppSettingValue<K> {
    const parsed = this.parseSettingValue(key, value);
    this.settings = { ...this.settings, [key]: parsed };
    this.save();
    return parsed;
  }

  private parseSettingValue<K extends AppSettingKey>(key: K, value: AppSettingValue<K>): AppSettingValue<K> {
    if (key === 'priorDays' || key === 'loadMoreDays' || key === 'llmContextBefore' || key === 'llmContextAfter') {
      const parsed = toPositiveInt(value);
      if (parsed === null) {
        throw new Error(`${key} must be a positive integer`);
      }
      return parsed as AppSettingValue<K>;
    }

    if (key === 'llmSearchScope') {
      if (value !== 'loaded' && value !== 'full') {
        throw new Error('llmSearchScope must be either loaded or full');
      }
      return value;
    }

    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error(`${key} must be a non-empty string`);
    }

    return value.trim() as AppSettingValue<K>;
  }

  private resolveIntSetting(envValue: string | undefined, stored: number | undefined, fallback: number): number {
    return toPositiveInt(envValue) ?? toPositiveInt(stored) ?? fallback;
  }
}
