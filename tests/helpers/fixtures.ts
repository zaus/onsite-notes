import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function loadFixture(name: string): string {
  return readFileSync(resolve(process.cwd(), 'tests', 'resources', name), 'utf8').replace(/\r\n/g, '\n');
}
