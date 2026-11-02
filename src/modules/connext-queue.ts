import {randomUUID} from "node:crypto";
import {db} from "@/lib/db";
import {ensure} from "@/lib/errors";
import {post,fingerprint} from "./finance";
import {slipConfig} from "./slip2go";
import {promptpayPayload} from "./slip-topups";
import {topupMode,listenerOnline,parseConnext} from "./connext";
import QRCode from "qrcode";

export async function createQueuedConnext(userId:string,requested:number,key:string){
 ensure(await topupMode()==="connext","PROVIDER_CHANGED",409);ensure(await listenerOnline(),"CONNEXT_OFFLINE",503);
 ensure(Number.isInteger(requested)&&requested>=100&&requested<=1000000,"INVALID_AMOUNT",400);
 const config=slipConfig();ensure(config,"TOPUP_NOT_CONFIGURED",503);
 const intent=await db.$transaction(async tx=>{
  // Refresh snapshot after short reservation lock; settlement has a separate worker.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(917123)`;
  const scoped=`connext:${userId}:${key}`;const old=await tx.topupIntent.findUnique({where:{key:scoped}});
  if(old){ensure(old.requestedAmount===requested,"IDEMPOTENCY_CONFLICT",409);return old;}
  const wallet=await tx.wallet.findUniqueOrThrow({where:{userId}});
  ensure(await tx.topupIntent.count({where:{walletId:wallet.id,provider:"connext",status:"PENDING",expiresAt:{gt:new Date()}}})<2,"CONNEXT_PENDING_LIMIT",409);
  const ceiling=Math.floor(requested/100)*100;
  const used=await tx.connextReservation.findMany({where:{holdUntil:{gt:new Date()},amount:{gte:Math.max(1,ceiling-499),lt:ceiling}},select:{amount:true}});
  const occupied=new Set(used.map(x=>x.amount));let amount=ceiling-1;
  while(amount>0&&ceiling-amount<=499&&occupied.has(amount))amount--;
  ensure(amount>0&&ceiling-amount<=499,"CONNEXT_AMOUNTS_BUSY",409);
  const created=await tx.topupIntent.create({data:{key:scoped,walletId:wallet.id,amount,requestedAmount:requested,provider:"connext",expiresAt:new Date(Date.now()+15*60000)}});
  await tx.connextReservation.upsert({where:{amount},create:{amount,intentId:created.id,holdUntil:new Date(created.expiresAt.getTime()+180000)},update:{intentId:created.id,holdUntil:new Date(created.expiresAt.getTime()+180000)}});
  return created;
 },{isolationLevel:"ReadCommitted",maxWait:15000,timeout:15000});
 return {...intent,accountName:config.name,qr:await QRCode.toDataURL(promptpayPayload(config.promptpay,intent.amount),{width:360,margin:2})};
}
export async function enqueueConnext(text:string){
 const event=parseConnext(text);ensure(event.account===process.env.TOPUP_BANK_ACCOUNT?.slice(-4),"CONNEXT_ACCOUNT",409);
 const id=`connext:${event.event}`;const existing=await db.connextJob.findUnique({where:{id}});if(existing)return {queued:true,duplicate:true,id};
 ensure(event.paidAt.getTime()<=Date.now()&&Date.now()-event.paidAt.getTime()<180000,"CONNEXT_STALE",409);
 await db.connextJob.createMany({data:[{id,amount:event.amount,account:event.account,paidAt:event.paidAt}],skipDuplicates:true});return {queued:true,id};
}
export async function drainConnext(limit=25){
 const lease=randomUUID();
 const acquired=await db.$queryRaw<Array<{id:string}>>`INSERT INTO "ConnextWorker" (id,lease,"lockedUntil") VALUES ('settlement',${lease},CURRENT_TIMESTAMP+interval '30 seconds') ON CONFLICT (id) DO UPDATE SET lease=EXCLUDED.lease,"lockedUntil"=EXCLUDED."lockedUntil" WHERE "ConnextWorker"."lockedUntil"<CURRENT_TIMESTAMP RETURNING id`;
 if(!acquired.length)return {busy:true,processed:0};let processed=0;const start=Date.now();
 try{
  while(processed<limit&&Date.now()-start<10000){
   const job=await db.connextJob.findFirst({where:{status:"PENDING",availableAt:{lte:new Date()}},orderBy:[{receivedAt:"asc"},{id:"asc"}]});if(!job)break;
   try{
    await db.$transaction(async tx=>{
     await tx.$executeRaw`SELECT id FROM "ConnextWorker" WHERE id='settlement' FOR UPDATE`;
     const owner=await tx.connextWorker.findUniqueOrThrow({where:{id:"settlement"}});ensure(owner.lease===lease,"WORKER_LEASE_LOST",409);
     if(await tx.paymentWebhook.findUnique({where:{id:job.id}})){await tx.connextJob.update({where:{id:job.id},data:{status:"DONE",lastError:null}});return;}
     const matches=await tx.topupIntent.findMany({where:{provider:"connext",amount:job.amount,createdAt:{lt:new Date(job.paidAt.getTime()+60000)},expiresAt:{gte:job.paidAt}},take:2});ensure(matches.length===1,"CONNEXT_NO_UNIQUE_MATCH",409);
     const candidate=matches[0];await tx.$executeRaw`SELECT id FROM "TopupIntent" WHERE id=${candidate.id} FOR UPDATE`;
     const intent=await tx.topupIntent.findUniqueOrThrow({where:{id:candidate.id}});
     if(intent.status==="PAID"){await tx.connextJob.update({where:{id:job.id},data:{status:"DONE",lastError:"ALREADY_SETTLED"}});return;}
     ensure(intent.status==="PENDING"&&job.receivedAt.getTime()<=intent.expiresAt.getTime()+180000,"CONNEXT_REVIEW_REQUIRED",409);
     await tx.topupIntent.update({where:{id:intent.id},data:{status:"PAID",paymentRef:job.id}});await tx.wallet.update({where:{id:intent.walletId},data:{balance:{increment:intent.amount}}});
     const ledger=await post(tx,{key:`settlement:${intent.id}`,hash:fingerprint([intent.id,intent.amount,job.id]),kind:"TOPUP",actorId:"provider:connext",walletId:intent.walletId,amount:intent.amount,debit:"CLEARING",credit:"WALLET_LIABILITY",reference:intent.id});
     await tx.paymentWebhook.create({data:{id:job.id,intentId:intent.id,digest:job.id.slice(8)}});
     await tx.auditLog.create({data:{actorId:"provider:connext",action:"CONNEXT_TOPUP_SETTLED",targetId:ledger.id,detail:JSON.stringify({amount:intent.amount,queueId:job.id,source:"windows-line-notification"})}});
     await tx.connextJob.update({where:{id:job.id},data:{status:"DONE",lastError:null}});
    },{isolationLevel:"ReadCommitted",maxWait:10000,timeout:10000});
   }catch(e){const attempts=job.attempts+1;const error=e instanceof Error?e.message:"UNKNOWN";await db.connextJob.update({where:{id:job.id},data:{attempts,status:attempts>=10?"REVIEW":"PENDING",lastError:error.slice(0,200),availableAt:new Date(Date.now()+Math.min(60000,1000*2**Math.min(attempts,6)))}});}
   processed++;
  }
 }finally{await db.connextWorker.updateMany({where:{id:"settlement",lease},data:{lockedUntil:new Date(0)}});}
 return {processed};
}
