import { colors, entityColors, platformColors } from '@sauria/design-tokens';
import type { PlatformField } from './types.js';

export const CARD_FALLBACK_W = 120;
export const CARD_FALLBACK_H = 150;

export const PLATFORM_ICONS: Record<string, string> = {
  telegram: '<img src="/icons/telegram.svg" alt="Telegram" />',
  slack: '<img src="/icons/slack.svg" alt="Slack" />',
  whatsapp: '<img src="/icons/whatsapp.svg" alt="WhatsApp" />',
  discord: '<img src="/icons/discord.svg" alt="Discord" />',
  teams: '<img src="/icons/teams.svg" alt="Teams" />',
  messenger: '<img src="/icons/messenger.svg" alt="Messenger" />',
  line: '<img src="/icons/line.svg" alt="LINE" />',
  'google-chat': '<img src="/icons/google-chat.svg" alt="Google Chat" />',
  twilio: '<img src="/icons/twilio.svg" alt="Twilio" />',
  matrix: '<img src="/icons/matrix.svg" alt="Matrix" class="icon-mono" />',
  gmail: '<img src="/icons/gmail.svg" alt="Gmail" />',
  email: '<img src="/icons/email.svg" alt="Email" class="icon-mono" />',
};

export const RESPONSE_LANGUAGES = [
  { code: 'auto', label: 'Auto-detect' },
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'French / Francais' },
  { code: 'es', label: 'Spanish / Espanol' },
  { code: 'de', label: 'German / Deutsch' },
  { code: 'it', label: 'Italian / Italiano' },
  { code: 'pt', label: 'Portuguese / Portugues' },
  { code: 'nl', label: 'Dutch / Nederlands' },
  { code: 'ru', label: 'Russian' },
  { code: 'uk', label: 'Ukrainian' },
  { code: 'pl', label: 'Polish / Polski' },
  { code: 'cs', label: 'Czech / Cestina' },
  { code: 'sk', label: 'Slovak / Slovencina' },
  { code: 'hu', label: 'Hungarian / Magyar' },
  { code: 'ro', label: 'Romanian / Romana' },
  { code: 'bg', label: 'Bulgarian' },
  { code: 'hr', label: 'Croatian / Hrvatski' },
  { code: 'sr', label: 'Serbian' },
  { code: 'sl', label: 'Slovenian / Slovenscina' },
  { code: 'lv', label: 'Latvian / Latviesu' },
  { code: 'lt', label: 'Lithuanian / Lietuviu' },
  { code: 'et', label: 'Estonian / Eesti' },
  { code: 'sv', label: 'Swedish / Svenska' },
  { code: 'no', label: 'Norwegian / Norsk' },
  { code: 'da', label: 'Danish / Dansk' },
  { code: 'fi', label: 'Finnish / Suomi' },
  { code: 'el', label: 'Greek' },
  { code: 'tr', label: 'Turkish / Turkce' },
  { code: 'ar', label: 'Arabic' },
  { code: 'he', label: 'Hebrew' },
  { code: 'hi', label: 'Hindi' },
  { code: 'bn', label: 'Bengali' },
  { code: 'ta', label: 'Tamil' },
  { code: 'te', label: 'Telugu' },
  { code: 'mr', label: 'Marathi' },
  { code: 'gu', label: 'Gujarati' },
  { code: 'ur', label: 'Urdu' },
  { code: 'fa', label: 'Persian / Farsi' },
  { code: 'zh', label: 'Chinese' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'th', label: 'Thai' },
  { code: 'vi', label: 'Vietnamese / Tieng Viet' },
  { code: 'id', label: 'Indonesian / Bahasa Indonesia' },
  { code: 'ms', label: 'Malay / Bahasa Melayu' },
  { code: 'tl', label: 'Filipino / Tagalog' },
  { code: 'sw', label: 'Swahili / Kiswahili' },
  { code: 'am', label: 'Amharic' },
  { code: 'yo', label: 'Yoruba' },
  { code: 'ha', label: 'Hausa' },
  { code: 'zu', label: 'Zulu / isiZulu' },
  { code: 'af', label: 'Afrikaans' },
  { code: 'ca', label: 'Catalan / Catala' },
  { code: 'eu', label: 'Basque / Euskara' },
  { code: 'gl', label: 'Galician / Galego' },
  { code: 'cy', label: 'Welsh / Cymraeg' },
  { code: 'ga', label: 'Irish / Gaeilge' },
  { code: 'ka', label: 'Georgian' },
  { code: 'hy', label: 'Armenian' },
  { code: 'az', label: 'Azerbaijani' },
  { code: 'uz', label: 'Uzbek' },
  { code: 'kk', label: 'Kazakh' },
  { code: 'mn', label: 'Mongolian' },
  { code: 'ne', label: 'Nepali' },
  { code: 'si', label: 'Sinhala' },
  { code: 'km', label: 'Khmer' },
  { code: 'lo', label: 'Lao' },
  { code: 'my', label: 'Burmese' },
] as const;

export const CEO_TEMPLATE = [
  '## Response Format',
  'Plain text only. No markdown formatting, no emojis, no asterisks.',
  '',
  '## Tone',
  'Concise, direct, professional.',
  '',
  '## Language',
  'English.',
].join('\n');

export const BOT_TEMPLATE = [
  '## Role',
  '[What this agent does — e.g., Customer support for billing]',
  '',
  '## Personality',
  '[How this agent communicates — e.g., Friendly, patient, empathetic]',
  '',
  '## Response Style',
  '- [e.g., Use simple language]',
  '- [e.g., Ask clarifying questions when needed]',
  '',
  '## Constraints',
  '- [e.g., Never share internal policies]',
  '- [e.g., Escalate to human for complex issues]',
].join('\n');

export const CF_PLATFORMS = [
  { id: 'telegram', name: 'Telegram', hint: 'Bot Token + User ID' },
  { id: 'slack', name: 'Slack', hint: 'Bot Token + Signing Secret' },
  { id: 'whatsapp', name: 'WhatsApp', hint: 'Phone Number ID + Token' },
  { id: 'discord', name: 'Discord', hint: 'Bot Token' },
  { id: 'teams', name: 'Teams', hint: 'Bot ID + Secret' },
  { id: 'messenger', name: 'Messenger', hint: 'Page Token + Page ID' },
  { id: 'line', name: 'LINE', hint: 'Channel Token + Secret' },
  { id: 'google-chat', name: 'Google Chat', hint: 'Service Account Key' },
  { id: 'twilio', name: 'Twilio SMS', hint: 'Account SID + Auth Token' },
  { id: 'matrix', name: 'Matrix', hint: 'Homeserver + Token' },
] as const;

const PLATFORM_FIELDS: Record<string, PlatformField[]> = {
  telegram: [
    {
      key: 'userId',
      label: 'Your User ID',
      type: 'text',
      placeholder: '123456789',
      hint: 'Get from @userinfobot on Telegram',
    },
    {
      key: 'token',
      label: 'Bot Token',
      type: 'password',
      placeholder: '123456:ABC-DEF...',
      hint: 'Get from @BotFather on Telegram',
    },
  ],
  slack: [
    {
      key: 'ownerId',
      label: 'Your Slack User ID',
      type: 'text',
      placeholder: 'U0123456789',
      hint: 'Profile > ⋯ > Copy member ID',
    },
    {
      key: 'token',
      label: 'Bot Token',
      type: 'password',
      placeholder: 'xoxb-...',
      hint: 'From Slack App > OAuth & Permissions',
    },
    {
      key: 'signingSecret',
      label: 'Signing Secret',
      type: 'password',
      placeholder: 'abc123...',
      hint: 'From Slack App > Basic Information',
    },
  ],
  whatsapp: [
    {
      key: 'phoneNumberId',
      label: 'Phone Number ID',
      type: 'text',
      placeholder: '1234567890',
      hint: 'From Meta Business > WhatsApp > API Setup',
    },
    {
      key: 'accessToken',
      label: 'Access Token',
      type: 'password',
      placeholder: 'EAA...',
      hint: 'Permanent token from System Users',
    },
  ],
  discord: [
    {
      key: 'token',
      label: 'Bot Token',
      type: 'password',
      placeholder: 'MTIz...',
      hint: 'From Discord Developer Portal > Bot > Token',
    },
  ],
  teams: [
    {
      key: 'appId',
      label: 'App ID',
      type: 'text',
      placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
      hint: 'From Azure Bot Service > Configuration',
    },
    {
      key: 'appSecret',
      label: 'App Secret',
      type: 'password',
      placeholder: 'abc123...',
      hint: 'Client secret from Azure AD app registration',
    },
    {
      key: 'tenantId',
      label: 'Tenant ID',
      type: 'text',
      placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
      hint: 'Azure AD tenant ID (or "common" for multi-tenant)',
    },
  ],
  messenger: [
    {
      key: 'pageAccessToken',
      label: 'Page Access Token',
      type: 'password',
      placeholder: 'EAA...',
      hint: 'From Meta Developer Portal > Messenger > Access Tokens',
    },
    {
      key: 'pageId',
      label: 'Page ID',
      type: 'text',
      placeholder: '1234567890',
      hint: 'Facebook Page ID (Settings > About)',
    },
  ],
  line: [
    {
      key: 'channelAccessToken',
      label: 'Channel Access Token',
      type: 'password',
      placeholder: 'abc123...',
      hint: 'From LINE Developers > Messaging API > Channel Access Token',
    },
    {
      key: 'channelSecret',
      label: 'Channel Secret',
      type: 'password',
      placeholder: 'abc123...',
      hint: 'From LINE Developers > Basic Settings',
    },
  ],
  'google-chat': [
    {
      key: 'serviceAccountKey',
      label: 'Service Account Key (JSON)',
      type: 'password',
      placeholder: '{"type":"service_account",...}',
      hint: 'From Google Cloud Console > IAM > Service Accounts > Keys',
    },
    {
      key: 'spaceId',
      label: 'Space ID',
      type: 'text',
      placeholder: 'spaces/AAAAxxx',
      hint: 'Google Chat space to listen on',
    },
  ],
  twilio: [
    {
      key: 'accountSid',
      label: 'Account SID',
      type: 'text',
      placeholder: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      hint: 'From Twilio Console > Account Info',
    },
    {
      key: 'authToken',
      label: 'Auth Token',
      type: 'password',
      placeholder: 'abc123...',
      hint: 'From Twilio Console > Account Info',
    },
    {
      key: 'phoneNumber',
      label: 'Phone Number',
      type: 'text',
      placeholder: '+1234567890',
      hint: 'Twilio phone number (E.164 format)',
    },
  ],
  matrix: [
    {
      key: 'homeserverUrl',
      label: 'Homeserver URL',
      type: 'text',
      placeholder: 'https://matrix.org',
      hint: 'Matrix homeserver base URL',
    },
    {
      key: 'accessToken',
      label: 'Access Token',
      type: 'password',
      placeholder: 'syt_xxx...',
      hint: 'From Element > Settings > Help & About > Access Token',
    },
  ],
  gmail: [],
  email: [
    { key: 'imapHost', label: 'IMAP Host', type: 'text', placeholder: 'imap.gmail.com', hint: '' },
    { key: 'imapPort', label: 'IMAP Port', type: 'number', placeholder: '993', hint: '' },
    {
      key: 'smtpHost',
      label: 'SMTP Host',
      type: 'text',
      placeholder: 'smtp.gmail.com',
      hint: 'Leave empty to use IMAP host',
    },
    { key: 'smtpPort', label: 'SMTP Port', type: 'number', placeholder: '587', hint: '' },
    {
      key: 'username',
      label: 'Username / Email',
      type: 'text',
      placeholder: 'bot@example.com',
      hint: '',
    },
    {
      key: 'password',
      label: 'Password',
      type: 'password',
      placeholder: 'App password',
      hint: 'Use an app password for Gmail / Outlook',
    },
  ],
};

export const ROLES = ['lead', 'specialist', 'observer', 'coordinator', 'assistant'] as const;
export const AUTONOMY_LEVELS = [
  { level: 0, label: 'Manual' },
  { level: 1, label: 'Supervised' },
  { level: 2, label: 'Guided' },
  { level: 3, label: 'Full' },
] as const;
export const PRESET_COLORS = [
  colors.accent,
  platformColors.telegram,
  colors.success,
  colors.warning,
  colors.error,
  entityColors.company,
] as const;

export function getFieldsForPlatform(platform: string): PlatformField[] {
  return PLATFORM_FIELDS[platform] ?? [];
}

export const GEAR_SVG = '<img src="/icons/settings.svg" alt="Settings" />';
export const LOCK_SVG = '<img class="icon-mono" src="/icons/lock.svg" alt="" />';
export const UNLOCK_SVG = '<img class="icon-mono" src="/icons/lock-open.svg" alt="" />';
