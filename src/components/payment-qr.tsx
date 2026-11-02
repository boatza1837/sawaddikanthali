"use client";
import {useEffect,useState} from "react";
export function PaymentQr({src,expiresAt,createdAt}:{src:string;expiresAt:string;createdAt:string}){
 const [remaining,setRemaining]=useState(0);
 const end=new Date(expiresAt).getTime(),start=new Date(createdAt).getTime();
 useEffect(()=>{const tick=()=>setRemaining(Math.max(0,Math.ceil((end-Date.now())/1000)));tick();const timer=setInterval(tick,1000);return()=>clearInterval(timer);},[end]);
 const duration=Number.isFinite(start)?Math.max(1,(end-start)/1000):900;
 return <div style={{border:"2px dashed #a7f3d0",borderRadius:22,padding:"24px 16px",textAlign:"center",margin:"20px 0",background:"linear-gradient(180deg,#fff,#f8fffb)",boxShadow:"0 8px 22px #10b98108"}}>
  {remaining>0?<img src={src} alt="QR เติมเงินตามยอดรายการ" width={248} height={248} style={{maxWidth:"100%",height:"auto",border:"1px solid #e2e8f0",borderRadius:16,padding:8,boxSizing:"border-box",background:"white"}}/>:<p>รายการหมดเวลาแล้ว หากโอนแล้วกรุณาติดต่อพนักงาน ห้ามโอนซ้ำ</p>}
  <p role="timer" style={{fontSize:14,color:remaining<60?"#b45309":"#047857",fontWeight:700,margin:"14px 0 12px"}}>{remaining>0?`รายการหมดเวลาใน ${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,"0")} นาที`:"รายการหมดเวลา"}</p>
  <div role="progressbar" aria-label="เวลาชำระเงินที่เหลือ" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(100,remaining/duration*100))} style={{height:6,background:"#e5e7eb",borderRadius:10,maxWidth:248,margin:"auto",overflow:"hidden"}}><div style={{height:"100%",width:`${Math.min(100,remaining/duration*100)}%`,background:"linear-gradient(90deg,#10b981,#047857)",borderRadius:10,transition:"width 1s linear"}}/></div>
  <small style={{display:"block",fontSize:12,color:"#94a3b8",marginTop:10}}>รายการนี้เติมเงินได้ครั้งเดียว · กรุณาโอนก่อนหมดเวลา</small>
 </div>;
}
