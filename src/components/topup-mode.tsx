"use client";
import {useEffect,useState} from "react";
export function TopupMode(){
 const [mode,setMode]=useState("");const [message,setMessage]=useState("");const [queue,setQueue]=useState({pending:0,review:0});const [busy,setBusy]=useState(false);
 async function refresh(){try{const r=await fetch("/api/admin/topup-mode");const d=await r.json();if(r.ok){setMode(d.mode??"");setQueue({pending:d.pending??0,review:d.review??0});}}catch{setMessage("โหลดสถานะไม่สำเร็จ กรุณาลองใหม่");}}
 useEffect(()=>{void refresh();},[]);
 async function send(body:unknown){setBusy(true);try{const r=await fetch("/api/admin/topup-mode",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const d=await r.json();setMessage(r.ok?("retried" in d?`ส่งกลับเข้าคิว ${d.retried} รายการแล้ว`:"เปลี่ยนแล้ว"):d.error);await refresh();}catch{setMessage("เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่");}finally{setBusy(false);}}
 return <section className="formal-card"><h2>ระบบเติมเงิน</h2><p>คอมที่รับแจ้งเตือนต้องเปิดและเชื่อมต่ออยู่ การเปลี่ยนมีผลกับรายการใหม่</p><select disabled={busy} value={mode} onChange={e=>void send({mode:e.target.value})}><option value="" disabled>เลือกผู้ให้บริการ</option><option value="slip2go">Slip2Go — ตรวจสลิป</option><option value="connext">Krungthai Connext — แจ้งเตือน</option></select><p>คิวรอดำเนินการ {queue.pending} · รอตรวจสอบ {queue.review}</p><button type="button" disabled={busy} onClick={()=>void refresh()}>อัปเดตสถานะคิว</button>{queue.review>0&&<button type="button" disabled={busy} onClick={()=>void send({retryQueue:true})}>ลองประมวลผลรายการค้างอีกครั้ง</button>}<p role="status">{message}</p></section>;
}
