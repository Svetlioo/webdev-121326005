// Better Auth's error codes, as sentences a person can read.
const messages: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: 'Грешен имейл или парола',
  INVALID_EMAIL: 'Невалиден имейл.',
  PASSWORD_TOO_SHORT: 'Паролата трябва да е поне 8 знака.',
  USER_ALREADY_EXISTS: 'Вече има профил с този имейл.',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'Вече има профил с този имейл.',
  // Google: Better Auth sends these back as ?error=... after the redirect.
  account_not_linked: 'Влезте с паролата си и свържете Google от профила',
  email_not_verified: 'Google не е потвърдил имейла ви, затова входът е отказан.',
  email_does_not_match: 'Профилът в Google трябва да е със същия имейл като този профил.',
  unable_to_link_account: 'Профилът в Google не можа да бъде свързан. Опитайте отново.',
  account_already_linked_to_different_user: 'Този профил в Google вече е свързан с друг потребител.',
  PROVIDER_NOT_FOUND: 'Входът с Google не е настроен.',
  oauth_provider_not_found: 'Входът с Google не е настроен.',
};

export function authMessage(code: string | undefined): string {
  return (code && messages[code]) || 'Нещо се обърка. Опитайте отново.';
}
