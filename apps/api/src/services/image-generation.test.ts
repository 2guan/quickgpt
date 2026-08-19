import assert from 'node:assert/strict';
import test from 'node:test';
import { getGeneratedImageResults } from './image-generation.js';

test('keeps every valid image returned by an image generation API', () => {
  assert.deepEqual(
    getGeneratedImageResults({ data: [{ url: 'one' }, { b64_json: 'two', revised_prompt: 'revised' }, {}] }, 'original'),
    [
      { url: 'one', b64Json: undefined, revisedPrompt: 'original' },
      { url: undefined, b64Json: 'two', revisedPrompt: 'revised' },
    ]
  );
});
