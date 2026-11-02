import {Redis} from "@upstash/redis";
import {db} from "@/lib/db";
import {redisConnection} from "@/lib/redis";

export type AgentHealth="ONLINE"|"LINE_STOPPED"|"NOTIFICATIONS_DENIED"|"UNKNOWN";
const reasons:Record<string,string>={LINE_STOPPED:"แอป LINE ปิดอยู่",NOTIFICATIONS_DENIED:"ตัวรับไม่มีสิทธิ์อ่านแจ้งเตือน",UNKNOWN:"ตรวจสถานะตัวรับไม่ได้",AGENT_TIMEOUT:"ตัวรับขาดการเชื่อมต่อหรือเครื่องหยุดทำงาน"};

async function updateHealth(heartbeat?:{reason:AgentHealth;at:number}){
 return db.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(917124)`;
  const prior=await tx.connextHealth.findUnique({where:{id:"primary"}});
  if(heartbeat&&prior?.lastHeartbeat&&prior.lastHeartbeat.getTime()>=heartbeat.at)return prior;
  const reason=heartbeat?.reason??(prior?.lastHeartbeat&&Date.now()-prior.lastHeartbeat.getTime()<60000?prior.reason:"AGENT_TIMEOUT");
  const status=reason==="ONLINE"?"ONLINE":"OFFLINE";
  const changed=!prior||prior.status!==status;
  const lastHeartbeat=heartbeat?new Date(heartbeat.at):prior?.lastHeartbeat??null;
  const state=await tx.connextHealth.upsert({where:{id:"primary"},create:{id:"primary",status,reason,lastHeartbeat},update:{status,reason,lastHeartbeat,...(changed?{changedAt:new Date()}: {})}});
  if(changed){
   const text=status==="ONLINE"?`Smart Canteen: ${prior?"ตัวรับกลับมาออนไลน์แล้ว":"เปิดเฝ้าระวังตัวรับแล้ว"}\nแอป LINE เปิดอยู่และอ่านแจ้งเตือนได้ กลับมาใช้ระบบเติมอัตโนมัติได้\nหมายเหตุ: ยังไม่ได้ตรวจสถานะล็อกอิน LINE`:`Smart Canteen: ระบบรับแจ้งเตือนขัดข้อง\n${reasons[reason]??reasons.UNKNOWN}\nหยุดสร้าง QR แบบเติมอัตโนมัติแล้ว ใช้ Slip2Go ตรวจสลิปสำรอง\nถ้าโอนแล้ว ห้ามโอนซ้ำ ให้อัปโหลดสลิปในรายการเดิม`;
   await tx.connextAlert.create({data:{text}});
  }
  return state;
 },{isolationLevel:"ReadCommitted",timeout:10000});
}

export async function flushHealthAlerts(){
 const token=process.env.MONITOR_LINE_TOKEN;const recipient=process.env.MONITOR_LINE_USER_ID;
 if(!token||!recipient)return {configured:false};
 for(let i=0;i<2;i++){
  const alert=await db.connextAlert.findFirst({where:{status:"PENDING",availableAt:{lte:new Date()}},orderBy:{createdAt:"asc"}});if(!alert)break;
  const claimed=await db.connextAlert.updateMany({where:{id:alert.id,status:"PENDING",availableAt:{lte:new Date()}},data:{availableAt:new Date(Date.now()+60000),attempts:{increment:1}}});if(!claimed.count)continue;
  try{
   const r=await fetch("https://api.line.me/v2/bot/message/push",{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json","X-Line-Retry-Key":alert.retryKey},body:JSON.stringify({to:recipient,messages:[{type:"text",text:alert.text}]}),signal:AbortSignal.timeout(8000)});
   if(!r.ok&&!(r.status===409&&r.headers.has("x-line-accepted-request-id")))throw Error("ALERT_SEND_FAILED");
   await db.connextAlert.update({where:{id:alert.id},data:{status:"SENT",sentAt:new Date()}});
  }catch{
   await db.connextAlert.update({where:{id:alert.id},data:{status:alert.attempts>=9?"REVIEW":"PENDING",availableAt:new Date(Date.now()+Math.min(300000,15000*2**Math.min(alert.attempts,5)))}});
  }
 }
 return {configured:true};
}

export async function reportAgentHealth(reason:AgentHealth,at:number){
 const state=await updateHealth({reason,at});
 // Do not allow delayed reports to overwrite the current availability cache.
 if(state.lastHeartbeat?.getTime()===at)await new Redis(redisConnection()).eval(`local old=redis.call('GET',KEYS[1]); if old then local h=cjson.decode(old); if type(h)=='table' and h.at and h.at>cjson.decode(ARGV[1]).at then return 0 end end; redis.call('SET',KEYS[1],ARGV[1],'EX',60); return 1`,["canteen:connext:health"],[JSON.stringify({status:state.status,at,reason:state.reason,version:2})]);
 await flushHealthAlerts();return state;
}
export async function checkAgentHealth(){const state=await updateHealth();await flushHealthAlerts();return state;}
