import { afterEach, describe, expect, it, vi } from "vitest";
import { maskedAccountMatches, slipConfig, validateSlip, verifySlip } from "../src/modules/slip2go";

const config = { secret: "test-only-secret", bank: "014", account: "1234567890", name: "นาย ทดสอบ ระบบ", promptpay: "0812345678" };
const created = new Date("2026-11-01T00:00:00Z");
const expires = new Date("2026-11-01T00:30:00Z");
function result() { return { code:"200200", data:{transRef:"bank-reference",amount:100,dateTime:"2026-11-01T00:01:00Z",sender:{bank:{id:"004"}},receiver:{bank:{id:"014"},account:{name:config.name,bank:{account:"xxx-x-xx7890"}}}}}; }
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
describe("Slip2Go financial trust boundary",()=>{
  it("stays disabled without complete server configuration",()=>{vi.stubEnv("PAYMENT_MODE","slip2go");vi.stubEnv("SLIP2GO_SECRET_KEY","");expect(slipConfig()).toBeNull();});
  it("matches masked positions and requires at least four visible digits",()=>{expect(maskedAccountMatches("xxx-x-xx7890",config.account)).toBe(true);expect(maskedAccountMatches("xx7890",config.account)).toBe(false);expect(maskedAccountMatches("xxx-x-xx7891",config.account)).toBe(false);expect(maskedAccountMatches("xxxxxxxx90",config.account)).toBe(false);});
  it("accepts only verified exact amount, receiver and time",()=>{expect(validateSlip(result(),config,10000,created,expires,expires).paymentRef).toBe("bank:004:bank-reference");});
  it("supports masked national-ID PromptPay only at the configured receiving bank",()=>{
    const raw={code:"200200",data:{...result().data,receiver:{bank:{id:"014"},account:{name:config.name,bank:null,proxy:{type:"NATID",account:"x-xxxx-xxxxx-456"}}}}};
    const idConfig={...config,promptpay:"1234567890456"};
    // Too few visible digits must fail closed even for a legitimate-looking proxy.
    expect(()=>validateSlip(raw,idConfig,10000,created,expires,expires)).toThrow("SLIP_RECEIVER_MISMATCH");
    raw.data.receiver.account.proxy.account="x-xxxx-xxxx0456";
    expect(validateSlip(raw,idConfig,10000,created,expires,expires).paymentRef).toBe("bank:004:bank-reference");
  });
  it.each(["200000","200501","200401","200402","200403","200202"])("rejects code %s even if it includes transaction data",code=>{const r=result();r.code=code;expect(()=>validateSlip(r,config,10000,created,expires,expires)).toThrow("SLIP_UNVERIFIED");});
  it("rejects amount mismatches, stale slips, future transfers and wrong receivers",()=>{
    expect(()=>validateSlip(result(),config,20000,created,expires,expires)).toThrow("SLIP_AMOUNT_MISMATCH");
    const old=result();old.data.dateTime="2026-10-31T23:59:59Z";expect(()=>validateSlip(old,config,10000,created,expires,expires)).toThrow("SLIP_DATE_MISMATCH");
    const future=result();future.data.dateTime="2026-11-01T00:31:00Z";expect(()=>validateSlip(future,config,10000,created,expires,expires)).toThrow("SLIP_DATE_MISMATCH");
    const wrong=result();wrong.data.receiver.bank.id="004";expect(()=>validateSlip(wrong,config,10000,created,expires,expires)).toThrow("SLIP_RECEIVER_MISMATCH");
    const name=result();name.data.receiver.account.name="คนอื่น";expect(()=>validateSlip(name,config,10000,created,expires,expires)).toThrow("SLIP_RECEIVER_MISMATCH");
  });
  it("sends only a server-authenticated image request with exact conditions, without retries",async()=>{
    const fetcher=vi.fn().mockResolvedValue(Response.json(result()));vi.stubGlobal("fetch",fetcher);
    await verifySlip(new File(["not-a-real-slip"],"test.png",{type:"image/png"}),config,10000,created);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url,options]=fetcher.mock.calls[0];expect(url).toBe("https://connect.slip2go.com/api/verify-slip/qr-image/info");expect(options.redirect).toBe("error");expect(options.headers.Authorization).toBe("Bearer test-only-secret");
    const payload=JSON.parse(options.body.get("payload"));expect(payload.checkReceiver).toHaveLength(2);expect(payload.checkAmount).toEqual({type:"eq",amount:"100.00"});
  });
});
