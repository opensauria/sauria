export interface NormalizedEvent {
  readonly source: string;
  readonly eventType: string;
  readonly content: string;
  readonly metadata: Record<string, string>;
  readonly timestamp: string;
}

const HTML_TAG_REGEX = /<[^>]*>/g;
const WHITESPACE_REGEX = /\s{2,}/g;

const METADATA_KEYS = ['sender', 'recipient', 'subject', 'date'] as const;

function stripHtmlTags(input: string): string {
  return input.replace(HTML_TAG_REGEX, '');
}

function normalizeWhitespace(input: string): string {
  return input.replace(WHITESPACE_REGEX, ' ').trim();
}

function extractStringField(raw: Record<string, unknown>, key: string): string | undefined {
  const value = raw[key];
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  return undefined;
}

function extractMetadata(raw: Record<string, unknown>): Record<string, string> {
  const metadata: Record<string, string> = {};

  for (const key of METADATA_KEYS) {
    const value = extractStringField(raw, key);
    if (value !== undefined) {
      metadata[key] = value;
    }
  }

  return metadata;
}

function extractContent(raw: Record<string, unknown>): string {
  const body =
    extractStringField(raw, 'body') ??
    extractStringField(raw, 'content') ??
    extractStringField(raw, 'text') ??
    extractStringField(raw, 'description') ??
    '';

  const subject = extractStringField(raw, 'subject');
  const parts = subject ? [subject, body] : [body];
  return parts.join('\n');
}

function extractEventType(raw: Record<string, unknown>): string {
  return extractStringField(raw, 'type') ?? extractStringField(raw, 'eventType') ?? 'unknown';
}

function extractTimestamp(raw: Record<string, unknown>): string {
  const date =
    extractStringField(raw, 'date') ??
    extractStringField(raw, 'timestamp') ??
    extractStringField(raw, 'created_at');

  if (date !== undefined) {
    return date;
  }

  return new Date().toISOString();
}

export function normalizeRawEvent(
  source: string,
  rawData: Record<string, unknown>,
): NormalizedEvent {
  const rawContent = extractContent(rawData);
  const stripped = stripHtmlTags(rawContent);
  const content = normalizeWhitespace(stripped);

  return {
    source,
    eventType: extractEventType(rawData),
    content,
    metadata: extractMetadata(rawData),
    timestamp: extractTimestamp(rawData),
  };
}
