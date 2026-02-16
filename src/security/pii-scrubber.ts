interface PiiPattern {
  readonly name: string;
  readonly regex: RegExp;
  readonly replacement: string;
}

export const PII_PATTERNS: ReadonlyArray<PiiPattern> = [
  {
    name: 'ssn',
    regex: /\b\d{3}-\d{2}-\d{4}\b/g,
    replacement: '[SSN_REDACTED]',
  },
  {
    name: 'credit_card',
    regex: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
    replacement: '[CC_REDACTED]',
  },
  {
    name: 'phone_intl',
    regex: /\+\d{1,3}[\s.-]?\(?\d{1,4}\)?[\s.-]?\d{1,4}[\s.-]?\d{1,9}/g,
    replacement: '[PHONE_REDACTED]',
  },
  {
    name: 'email_in_body',
    regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    replacement: '[EMAIL_REDACTED]',
  },
  {
    name: 'api_key',
    regex: /\b(sk|pk|key|token|secret|password)[_-]?[a-zA-Z0-9]{20,}\b/gi,
    replacement: '[KEY_REDACTED]',
  },
  {
    name: 'iban',
    regex: /\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}([A-Z0-9]?){0,16}\b/g,
    replacement: '[IBAN_REDACTED]',
  },
];

export function scrubPII(text: string): string {
  let result = text;
  for (const { regex, replacement } of PII_PATTERNS) {
    result = result.replace(regex, replacement);
  }
  return result;
}

export function hasPII(text: string): boolean {
  for (const { regex } of PII_PATTERNS) {
    // Reset lastIndex for global regexes
    regex.lastIndex = 0;
    if (regex.test(text)) {
      regex.lastIndex = 0;
      return true;
    }
  }
  return false;
}
