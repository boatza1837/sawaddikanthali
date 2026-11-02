import { Redis } from "@upstash/redis";
import { redisConnection } from "@/lib/redis";
import { db } from "@/lib/db";
import { ensure } from "@/lib/errors";
import { digest } from "@/lib/security";
export {createQueuedConnext as createConnext,enqueueConnext as acceptConnext,drainConnext} from "./connext-queue";

export async function topupMode() {
 const setting=await db.auditLog.findFirst({where:{action:"TOPUP_MODE_CHANGED"},orderBy:[{createdAt:"desc"},{id:"desc"}]});
 return setting?.detail === "connext" ? "connext" : "slip2go";
}
export async function listenerOnline(){return Boolean(await new Redis(redisConnection()).get("canteen:connext:alive"));}
export function parseConnext(text:string){
 const m=/^เงินเข้า:\s*([\d,]+\.\d{2}) บาท เข้าบัญชี XX(\d{4}) เมื่อ (\d{2})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}) ยอดเงินที่ใช้ได้ ([\d,]+\.\d{2}) บาท$/.exec(text.trim());
 ensure(m,"CONNEXT_INCOMPLETE",400);
 const amount=Math.round(Number(m[1].replaceAll(",",""))*100);
 const year=2000+Number(m[5])-43;
 const paidAt=new Date(`${year}-${m[4]}-${m[3]}T${m[6]}:${m[7]}:00+07:00`);
 ensure(Number.isSafeInteger(amount)&&amount>0&&Number.isFinite(paidAt.getTime()),"CONNEXT_INVALID",400);
 return {amount,account:m[2],paidAt,balance:m[8],event:digest(JSON.stringify([amount,m[2],paidAt.toISOString(),m[8]]))};
}

