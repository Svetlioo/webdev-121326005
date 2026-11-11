// Better Auth's error codes, as sentences a person can read.
const messages: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: 'Грешен имейл или парола',
  INVALID_EMAIL: 'Невалиден имейл.',
  PASSWORD_TOO_SHORT: 'Паролата трябва да е поне 8 знака.',
  USER_ALREADY_EXISTS: 'Вече има профил с този имейл.',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'Вече има профил с този имейл.',
};

export function authMessage(code: string | undefined): string {
  return (code && messages[code]) || 'Нещо се обърка. Опитайте отново.';
}
