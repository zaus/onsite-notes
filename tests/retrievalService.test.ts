import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { NotebookRetriever } from '../src/main/retrievalService';

describe('NotebookRetriever', () => {
  it('should rank and chunk documents by keyword frequency', () => {
    const retriever = new NotebookRetriever('/mock/path');

    const documents = [
      {
        date: '2026-03-20',
        entries: [],
        text: 'Team planning session. Project planning with team members. Project discussion. Team coordination meeting.',
      },
      {
        date: '2026-03-19',
        entries: [],
        text: 'Kickoff was successful. Meeting concluded with action items.',
      },
      {
        date: '2026-03-18',
        entries: [],
        text: 'Daily standup. No project updates today. Just bug fixes.',
      },
    ];

    const query = 'project team meeting';
    const chunks = retriever.rankAndChunk(query, documents, 2);

    expect(chunks.length).toBe(2);
    // First result should be from 2026-03-20 (has all three keywords appearing multiple times)
    expect(chunks[0]!.date).toBe('2026-03-20');
    expect(chunks[0]!.score).toBeGreaterThan(chunks[1]!.score);
  });

  it('should return empty array for empty query', () => {
    const retriever = new NotebookRetriever('/mock/path');
    const documents = [
      {
        date: '2026-03-20',
        entries: [],
        text: 'Some content here',
      },
    ];

    const chunks = retriever.rankAndChunk('', documents);
    expect(chunks.length).toBe(0);
  });

  it('should build context string from chunks', () => {
    const retriever = new NotebookRetriever('/mock/path');

    const chunks = [
      {
        date: '2026-03-20',
        snippet: 'Meeting discussion',
        score: 5,
        entry: undefined,
      },
      {
        date: '2026-03-19',
        snippet: 'Kickoff discussion',
        score: 3,
        entry: undefined,
      },
    ];

    const context = retriever.buildContext(chunks);
    expect(context).toContain('2026-03-20');
    expect(context).toContain('2026-03-19');
    expect(context).toContain('Meeting discussion');
    expect(context).toContain('Kickoff discussion');
  });

  it('should load only the provided notebook files', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onsite-notes-retrieval-'));

    try {
      fs.writeFileSync(path.join(tempDir, '2026-03-20.txt'), 'Loaded note', 'utf-8');
      fs.writeFileSync(path.join(tempDir, '2026-03-21.txt'), 'Other note', 'utf-8');

      const retriever = new NotebookRetriever(tempDir);
      const documents = await retriever.loadNotebook(['2026-03-20.txt']);

      expect(documents).toEqual([
        {
          date: '2026-03-20',
          entries: [],
          text: 'Loaded note',
        },
      ]);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should respect topK parameter', () => {
    const retriever = new NotebookRetriever('/mock/path');

    const documents = Array.from({ length: 10 }, (_, i) => ({
      date: `2026-03-${String(20 + i).padStart(2, '0')}`,
      entries: [],
      text: 'test content repeated many times test test test',
    }));

    const chunks = retriever.rankAndChunk('test', documents, 3);
    expect(chunks.length).toBe(3);
  });

  it('should rank semantic matches with embeddings', async () => {
    const retriever = new NotebookRetriever('/mock/path');

    const documents = [
      {
        date: '2026-03-20',
        entries: [],
        text: 'Resolved production incident after triaging a major bug in checkout flow.',
      },
      {
        date: '2026-03-19',
        entries: [],
        text: 'Prepared onboarding checklist and team schedule for new hire.',
      },
    ];

    const embedText = async (input: string): Promise<number[] | null> => {
      const normalized = input.toLowerCase();
      if (normalized.includes('incident') || normalized.includes('bug') || normalized.includes('outage')) {
        return [1, 0, 0];
      }
      if (normalized.includes('onboarding') || normalized.includes('schedule')) {
        return [0, 1, 0];
      }
      return [0, 0, 1];
    };

    const chunks = await retriever.rankAndChunkHybrid('outage issue', documents, 1, { embedText });
    expect(chunks.length).toBe(1);
    expect(chunks[0]?.date).toBe('2026-03-20');
  });

  const runKeywordWeightRankingScenario = async (preferKeywordMatch: boolean) => {
    const retriever = new NotebookRetriever('/mock/path');

    const documents = [
      {
        date: '2026-03-20',
        entries: [],
        text: 'spareebo planning notes and follow-up items.',
      },
      {
        date: '2026-03-21',
        entries: [],
        text: 'Product kickoff roadmap and planning discussion.',
      },
    ];

    const embedText = async (input: string): Promise<number[] | null> => {
      const normalized = input.toLowerCase();
      if (normalized === 'spareebo launch') {
        return [1, 0];
      }
      if (normalized.includes('product kickoff roadmap')) {
        return [1, 0];
      }
      if (normalized.includes('spareebo planning notes')) {
        return [0, 1];
      }
      return [0, 0];
    };

    return retriever.rankAndChunkHybrid('spareebo launch', documents, 2, {
      embedText,
      semanticWeight: preferKeywordMatch ? 0.2 : 0.9,
      keywordWeight: preferKeywordMatch ? 0.8 : 0.1,
      requireKeywordMatch: false,
    });
  };

  it('should allow a semantic-only result to outrank a keyword result when keyword weight is low', async () => {
    const chunks = await runKeywordWeightRankingScenario(false);

    expect(chunks).toHaveLength(2);
    expect(chunks[0]?.date).toBe('2026-03-21');
    expect(chunks[1]?.date).toBe('2026-03-20');
  });

  it('should prioritize a keyword-bearing result when keyword weight is increased without requiring keyword matches', async () => {
    const chunks = await runKeywordWeightRankingScenario(true);

    expect(chunks).toHaveLength(2);
    expect(chunks[0]?.date).toBe('2026-03-20');
    expect(chunks[1]?.date).toBe('2026-03-21');
    expect(chunks[0]!.score).toBeGreaterThan(chunks[1]!.score);
  });

  it('should fall back to keyword ranking when embeddings are unavailable', async () => {
    const retriever = new NotebookRetriever('/mock/path');

    const documents = [
      {
        date: '2026-03-20',
        entries: [],
        text: 'Only this note mentions deployment rollback details.',
      },
      {
        date: '2026-03-19',
        entries: [],
        text: 'General planning notes with no deployment mention.',
      },
    ];

    const chunks = await retriever.rankAndChunkHybrid('rollback deployment', documents, 1, {
      embedText: async () => null,
    });

    expect(chunks.length).toBe(1);
    expect(chunks[0]?.date).toBe('2026-03-20');
  });

  it('should filter low-confidence citation chunks', async () => {
    const retriever = new NotebookRetriever('/mock/path');

    const documents = [
      {
        date: '2026-03-20',
        entries: [],
        text: 'Resolved checkout outage and rollback after a production incident.',
      },
      {
        date: '2026-03-19',
        entries: [],
        text: 'Planned team lunch and general admin tasks for next week.',
      },
    ];

    const embedText = async (input: string): Promise<number[] | null> => {
      const normalized = input.toLowerCase();
      if (normalized.includes('outage') || normalized.includes('incident') || normalized.includes('rollback')) {
        return [1, 0, 0];
      }
      return [0.6, 0.4, 0];
    };

    const chunks = await retriever.rankAndChunkHybrid('checkout outage', documents, 3, {
      embedText,
      minScore: 0.45,
      requireKeywordMatch: true,
    });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.date).toBe('2026-03-20');
  });

  it('should exclude citation chunks below the configured min score', async () => {
    const retriever = new NotebookRetriever('/mock/path');

    const documents = [
      {
        date: '2026-03-20',
        entries: [],
        text: 'Checkout outage follow-up notes.',
      },
    ];

    const chunks = await retriever.rankAndChunkHybrid('checkout outage', documents, 3, {
      embedText: async () => [1, 0, 0],
      semanticWeight: 0,
      keywordWeight: 1,
      minScore: 0.5,
      requireKeywordMatch: true,
    });

    expect(chunks).toHaveLength(0);
  });

  it('should include citation chunks when score matches the configured min score', async () => {
    const retriever = new NotebookRetriever('/mock/path');

    const documents = [
      {
        date: '2026-03-20',
        entries: [],
        text: 'Checkout notes only.',
      },
    ];

    const chunks = await retriever.rankAndChunkHybrid('checkout', documents, 3, {
      embedText: async () => [1, 0, 0],
      semanticWeight: 0,
      keywordWeight: 1,
      minScore: 0.25,
      requireKeywordMatch: true,
    });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.date).toBe('2026-03-20');
    expect(chunks[0]?.score).toBe(0.25);
  });

  it('should show why specific-term can include unrelated chunks without keyword filtering', async () => {
    const retriever = new NotebookRetriever('/mock/path');
    const fixturePath = path.join(process.cwd(), 'tests', 'resources', 'citation-entry.txt');
    const fixtureText = fs.readFileSync(fixturePath, 'utf-8');

    const documents = [
      {
        date: '2026-02-19',
        entries: [],
        text: fixtureText,
      },
    ];

    const chunks = await retriever.rankAndChunkHybrid('spareebo', documents, 8, {
      embedText: async () => [1, 0, 0],
      semanticWeight: 1,
      keywordWeight: 0,
      chunkSize: 350,
      chunkOverlap: 40,
      minScore: 0.8,
      requireKeywordMatch: false,
    });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.some((chunk) => !chunk.snippet.toLowerCase().includes('spareebo'))).toBe(true);
  });

  it('should keep specific-term citations keyword-relevant when keyword filtering is enabled', async () => {
    const retriever = new NotebookRetriever('/mock/path');
    const fixturePath = path.join(process.cwd(), 'tests', 'resources', 'citation-entry.txt');
    const fixtureText = fs.readFileSync(fixturePath, 'utf-8');

    const documents = [
      {
        date: '2026-02-19',
        entries: [],
        text: fixtureText,
      },
    ];

    const chunks = await retriever.rankAndChunkHybrid('spareebo', documents, 8, {
      embedText: async () => [1, 0, 0],
      semanticWeight: 1,
      keywordWeight: 0,
      chunkSize: 350,
      chunkOverlap: 40,
      minScore: 0.8,
      requireKeywordMatch: true,
    });

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.every((chunk) => chunk.snippet.toLowerCase().includes('spareebo'))).toBe(true);
  });

  it('should use production citation config to keep only specific-term-matching chunks', async () => {
    const retriever = new NotebookRetriever('/mock/path');
    const fixturePath = path.join(process.cwd(), 'tests', 'resources', 'citation-entry.txt');
    const fixtureText = fs.readFileSync(fixturePath, 'utf-8');

    const documents = [
      {
        date: '2026-02-19',
        entries: [],
        text: fixtureText,
      },
    ];

    const chunks = await retriever.rankAndChunkHybrid('spareebo', documents, 3, {
      embedText: async () => [1, 0, 0],
      minScore: 0.45,
      requireKeywordMatch: true,
    });

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.length).toBeLessThanOrEqual(3);
    expect(chunks.every((chunk) => chunk.snippet.toLowerCase().includes('spareebo'))).toBe(true);
    expect(chunks.every((chunk) => chunk.score >= 0.45)).toBe(true);
  });

  it('should compute production weighted score for a keyword match', async () => {
    const retriever = new NotebookRetriever('/mock/path');

    const documents = [
      {
        date: '2026-03-20',
        entries: [],
        text: 'spareebo kickoff notes',
      },
    ];

    const chunks = await retriever.rankAndChunkHybrid('spareebo', documents, 3, {
      embedText: async () => [1, 0, 0],
      minScore: 0.45,
      requireKeywordMatch: true,
    });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.score).toBeCloseTo(0.775, 6);
  });

  it('should reject low-confidence keyword matches under production threshold', async () => {
    const retriever = new NotebookRetriever('/mock/path');

    const documents = [
      {
        date: '2026-03-20',
        entries: [],
        text: 'spareebo kickoff notes',
      },
    ];

    const embedText = async (input: string): Promise<number[] | null> => {
      return input.trim().toLowerCase() === 'spareebo' ? [1, 0, 0] : [0, 1, 0];
    };

    const chunks = await retriever.rankAndChunkHybrid('spareebo', documents, 3, {
      embedText,
      minScore: 0.45,
      requireKeywordMatch: true,
    });

    expect(chunks).toHaveLength(0);
  });

  it('should match #tag query only against text containing the literal tag sigil', async () => {
    const retriever = new NotebookRetriever('/mock/path');

    const documents = [
      {
        date: '2026-03-20',
        entries: [],
        // Contains the word "spareebo" but never as a #tag
        text: 'spareebo kickoff meeting notes. Discussed spareebo roadmap.',
      },
      {
        date: '2026-03-21',
        entries: [],
        // Contains the literal #spareebo tag
        text: 'Prep work for #spareebo-1stcall. Reviewed the #spareebo agenda.',
      },
    ];

    // When user queries "#spareebo" the sigil is preserved, so only the tagged doc matches
    const chunks = await retriever.rankAndChunkHybrid('#spareebo', documents, 5, {
      embedText: async () => [1, 0, 0],
      requireKeywordMatch: true,
    });

    expect(chunks.length).toBe(1);
    expect(chunks[0]?.date).toBe('2026-03-21');
  });

  it('should match plain query term against both bare and #tag occurrences', async () => {
    const retriever = new NotebookRetriever('/mock/path');

    const documents = [
      {
        date: '2026-03-20',
        entries: [],
        text: 'spareebo kickoff meeting notes.',
      },
      {
        date: '2026-03-21',
        entries: [],
        text: 'Prep work for #spareebo-1stcall and #spareebo agenda.',
      },
    ];

    const chunks = await retriever.rankAndChunkHybrid('spareebo', documents, 5, {
      embedText: async () => [1, 0, 0],
      requireKeywordMatch: true,
    });

    expect(chunks.length).toBe(2);
    expect(chunks.map((chunk) => chunk.date).sort()).toEqual(['2026-03-20', '2026-03-21']);
  });
});
