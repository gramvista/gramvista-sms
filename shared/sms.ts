export function normalizePhone(input: string): string | null {
  let phone = input.trim().replace(/[\s().-]/g, "");
  if (/^0[67]\d{8}$/.test(phone)) phone = "+255" + phone.slice(1);
  else if (/^255[67]\d{8}$/.test(phone)) phone = "+" + phone;
  else if (phone.startsWith("00")) phone = "+" + phone.slice(2);
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null;
}
const gsm = new Set(
  Array.from(
    "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà",
  ),
);
const extended = new Set(Array.from("^{}\\[~]|€\f"));
export function estimateSms(message: string) {
  const unicode = Array.from(message).some(
    (c) => !gsm.has(c) && !extended.has(c),
  );
  const length = unicode
    ? message.length
    : Array.from(message).reduce(
        (sum, c) => sum + (extended.has(c) ? 2 : 1),
        0,
      );
  const limit = unicode ? 70 : 160;
  return {
    encoding: unicode ? "Unicode" : "GSM-7",
    characters: Array.from(message).length,
    parts:
      length === 0
        ? 0
        : length <= limit
          ? 1
          : Math.ceil(length / (unicode ? 67 : 153)),
  };
}
export function filterRecipients(input: string[], suppressed: string[] = []) {
  const seen = new Set<string>();
  const blocked = new Set(suppressed);
  let invalid = 0,
    duplicates = 0,
    suppression = 0;
  const eligible: string[] = [];
  for (const raw of input) {
    const phone = normalizePhone(raw);
    if (!phone) {
      invalid++;
      continue;
    }
    if (seen.has(phone)) {
      duplicates++;
      continue;
    }
    seen.add(phone);
    if (blocked.has(phone)) {
      suppression++;
      continue;
    }
    eligible.push(phone);
  }
  return {
    eligible,
    invalid,
    duplicates,
    suppressed: suppression,
    total: input.length,
  };
}
