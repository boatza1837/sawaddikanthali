"use client";
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { WalletAdjustment } from "./wallet-adjustment";
import { DebtReport } from "./debt-report";
import { money } from "@/lib/money";
import { Button } from "./ui/button";
type Member = { id: string; name: string | null; email: string | null; role: string; status: string; wallet: { balance: number } | null };
type Terminal = { id: string; name: string; active: boolean; locked: boolean };
type Overview = { members: number; walletBalance: number; grossSales: number; refunded: number; saleCount: number; refundCount: number; terminals: Terminal[]; shifts: { id: string; openedAt: string; user: { name: string | null; email: string | null }; terminal: Terminal }[]; audit: { id: string; action: string; actorId: string; targetId: string; detail: string | null; createdAt: string }[]; transactions: { id: string; amount: number; refunded: number; ledger: { createdAt: string }; shift: { user: { name: string | null }; terminalId: string } }[] };
const date = (value: string) => new Date(value).toLocaleString("th-TH");
export function Admin({ name, userId }: { name: string; userId: string }) {
  const [verified, setVerified] = useState(false), [enrolled, setEnrolled] = useState(false), [loaded, setLoaded] = useState(false);
  const [code, setCode] = useState(""), [secret, setSecret] = useState(""), [qr, setQr] = useState("");
  const [status, setStatus] = useState(""), [busy, setBusy] = useState(false), lock = useRef(false);
  const [tab, setTab] = useState("overview"), [overview, setOverview] = useState<Overview | null>(null);
  const [members, setMembers] = useState<Member[]>([]), [query, setQuery] = useState(""), [selected, setSelected] = useState<Member | null>(null), [reason, setReason] = useState("");
  const [adjustTarget,setAdjustTarget] = useState<Member|null>(null);
  const [terminal, setTerminal] = useState<Terminal>({ id: "", name: "", active: true, locked: false });
  async function request(path: string, body?: unknown) {
    const r = await fetch("/api/admin/" + path, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await r.json();
    if (!r.ok) {
      if (data.error === "ADMIN_MFA_REQUIRED") { setVerified(false); setOverview(null); setMembers([]); setSelected(null); setAdjustTarget(null); }
      throw Error(data.error === "ADMIN_MFA_REQUIRED" ? "กรุณายืนยัน Authenticator อีกครั้ง (สิทธิ์หมดอายุใน 15 นาที)" : data.error);
    }
    return data;
  }
  async function run(fn: () => Promise<void>) {
    if (lock.current) return; lock.current = true; setBusy(true); setStatus("");
    try { await fn(); } catch(e) { setStatus(e instanceof Error ? e.message : "เชื่อมต่อไม่สำเร็จ"); }
    finally { lock.current = false; setBusy(false); }
  }
  async function refresh() { setOverview(await request("overview")); }
  useEffect(() => { run(async () => { const s = await request("mfa"); setEnrolled(s.enrolled); setVerified(s.verified); if (s.verified) await refresh(); }).finally(() => setLoaded(true)); }, []);
  useEffect(() => {
    if (!verified) return;
    const timer = setTimeout(() => { setVerified(false); setOverview(null); setMembers([]); setSelected(null); setAdjustTarget(null); }, 15 * 60000);
    return () => clearTimeout(timer);
  }, [verified]);
  return <div className="workspace">
    <div className="workspace-heading"><div><span className="badge">SMART CANTEEN · ADMIN</span><h1>ดูแลร้านอย่างสบายใจ</h1><p className="muted">สวัสดี {name} · ข้อมูลจริงจากระบบ</p></div>{verified && <Button variant="outline" disabled={busy} onClick={() => run(refresh)}>↻ อัปเดตข้อมูล</Button>}</div>
    <p className="status" role="status">{busy ? "กำลังดำเนินการ…" : status}</p>
    {!loaded ? <div className="formal-card">กำลังตรวจสิทธิ์…</div> : !verified ? <section className="formal-card security-card">
      <span className="badge">ยืนยันตัวตนเพิ่มอีกขั้น</span><h2>{enrolled ? "ยืนยันด้วย Authenticator" : "ผูก Authenticator ของผู้ดูแล"}</h2>
      <p className="muted">ใช้ Google Authenticator หรือแอป TOTP บนมือถือ รหัสนี้แยกจาก OTP อีเมล และเปิดสิทธิ์จัดการครั้งละ 15 นาที</p>
      {!enrolled && !secret && <Button disabled={busy} onClick={() => run(async () => { const data = await request("mfa/enroll", {}); setSecret(data.secret); setQr(await QRCode.toDataURL(data.uri, { width: 240, margin: 2 })); })}>เริ่มผูก Authenticator</Button>}
      {qr && <><img src={qr} width="240" height="240" alt="QR สำหรับผูก Authenticator เก็บเป็นความลับ" /><p>สแกนในแอป หรือใส่คีย์ด้วยตนเอง</p><code className="secret-key">{secret}</code><p className="muted">เก็บคีย์นี้ในที่ปลอดภัยก่อนยืนยัน ใช้กู้คืนบนมือถือใหม่ได้ อย่าแชร์หรือส่งภาพ QR ให้ผู้อื่น</p></>}
      {(enrolled || secret) && <form onSubmit={e => { e.preventDefault(); run(async () => { await request("mfa/verify", { code }); setVerified(true); setEnrolled(true); setSecret(""); setQr(""); setCode(""); await refresh(); }); }}><label htmlFor="mfa-code">รหัส 6 หลักจากแอป</label><input id="mfa-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ""))} required /><Button disabled={busy || code.length !== 6}>ยืนยันเข้าหน้าผู้ดูแล</Button></form>}
    </section> : <>
      <div className="workspace-tabs" role="navigation" aria-label="เมนูผู้ดูแล">{[["overview","ภาพรวม"],["members","สมาชิกและพนักงาน"],["terminals","จุดรับชำระ"],["debt","รายงานยืมเงิน"],["audit","บันทึกกิจกรรม"]].map(([id,label]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => { setTab(id); if (id === "members") run(async () => setMembers(await request("members?q=" + encodeURIComponent(query)))); }}>{label}</button>)}</div>
      <WalletAdjustment member={adjustTarget} userId={userId} request={request} onClose={()=>setAdjustTarget(null)} onSaved={async()=>{setMembers(await request("members?q="+encodeURIComponent(query)));await refresh();}} />
      {overview && tab === "overview" && <>
        <div className="metrics">{[["สมาชิกทั้งหมด", overview.members.toLocaleString() + " คน"],["ยอดขายสุทธิสะสม",money(overview.grossSales - overview.refunded)],["ยอดสุทธิ Wallet ทั้งระบบ",money(overview.walletBalance)],["คืนเงินสะสม",money(overview.refunded)]].map(([label,value]) => <article className="formal-card metric" key={label}><p className="muted">{label}</p><strong>{value}</strong></article>)}</div>
        <section className="formal-card"><h2>กะที่เปิดอยู่ <span className="badge">{overview.shifts.length}</span></h2>{!overview.shifts.length && <p className="muted">ยังไม่มีพนักงานเปิดกะ</p>}{overview.shifts.map(s => <div className="data-row" key={s.id}><div><strong>{s.terminal.name}</strong><p className="muted">{s.user.name} · {s.user.email}</p></div><span>{date(s.openedAt)}</span></div>)}</section>
        <section className="formal-card"><h2>รายการรับชำระล่าสุด</h2><p className="muted">แสดงล่าสุด 50 รายการ · ยอดสรุปด้านบนรวมทุกช่วงเวลา</p><div className="table-scroll"><table><thead><tr><th>วันเวลา / เลขรายการ</th><th>พนักงาน / จุดขาย</th><th>ยอดชำระ</th><th>คืนแล้ว</th></tr></thead><tbody>{overview.transactions.map(t => <tr key={t.id}><td>{date(t.ledger.createdAt)}<small>{t.id}</small></td><td>{t.shift.user.name}<small>{t.shift.terminalId}</small></td><td>{money(t.amount)}</td><td>{money(t.refunded)}</td></tr>)}</tbody></table></div>{!overview.transactions.length && <p className="empty-state">ยังไม่มีรายการรับชำระ</p>}</section>
      </>}
      {tab === "members" && <section className="formal-card"><h2>สมาชิกและสิทธิ์พนักงาน</h2><form className="search-row" onSubmit={e => { e.preventDefault(); run(async () => setMembers(await request("members?q=" + encodeURIComponent(query)))); }}><input aria-label="ค้นหาชื่อ อีเมล หรือรหัสสมาชิก" placeholder="ค้นหาชื่อ อีเมล หรือรหัสสมาชิก…" value={query} onChange={e => setQuery(e.target.value)} /><Button disabled={busy}>ค้นหา</Button></form><p className="muted">แสดงไม่เกิน 100 บัญชี · ไม่สามารถแก้สิทธิ์บัญชี Admin ผ่านหน้านี้</p>
        {selected && <form className="edit-panel" onSubmit={e => { e.preventDefault(); run(async () => { await request("member", { id: selected.id, role: selected.role, status: selected.status, reason }); setSelected(null); setReason(""); setMembers(await request("members?q=" + encodeURIComponent(query))); await refresh(); setStatus("บันทึกแล้ว บัญชีที่เปลี่ยนสิทธิ์ต้องเข้าสู่ระบบใหม่"); }); }}><h3>จัดการ {selected.email}</h3><label>สิทธิ์<select value={selected.role} onChange={e => setSelected({ ...selected, role: e.target.value })}><option value="USER">สมาชิก</option><option value="EMPLOYEE">พนักงาน POS</option><option value="SUPERVISOR">หัวหน้างาน (อนุมัติคืนเงิน)</option></select></label><label>สถานะ<select value={selected.status} onChange={e => setSelected({ ...selected, status: e.target.value })}><option value="ACTIVE">เปิดใช้งาน</option><option value="SUSPENDED">ระงับบัญชี</option></select></label><label>เหตุผล (บันทึกประวัติ)<input value={reason} onChange={e => setReason(e.target.value)} minLength={5} maxLength={500} required /></label><Button disabled={busy}>บันทึกการเปลี่ยนแปลง</Button><Button type="button" variant="outline" onClick={() => setSelected(null)}>ยกเลิก</Button></form>}
        <div className="table-scroll"><table><thead><tr><th>สมาชิก</th><th>สิทธิ์</th><th>สถานะ</th><th>Wallet</th><th></th></tr></thead><tbody>{members.map(m => <tr key={m.id}><td>{m.name}<small>{m.email}</small></td><td>{m.role}</td><td>{m.status}</td><td>{money(m.wallet?.balance ?? 0)}</td><td><Button variant="outline" disabled={busy || m.role === "ADMIN" || m.status === "PENDING"} onClick={() => { setSelected({...m}); setReason(""); }}>จัดการ</Button><Button variant="outline" disabled={busy || m.status !== "ACTIVE" || !m.wallet} onClick={()=>setAdjustTarget({...m})}>เพิ่ม / ลดเงิน</Button></td></tr>)}</tbody></table></div>
      </section>}
      {tab === "terminals" && <div className="grid"><section className="formal-card"><h2>จุดรับชำระทั้งหมด</h2>{overview?.terminals.map(t => <div className="data-row" key={t.id}><div><strong>{t.name}</strong><small>{t.id} · {t.active && !t.locked ? "พร้อมเปิดกะ" : "ปิดใช้งาน / ล็อก"}</small></div><Button variant="outline" onClick={() => setTerminal({...t})}>แก้ไข</Button></div>)}</section><form className="formal-card" onSubmit={e => { e.preventDefault(); run(async () => { await request("terminal", terminal); await refresh(); setStatus("บันทึกจุดรับชำระแล้ว"); }); }}><h2>เพิ่ม / แก้ไขจุดรับชำระ</h2><label>รหัสจุดขาย<input required pattern="[a-zA-Z0-9_-]{1,60}" value={terminal.id} onChange={e => setTerminal({...terminal, id:e.target.value})} /></label><label>ชื่อที่แสดง<input required maxLength={100} value={terminal.name} onChange={e => setTerminal({...terminal, name:e.target.value})} /></label><label className="check-row"><input type="checkbox" checked={terminal.active} onChange={e => setTerminal({...terminal,active:e.target.checked})} />เปิดใช้งาน</label><label className="check-row"><input type="checkbox" checked={terminal.locked} onChange={e => setTerminal({...terminal,locked:e.target.checked})} />ล็อกจุดขายและปิดกะที่เปิดอยู่</label><Button disabled={busy}>บันทึกจุดรับชำระ</Button></form></div>}
      {tab === "debt" && <DebtReport request={request} />}
      {tab === "audit" && <section className="formal-card"><h2>ประวัติกิจกรรมล่าสุด</h2><p className="muted">ล่าสุด 50 รายการ · บันทึกนี้แก้ไขหรือลบผ่านระบบไม่ได้</p>{overview?.audit.map(a => <details className="audit-item" key={a.id}><summary><strong>{a.action}</strong><span>{date(a.createdAt)}</span></summary><p>ผู้ทำรายการ: {a.actorId}</p><p>เป้าหมาย: {a.targetId}</p>{a.detail && <pre>{a.detail}</pre>}</details>)}</section>}
    </>}
  </div>;
}
