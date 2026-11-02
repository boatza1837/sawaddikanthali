import { randomInt } from "node:crypto";
import { Redis } from "@upstash/redis";
import { redisConnection } from "@/lib/redis";
import { db } from "@/lib/db";
import { ensure } from "@/lib/errors";
import { digest } from "@/lib/security";
import { serial, post, fingerprint } from "./finance";
import { slipConfig } from "./slip2go";
import { promptpayPayload } from "./slip-topups";
import QRCode from "qrcode";

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
export async function createConnext(userId:string,requested:number,key:string){
 ensure(await topupMode()==="connext","PROVIDER_CHANGED",409);
 ensure(await listenerOnline(),"CONNEXT_OFFLINE",503);
 const config=slipConfig();ensure(config,"TOPUP_NOT_CONFIGURED",503);
 const intent=await serial(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(917123)`;
  const scoped=`connext:${userId}:${key}`;
  const old=await tx.topupIntent.findUnique({where:{key:scoped}});if(old)return old;
  const wallet=await tx.wallet.findUniqueOrThrow({where:{userId}});
  ensure((await tx.topupIntent.count({where:{walletId:wallet.id,provider:"connext",status:"PENDING",expiresAt:{gt:new Date()}}}))<2,"CONNEXT_PENDING_LIMIT",409);
  // Reserve each payable amount for a whole day, even after payment/expiry.
  const base=Math.ceil(requested/100)*100;
  const used=await tx.topupIntent.findMany({where:{provider:"connext",createdAt:{gte:new Date(Date.now()-86400000)},amount:{gt:base,lt:base+100}},select:{amount:true}});
  const occupied=new Set(used.map(x=>x.amount));const free=Array.from({length:99},(_,i)=>base+i+1).filter(x=>!occupied.has(x)&&x<=1000000);
  ensure(free.length,"CONNEXT_AMOUNTS_BUSY",409);
  return tx.topupIntent.create({data:{key:scoped,walletId:wallet.id,amount:free[randomInt(free.length)],provider:"connext",expiresAt:new Date(Date.now()+15*60000)}});
 });
 return {...intent,accountName:config.name,qr:await QRCode.toDataURL(promptpayPayload(config.promptpay,intent.amount),{width:360,margin:2})};
}
export async function acceptConnext(text:string){
 const event=parseConnext(text);
 ensure(event.account===process.env.TOPUP_BANK_ACCOUNT?.slice(-4),"CONNEXT_ACCOUNT",409);
 // Notifications only provide minute precision. Accept recent delivery, not old history.
 ensure(event.paidAt.getTime()<=Date.now()&&Date.now()-event.paidAt.getTime()<180000,"CONNEXT_STALE",409);
 return serial(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(917123)`;
  const id=`connext:${event.event}`;
  if(await tx.paymentWebhook.findUnique({where:{id}}))return {duplicate:true};
  const matches=await tx.topupIntent.findMany({where:{provider:"connext",status:"PENDING",amount:event.amount,createdAt:{lt:new Date(event.paidAt.getTime()+60000)},expiresAt:{gte:event.paidAt}},take:2});
  ensure(matches.length===1,"CONNEXT_NO_UNIQUE_MATCH",409);
  const intent=matches[0];
  ensure(intent.expiresAt.getTime()>Date.now(),"CONNEXT_EXPIRED",409);
  await tx.topupIntent.update({where:{id:intent.id},data:{status:"PAID",paymentRef:id}});
  await tx.wallet.update({where:{id:intent.walletId},data:{balance:{increment:intent.amount}}});
  const ledger=await post(tx,{key:`settlement:${intent.id}`,hash:fingerprint([intent.id,intent.amount,id]),kind:"TOPUP",actorId:"provider:connext",walletId:intent.walletId,amount:intent.amount,debit:"CLEARING",credit:"WALLET_LIABILITY",reference:intent.id});
  await tx.paymentWebhook.create({data:{id,intentId:intent.id,digest:event.event}});
  await tx.auditLog.create({data:{actorId:"provider:connext",action:"CONNEXT_TOPUP_SETTLED",targetId:ledger.id,detail:JSON.stringify({amount:intent.amount,source:"windows-line-notification",experimental:true})}});
  return {paid:true,amount:intent.amount};
 });
}
