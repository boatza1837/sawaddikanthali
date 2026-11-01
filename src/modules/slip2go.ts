import { z } from "zod";
import { ensure } from "@/lib/errors";
import { satang } from "@/lib/money";

export function slipConfig() {
  const secret = process.env.SLIP2GO_SECRET_KEY;
  const bank = process.env.TOPUP_BANK_CODE;
  const account = process.env.TOPUP_BANK_ACCOUNT;
  const name = process.env.TOPUP_ACCOUNT_NAME;
  const promptpay = process.env.TOPUP_PROMPTPAY;
  if (process.env.PAYMENT_MODE !== "slip2go" || !secret || !bank || !/^\d{3}$/.test(bank) || !account || !/^\d{8,15}$/.test(account) || !name || !promptpay || !/^(?:0\d{9}|\d{13})$/.test(promptpay)) return null;
  return { secret, bank, account, name, promptpay };
}

const accountSchema = z.object({ name: z.string(), bank: z.object({ account: z.string() }).nullish(), proxy: z.object({ type: z.string().nullish(), account: z.string() }).nullish() });
const responseSchema = z.object({ code: z.string(), data: z.object({ transRef: z.string().min(1).max(150), amount: z.number().positive().max(10000), dateTime: z.string().datetime({ offset: true }), sender: z.object({ bank: z.object({ id: z.string().regex(/^\d{3}$/) }) }), receiver: z.object({ account: accountSchema, bank: z.object({ id: z.string() }) }) }) });

// Masked digits must match their exact positions; suffix-only matching is insufficient.
export function maskedAccountMatches(masked: string | undefined, full: string) {
  if (!masked) return false;
  const normalized = masked.replace(/[\s-]/g, "").replace(/[X*•]/g, "x");
  if (!/^[\dx]+$/.test(normalized) || normalized.length !== full.length) return false;
  const visible = normalized.replace(/x/g, "");
  return visible.length >= 4 && [...normalized].every((char, i) => char === "x" || char === full[i]);
}
const normalizedName = (name: string) => name.normalize("NFKC").replace(/\s/g, "").toLowerCase();

export function validateSlip(raw: unknown, config: NonNullable<ReturnType<typeof slipConfig>>, amount: number, createdAt: Date, expiresAt: Date, now = new Date()) {
  const parsed = responseSchema.safeParse(raw);
  ensure(parsed.success, "SLIP_UNVERIFIED", 409);
  const { code, data } = parsed.data;
  // Only an explicitly validated response is accepted when receiver conditions were sent.
  ensure(code === "200200", "SLIP_UNVERIFIED", 409);
  ensure(satang(String(data.amount)) === amount, "SLIP_AMOUNT_MISMATCH", 409);
  const paidAt = new Date(data.dateTime);
  ensure(paidAt >= createdAt && paidAt <= expiresAt && paidAt <= now, "SLIP_DATE_MISMATCH", 409);
  const receiver = data.receiver;
  const bankMatch = receiver.bank.id === config.bank && maskedAccountMatches(receiver.account.bank?.account, config.account);
  const proxyMatch = receiver.bank.id === config.bank && receiver.account.proxy?.type === (config.promptpay.length === 13 ? "NATID" : "MSISDN") && maskedAccountMatches(receiver.account.proxy.account, config.promptpay);
  ensure((bankMatch || proxyMatch) && normalizedName(receiver.account.name) === normalizedName(config.name), "SLIP_RECEIVER_MISMATCH", 409);
  return { paymentRef: `bank:${data.sender.bank.id}:${data.transRef}`, paidAt };
}

export async function verifySlip(file: File, config: NonNullable<ReturnType<typeof slipConfig>>, amount: number, createdAt: Date) {
  const form = new FormData();
  form.set("file", file);
  const receiverName = /[\u0E00-\u0E7F]/.test(config.name) ? { accountNameTH: config.name } : { accountNameEN: config.name };
  form.set("payload", JSON.stringify({
    // Our database deduplicates bank references globally. Provider-side marking can
    // strand a paid member after a network timeout; repeat calls still cannot credit twice.
    checkDuplicate: false,
    checkReceiver: [
      { accountType: `01${config.bank}`, accountNumber: config.account, ...receiverName },
      { ...(config.promptpay.length === 10 ? { accountType: "02001" } : {}), accountNumber: config.promptpay, ...receiverName },
    ],
    checkAmount: { type: "eq", amount: (amount / 100).toFixed(2) },
    checkDate: { type: "gte", date: createdAt.toISOString() },
  }));
  // Credentials are sent only to the provider's fixed HTTPS host, never an uploaded URL.
  const response = await fetch("https://connect.slip2go.com/api/verify-slip/qr-image/info", { method: "POST", headers: { Authorization: `Bearer ${config.secret}` }, body: form, signal: AbortSignal.timeout(20000), redirect: "error", cache: "no-store" });
  ensure(response.ok, "SLIP_PROVIDER_UNAVAILABLE", 503);
  return response.json() as Promise<unknown>;
}
