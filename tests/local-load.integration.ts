import "dotenv/config";
import {afterAll,describe,it,vi,expect} from "vitest";
import {createServer} from "node:http";
import {performance} from "node:perf_hooks";
import {randomUUID} from "node:crypto";
import {mkdirSync,writeFileSync} from "node:fs";
vi.mock("@upstash/redis",()=>({Redis:class{get(){return Promise.resolve({status:"ONLINE",at:Date.now(),version:2})}}}));
vi.mock("../src/lib/redis",()=>({redisConnection:()=>({url:"https://unused.invalid",token:"test"})}));
import {db} from "../src/lib/db";
import {createConnext,acceptConnext,drainConnext} from "../src/modules/connext";
const suite=process.env.RUN_LOAD_TESTS==="1"?describe:describe.skip;
suite("local isolated HTTP/service load benchmark",()=>{
 afterAll(async()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();await db.$disconnect();});
 it("benchmarks 100/250/500 concurrency and 50 simultaneous topups",async()=>{
  const url=new URL(process.env.DATABASE_URL??"http://invalid");
  if(!["localhost","127.0.0.1"].includes(url.hostname)||url.pathname!=="/canteen_loadtest")throw Error("Only localhost/canteen_loadtest permitted");
  const nativeFetch=globalThis.fetch;
  // Hard outbound block: even an accidental email/provider request fails locally.
  vi.stubGlobal("fetch",(input:RequestInfo|URL,init?:RequestInit)=>{const target=new URL(input instanceof Request?input.url:String(input));if(target.hostname!=="127.0.0.1")throw Error("EXTERNAL_NETWORK_BLOCKED");return nativeFetch(input,init);});
  for(const [key,value] of Object.entries({PAYMENT_MODE:"slip2go",SLIP2GO_SECRET_KEY:"fake-local-only",TOPUP_BANK_CODE:"006",TOPUP_BANK_ACCOUNT:"1234568619",TOPUP_ACCOUNT_NAME:"Local load test",TOPUP_PROMPTPAY:"0812345678",EMAIL_PROVIDER:"disabled",BREVO_API_KEY:"",RESEND_API_KEY:""}))vi.stubEnv(key,value);
  const users=Array.from({length:500},()=>randomUUID());
  await db.user.createMany({data:users.map(id=>({id,status:"ACTIVE",email:`load-${id}@example.test`}))});
  await db.wallet.createMany({data:users.map(userId=>({id:randomUUID(),userId}))});
  await db.auditLog.create({data:{actorId:"load-test",action:"TOPUP_MODE_CHANGED",targetId:"test",detail:"connext"}});
  const server=createServer(async(req,res)=>{
   try{
    const path=new URL(req.url!,"http://localhost");let data:unknown;
    if(path.pathname==="/wallet")data=await db.wallet.findUnique({where:{userId:path.searchParams.get("user")!},include:{entries:{take:30,orderBy:{transaction:{createdAt:"desc"}},include:{transaction:true}}}});
    else {let body="";for await(const chunk of req)body+=chunk;const input=JSON.parse(body);if(path.pathname==="/topup")data=await createConnext(input.userId,input.amount,input.key);else if(path.pathname==="/notification")data=await acceptConnext(input.text);else throw Error("NOT_FOUND");}
    res.setHeader("Content-Type","application/json");res.end(JSON.stringify(data));
   }catch(e){res.statusCode=503;res.setHeader("Content-Type","application/json");const problem=e as Error&{code?:string};res.end(JSON.stringify({error:`${problem.code??problem.name}: ${problem.message}`}));}
  });
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  const address=server.address() as {port:number};const origin=`http://127.0.0.1:${address.port}`;
  async function request(path:string,body?:unknown){const start=performance.now();try{const r=await fetch(origin+path,body?{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)}:{signal:AbortSignal.timeout(30000)});return {ok:r.ok,ms:performance.now()-start,data:await r.json()};}catch(e){return {ok:false,ms:performance.now()-start,data:{error:String(e)}};}}
  function stats(samples:{ok:boolean;ms:number;data?:{error?:string}}[],elapsed:number){const times=samples.map(x=>x.ms).sort((a,b)=>a-b);const pct=(p:number)=>Math.round(times[Math.min(times.length-1,Math.floor(times.length*p))]??0);const errors:Record<string,number>={};for(const r of samples.filter(x=>!x.ok)){const key=(r.data?.error??"error").slice(0,160);errors[key]=(errors[key]??0)+1;}return {requests:samples.length,successful:samples.filter(x=>x.ok).length,failed:samples.filter(x=>!x.ok).length,rps:Number((samples.length/(elapsed/1000)).toFixed(1)),p50ms:pct(.5),p95ms:pct(.95),p99ms:pct(.99),maxms:Math.round(times.at(-1)??0),errors};}
  const report:Record<string,unknown>={date:new Date().toISOString(),scope:"Local HTTP harness calling actual Prisma/services; excludes Next rendering, authentication, external Redis, real LINE throughput and production hosting.",externalNetwork:"blocked; no Slip2Go/Brevo requests",walletStages:[]};
  try{
   for(let i=0;i<20;i++)await request(`/wallet?user=${users[i]}`);
   for(const concurrency of (process.env.LOAD_WALLET_STAGES==="0"?[]:[100,250,500])){
    const samples:Awaited<ReturnType<typeof request>>[]=[];const start=performance.now();const until=start+8000;
    await Promise.all(Array.from({length:concurrency},async(_,i)=>{while(performance.now()<until)samples.push(await request(`/wallet?user=${users[i]}`));}));
    const result={concurrency,...stats(samples,performance.now()-start)};(report.walletStages as unknown[]).push(result);console.log("WALLET_STAGE",JSON.stringify(result));
   }
   const requested=(100+Math.floor(Math.random()*10000))*100;
   const start=performance.now();const created=await Promise.all(users.slice(0,50).map(userId=>request("/topup",{userId,amount:requested,key:randomUUID()})));
   report.topupCreation={concurrency:50,...stats(created,performance.now()-start),uniqueAmounts:new Set(created.filter(x=>x.ok).map(x=>x.data.amount)).size};console.log("TOPUP_CREATION",JSON.stringify(report.topupCreation));
   const intents=created.filter(x=>x.ok).map(x=>x.data);
   const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Bangkok",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:false}).formatToParts(new Date());const part=(type:string)=>parts.find(p=>p.type===type)!.value;
   const texts=intents.map((intent,i)=>`เงินเข้า: ${(intent.amount/100).toFixed(2)} บาท เข้าบัญชี XX8619 เมื่อ ${part("day")}/${part("month")}/${String(Number(part("year"))+543).slice(-2)} ${part("hour")}:${part("minute")} ยอดเงินที่ใช้ได้ ${(1000+i).toFixed(2)} บาท`);
   const notifyStart=performance.now();const notifications=await Promise.all(texts.flatMap(text=>[request("/notification",{text}),request("/notification",{text})]));
   report.notificationBurst={uniqueTransfers:texts.length,deliveryCopies:2,...stats(notifications,performance.now()-notifyStart)};console.log("NOTIFICATION_BURST",JSON.stringify(report.notificationBurst));
   // Redelivery models retry after an overload; preserve exactly the same event.
   const recoveryStart=performance.now();const recovered=[];for(const text of texts)recovered.push(await request("/notification",{text}));report.redelivery=stats(recovered,performance.now()-recoveryStart);
   // Independently isolate a burst of 50 already-created topups. Fixture creation
   // avoids the creation bottleneck; settlement still uses the actual service.
   const fixtureBase=15000000+Math.floor(Math.random()*10000)*100;
   const fixtureRows=await db.wallet.findMany({where:{userId:{in:users.slice(50,100)}}});
   const fixtureIntents=fixtureRows.map((wallet,i)=>({id:randomUUID(),key:`load:${randomUUID()}`,walletId:wallet.id,amount:fixtureBase%900000+i+1,provider:"connext",expiresAt:new Date(Date.now()+900000)}));
   await db.topupIntent.createMany({data:fixtureIntents});
   const fixtureTexts=fixtureIntents.map((intent,i)=>`เงินเข้า: ${(intent.amount/100).toFixed(2)} บาท เข้าบัญชี XX8619 เมื่อ ${part("day")}/${part("month")}/${String(Number(part("year"))+543).slice(-2)} ${part("hour")}:${part("minute")} ยอดเงินที่ใช้ได้ ${(5000+i).toFixed(2)} บาท`);
   const fixtureStart=performance.now();const fixtureResults=await Promise.all(fixtureTexts.flatMap(text=>[request("/notification",{text}),request("/notification",{text})]));
   report.fiftyTransferBurst={uniqueTransfers:50,deliveryCopies:2,...stats(fixtureResults,performance.now()-fixtureStart)};console.log("FIFTY_TRANSFER_BURST",JSON.stringify(report.fiftyTransferBurst));
   const settleStart=performance.now();
   for(let batch=0;batch<20;batch++){await drainConnext(100);if(await db.topupIntent.count({where:{id:{in:[...intents,...fixtureIntents].map(x=>x.id)},status:"PENDING"}})===0)break;}
   report.queueSettlementMs=Math.round(performance.now()-settleStart);
   const fixtureRetryStart=performance.now();const fixtureRecovered=[];for(const text of fixtureTexts)fixtureRecovered.push(await request("/notification",{text}));report.fiftyTransferRedelivery=stats(fixtureRecovered,performance.now()-fixtureRetryStart);
   await drainConnext(100);
   const paid=await db.topupIntent.findMany({where:{wallet:{userId:{in:users}},status:"PAID"}});
   const balances=await db.wallet.aggregate({where:{userId:{in:users}},_sum:{balance:true}});
   const ledgerCount=await db.ledgerTransaction.count({where:{reference:{in:paid.map(x=>x.id)},kind:"TOPUP"}});
   const expected=paid.reduce((sum,x)=>sum+x.amount,0);
   report.financialIntegrity={created:intents.length+50,paid:paid.length,ledgerCount,expectedSatang:expected,actualSatang:balances._sum.balance,pass:paid.length===intents.length+50&&ledgerCount===paid.length&&balances._sum.balance===expected};
   report.processMaxRssKb=process.resourceUsage().maxRSS;
   mkdirSync(".cache",{recursive:true});writeFileSync(".cache/load-test-queue-report.json",JSON.stringify(report,null,2));console.log("REPORT",JSON.stringify(report.financialIntegrity));
   expect(created.filter(x=>x.ok)).toHaveLength(50);expect(new Set(intents.map(x=>x.amount)).size).toBe(50);
   expect(notifications.every(x=>x.ok)&&fixtureResults.every(x=>x.ok)).toBe(true);
   expect((report.financialIntegrity as {pass:boolean}).pass).toBe(true);
  }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
 },180000);
});
