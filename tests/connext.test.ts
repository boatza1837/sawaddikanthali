import {describe,it,expect} from "vitest";
import {parseConnext} from "../src/modules/connext";
describe("Connext notification parser",()=>{
 const text="เงินเข้า: 1.00 บาท เข้าบัญชี XX8619 เมื่อ 02/11/69 11:47 ยอดเงินที่ใช้ได้ 9,509.42 บาท";
 it("uses transfer amount rather than available balance",()=>{const result=parseConnext(text);expect(result.amount).toBe(100);expect(result.account).toBe("8619");expect(result.paidAt.toISOString()).toBe("2026-11-02T04:47:00.000Z");});
 it("deduplicates equivalent notifications",()=>expect(parseConnext(text).event).toBe(parseConnext(text).event));
 it.each(["เงินออก: 1.00 บาท", "เงินเข้า: 1.00 บาท เข้าบัญชี X...",text.replace("1.00","NaN")])("rejects incomplete and outgoing events",value=>expect(()=>parseConnext(value)).toThrow());
});
