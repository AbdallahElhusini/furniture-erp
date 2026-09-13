import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;
const COST = 16_384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;

function deriveKey(
  password: string,
  salt: string,
  cost = COST,
  blockSize = BLOCK_SIZE,
  parallelization = PARALLELIZATION,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      KEY_LENGTH,
      {
        N: cost,
        r: blockSize,
        p: parallelization,
        maxmem: 64 * 1024 * 1024,
      },
      (error, derivedKey) => {
        if (error) reject(error);
        else resolve(derivedKey);
      },
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("base64url");
  const derivedKey = await deriveKey(password, salt);

  return [
    "scrypt",
    COST,
    BLOCK_SIZE,
    PARALLELIZATION,
    salt,
    derivedKey.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  const [algorithm, costValue, blockSizeValue, parallelizationValue, salt, hash] =
    storedHash.split("$");

  if (algorithm !== "scrypt" || !salt || !hash) return false;

  const cost = Number(costValue);
  const blockSize = Number(blockSizeValue);
  const parallelization = Number(parallelizationValue);
  if (![cost, blockSize, parallelization].every(Number.isSafeInteger)) return false;

  const expected = Buffer.from(hash, "base64url");
  const actual = await deriveKey(password, salt, cost, blockSize, parallelization);

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function getPasswordValidationError(password: string): string | null {
  if (password.length < 12) return "يجب ألا تقل كلمة المرور عن 12 حرفاً";
  if (password.length > 128) return "كلمة المرور طويلة جداً";

  const characterGroups = [
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length;

  if (characterGroups < 3) {
    return "استخدم ثلاثة أنواع على الأقل: حروف صغيرة، حروف كبيرة، أرقام، ورموز";
  }

  return null;
}
