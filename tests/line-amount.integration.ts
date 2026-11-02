import "dotenv/config";
import {afterAll,describe,it,expect,vi} from "vitest";
import {randomUUID} from "node:crypto";
import {readFileSync,writeFileSync} from "node:fs";
vi.mock("@upstash/redis",()=>({Redis:class{get(){return Promise.resolve({status:"ONLINE",at:Date.now(),version:2})}}}));
vi.mock("../src/lib/redis",()=>({redisConnection:()=>({url:"https://unused.invalid",token:"test"})}));
import {db} from "../src/lib/db";
import {createConnext,acceptConnext,drainConnext} from "../src/modules/connext";
type Record={number:number;code:string;amount:number;id:string;userId:string};
const suite=process.env.RUN_LINE_AMOUNT_TEST==="1"?describe:describe.skip;
suite("111 local topups matched to captured LINE codes and decimal amounts",()=>{
 afterAll(async()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();await db.$disconnect();});
 it("prepares or settles isolated fixtures without external payment/email calls",async()=>{
  const url=new URL(process.env.DATABASE_URL??"http://invalid");if(!["localhost","127.0.0.1"].includes(url.hostname)||url.pathname!=="/canteen_loadtest")throw Error("DEDICATED_LOCAL_DATABASE_REQUIRED");
  vi.stubGlobal("fetch",()=>{throw Error("EXTERNAL_NETWORK_BLOCKED")});
  for(const [k,v] of Object.entries({PAYMENT_MODE:"slip2go",SLIP2GO_SECRET_KEY:"fake-test-only",TOPUP_BANK_CODE:"006",TOPUP_BANK_ACCOUNT:"1234568619",TOPUP_ACCOUNT_NAME:"Test",TOPUP_PROMPTPAY:"0812345678",BREVO_API_KEY:"",RESEND_API_KEY:""}))vi.stubEnv(k,v);
  if(process.env.LINE_AMOUNT_PHASE!=="settle"){
   const run="amount-"+randomUUID().slice(0,8);const ids=Array.from({length:111},()=>randomUUID());
   await db.user.createMany({data:ids.map(id=>({id,email:`line-${id}@example.test`,status:"ACTIVE"}))});await db.wallet.createMany({data:ids.map(userId=>({userId}))});
   await db.auditLog.create({data:{actorId:"local-test",action:"TOPUP_MODE_CHANGED",targetId:run,detail:"connext"}});
   const start=Date.now();const intents=await Promise.all(ids.map(id=>createConnext(id,5000,randomUUID())));
   expect(intents.map(x=>x.amount).sort((a,b)=>b-a)).toEqual([...Array.from({length:99},(_,i)=>5099-i),...Array.from({length:12},(_,i)=>4999-i)]);
   const records:Record[]=intents.map((x,i)=>({number:i+1,code:randomUUID().replaceAll("-","").slice(0,12).toUpperCase(),amount:x.amount,id:x.id,userId:ids[i]}));
   writeFileSync(".cache/line-amount-fixture.json",JSON.stringify({run,records,createMs:Date.now()-start,scope:"LOCAL_TEST_DATABASE_ONLY"},null,2));
   console.log("PREPARED",JSON.stringify({run,count:111,uniqueAmounts:new Set(records.map(x=>x.amount)).size}));return;
  }
  const fixture=JSON.parse(readFileSync(".cache/line-amount-fixture.json","utf8")) as {run:string;records:Record[]};
  const captured=JSON.parse(readFileSync(`.cache/line-test-${fixture.run}.json`,"utf8")) as {run:string;captured:number;records:{number:number;code:string;amountText:string}[];conflicts:number[]};
  expect(captured.run).toBe(fixture.run);expect(captured.captured).toBe(111);expect(captured.conflicts).toHaveLength(0);expect(captured.records).toHaveLength(111);
  const values=new Map(captured.records.map(x=>[x.number,x]));
  for(const expected of fixture.records){const actual=values.get(expected.number)!;expect(actual.code).toBe(expected.code);expect(actual.amountText).toBe((expected.amount/100).toFixed(2));}
  const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Bangkok",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:false}).formatToParts(new Date());const p=(t:string)=>parts.find(x=>x.type===t)!.value;
  const texts=captured.records.map(x=>`เงินเข้า: ${x.amountText} บาท เข้าบัญชี XX8619 เมื่อ ${p("day")}/${p("month")}/${String(Number(p("year"))+543).slice(-2)} ${p("hour")}:${p("minute")} ยอดเงินที่ใช้ได้ ${(100000+x.number).toFixed(2)} บาท`);
  // Bank notifications are simulated from the captured bot payload, in local DB only.
  await Promise.all(texts.flatMap(text=>[acceptConnext(text),acceptConnext(text)]));
  for(let i=0;i<10;i++){await drainConnext(111);if(await db.topupIntent.count({where:{id:{in:fixture.records.map(x=>x.id)},status:"PENDING"}})===0)break;}
  const intents=await db.topupIntent.findMany({where:{id:{in:fixture.records.map(x=>x.id)}},include:{wallet:true}});
  for(const item of intents){expect(item.status).toBe("PAID");expect(item.wallet.balance).toBe(item.amount);expect(await db.ledgerTransaction.count({where:{reference:item.id}})).toBe(1);}
  const total=intents.reduce((s,x)=>s+x.wallet.balance,0);const expected=fixture.records.reduce((s,x)=>s+x.amount,0);expect(total).toBe(expected);
  const report={run:fixture.run,count:111,codesMatched:111,amountsMatched:111,paid:intents.length,expectedSatang:expected,actualSatang:total,duplicateDeliveries:222,realWalletEffect:"NONE",scope:"SIMULATED_BANK_EVENTS_IN_LOCAL_TEST_DB"};
  writeFileSync(".cache/line-amount-result.json",JSON.stringify(report,null,2));console.log("VERIFIED",JSON.stringify(report));
 },60000);
});
