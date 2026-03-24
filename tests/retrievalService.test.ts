import { describe, it, expect } from 'vitest';
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
});
