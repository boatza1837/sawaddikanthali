"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import { money, satang } from "@/lib/money";
export type AdjustmentMember={id:string;name:string|null;email:string|null;status:string;wallet:{balance:number}|null};
type Payload={memberId:string;direction:"CREDIT"|"DEBIT";amount:number;reason:string;key:string;expectedBalance:number};
type Result={transactionId:string;balanceBefore:number;balanceAfter:number;amount:number;direction:string;replayed:boolean};
export function WalletAdjustment({member,userId,request,onClose,onSaved}:{member:AdjustmentMember|null;userId:string;request:(path:string,body?:unknown)=>Promise<unknown>;onClose:()=>void;onSaved:()=>Promise<void>}) {
 const [target,setTarget]=useState<AdjustmentMember|null>(member),[direction,setDirection]=useState<"CREDIT"|"DEBIT">("CREDIT"),[amount,setAmount]=useState(""),[reason,setReason]=useState("");
 const [review,setReview]=useState<Payload|null>(null),[pending,setPending]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[result,setResult]=useState<Result|null>(null),[ready,setReady]=useState(false);
 const previousMember=useRef(member);
 const lock=useRef(false),key="canteen:adjust:"+userId;
 useEffect(()=>{try{const raw=sessionStorage.getItem(key);if(raw){const saved=JSON.parse(raw);setTarget(saved.member);setReview(saved.payload);setDirection(saved.payload.direction);setAmount((saved.payload.amount/100).toFixed(2));setReason(saved.payload.reason);setPending(true);}}catch{setError("อ่านรายการปรับยอดค้างไม่ได้ กรุณาตรวจ Audit กับผู้ดูแลก่อนเริ่มใหม่");setPending(true);}setReady(true);},[key]);
 useEffect(()=>{if(member===previousMember.current)return;previousMember.current=member;if(member&&!pending){setTarget(member);setReview(null);setResult(null);setError("");setAmount("");setReason("");}},[member]);
 async function prepare() {
  if(lock.current||pending||!target)return;lock.current=true;setBusy(true);setError("");
  try{
   const value=satang(amount);if(reason.trim().length<5)throw Error("กรอกเหตุผลอย่างน้อย 5 ตัวอักษร");
   const fresh=await request("wallet?memberId="+encodeURIComponent(target.id)) as AdjustmentMember;
   if(fresh.status!=="ACTIVE"||!fresh.wallet)throw Error("สมาชิกยังไม่พร้อมใช้งาน");
   setTarget(fresh);
   if(direction==="DEBIT"&&fresh.wallet.balance<value)throw Error("ลดได้ไม่เกินยอดเงินที่มีอยู่ และไม่สามารถสร้างหนี้ด้วยเมนูนี้");
   setReview({memberId:fresh.id,direction,amount:value,reason:reason.trim(),key:crypto.randomUUID(),expectedBalance:fresh.wallet.balance});
  }catch(e){setError(e instanceof Error?e.message:"อ่านยอดไม่สำเร็จ");}
  finally{lock.current=false;setBusy(false);}
 }
 async function confirm() {
  if(lock.current||!review||!target)return;lock.current=true;setBusy(true);setError("");
  try{
   sessionStorage.setItem(key,JSON.stringify({member:target,payload:review}));setPending(true);
   const saved=await request("adjust",review) as Result;
   sessionStorage.removeItem(key);setPending(false);setReview(null);setResult(saved);
   setTarget({...target,wallet:{balance:saved.balanceAfter}});setAmount("");setReason("");
   try{await onSaved();}catch{}
  }catch(e){
   const code=e instanceof Error?e.message:"NETWORK_ERROR";
   if(["WALLET_CHANGED","INSUFFICIENT_BALANCE","INVALID_INPUT","MEMBER_UNAVAILABLE","INVALID_AMOUNT","INVALID_ADJUSTMENT","BALANCE_LIMIT_REACHED"].includes(code)){sessionStorage.removeItem(key);setPending(false);setReview(null);}
   setError(code==="WALLET_CHANGED"?"ยอดเงินเปลี่ยนระหว่างตรวจสอบ กรุณากดตรวจยอดอีกครั้งก่อนยืนยัน":code);
  }finally{lock.current=false;setBusy(false);}
 }
 function close(){if(pending||busy)return;setTarget(null);setReview(null);setResult(null);onClose();}
 if(!target&&!error)return null;
 const after=review?review.expectedBalance+(review.direction==="CREDIT"?review.amount:-review.amount):0;
 return <section className="formal-card adjustment-panel" aria-label="ปรับยอดเงินโดยผู้ดูแล">
  <span className="badge">ADMIN · ปรับยอดเงิน</span><h2 style={{marginTop:14}}>{target?.name??"สมาชิก"}</h2><p>{target?.email}</p>
  <p className="muted">ปรับบัญชีภายในโดยผู้ดูแล ไม่ใช่รายการเติมเงินผ่านธนาคาร ทุกครั้งต้องระบุเหตุผลและลงประวัติ ตรวจได้สูงสุดครั้งละ 10,000 บาท</p>
  {error&&<p className="notice" role="alert">{error}</p>}
  {result&&<div className="pos-paid" role="status"><strong>ปรับยอดสำเร็จ {money(result.amount)}</strong><p>{money(result.balanceBefore)} → {money(result.balanceAfter)}</p><small>{result.transactionId}{result.replayed?" · ยืนยันรายการเดิม ไม่มีการปรับซ้ำ":""}</small></div>}
  {!review&&!pending&&<form onSubmit={e=>{e.preventDefault();prepare();}}><label>การปรับยอด<select disabled={busy} value={direction} onChange={e=>setDirection(e.target.value as "CREDIT"|"DEBIT")}><option value="CREDIT">เพิ่มเงิน</option><option value="DEBIT">ลดเงิน</option></select></label><label>จำนวนเงิน (บาท)<input required inputMode="decimal" placeholder="เช่น 100" value={amount} disabled={busy} onChange={e=>setAmount(e.target.value)}/></label><label>เหตุผล<input required minLength={5} maxLength={500} placeholder="เช่น แก้ยอดนำเข้าผิด ตามหลักฐาน…" value={reason} disabled={busy} onChange={e=>setReason(e.target.value)}/></label><Button disabled={busy||!ready}>ตรวจยอดก่อนยืนยัน</Button><Button type="button" variant="outline" disabled={busy} onClick={close}>ปิด</Button></form>}
  {review&&<div className="adjustment-review"><h3>ตรวจสอบก่อน{review.direction==="CREDIT"?"เพิ่ม":"ลด"}เงิน</h3><p><strong>{target?.name} · {target?.email}</strong></p><p>ยอดก่อนปรับ {money(review.expectedBalance)}</p><p>{review.direction==="CREDIT"?"เพิ่ม":"ลด"}เงิน <strong>{money(review.amount)}</strong></p><p>ยอดหลังปรับ <strong>{money(after)}</strong></p><p>เหตุผล: {review.reason}</p>{pending&&<p className="notice">รายการนี้ยังไม่ทราบผล กดตรวจสอบรายการเดิม ห้ามเริ่มใหม่เพื่อป้องกันการปรับซ้ำ</p>}<Button variant={review.direction==="DEBIT"?"danger":"default"} disabled={busy} onClick={confirm}>{busy?"กำลังบันทึก…":pending?"ตรวจสอบรายการปรับยอดเดิม":"ยืนยัน"+(review.direction==="CREDIT"?"เพิ่ม":"ลด")+"เงิน "+money(review.amount)}</Button><Button variant="outline" disabled={busy||pending} onClick={()=>setReview(null)}>กลับไปแก้ไข</Button></div>}
  {pending&&!review&&<p className="notice">โปรดให้ผู้ดูแลตรวจประวัติรายการค้างก่อน ไม่สามารถเริ่มรายการใหม่ได้</p>}
 </section>;
}
