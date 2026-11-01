import { ensure } from "./errors";
export const MAX_AMOUNT = 1_000_000;
export function satang(text: string) {
  ensure(/^\d{1,5}(\.\d{1,2})?$/.test(text), "INVALID_AMOUNT");
  const [baht, fraction = ""] = text.split(".");
  const result = Number(baht) * 100 + Number(fraction.padEnd(2, "0"));
  ensure(
    Number.isSafeInteger(result) && result > 0 && result <= MAX_AMOUNT,
    "INVALID_AMOUNT",
  );
  return result;
}
export function money(value: number) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
  }).format(value / 100);
}
