/**
 * Retrieval service for notebook search and ranking.
 * Implements keyword-based retrieval with BM25-like scoring.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { LogEntry } from './parser';

export interface RetrievalDocument {
  date: string;
  entries: LogEntry[];
  text: string;
}

export interface RankedChunk {
  date: string;
  snippet: string;
  entry?: LogEntry;
  score: number;
}

export interface RetrievalResult {
  documents: RankedChunk[];
  citations: Array<{ date: string; snippet: string }>;
}

export class NotebookRetriever {
  private notebookPath: string;

  constructor(notebookPath: string) {
    this.notebookPath = notebookPath;
  }

  /**
   * Load notebook documents based on scope.
   * @param scope 'loaded' = currently loaded editors, 'full' = all dates in notebook
   * @param loadedDates Optional array of currently loaded date strings (YYYY-MM-DD)
   */
  async loadNotebook(
    scope: 'loaded' | 'full',
    loadedDates?: string[]
  ): Promise<RetrievalDocument[]> {
    const documents: RetrievalDocument[] = [];

    if (scope === 'loaded' && loadedDates) {
      // Load only specified dates
      for (const date of loadedDates) {
        try {
          const filePath = join(this.notebookPath, `${date}.txt`);
          const text = readFileSync(filePath, 'utf-8');
          documents.push({ date, entries: [], text });
        } catch {
          // Skip missing date files
        }
      }
    } else if (scope === 'full') {
      // In full scope, we would enumerate all YYYY-MM-DD.txt files
      // For now, this is a placeholder—actual implementation would
      // use fs.readdirSync and filter for .txt files
      // This prevents expensive full-text indexing at startup
      // TODO: implement full directory scan when needed
    }

    return documents;
  }

  /**
   * Perform keyword search and ranking on documents.
   * Uses simple term frequency for scoring (BM25-like).
   * @param query User search query
   * @param documents Documents to search
   * @param topK Number of top results to return (default 5)
   */
  rankAndChunk(
    query: string,
    documents: RetrievalDocument[],
    topK: number = 5
  ): RankedChunk[] {
    const terms = query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2); // Ignore short terms

    if (terms.length === 0) {
      return [];
    }

    const scored: RankedChunk[] = [];

    for (const doc of documents) {
      const textLower = doc.text.toLowerCase();

      // Calculate term frequencies
      let score = 0;
      for (const term of terms) {
        const matches = (textLower.match(new RegExp(term, 'g')) || []).length;
        score += matches;
      }

      if (score > 0) {
        // Extract snippet around first match
        const firstTerm = terms[0];
        if (firstTerm) {
          const firstTermIndex = textLower.indexOf(firstTerm);
          const start = Math.max(0, firstTermIndex - 150);
          const end = Math.min(doc.text.length, firstTermIndex + 300);
          const snippet = doc.text.substring(start, end);

          scored.push({
            date: doc.date,
            snippet: `${start > 0 ? '...' : ''}${snippet}${end < doc.text.length ? '...' : ''}`,
            score,
            entry: undefined,
          });
        }
      }
    }

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // Return top K
    return scored.slice(0, topK);
  }

  /**
   * Build context string from ranked chunks for LLM.
   */
  buildContext(chunks: RankedChunk[]): string {
    return chunks
      .map(
        (chunk) =>
          `[Date: ${chunk.date}]\n${chunk.snippet}\n---\n`
      )
      .join('\n');
  }
}
