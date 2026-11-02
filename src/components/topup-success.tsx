"use client";
import {useEffect,useRef} from "react";
import {money} from "@/lib/money";
export function TopupSuccess({amount,onClose}:{amount:number|null;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{if(amount!==null&&!dialog.current?.open)dialog.current?.showModal();},[amount]);
 return <dialog ref={dialog} className="topup-celebration" onCancel={onClose} onClose={onClose}>
  <div className="topup-confetti" aria-hidden="true">{Array.from({length:22},(_,i)=><i key={i} style={{left:`${(i*37)%100}%`,background:["#10b981","#fbbf24","#38bdf8","#f9a8d4"][i%4],animationDelay:`${i%7*.09}s`,transform:`rotate(${i*29}deg)`}}/>)}</div>
  <div className="topup-success-check" aria-hidden="true">✓</div>
  <span className="topup-success-eyebrow">WALLET เติมความพร้อมแล้ว</span>
  <h2>เงินเข้าแล้ว พร้อมอร่อย!</h2>
  <p>เติมเงินเข้า Wallet สำเร็จ</p>
  <strong className="topup-success-amount">+{money(amount??0)}</strong>
  <p className="topup-success-caption">ยอดของคุณอัปเดตแล้ว<br/>มื้อต่อไป เลือกของอร่อยได้เลย</p>
  <button className="button primary" onClick={()=>dialog.current?.close()}>เยี่ยมเลย ไปที่ Wallet</button>
  <style jsx>{`
   .topup-celebration{box-sizing:border-box;position:fixed;overflow:hidden;width:min(440px,calc(100vw - 32px));border:1px solid #d1fae5;border-radius:32px;padding:38px 26px 28px;text-align:center;color:#14243b;background:radial-gradient(ellipse at top,#d1fae5 0%,#f0fdf4 27%,#fff 65%);box-shadow:0 28px 90px #052e1640;animation:topup-pop .45s cubic-bezier(.2,.8,.2,1)}
   .topup-celebration::backdrop{background:#10291c80;backdrop-filter:blur(7px)}
   .topup-success-check{display:grid;place-items:center;position:relative;margin:0 auto 20px;width:82px;height:82px;border-radius:28px;background:linear-gradient(135deg,#34d399,#047857);color:white;font-size:49px;box-shadow:0 10px 26px #10b98130,0 0 0 10px #d1fae580}
   .topup-success-eyebrow{font-size:11px;letter-spacing:1.2px;font-weight:700;color:#047857}.topup-celebration h2{font-size:25px;line-height:1.4;margin:10px 0 8px}.topup-celebration p{color:#64748b;font-size:14px;margin:6px 0}.topup-success-amount{display:block;color:#047857;font-size:clamp(36px,9vw,54px);letter-spacing:-1px;margin:18px 0;font-variant-numeric:tabular-nums}.topup-success-caption{line-height:1.8;margin-bottom:25px!important}.topup-celebration button{width:100%;min-height:50px;border-radius:16px;position:relative}.topup-confetti{position:absolute;inset:0;pointer-events:none}.topup-confetti i{position:absolute;top:-16px;width:7px;height:13px;border-radius:3px;animation:topup-fall 1.8s ease-out both}.topup-confetti i:nth-child(3n){border-radius:50%;width:8px;height:8px}
   @keyframes topup-pop{from{opacity:0;transform:translateY(16px) scale(.94)}to{opacity:1;transform:translateY(0) scale(1)}}@keyframes topup-fall{0%{opacity:0;translate:0 -10px;rotate:0deg}15%{opacity:1}100%{opacity:0;translate:12px 410px;rotate:400deg}}
   @media(prefers-reduced-motion:reduce){.topup-celebration,.topup-confetti i{animation:none}.topup-confetti{display:none}}
  `}</style>
 </dialog>;
}
