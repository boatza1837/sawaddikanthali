import "dotenv/config";
import {afterAll,beforeAll,describe,it,expect,vi} from "vitest";
const cache=vi.hoisted(()=>new Map<string,unknown>());
vi.mock("@upstash/redis",()=>({Redis:class{async get(k:string){return cache.get(k)}async eval(_script:string,keys:string[],args:string[]){const next=JSON.parse(args[0]);const old=cache.get(keys[0]) as {at?:number}|undefined;if((old?.at??0)<=next.at)cache.set(keys[0],next);return 1;}}}));
vi.mock("../src/lib/redis",()=>({redisConnection:()=>({url:"https://unused.invalid",token:"fake"})}));
import {db} from "../src/lib/db";
import {reportAgentHealth,checkAgentHealth,flushHealthAlerts} from "../src/modules/connext-health";
import {listenerOnline} from "../src/modules/connext";
const suite=process.env.RUN_DB_TESTS==="1"?describe:describe.skip;
suite("receiver watchdog in isolated DB, all LINE sends mocked",()=>{
 const send=vi.fn();
 beforeAll(async()=>{
  const url=new URL(process.env.DATABASE_URL??"http://invalid");if(!["localhost","127.0.0.1"].includes(url.hostname)||url.pathname!=="/canteen_test")throw Error("DEDICATED_TEST_DB_REQUIRED");
  vi.stubEnv("MONITOR_LINE_TOKEN","fake");vi.stubEnv("MONITOR_LINE_USER_ID","fake");vi.stubGlobal("fetch",send);
  send.mockResolvedValue(new Response(null,{status:200}));
  await db.connextAlert.deleteMany();await db.connextHealth.deleteMany();
 });
 afterAll(async()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();await db.$disconnect();});
 it("alerts on transitions, not each heartbeat, and fails closed on bad health",async()=>{
  await reportAgentHealth("ONLINE",Date.now()-2000);expect(await listenerOnline()).toBe(true);expect(send).toHaveBeenCalledTimes(1);
  await reportAgentHealth("ONLINE",Date.now()-1000);expect(send).toHaveBeenCalledTimes(1);
  await reportAgentHealth("LINE_STOPPED",Date.now());expect(await listenerOnline()).toBe(false);expect(send).toHaveBeenCalledTimes(2);
  await reportAgentHealth("LINE_STOPPED",Date.now()+1);expect(send).toHaveBeenCalledTimes(2);
 });
 it("a stopped receiver is detected without desktop requests; recovery notifies once",async()=>{
  await reportAgentHealth("ONLINE",Date.now()+2);expect(send).toHaveBeenCalledTimes(1);
  await db.connextHealth.update({where:{id:"primary"},data:{lastHeartbeat:new Date(Date.now()-70000)}});
  const state=await checkAgentHealth();expect(state.status).toBe("OFFLINE");expect(state.reason).toBe("AGENT_TIMEOUT");expect(send).toHaveBeenCalledTimes(2);
  await checkAgentHealth();expect(send).toHaveBeenCalledTimes(2);
  await reportAgentHealth("ONLINE",Date.now()+3);expect(send).toHaveBeenCalledTimes(3);
 });
 it("persists failed alerts and retries with the same LINE retry key",async()=>{
  send.mockRejectedValueOnce(Error("NETWORK_ERROR"));
  await reportAgentHealth("NOTIFICATIONS_DENIED",Date.now()+4);
  const pending=await db.connextAlert.findFirstOrThrow({where:{status:"PENDING"}});expect(pending.attempts).toBe(1);expect(await listenerOnline()).toBe(false);
  const firstHeaders=send.mock.calls.at(-1)![1].headers;
  await db.connextAlert.update({where:{id:pending.id},data:{availableAt:new Date(0)}});await flushHealthAlerts();
  expect(send.mock.calls.at(-1)![1].headers["X-Line-Retry-Key"]).toBe(firstHeaders["X-Line-Retry-Key"]);
  expect((await db.connextAlert.findUniqueOrThrow({where:{id:pending.id}})).status).toBe("SENT");
 });
 it("rejects legacy alive flags, stale availability and unknown reports",async()=>{
  cache.set("canteen:connext:health",true);expect(await listenerOnline()).toBe(false);
  cache.set("canteen:connext:health",{version:2,status:"ONLINE",at:Date.now()-46000});expect(await listenerOnline()).toBe(false);
  await reportAgentHealth("UNKNOWN",Date.now()+5);expect(await listenerOnline()).toBe(false);
 });
});
