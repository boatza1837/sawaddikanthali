import { expect, it } from "vitest";
import { normalizeContactPhone } from "@/lib/phone";
it("normalizes Thai contact numbers and rejects malformed input", () => {
 expect(normalizeContactPhone("0812345678")).toBe("+66812345678");
 expect(normalizeContactPhone("081-234-5678")).toBe("+66812345678");
 expect(normalizeContactPhone("+66812345678")).toBe("+66812345678");
 expect(normalizeContactPhone("08123")).toBeNull();
 expect(normalizeContactPhone("abcdefghij")).toBeNull();
});
