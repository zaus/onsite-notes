import { parseEntries, LogEntry } from './parser';

interface IdStats {
  id: string;
  project: string | null;
  minutes: number;
  type: 'tag' | 'mention' | 'plain';
}

export class Analyzer {
  analyze(contents: Record<string, string>): string {
    const dates = Object.keys(contents).sort();
    if (dates.length === 0) return 'No data to analyze.';

    const allEntries: LogEntry[] = [];
    for (const date of dates) {
      const entries = parseEntries(contents[date], date);
      allEntries.push(...entries);
    }

    let totalMinutes = 0;
    let activeMinutes = 0;
    let billableMinutes = 0;
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
        if (entry.type === 'tag') billableMinutes += dur;
      }

      if (entry.id) {
        if (!idStats[entry.id]) {
          idStats[entry.id] = { id: entry.id, project: entry.project, minutes: 0, type: entry.type };
        }
        idStats[entry.id].minutes += dur;
        if (entry.project) projectSet.add(entry.project);
      }
    }

    const fmt = (minutes: number) => {
      const h = Math.floor(minutes / 60);
      const m = Math.round(minutes % 60);
      return `${h}:${m.toString().padStart(2, '0')}`;
    };
    const dec = (minutes: number) => (minutes / 60).toFixed(2);
    const pct = (part: number, total: number) => total > 0 ? ((part / total) * 100).toFixed(1) : '0.0';

    const dayCount = dates.length;
    const avgPerDay = dayCount > 0 ? totalMinutes / dayCount : 0;
    const avgActivePerDay = dayCount > 0 ? activeMinutes / dayCount : 0;

    const sortedIds = Object.values(idStats).sort((a, b) => a.id.localCompare(b.id)); // .sort((a, b) => b.minutes - a.minutes);

    // TODO: html formatting instead
    let out = '=== SUMMARY ===\n';
    out += `${entryCount} entries, ${projectSet.size} projects\n`;
    out += `${dayCount} days\n`;
    out += `${fmt(avgPerDay)}/day --> ${fmt(avgActivePerDay)}/day active\n`;
    const offMinutes = totalMinutes - activeMinutes;
    out += `${fmt(totalMinutes)}  |  ${fmt(activeMinutes)} (${dec(activeMinutes)}) = ${pct(activeMinutes, totalMinutes)}% on  `;
    out += `${fmt(offMinutes)} (${dec(offMinutes)}) = ${pct(offMinutes, totalMinutes)}% off\n\n`;

    // Daily breakdown
    out += `=== DAILY (${dayCount} days, ${entryCount} entries) ===\n`;
    for (const date of dates) {
      const dayEntries = allEntries.filter(e => e.date === date && e.durationMinutes && e.durationMinutes > 0);
      let dayTotal = 0, dayActive = 0;
      for (const e of dayEntries) {
        dayTotal += e.durationMinutes!;
        if (e.type !== 'mention') dayActive += e.durationMinutes!;
      }
      out += `${date}: ${fmt(dayTotal)}  |  ${fmt(dayActive)} (${dec(dayActive)}) = ${pct(dayActive, dayTotal)}% on  `;
      out += `${fmt(dayTotal - dayActive)} (${dec(dayTotal - dayActive)}) = ${pct(dayTotal - dayActive, dayTotal)}% off\n`;
    }

    out += `\n=== PROJECTS (${sortedIds.length}) ===\n`;
    for (const stat of sortedIds) {
      out += `${fmt(stat.minutes)}  ${dec(stat.minutes)}  ${stat.id}  ${stat.project || ''}  (${pct(stat.minutes, totalMinutes)}%)\n`;
    }

    return out;
  }
}
