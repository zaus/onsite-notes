import { describe, it, expect } from 'vitest';
import { NotebookRetriever } from '../../src/main/retrievalService';

describe('NotebookRetriever', () => {
  it('should rank and chunk documents by keyword frequency', () => {
    const retriever = new NotebookRetriever('/mock/path');

    const documents = [
      {
        date: '2026-03-20',
        entries: [],
        text: 'Meeting with the team about project planning. Discussed roadmap and milestones.',
      },
      {
        date: '2026-03-19',
        entries: [],
        text: 'Project kickoff was successful. Team meeting concluded with clear action items.',
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
    // First result should be from 2026-03-20 (has all three keywords)
    expect(chunks[0].date).toBe('2026-03-20');
    expect(chunks[0].score).toBeGreaterThan(chunks[1].score);
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
});
