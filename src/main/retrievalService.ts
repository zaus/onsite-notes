/**
 * Retrieval service for notebook search and ranking.
 * Implements keyword-based retrieval with BM25-like scoring.
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import type { LogEntry } from './parser';

export interface RetrievalDocument {
  date: string;
  entries: LogEntry[]; // todo: use these or remove them?
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

  constructor(private notebookPath: string, private contextBefore = 150, private contextAfter = 300) {
  }

  /**
   * Load notebook documents based on scope.
   * @param scope 'loaded' = currently loaded editors, 'full' = all dates in notebook
   * @param loadedFiles Optional array of loaded filenames (YYYY-MM-DD.txt)
   */
  async loadNotebook(
    scope: 'loaded' | 'full',
    loadedFiles?: string[]
  ): Promise<RetrievalDocument[]> {
    const documents: RetrievalDocument[] = [];
    const dateRegex = /^(\d{4}-\d{2}-\d{2})\.txt$/;

    if (scope === 'loaded' && loadedFiles) {
      // Load only specified files
      for (const file of loadedFiles) {
        try {
          const match = file.match(dateRegex);
          if (!match || !match[1]) {
            continue;
          }

          const date = match[1];
          const filePath = join(this.notebookPath, file);
          const text = readFileSync(filePath, 'utf-8');
          documents.push({ date, entries: [], text });
        } catch {
          // Skip unreadable files
        }
      }
    } else if (scope === 'full') {
      // Load all YYYY-MM-DD.txt files from the notebook directory
      try {
        const files = readdirSync(this.notebookPath);
        
        for (const file of files) {
          const match = file.match(dateRegex);
          if (!match || !match[1]) {
            continue;
          }

          try {
            const date = match[1];
            const filePath = join(this.notebookPath, file);
            const text = readFileSync(filePath, 'utf-8');
            documents.push({ date, entries: [], text });
          } catch {
            // Skip unreadable files
          }
        }
      } catch {
        // If directory doesn't exist or can't be read, return empty
      }
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
          const start = Math.max(0, firstTermIndex - this.contextBefore);
          const end = Math.min(doc.text.length, firstTermIndex + this.contextAfter);
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
