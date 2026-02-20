import { parseEntries, LogEntry } from './parser';

interface IdStats {
  id: string;
  project: string | null;
  minutes: number;
  type: 'tag' | 'mention' | 'plain';
}

interface DaySummary {
  date: string;
  totalMinutes: number;
  activeMinutes: number;
}

interface AnalysisSummary {
  entryCount: number;
  projectCount: number;
  dayCount: number;
  totalMinutes: number;
  activeMinutes: number;
  averageMinutesPerDay: number;
  averageActiveMinutesPerDay: number;
  days: DaySummary[];
  topics: IdStats[];
}

export class Analyzer {
  analyze(contents: Record<string, string>): string {
    const summary = this.buildSummary(contents);
    if (!summary) return 'No data to analyze.';
    return this.formatTextSummary(summary);
  }

  analyzeHtml(contents: Record<string, string>): string {
    const summary = this.buildSummary(contents);
    if (!summary) return '<p>No data to analyze.</p>';
    return this.formatHtmlSummary(summary);
  }

  private buildSummary(contents: Record<string, string>): AnalysisSummary | null {
    const dates = Object.keys(contents).sort();
    if (dates.length === 0) return null;

    const allEntries: LogEntry[] = [];
    for (const date of dates) {
      const entries = parseEntries(contents[date], date);
      allEntries.push(...entries);
    }

    let totalMinutes = 0;
    let activeMinutes = 0;
    const idStats: Record<string, IdStats> = {};
    let entryCount = 0;
    const projectSet = new Set<string>();

    for (const entry of allEntries) {
      if (!entry.durationMinutes || entry.durationMinutes <= 0) continue;
      const dur = entry.durationMinutes;
      entryCount++;
      totalMinutes += dur;

      if (entry.type !== 'mention') {
        activeMinutes += dur;
      }

      if (entry.id) {
        if (!idStats[entry.id]) {
          idStats[entry.id] = { id: entry.id, project: entry.project, minutes: 0, type: entry.type };
        }
        idStats[entry.id].minutes += dur;
        if (entry.project) projectSet.add(entry.project);
      }
    }

    const dayCount = dates.length;
    const avgPerDay = dayCount > 0 ? totalMinutes / dayCount : 0;
    const avgActivePerDay = dayCount > 0 ? activeMinutes / dayCount : 0;

    const sortedIds = Object.values(idStats).sort((a, b) => a.id.localeCompare(b.id)); // .sort((a, b) => b.minutes - a.minutes);

    const days: DaySummary[] = [];
    for (const date of dates) {
      const dayEntries = allEntries.filter(e => e.date === date && e.durationMinutes && e.durationMinutes > 0);
      let dayTotal = 0;
      let dayActive = 0;
      for (const entry of dayEntries) {
        dayTotal += entry.durationMinutes!;
        if (entry.type !== 'mention') dayActive += entry.durationMinutes!;
      }
      days.push({
        date,
        totalMinutes: dayTotal,
        activeMinutes: dayActive
      });
    }

    return {
      entryCount,
      projectCount: projectSet.size,
      dayCount,
      totalMinutes,
      activeMinutes,
      averageMinutesPerDay: avgPerDay,
      averageActiveMinutesPerDay: avgActivePerDay,
      days,
      topics: sortedIds
    };
  }

  private formatTextSummary(summary: AnalysisSummary): string {
    const offMinutes = summary.totalMinutes - summary.activeMinutes;

    let out = '=== SUMMARY ===\n';
    out += `${summary.entryCount} entries, ${summary.projectCount} projects\n, ${summary.dayCount} days\n`;
    out += `${this.fmt(summary.averageMinutesPerDay)}/day --> ${this.fmt(summary.averageActiveMinutesPerDay)}/day active\n`;
    out += `${this.fmt(summary.totalMinutes)}  |  ${this.fmt(summary.activeMinutes)} (${this.dec(summary.activeMinutes)}) = ${this.pct(summary.activeMinutes, summary.totalMinutes)}% on  `;
    out += `${this.fmt(offMinutes)} (${this.dec(offMinutes)}) = ${this.pct(offMinutes, summary.totalMinutes)}% off\n\n`;

    out += `=== DAILY (${summary.dayCount} days, ${summary.entryCount} entries) ===\n`;
    for (const day of summary.days) {
      const dayOff = day.totalMinutes - day.activeMinutes;
      out += `${day.date}\t${this.fmt(day.totalMinutes)}  |  ${this.fmt(day.activeMinutes)} (${this.dec(day.activeMinutes)}) = ${this.pct(day.activeMinutes, day.totalMinutes)}% on  `;
      out += `${this.fmt(dayOff)} (${this.dec(dayOff)}) = ${this.pct(dayOff, day.totalMinutes)}% off\n`;
    }

    out += `\n=== TOPICS (${summary.topics.length}) ===\n`;
    for (const stat of summary.topics) {
      out += `- ${this.fmt(stat.minutes)}\t${this.dec(stat.minutes)}\t${stat.id}\t${stat.project || ''}\t(${this.pct(stat.minutes, summary.totalMinutes)}%)\n`;
    }

    return out;
  }

  private formatHtmlSummary(summary: AnalysisSummary): string {
    const offMinutes = summary.totalMinutes - summary.activeMinutes;
    const dayRows = summary.days.map(day => {
      const dayOff = day.totalMinutes - day.activeMinutes;
      return `<tr><td>${this.escapeHtml(day.date)}</td><td>${this.fmt(day.totalMinutes)}</td><td>${this.fmt(day.activeMinutes)} (${this.dec(day.activeMinutes)}) ${this.pct(day.activeMinutes, day.totalMinutes)}%</td><td>${this.fmt(dayOff)} (${this.dec(dayOff)}) ${this.pct(dayOff, day.totalMinutes)}%</td></tr>`;
    }).join('');

    const projectRows = summary.topics.map(project => {
      return `<tr><td>${this.fmt(project.minutes)}</td><td>${this.dec(project.minutes)}</td><td>${this.escapeHtml(project.id)}</td><td>${this.escapeHtml(project.project || '')}</td><td>${this.pct(project.minutes, summary.totalMinutes)}%</td></tr>`;
    }).join('');

    return [
      '<section class="analysis-summary">',
      '<h2>Summary</h2>',
      `<p><strong>${summary.entryCount}</strong> entries across <strong>${summary.projectCount}</strong> projects in <strong>${summary.dayCount}</strong> days.</p>`,
      `<p>${this.fmt(summary.averageMinutesPerDay)}/day average, ${this.fmt(summary.averageActiveMinutesPerDay)}/day active.</p>`,
      `<p>Total: ${this.fmt(summary.totalMinutes)} | Active: ${this.fmt(summary.activeMinutes)} (${this.dec(summary.activeMinutes)}) ${this.pct(summary.activeMinutes, summary.totalMinutes)}% | Off: ${this.fmt(offMinutes)} (${this.dec(offMinutes)}) ${this.pct(offMinutes, summary.totalMinutes)}%</p>`,
      '<h3>Daily</h3>',
      '<table><thead><tr><th>Date</th><th>Total</th><th>Active</th><th>Off</th></tr></thead><tbody>',
      dayRows,
      '</tbody></table>',
      `<h3>Topics (${summary.topics.length})</h3>`,
      '<table><thead><tr><th>Time</th><th>Hours</th><th>ID</th><th>Project</th><th>Share</th></tr></thead><tbody>',
      projectRows,
      '</tbody></table>',
      '</section>'
    ].join('');
  }

  private fmt(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return `${h}:${m.toString().padStart(2, '0')}`;
  }

  private dec(minutes: number): string {
    return (minutes / 60).toFixed(2);
  }

  private pct(part: number, total: number): string {
    return total > 0 ? ((part / total) * 100).toFixed(1) : '0.0';
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
