import { ensure } from "@/lib/errors";
import { fingerprint, post, replay, serial } from "./finance";
export type AdjustmentInput = {
 actorId:string; memberId:string; direction:"CREDIT"|"DEBIT"; amount:number;
 reason:string; key:string; expectedBalance:number;
};
export async function adjustWallet(input:AdjustmentInput) {
  ensure(["CREDIT","DEBIT"].includes(input.direction),"INVALID_ADJUSTMENT");
  ensure(Number.isSafeInteger(input.amount)&&input.amount>0&&input.amount<=1_000_000,"INVALID_AMOUNT");
  ensure(Number.isSafeInteger(input.expectedBalance)&&input.reason.trim().length>=5&&input.reason.length<=500,"INVALID_ADJUSTMENT");
  const key="adjustment:"+input.actorId+":"+input.key;
  const hash=fingerprint([input.actorId,input.memberId,input.direction,input.amount,input.reason,input.expectedBalance]);
  return serial(async tx=>{
    const admin=await tx.user.findUnique({where:{id:input.actorId}});
    ensure(admin?.role==="ADMIN"&&admin.status==="ACTIVE","ADMIN_REQUIRED",403);
    const prior=await replay(tx,key,hash);
    if(prior) {
      const audit=await tx.auditLog.findFirst({where:{action:"WALLET_ADJUSTMENT",targetId:prior.id}});
      ensure(audit?.detail,"ADJUSTMENT_RECORD_MISSING",500);
      return {transactionId:prior.id,...JSON.parse(audit.detail),replayed:true};
    }
    const member=await tx.user.findUnique({where:{id:input.memberId},include:{wallet:true}});
    ensure(member?.status==="ACTIVE"&&member.wallet,"MEMBER_UNAVAILABLE",409);
    const wallet=member.wallet;
    ensure(wallet.balance===input.expectedBalance,"WALLET_CHANGED",409);
    const after=wallet.balance+(input.direction==="CREDIT"?input.amount:-input.amount);
    // Manual debit does not authorize credit or deepen existing debt.
    ensure(input.direction!=="DEBIT"||after>=0,"INSUFFICIENT_BALANCE",409);
    ensure(after<=2147483647,"BALANCE_LIMIT_REACHED",409);
    const updated=await tx.wallet.updateMany({where:{id:wallet.id,balance:input.expectedBalance},data:{balance:after}});
    ensure(updated.count===1,"WALLET_CHANGED",409);
    const ledger=await post(tx,{key,hash,kind:"ADJUSTMENT",actorId:input.actorId,walletId:wallet.id,amount:input.amount,
      debit:input.direction==="CREDIT"?"ADMIN_ADJUSTMENT":"WALLET_LIABILITY",
      credit:input.direction==="CREDIT"?"WALLET_LIABILITY":"ADMIN_ADJUSTMENT",reference:member.id});
    const detail={memberId:member.id,direction:input.direction,amount:input.amount,reason:input.reason,balanceBefore:wallet.balance,balanceAfter:after};
    await tx.auditLog.create({data:{actorId:input.actorId,action:"WALLET_ADJUSTMENT",targetId:ledger.id,detail:JSON.stringify(detail)}});
    return {transactionId:ledger.id,...detail,replayed:false};
  });
}
