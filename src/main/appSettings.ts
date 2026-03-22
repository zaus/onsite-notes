import * as fs from 'fs';
import * as path from 'path';
import { toPositiveInt } from './utilities';

export type AppSettings = {
  priorDays?: number;
  loadMoreDays?: number;
};

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
    return this.setSetting('priorDays', days);
  }

  setLoadMoreDays(days: number): number {
    return this.setSetting('loadMoreDays', days);
  }

  resolvePriorDays(fallback: number): number {
    return this.resolveSetting(process.env.ONSITE_PRIOR_DAYS, this.settings.priorDays, fallback);
  }

  resolveLoadMoreDays(fallback: number): number {
    return this.resolveSetting(process.env.ONSITE_LOAD_MORE_CHUNK_DAYS, this.settings.loadMoreDays, fallback);
  }

  private setSetting<K extends keyof AppSettings>(key: K, value: number): number {
    const parsed = toPositiveInt(value);
    if (parsed === null) {
      throw new Error(`${key} must be a positive integer`);
    }

    this.settings = { ...this.settings, [key]: parsed };
    this.save();
    return parsed;
  }

  private resolveSetting(envValue: string | undefined, stored: number | undefined, fallback: number): number {
    return toPositiveInt(envValue) ?? toPositiveInt(stored) ?? fallback;
  }
}
