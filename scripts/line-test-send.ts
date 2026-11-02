import dotenv from "dotenv";
import {randomUUID} from "node:crypto";
import {readFileSync,writeFileSync} from "node:fs";
dotenv.config({path:".env.line-test.local",quiet:true});
const token=process.env.LINE_TEST_CHANNEL_ACCESS_TOKEN;
const recipient=process.env.LINE_TEST_USER_ID;
const run=process.argv[2];
const fixture=process.argv.includes("--amounts")?JSON.parse(readFileSync(".cache/line-amount-fixture.json","utf8")):null;
const records: Array<{number:number;code:string;amount:number}>=fixture?.records??[];
if(fixture&&(fixture.run!==run||records.length!==111||records.some(x=>!Number.isInteger(x.amount)||x.amount<=0||!/^[A-F0-9]{12}$/.test(x.code))))throw Error("INVALID_TEST_FIXTURE");
const count=fixture?111:50;
if(!token||!recipient||!run||!/^[a-zA-Z0-9-]{1,40}$/.test(run))throw Error("Test token, own user ID and run ID required");
const headers={Authorization:`Bearer ${token}`,"Content-Type":"application/json"};
async function read(path:string){const r=await fetch(`https://api.line.me${path}`,{headers});if(!r.ok)throw Error(`LINE_READ_${r.status}`);return r.json();}
// Fail closed if someone accidentally supplies a production bot credential.
const info=await read("/v2/bot/info");
if(info.basicId!=="@642afwey"||info.displayName!=="Canteen Test Bot")throw Error("WRONG_TEST_BOT");
const quota=await read("/v2/bot/message/quota");const used=await read("/v2/bot/message/quota/consumption");
if(quota.type!=="limited"||quota.value-used.totalUsage<count)throw Error("INSUFFICIENT_FREE_QUOTA");
const start=Date.now();
const results=await Promise.all(Array.from({length:count},async(_,i)=>{
 const text=fixture?`CANTEEN_TEST ${run} ${String(i+1).padStart(3,"0")}/111 CODE=${records[i].code} AMOUNT=${(records[i].amount/100).toFixed(2)}`:`CANTEEN_TEST ${run} ${String(i+1).padStart(2,"0")}/50 — test only; no payment`;
 const r=await fetch("https://api.line.me/v2/bot/message/push",{method:"POST",headers:{...headers,"X-Line-Retry-Key":randomUUID()},body:JSON.stringify({to:recipient,messages:[{type:"text",text}]}),signal:AbortSignal.timeout(15000)});
 return {number:i+1,status:r.status};
}));
const report={run,expected:count,accepted:results.filter(x=>x.status===200).length,elapsedMs:Date.now()-start,results,financialEffect:"NONE"};
writeFileSync(`.cache/line-send-${run}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
