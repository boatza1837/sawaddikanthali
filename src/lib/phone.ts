export function normalizeContactPhone(input: string) {
  const phone = input.trim().replace(/[\s()-]/g, "");
  if (/^0\d{9}$/.test(phone)) return "+66" + phone.slice(1);
  if (/^\+[1-9]\d{7,14}$/.test(phone)) return phone;
  return null;
}
