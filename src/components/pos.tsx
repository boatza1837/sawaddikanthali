"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import { money, satang } from "@/lib/money";
type Member = { name: string; memberId: string; balance: number };
export function Pos({ userId }: { userId: string }) {
  const [amount, setAmount] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [token, setToken] = useState(""),
    [member, setMember] = useState<Member | null>(null),
    [shift, setShift] = useState(""),
    [terminal, setTerminal] = useState("counter-1"),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [history, setHistory] = useState<
      { id: string; amount: number; ledger: { createdAt: string } }[]
    >([]);
  const requestKey = useRef<string | null>(null),
    inFlight = useRef(false);
  const storageKey = `canteen:pending:${userId}`;
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw);
        setAmount(saved.amount);
        setToken(saved.token);
        setMember(saved.member);
        setShift(saved.shift);
        setTerminal(saved.terminal);
        requestKey.current = saved.key;
        setConfirmed(true);
        setUncertain(true);
        setStatus(
          "มีรายการที่ยังไม่ทราบผลจากก่อนรีเฟรช ตรวจสอบด้วย key เดิมก่อนเริ่มรายการใหม่",
        );
      }
    } catch {
      setStatus(
        "อ่านรายการค้างไม่ได้ กรุณาตรวจประวัติกับผู้ดูแลก่อนทำรายการใหม่",
      );
    } finally {
      setReady(true);
    }
  }, [storageKey]);
  async function api(path: string, data: unknown) {
    const r = await fetch(`/api/pos/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const value = await r.json();
    if (!r.ok) throw Error(value.error);
    return value;
  }
  async function run(fn: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "NETWORK_ERROR");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  function reset() {
    sessionStorage.removeItem(storageKey);
    setAmount("");
    setConfirmed(false);
    setToken("");
    setMember(null);
    requestKey.current = null;
    setUncertain(false);
  }
  function tone(success: boolean) {
    try {
      const c = new AudioContext(),
        o = c.createOscillator(),
        g = c.createGain();
      o.connect(g);
      g.connect(c.destination);
      o.frequency.value = success ? 880 : 220;
      g.gain.value = 0.04;
      o.start();
      o.stop(c.currentTime + 0.12);
      o.onended = () => c.close();
    } catch {}
  }
  if (!ready) return <p role="status">กำลังตรวจรายการค้าง…</p>;
  return (
    <>
      <div className="row">
        <div>
          <span className="badge">Employee POS · Manual amount</span>
          <h1 style={{ marginTop: 12 }}>รับชำระเงิน</h1>
        </div>
        <form action="/api/auth/signout">
          <Button variant="outline">ออกจากระบบ</Button>
        </form>
      </div>
      <div className="grid">
        <section className="card">
          <label htmlFor="terminal">Terminal ID</label>
          <input
            id="terminal"
            disabled={Boolean(shift)}
            value={terminal}
            onChange={(e) => setTerminal(e.target.value)}
          />
          <Button
            disabled={busy || Boolean(shift)}
            onClick={() =>
              run(async () => {
                const s = await api("shift", {
                  terminalId: terminal,
                  action: "open",
                });
                setShift(s.id);
                setStatus("เปิดกะแล้ว");
              })
            }
          >
            เปิดกะ
          </Button>
          <Button
            disabled={busy || !shift || uncertain}
            variant="outline"
            onClick={() =>
              run(async () => {
                await api("shift", { terminalId: terminal, action: "close" });
                setShift("");
                reset();
                setStatus("ปิดกะแล้ว");
              })
            }
          >
            ปิดกะ
          </Button>
          <Button
            disabled={busy || !shift || uncertain}
            variant="outline"
            onClick={() =>
              run(async () => {
                await api("lock", { shiftId: shift });
                setShift("");
                reset();
                setStatus("ล็อก POS แล้ว เปิดกะเพื่อใช้งานอีกครั้ง");
              })
            }
          >
            ล็อก POS
          </Button>
          <h2 style={{ marginTop: 24 }}>1. กรอกยอดรวม</h2>
          <output className="balance" aria-live="polite">
            ฿{amount || "0"}
          </output>
          <div className="keypad">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"].map(
              (k) => (
                <Button
                  key={k}
                  variant="outline"
                  disabled={busy || confirmed}
                  onClick={() => {
                    setAmount((a) =>
                      k === "⌫" ? a.slice(0, -1) : a.length < 8 ? a + k : a,
                    );
                  }}
                >
                  {k}
                </Button>
              ),
            )}
          </div>
          <Button
            disabled={busy || uncertain}
            variant="outline"
            onClick={reset}
          >
            Clear / ยกเลิก
          </Button>
          <Button
            disabled={busy || confirmed || !shift}
            onClick={() => {
              try {
                satang(amount);
                setConfirmed(true);
                setStatus("");
              } catch {
                setStatus("จำนวนเงินไม่ถูกต้อง");
              }
            }}
          >
            ยืนยันยอด
          </Button>
        </section>
        <section className="card">
          <h2>2. ระบุสมาชิก</h2>
          <p className="muted">
            สแกน QR ด้วย USB keyboard-wedge หรือวาง token จาก QR สมาชิก กล้องและ
            RFID ยังไม่เปิดใช้
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                const m = await api("identify", { token });
                setMember(m);
                requestKey.current = crypto.randomUUID();
                setStatus("ตรวจสอบชื่อและยอดก่อนยืนยัน");
              });
            }}
          >
            <label htmlFor="token">Member token</label>
            <input
              id="token"
              autoComplete="off"
              disabled={!confirmed || busy || uncertain}
              value={token}
              onChange={(e) => {
                setToken(e.target.value);
                setMember(null);
              }}
            />
            <Button disabled={!confirmed || busy || uncertain}>
              ค้นหาสมาชิก
            </Button>
          </form>
          {member && (
            <>
              <h2>3. ยืนยันชำระ</h2>
              <p>
                {member.name} · {member.memberId}
              </p>
              <p>ยอดปัจจุบัน {money(member.balance)}</p>
              <p>เรียกเก็บ {money(satang(amount))}</p>
              <p>คงเหลือหลังชำระ {money(member.balance - satang(amount))}</p>
              {member.balance < satang(amount) && (
                <div className="notice">
                  ยอดไม่เพียงพอ ขาด {money(satang(amount) - member.balance)}
                </div>
              )}
              <Button
                disabled={busy || member.balance < satang(amount)}
                onClick={() =>
                  run(async () => {
                    sessionStorage.setItem(
                      storageKey,
                      JSON.stringify({
                        amount,
                        token,
                        member,
                        shift,
                        terminal,
                        key: requestKey.current,
                      }),
                    );
                    setUncertain(true);
                    try {
                      const r = await api("charge", {
                        token,
                        amount: satang(amount),
                        shiftId: shift,
                        key: requestKey.current,
                      });
                      tone(true);
                      setStatus(
                        r.replayed
                          ? `ยืนยันรายการเดิมแล้ว ${r.transactionId} กรุณาตรวจประวัติ`
                          : `ชำระสำเร็จ ${money(r.amount)}\n${r.memberName}\nคงเหลือ ${money(r.balance)}\n${r.transactionId}\n${new Date(r.createdAt).toLocaleString("th-TH")}`,
                      );
                      reset();
                    } catch (e) {
                      tone(false);
                      if (
                        e instanceof Error &&
                        [
                          "INVALID_MEMBER_TOKEN",
                          "TOKEN_USED",
                          "INSUFFICIENT_BALANCE",
                          "INVALID_SHIFT",
                          "STAFF_REQUIRED",
                          "MEMBER_UNAVAILABLE",
                          "INVALID_AMOUNT",
                        ].includes(e.message)
                      ) {
                        setUncertain(false);
                        sessionStorage.removeItem(storageKey);
                      }
                      throw e;
                    }
                  })
                }
              >
                {uncertain ? "ตรวจสอบ/ส่งซ้ำด้วย key เดิม" : "Confirm Payment"}
              </Button>
            </>
          )}
          <p className="status" role="status">
            {status}
          </p>
          {uncertain && (
            <div className="notice">
              หากการเชื่อมต่อขัดข้อง ห้ามเริ่มรายการใหม่
              ตรวจสอบรายการเดิมด้วยปุ่มด้านบนซึ่งใช้ key เดิม
            </div>
          )}
        </section>
      </div>
      <section className="card">
        <h2>ประวัติพนักงาน</h2>
        <Button
          variant="outline"
          onClick={() =>
            run(async () => {
              const r = await fetch("/api/pos/history", { cache: "no-store" });
              const data = await r.json();
              if (!r.ok) throw Error(data.error);
              setHistory(data);
            })
          }
        >
          โหลดประวัติ
        </Button>
        {history.map((h) => (
          <p key={h.id}>
            {new Date(h.ledger.createdAt).toLocaleString("th-TH")} ·{" "}
            {money(h.amount)} · {h.id}
          </p>
        ))}
      </section>
    </>
  );
}
