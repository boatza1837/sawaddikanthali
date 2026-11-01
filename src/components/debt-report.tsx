"use client";
import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import { money } from "@/lib/money";
import { bangkokToday } from "@/lib/report-day";
type Row = { id:string; amount:number; borrowed:number; balanceBefore:number; balanceAfter:number; overdraftApproved:boolean; ledger:{createdAt:string}; terminalId:string;cashier:{name:string|null;email:string|null}|null; member:{name:string|null;email:string|null;balance:number}|null };
type Report = { day:string; borrowed:number; count:number; borrowers:number; outstanding:number; rows:Row[]; nextCursor:string|null };
export function DebtReport({ request }: { request:(path:string)=>Promise<Report> }) {
  const [day,setDay]=useState(()=>bangkokToday()),[data,setData]=useState<Report|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
  useEffect(()=>{let cancelled=false;setBusy(true);setError("");setData(null);
    request("debt?date="+day).then(result=>{if(!cancelled)setData(result);}).catch(e=>{if(!cancelled)setError(e.message);}).finally(()=>{if(!cancelled)setBusy(false);});
    return()=>{cancelled=true;};
  },[day]);
  return <section className="formal-card">
    <div className="row"><div><h2>รายงานยืมเงินรายวัน</h2><p className="muted">นับวันตามเวลาประเทศไทย · วงเงินติดลบสูงสุด 50 บาทต่อคน</p></div><label>เลือกรายวัน<input type="date" value={day} onChange={e=>{if(e.target.value)setDay(e.target.value);}} /></label></div>
    {error&&<p role="alert">{error}</p>}
    {data&&<>
      <div className="metrics">{[["ยืมเพิ่มในวันที่เลือก",money(data.borrowed)],["รายการที่ยืม",data.count+" รายการ"],["จำนวนผู้ยืม",data.borrowers+" คน"],["หนี้คงค้างปัจจุบันทั้งหมด",money(data.outstanding)]].map(([label,value])=><article className="formal-card metric" key={label}><p className="muted">{label}</p><strong>{value}</strong></article>)}</div>
      <p className="muted">ยอดยืมเพิ่มคือเฉพาะส่วนที่ทำให้ติดลบเพิ่ม ณ เวลาซื้อ ก่อนหักการคืนเงิน ยอดหนี้คงค้างเป็นยอดปัจจุบันทุกวันรวมกัน การคืนเงินหรือเติมเงินจะลดหนี้คงค้าง</p>
      <div className="table-scroll"><table><thead><tr><th>เวลา / รายการ</th><th>สมาชิก</th><th>ยอดซื้อ</th><th>ยืมเพิ่ม</th><th>ก่อน → หลัง</th><th>ผู้อนุมัติ</th></tr></thead><tbody>{data.rows.map(row=><tr key={row.id}><td>{new Date(row.ledger.createdAt).toLocaleString("th-TH",{timeZone:"Asia/Bangkok"})}<small>{row.id}</small></td><td>{row.member?.name??"สมาชิก"}<small>{row.member?.email}</small></td><td>{money(row.amount)}</td><td style={{color:"#b42318",fontWeight:700}}>{money(row.borrowed)}</td><td>{money(row.balanceBefore)} → {money(row.balanceAfter)}</td><td>{row.cashier?.name}<small>{row.cashier?.email} · {row.terminalId}</small></td></tr>)}</tbody></table></div>
      {!data.rows.length&&<p className="empty-state">ไม่มีรายการยืมเงินในวันที่เลือก</p>}
      {data.nextCursor&&<Button variant="outline" disabled={busy} onClick={async()=>{setBusy(true);setError("");try{const next=await request("debt?date="+day+"&after="+encodeURIComponent(data.nextCursor!));setData(current=>current?.day===next.day?{...next,rows:[...current.rows,...next.rows]}:current);}catch(e){setError(e instanceof Error?e.message:"อ่านรายงานไม่ได้");}finally{setBusy(false);}}}>ดูรายการเพิ่มเติม</Button>}
    </>}
    {busy&&<p role="status">กำลังอ่านรายงาน…</p>}
  </section>;
}
