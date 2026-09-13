export function neutralizeSpreadsheetText(value: string): string {
  if (value.startsWith("'")) return `'${value}`;
  return /^[\t\r\n ]*[=+\-@]/.test(value) ? `'${value}` : value;
}

export function decodeNeutralizedSpreadsheetText(value: string): string {
  if (value.startsWith("''")) return value.slice(1);
  return /^'[\t\r\n ]*[=+\-@]/.test(value) ? value.slice(1) : value;
}
