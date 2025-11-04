export const PASSWORD_MIN_LENGTH = 8;
const UPPERCASE_REGEX = /[A-Z]/;
const DIGIT_REGEX = /\d/g;

export const PASSWORD_REQUIREMENTS_MESSAGE =
  'Password must include at least 8 characters, one uppercase letter, and two numbers.';

export function isPasswordStrong(password: string): boolean {
  if (typeof password !== 'string') {
    return false;
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    return false;
  }

  if (!UPPERCASE_REGEX.test(password)) {
    return false;
  }

  const digitMatches = password.match(DIGIT_REGEX);
  if (!digitMatches || digitMatches.length < 2) {
    return false;
  }

  return true;
}
