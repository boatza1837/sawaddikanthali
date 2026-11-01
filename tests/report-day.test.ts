import { expect, it } from "vitest";
import { bangkokToday, bangkokDayBounds } from "@/lib/report-day";
it("uses Thai calendar days and excludes the next midnight",()=>{
 const range=bangkokDayBounds("2026-11-01")!;
 expect(range.gte.toISOString()).toBe("2026-10-31T17:00:00.000Z");
 expect(range.lt.toISOString()).toBe("2026-11-01T17:00:00.000Z");
 expect(bangkokToday(new Date("2026-11-01T17:00:00Z"))).toBe("2026-11-02");
 expect(bangkokDayBounds("2026-02-30")).toBeNull();
 expect(bangkokDayBounds("invalid")).toBeNull();
});
