/**
 * Retrieval service for notebook search and ranking.
 * Implements keyword-based retrieval with BM25-like scoring.
 */

import { readFileSync } from 'fs';
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
  citations: Array<{ date: string; snippet: string; score: number }>;
}

export interface HybridRetrievalOptions {
  embedText?: (input: string) => Promise<number[] | null>;
  semanticWeight?: number;
  keywordWeight?: number;
  chunkSize?: number;
  chunkOverlap?: number;
  maxChunks?: number;
  minScore?: number;
  requireKeywordMatch?: boolean;
}

type DocumentChunk = {
  date: string;
  text: string;
  start: number;
  end: number;
};

export class NotebookRetriever {

  constructor(private notebookPath: string, private contextBefore = 150, private contextAfter = 300) {
  }

  /**
   * Load notebook documents from the provided notebook files.
   */
  async loadNotebook(files: string[]): Promise<RetrievalDocument[]> {
    const documents: RetrievalDocument[] = [];
    for (const file of files) {
      try {
        const date = file.endsWith('.txt') ? file.slice(0, -4) : file;
        const filePath = join(this.notebookPath, file);
        const text = readFileSync(filePath, 'utf-8');
        documents.push({ date, entries: [], text });
      } catch {
        // Skip unreadable files
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
    topK: number = 5,
    options: Pick<HybridRetrievalOptions, 'minScore'> = {}
  ): RankedChunk[] {
    const terms = query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2); // Ignore short terms

    if (terms.length === 0) {
      return [];
    }

    const minScore = options.minScore ?? 0;
    const scored: RankedChunk[] = [];

    for (const doc of documents) {
      const textLower = doc.text.toLowerCase();

      // Calculate term frequencies
      let score = 0;
      for (const term of terms) {
        const matches = (textLower.match(new RegExp(term, 'g')) || []).length;
        score += matches;
      }

      if (score > 0 && score >= minScore) {
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

  async rankAndChunkHybrid(
    query: string,
    documents: RetrievalDocument[],
    topK: number = 5,
    options: HybridRetrievalOptions = {}
  ): Promise<RankedChunk[]> {
    const terms = this.getQueryTerms(query);
    if (terms.length === 0) {
      return [];
    }

    const chunkSize = options.chunkSize ?? 800;
    const chunkOverlap = options.chunkOverlap ?? 120;
    const maxChunks = options.maxChunks ?? 200;
    const semanticWeight = options.semanticWeight ?? 0.7;
    const keywordWeight = options.keywordWeight ?? 0.3;
    const minScore = options.minScore ?? 0;
    const requireKeywordMatch = options.requireKeywordMatch ?? false;
    const chunks = this
      .chunkDocuments(documents, chunkSize, chunkOverlap)
      .slice(-maxChunks);

    if (chunks.length === 0) {
      return [];
    }

    const embedText = options.embedText;
    if (!embedText) {
      return this.rankAndChunk(query, documents, topK, { minScore });
    }

    let queryEmbedding: number[] | null = null;
    try {
      queryEmbedding = await embedText(query);
    } catch {
      queryEmbedding = null;
    }

    if (!queryEmbedding || queryEmbedding.length === 0) {
      return this.rankAndChunk(query, documents, topK, { minScore });
    }

    const scored: RankedChunk[] = [];

    for (const chunk of chunks) {
      const keywordRawScore = this.computeKeywordScore(terms, chunk.text);
      if (requireKeywordMatch && keywordRawScore === 0) {
        continue;
      }

      let semanticScore = 0;
      try {
        const chunkEmbedding = await embedText(chunk.text);
        if (chunkEmbedding && chunkEmbedding.length > 0) {
          const cosine = this.cosineSimilarity(queryEmbedding, chunkEmbedding);
          semanticScore = (cosine + 1) / 2;
        }
      } catch {
        semanticScore = 0;
      }

      const keywordNormalized = keywordRawScore / (keywordRawScore + 3);
      const score = (semanticWeight * semanticScore) + (keywordWeight * keywordNormalized);

      if (score > 0 && score >= minScore) {
        const snippet = `${chunk.start > 0 ? '...' : ''}${chunk.text}${chunk.end < this.getDocumentLength(documents, chunk.date) ? '...' : ''}`;
        scored.push({
          date: chunk.date,
          snippet,
          score,
          entry: undefined,
        });
      }
    }

    scored.sort((a, b) => b.score - a.score);
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

  private getQueryTerms(query: string): string[] {
    return query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2);
  }

  private computeKeywordScore(terms: string[], text: string): number {
    const textLower = text.toLowerCase();
    let score = 0;
    for (const term of terms) {
      const matches = (textLower.match(new RegExp(term, 'g')) || []).length;
      score += matches;
    }
    return score;
  }

  private chunkDocuments(documents: RetrievalDocument[], chunkSize: number, chunkOverlap: number): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    const safeChunkSize = Math.max(200, chunkSize);
    const safeOverlap = Math.max(0, Math.min(chunkOverlap, safeChunkSize - 50));
    const step = safeChunkSize - safeOverlap;

    for (const doc of documents) {
      if (!doc.text || doc.text.trim().length === 0) {
        continue;
      }

      if (doc.text.length <= safeChunkSize) {
        chunks.push({
          date: doc.date,
          text: doc.text,
          start: 0,
          end: doc.text.length,
        });
        continue;
      }

      for (let start = 0; start < doc.text.length; start += step) {
        const end = Math.min(doc.text.length, start + safeChunkSize);
        const text = doc.text.substring(start, end);
        chunks.push({ date: doc.date, text, start, end });
        if (end >= doc.text.length) {
          break;
        }
      }
    }

    return chunks;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length === 0 || b.length === 0 || a.length !== b.length) {
      return 0;
    }

    let dot = 0;
    let magA = 0;
    let magB = 0;

    for (let idx = 0; idx < a.length; idx++) {
      const left = a[idx] || 0;
      const right = b[idx] || 0;
      dot += left * right;
      magA += left * left;
      magB += right * right;
    }

    if (magA === 0 || magB === 0) {
      return 0;
    }

    return dot / (Math.sqrt(magA) * Math.sqrt(magB));
  }

  private getDocumentLength(documents: RetrievalDocument[], date: string): number {
    const doc = documents.find((item) => item.date === date);
    return doc?.text.length ?? 0;
  }
}
