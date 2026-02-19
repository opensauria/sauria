import type { ModelRouter } from './router.js';
import type { ExtractionResult } from './anti-injection.js';
import { scrubPII } from '../security/pii-scrubber.js';
import { sanitizeEntityName } from '../security/sanitize.js';

const EMPTY_RESULT: ExtractionResult = {
  entities: [],
  relations: [],
  facts: [],
};

function buildExtractionPrompt(content: string): string {
  return `Extract all entities, relations, and facts from the following content.

Return JSON matching this exact schema:
{
  "entities": [{ "name": "string", "type": "person|project|company|event|document|goal|place|concept", "properties": {} }],
  "relations": [{ "from": "entity name", "to": "entity name", "type": "string", "context": "string" }],
  "facts": [{ "fact": "string", "importance": 0.0-1.0 }]
}

Content:
${content}`;
}

function sanitizeResult(result: ExtractionResult): ExtractionResult {
  return {
    entities: result.entities.map((entity) => ({
      ...entity,
      name: sanitizeEntityName(entity.name),
    })),
    relations: result.relations.map((relation) => ({
      ...relation,
      from: sanitizeEntityName(relation.from),
      to: sanitizeEntityName(relation.to),
    })),
    facts: result.facts,
  };
}

export async function extractEntities(
  router: ModelRouter,
  content: string,
): Promise<ExtractionResult> {
  if (!content.trim()) {
    return EMPTY_RESULT;
  }

  const scrubbed = scrubPII(content);

  try {
    const prompt = buildExtractionPrompt(scrubbed);
    const raw = await router.extract(prompt);
    return sanitizeResult(raw);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logWarning(`Entity extraction failed: ${message}`);
    return EMPTY_RESULT;
  }
}

function logWarning(message: string): void {
  process.stderr.write(`[openwind:extract] WARNING: ${message}\n`);
}
