"use client";
import { Refund } from "./refund";
import { QrScanner } from "./qr-scanner";
import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import { money, satang, MAX_AMOUNT } from "@/lib/money";
import { MAX_OVERDRAFT } from "@/lib/credit";
type Member = { name: string | null; memberId: string; balance: number };
type ChargeRequest = { token: string; amount: number; shiftId?: string; terminalId?: string; key: string; allowNegative?: boolean };
type Terminal = { id:string; name:string; active:boolean; locked:boolean };
type History = { id: string; amount: number; ledger: { createdAt: string } };
const errors: Record<string,string> = {
  INVALID_MEMBER_TOKEN: "QR หมดอายุหรือใช้แล้ว ให้สมาชิกสร้าง QR ใหม่แล้วสแกนอีกครั้ง",
  TOKEN_USED: "QR นี้ถูกใช้แล้ว กรุณาตรวจประวัติและให้สมาชิกสร้าง QR ใหม่",
  INSUFFICIENT_BALANCE: "ยอดเงินเปลี่ยนและไม่เพียงพอ กรุณาตัดสินใจด้านล่าง",
  OVERDRAFT_LIMIT_EXCEEDED: "รายการนี้จะทำให้หนี้เกิน 50 บาท จึงไม่สามารถผ่านได้",
  INVALID_SHIFT: "ข้อมูลรายการค้างเดิมไม่ถูกต้อง กรุณาติดต่อผู้ดูแล",
  TERMINAL_UNAVAILABLE: "จุดขายนี้ถูกปิดใช้งานหรือล็อก กรุณาเลือกจุดขายอื่น",
  INVALID_POS_CONTEXT: "ข้อมูลจุดขายไม่ถูกต้อง กรุณาเลือกจุดขายใหม่",
};
const definitiveErrors = new Set(["INVALID_MEMBER_TOKEN","TOKEN_USED","INSUFFICIENT_BALANCE","OVERDRAFT_LIMIT_EXCEEDED","INVALID_SHIFT","INVALID_POS_CONTEXT","TERMINAL_UNAVAILABLE","STAFF_REQUIRED","MEMBER_UNAVAILABLE","INVALID_AMOUNT","INVALID_INPUT"]);

export function Pos({ userId, name, role }: { userId: string; name: string; role: string }) {
  const [amount, setAmount] = useState(""), [confirmed,setConfirmed] = useState(false), [cameraRequest,setCameraRequest] = useState(0);
  const [token,setToken] = useState(""), [member,setMember] = useState<Member|null>(null);
  const [terminal,setTerminal] = useState("counter-1"), [terminals,setTerminals] = useState<Terminal[]>([]);
  const [status,setStatus] = useState(""), [busy,setBusy] = useState(false), [ready,setReady] = useState(false), [storageFault,setStorageFault] = useState(false);
  const [pending,setPending] = useState<ChargeRequest|null>(null), [history,setHistory] = useState<History[]>([]);
  const [success,setSuccess] = useState<{ amount:number; name:string; id:string }|null>(null);
  const inFlight = useRef(false), audio = useRef<AudioContext|null>(null);
  const amountPanel = useRef<HTMLElement|null>(null), scanPanel = useRef<HTMLElement|null>(null);
  function scrollToPanel(panel:HTMLElement|null) {
    panel?.scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth",block:"start"});
  }
  useEffect(()=>{if(!confirmed)return;const frame=requestAnimationFrame(()=>scrollToPanel(scanPanel.current));return()=>cancelAnimationFrame(frame);},[cameraRequest,confirmed]);
  useEffect(()=>{if(!success)return;const frame=requestAnimationFrame(()=>{scrollToPanel(amountPanel.current);amountPanel.current?.focus({preventScroll:true});});const timer=setTimeout(()=>setSuccess(null),3500);return()=>{cancelAnimationFrame(frame);clearTimeout(timer);};},[success]);
  const storageKey = `canteen:pending:${userId}`;
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw);
        // Preserve exact requests created by earlier POS versions too.
        const request: ChargeRequest = saved.request ?? { token:saved.token, amount:satang(saved.amount), shiftId:saved.shift, key:saved.key };
        if (!request.key || !request.token || !Number.isSafeInteger(request.amount)) throw Error("INVALID_SAVED_REQUEST");
        setPending(request); setAmount(saved.amountText ?? saved.amount); setToken(request.token);
        setMember(saved.member); setTerminal(saved.terminal ?? request.terminalId ?? "counter-1"); setConfirmed(true);
        setStatus("มีรายการค้าง กดตรวจสอบรายการเดิมก่อนเริ่มรายการใหม่");
      }
    } catch { setStorageFault(true); setStatus("อ่านรายการค้างไม่ได้ โปรดให้ผู้ดูแลตรวจประวัติก่อนทำรายการใหม่"); }
    setReady(true);
    fetch("/api/pos/state", {cache:"no-store"}).then(async r => {
      const data = await r.json(); if (!r.ok) throw Error(data.error);
      const available:Terminal[] = data.terminals ?? []; setTerminals(available);
      if (!sessionStorage.getItem(storageKey)) setTerminal(current => available.some(point=>point.id===current&&point.active&&!point.locked)?current:available.find(point=>point.active&&!point.locked)?.id??"");
      setHistory(data.history);
    }).catch(e => setStatus(e.message));
    return () => { void audio.current?.close(); };
  }, [storageKey]);
  function unlockSound() {
    try { audio.current ??= new AudioContext(); void audio.current.resume(); } catch {}
  }
  function tone(ok:boolean) {
    try {
      const context = audio.current;
      if (!context || context.state !== "running") return;
      const oscillator=context.createOscillator(), gain=context.createGain();
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.frequency.value=ok?880:220; gain.gain.value=.06;
      oscillator.start(); oscillator.stop(context.currentTime + (ok?.18:.25));
      oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
    } catch {}
  }
  async function api(path:string,data:unknown) {
    const response=await fetch("/api/pos/"+path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});
    const value=await response.json(); if(!response.ok) throw Error(value.error); return value;
  }
  async function run(fn:()=>Promise<void>) {
    if(inFlight.current || storageFault) return;
    inFlight.current=true;setBusy(true);
    try{await fn();}catch(e){const code=e instanceof Error?e.message:"NETWORK_ERROR";setStatus(errors[code]??code);}
    finally{inFlight.current=false;setBusy(false);}
  }
  function reset() {
    sessionStorage.removeItem(storageKey);
    setPending(null);setAmount("");setConfirmed(false);setToken("");setMember(null);
  }
  async function pay(request:ChargeRequest, target:Member) {
    sessionStorage.setItem(storageKey,JSON.stringify({request,amountText:amount,member:target,terminal}));
    setPending(request);
    try {
      const result=await api("charge",request);
      tone(true);
      setSuccess({amount:request.amount,name:result.memberName??target.name??"สมาชิก",id:result.transactionId});
      setStatus(result.replayed?"ยืนยันรายการเดิมแล้ว ไม่มีการตัดยอดซ้ำ":"รับชำระสำเร็จ พร้อมเริ่มรายการถัดไป");
      reset();
      // Receipt is already confirmed; history refresh must not affect its result.
      void fetch("/api/pos/history",{cache:"no-store"}).then(async r=>{if(r.ok)setHistory(await r.json());}).catch(()=>{});
    } catch(e) {
      const code=e instanceof Error?e.message:"NETWORK_ERROR";
      if(definitiveErrors.has(code)) {
        sessionStorage.removeItem(storageKey);setPending(null);
        if(code==="INSUFFICIENT_BALANCE" || code==="OVERDRAFT_LIMIT_EXCEEDED") {
          tone(false);
          try { setMember(await api("identify",{token:request.token,amount:request.amount})); } catch { setMember(null); }
        } else if(code==="INVALID_MEMBER_TOKEN" || code==="TOKEN_USED") setMember(null);
      }
      throw e;
    }
  }
  function identifyMember(value:string) {
    if(!confirmed || busy || pending || !terminal || storageFault) return;
    const total=satang(amount);
    setToken(value);setMember(null);setSuccess(null);setStatus("กำลังตรวจสอบและรับชำระ…");
    run(async()=>{
      const found:Member=await api("identify",{token:value,amount:total});setMember(found);
      if(found.balance>=total) await pay({token:value,amount:total,terminalId:terminal,key:crypto.randomUUID()},found);
      else {tone(false);setStatus("เงินไม่พอ กรุณาเลือกผ่านแบบติดลบ หรือยกเลิก");}
    });
  }
  function cancelSale() {
    if (token && confirmed) void api("cancel", { token, amount: satang(amount) }).catch(()=>{});
    reset(); setStatus("ยกเลิกแล้ว ไม่มีการหักเงิน");
    requestAnimationFrame(()=>scrollToPanel(amountPanel.current));
  }
  function addQuick(value:number) {
    try {
      const next=(amount?satang(amount):0)+value*100;
      if(next>MAX_AMOUNT) {setStatus("ยอดต่อรายการสูงสุด 10,000 บาท");return;}
      setAmount((next/100).toFixed(2).replace(/\.00$/,""));
    } catch {setStatus("กรุณาล้างยอดที่ไม่ถูกต้องก่อน");}
  }
  if(!ready) return <p role="status">กำลังตรวจรายการค้าง…</p>;
  const frozen=busy || !!pending || storageFault;
  const terminalAvailable=terminals.some(point=>point.id===terminal&&point.active&&!point.locked);
  const total=confirmed?satang(amount):0;
  const after=member?member.balance-total:0;
  const insufficient=!!member && member.balance<total;
  return <div className="workspace pos-workspace">
    {success&&<div className="pos-success-toast" role="status" aria-live="polite"><span className="pos-success-check" aria-hidden="true">✓</span><div><strong>รับชำระสำเร็จ {money(success.amount)}</strong><small>{success.name} · กรอกยอดคนถัดไปได้เลย</small></div><button type="button" aria-label="ปิดแจ้งเตือนสำเร็จ" onClick={()=>setSuccess(null)}>×</button></div>}

    <div className="workspace-heading"><div><span className="badge">SMART CANTEEN · FAST CHECKOUT</span><h1>รับชำระอย่างคล่องตัว</h1><p className="muted">สวัสดี {name} · {role==="ADMIN"?"ผู้ดูแล":role==="SUPERVISOR"?"หัวหน้างาน":"พนักงาน"} · พร้อมรับชำระ</p></div><form action="/api/auth/signout"><Button variant="outline">ออกจากระบบ</Button></form></div>
    <div className="pos-grid">
      <section className="formal-card pos-amount-panel" ref={amountPanel} tabIndex={-1}>
        <div className="row"><h2>รับชำระได้เลย</h2><span className="badge">ไม่ต้องเปิดกะ</span></div>
        {terminals.length > 1 ? <label htmlFor="terminal">จุดขาย<select id="terminal" disabled={frozen||confirmed} value={terminal} onChange={e=>setTerminal(e.target.value)}>{terminals.map(point=><option key={point.id} value={point.id} disabled={!point.active||point.locked}>{point.name}{!point.active||point.locked?" (ปิดใช้งาน)":""}</option>)}</select></label> : <p className="muted">{terminals[0]?.name ?? "กำลังตรวจจุดขาย…"}</p>}
        {!!terminals.length&&!terminalAvailable&&<p className="notice">จุดขายนี้ปิดใช้งาน กรุณาให้ผู้ดูแลเปิดใช้งานหรือเลือกจุดขายอื่น</p>}
        <h2 className="step-title" style={{marginTop:24}}><span>1</span> กรอกยอดรวม</h2>
        <output className="balance pos-total" aria-live="polite">฿{amount||"0"}</output>
        <div className="pos-quick-add" aria-label="ปุ่มบวกยอดด่วน">{[1,3,5,10,15,20].map(value=><Button key={value} variant="outline" disabled={frozen || confirmed} onClick={()=>addQuick(value)}>+{value}</Button>)}</div>
        <div className="keypad">{["1","2","3","4","5","6","7","8","9",".","0","⌫"].map(key=><Button key={key} variant="outline" disabled={frozen || confirmed} onClick={()=>setAmount(current=>{if(key==="⌫")return current.slice(0,-1);const next=current+key;return /^\d{0,5}(\.\d{0,2})?$/.test(next)?next:current;})}>{key}</Button>)}</div>
        <Button variant="outline" disabled={frozen} onClick={cancelSale}>ล้างยอด / ยกเลิก</Button>
        <Button disabled={frozen || confirmed || !terminalAvailable} onClick={()=>{try{satang(amount);unlockSound();setSuccess(null);setConfirmed(true);setCameraRequest(value=>value+1);setStatus("ยืนยันยอดแล้ว สแกนสมาชิกเพื่อรับชำระอัตโนมัติเมื่อเงินพอ");}catch{setStatus("จำนวนเงินไม่ถูกต้อง");}}}>ยืนยันยอดและเปิดกล้อง</Button>
        <p className="muted">ยืนยันยอดแล้ว หากเงินพอ เมื่อสแกนจะตัดเงินทันทีและมีเสียงแจ้ง</p>
      </section>
      <section className="formal-card pos-scan-panel" ref={scanPanel}>
        <h2 className="step-title"><span>2</span> สแกนเพื่อรับชำระ</h2>

        <QrScanner disabled={!confirmed || frozen || !terminalAvailable || insufficient} openRequest={cameraRequest} onScan={identifyMember} />
        <form onSubmit={e=>{e.preventDefault();unlockSound();identifyMember(token);}}><label htmlFor="token">รหัสจาก QR / เครื่องสแกน USB</label><input id="token" autoComplete="off" disabled={!confirmed || frozen || insufficient} value={token} onChange={e=>{setToken(e.target.value);setMember(null);}} /><Button disabled={!confirmed || frozen || insufficient}>อ่านรหัสและรับชำระ</Button></form>
        {insufficient && <section className="pos-shortfall" role="alert" aria-label="เงินไม่พอ">
          <h2>เงินไม่พอ</h2><strong className="shortfall-total">ขาด {money(total-member.balance)}</strong>
          <p>{member.name??"สมาชิก"} · ยอดปัจจุบัน {money(member.balance)}</p><p>ยอดซื้อ <strong>{money(total)}</strong></p>
          <div className="shortfall-after">ถ้ากดผ่าน ยอดจะเป็น <strong>{money(after)}</strong></div>
          {after < -MAX_OVERDRAFT ? <p><strong>เกินวงเงินติดลบ 50 บาท ไม่สามารถกดผ่านได้</strong></p> : <p>กดผ่านคืออนุมัติยืมเพิ่ม {money(Math.max(0,-after)-Math.max(0,-member.balance))} และบันทึกชื่อผู้อนุมัติ</p>}
          <div className="shortfall-actions"><Button variant="danger" disabled={frozen || after < -MAX_OVERDRAFT} onClick={()=>{unlockSound();run(()=>pay({token,amount:total,terminalId:terminal,key:crypto.randomUUID(),allowNegative:true},member));}}>ผ่าน — ยืนยันให้ติดลบ</Button><Button variant="outline" disabled={frozen} onClick={cancelSale}>ยกเลิก ไม่หักเงิน</Button></div>
        </section>}
        {pending && <div className="notice"><strong>ยังไม่ทราบผล ห้ามเริ่มรายการใหม่</strong><p>ตรวจสอบด้วยรายการและรหัสเดิมเพื่อป้องกันการหักซ้ำ</p><Button disabled={busy || storageFault} onClick={()=>{unlockSound();run(()=>pay(pending,member??{name:"สมาชิก",memberId:"",balance:0}));}}>ตรวจสอบรายการเดิม / ส่งซ้ำอย่างปลอดภัย</Button></div>}
        <p className="status" role="status">{busy?"กำลังรับชำระ กรุณารอผล…":status}</p>
      </section>
    </div>
    <section className="formal-card"><h2>รายการรับชำระของฉัน</h2><p className="muted">ล่าสุด 30 รายการ</p><Button variant="outline" disabled={busy} onClick={()=>run(async()=>{const r=await fetch("/api/pos/history",{cache:"no-store"});const data=await r.json();if(!r.ok)throw Error(data.error);setHistory(data);})}>อัปเดตประวัติ</Button>{!history.length&&<p className="empty-state">ยังไม่มีรายการ</p>}{history.map(item=><p key={item.id}>{new Date(item.ledger.createdAt).toLocaleString("th-TH")} · {money(item.amount)} · {item.id}</p>)}</section>
    {role==="SUPERVISOR"&&<Refund userId={userId}/>}
  </div>;
}
