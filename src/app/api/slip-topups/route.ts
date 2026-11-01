import { z } from "zod";
import { api, actor } from "@/lib/http";
import { ensure } from "@/lib/errors";
import { createSlipTopup, submitSlip } from "@/modules/slip-topups";

export const runtime = "nodejs";
export const maxDuration = 30;
export const POST = api(async req => {
  const user = await actor(req);
  const type = req.headers.get("content-type") ?? "";
  if (type.startsWith("application/json")) {
    const data = z.object({ amount: z.number().int().positive().max(1000000), key: z.string().uuid() }).strict().parse(await req.json());
    return createSlipTopup(user.id, data.amount, data.key);
  }
  ensure(type.startsWith("multipart/form-data"), "INVALID_INPUT", 400);
  // Enforce the limit before multipart parsing, including chunked requests.
  const reader = req.body?.getReader();
  ensure(reader, "INVALID_INPUT", 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 3 * 1024 * 1024 + 16384) { await reader.cancel(); ensure(false, "SLIP_FILE_TOO_LARGE", 413); }
    chunks.push(value);
  }
  const form = await new Response(Buffer.concat(chunks), { headers: { "Content-Type": type } }).formData();
  const intentId = z.string().min(1).max(100).parse(form.get("intentId"));
  const file = form.get("file");
  ensure(file instanceof File, "SLIP_FILE_TYPE", 400);
  return submitSlip(user.id, intentId, file);
});
