export class InputTooLongError extends Error {
  override readonly name = 'InputTooLongError';

  constructor(length: number, limit: number) {
    super(`Input length ${length} exceeds limit of ${limit}`);
  }
}

const MAX_CHANNEL_INPUT_LENGTH = 10_000;

export const INJECTION_PATTERNS: ReadonlyArray<RegExp> = [
  /\[SYSTEM\]/gi,
  /\[INST\]/gi,
  /\[\/INST\]/gi,
  /<\|im_start\|>/gi,
  /<\|im_end\|>/gi,
  /<\|system\|>/gi,
  /<\|user\|>/gi,
  /<\|assistant\|>/gi,
  /<<SYS>>/gi,
  /<<\/SYS>>/gi,
  /Human:/gi,
  /Assistant:/gi,
  /<\|begin_of_text\|>/gi,
  /<\|end_of_text\|>/gi,
  /<\|eot_id\|>/gi,
  /<\|start_header_id\|>/gi,
  /<s>/gi,
  /<\/s>/gi,
  /\n\nHuman:/g,
  /\n\nAssistant:/g,
  /```system\b/gi,
  /[\u202E\u200F\u200E\u2066\u2067\u2068\u2069\u202A\u202B\u202C\u202D]/g,
];

const CONTROL_CHAR_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;
const XSS_VECTOR_REGEX = /[<>'"&]/g;

function stripControlChars(input: string): string {
  return input.replace(CONTROL_CHAR_REGEX, '');
}

function stripInjectionTokens(input: string): string {
  let result = input;
  for (const pattern of INJECTION_PATTERNS) {
    result = result.replace(pattern, '');
  }
  return result;
}

export function sanitizeChannelInput(input: string): string {
  if (input.length > MAX_CHANNEL_INPUT_LENGTH) {
    throw new InputTooLongError(input.length, MAX_CHANNEL_INPUT_LENGTH);
  }

  const noControlChars = stripControlChars(input);
  const noInjections = stripInjectionTokens(noControlChars);
  return noInjections.normalize('NFC');
}

export function sanitizeEntityName(name: string): string {
  const normalized = name.normalize('NFC');
  const noControlChars = stripControlChars(normalized);
  const noXss = noControlChars.replace(XSS_VECTOR_REGEX, '');
  return noXss.trim().slice(0, 200);
}

export function deepSanitizeStrings(obj: unknown): unknown {
  if (typeof obj === 'string') {
    return sanitizeEntityName(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(deepSanitizeStrings);
  }

  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = deepSanitizeStrings(value);
    }
    return result;
  }

  return obj;
}
