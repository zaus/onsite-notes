import * as fs from 'fs';
import * as path from 'path';

export type AppSettings = {
  priorDays?: number;
  loadMoreChunkDays?: number;
};

export class AppSettingsStore {
  private settings: AppSettings = {};

  constructor(private userDataDir: string) {
    this.settings = this.load();
  }

  getSettingsPath(): string {
    return path.join(this.userDataDir, 'settings.json');
  }

  load(): AppSettings {
    const settingsPath = this.getSettingsPath();
    if (!fs.existsSync(settingsPath)) {
      return {};
    }

    try {
      const raw = fs.readFileSync(settingsPath, 'utf-8');
      const parsed = JSON.parse(raw) as AppSettings;
      this.settings = parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      this.settings = {};
    }

    return this.settings;
  }

  save(): void {
    const settingsPath = this.getSettingsPath();
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify(this.settings, null, 2), 'utf-8');
  }

  setPriorDays(days: number): number {
    const parsed = this.toPositiveInt(days);
    if (parsed === null) {
      throw new Error('priorDays must be a positive integer');
    }

    this.settings = {
      ...this.settings,
      priorDays: parsed
    };
    this.save();
    return parsed;
  }

  setLoadMoreChunkDays(days: number): number {
    const parsed = this.toPositiveInt(days);
    if (parsed === null) {
      throw new Error('loadMoreChunkDays must be a positive integer');
    }

    this.settings = {
      ...this.settings,
      loadMoreChunkDays: parsed
    };
    this.save();
    return parsed;
  }

  resolvePriorDays(fallback: number): number {
    const envPriorDays = this.toPositiveInt(process.env.ONSITE_PRIOR_DAYS);
    if (envPriorDays !== null) {
      return envPriorDays;
    }

    const stored = this.toPositiveInt(this.settings.priorDays);
    return stored ?? fallback;
  }

  resolveLoadMoreChunkDays(priorDays: number): number {
    const envLoadMoreChunk = this.toPositiveInt(process.env.ONSITE_LOAD_MORE_CHUNK_DAYS);
    if (envLoadMoreChunk !== null) {
      return envLoadMoreChunk;
    }

    const stored = this.toPositiveInt(this.settings.loadMoreChunkDays);
    return stored ?? priorDays;
  }

  private toPositiveInt(value: unknown): number | null {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.floor(parsed);
    }
    return null;
  }
}
