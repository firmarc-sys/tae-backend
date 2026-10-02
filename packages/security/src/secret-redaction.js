const SECRET_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi,
  /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password)\s*[:=]\s*[^\s,;]+/gi,
];
export function redactSecrets(input) {
  if (typeof input !== "string") return "";
  return SECRET_PATTERNS.reduce((value, pattern) => value.replace(pattern, (match) => {
    const separator = match.search(/[:=]/);
    return separator >= 0 && !/^Bearer\s/i.test(match) ? match.slice(0, separator + 1) + "[REDACTED]" : "[REDACTED]";
  }), input);
}