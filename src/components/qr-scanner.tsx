"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import { memberQrToken } from "@/lib/member-qr";

export function QrScanner({ disabled, onScan, openRequest = 0 }: {
  disabled: boolean;
  openRequest?: number;
  onScan: (token: string) => void;
}) {
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [message, setMessage] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const handledOpenRequest = useRef(0);
  useEffect(() => {
    if (!disabled && openRequest > handledOpenRequest.current) {
      handledOpenRequest.current = openRequest;
      setActive(true);
    }
  }, [openRequest, disabled]);
  const onScanRef = useRef(onScan);
  useEffect(() => { onScanRef.current = onScan; }, [onScan]);

  useEffect(() => {
    if (!active || disabled) { if (disabled) setActive(false); return; }
    let cancelled = false;
    let stream: MediaStream | null = null;
    let frame = 0;
    let lastFrame = 0;
    let detected = false;
    const video = videoRef.current;
    const stop = () => {
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach(track => track.stop());
      if (video) { video.pause(); video.srcObject = null; }
    };
    const hide = () => {
      if (document.hidden) {
        stop();
        setActive(false);
        setMessage("พักกล้องแล้ว กดเปิดกล้องอีกครั้งเมื่อกลับมารับชำระ");
      }
    };
    document.addEventListener("visibilitychange", hide);
    setLoading(true);
    setMessage("กำลังเปิดกล้อง กรุณาอนุญาตการใช้กล้องในเบราว์เซอร์");
    async function start() {
      try {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
          throw new Error("CAMERA_UNAVAILABLE");
        const { default: decode } = await import("jsqr");
        if (cancelled || document.hidden) return;
        const acquired = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (cancelled || document.hidden) {
          acquired.getTracks().forEach(track => track.stop());
          return;
        }
        stream = acquired;
        if (!video) throw new Error("CAMERA_UNAVAILABLE");
        stream.getVideoTracks().forEach(track => track.addEventListener("ended", () => {
          if (!cancelled) { stop(); setActive(false); setMessage("กล้องถูกปิดหรือขาดการเชื่อมต่อ กรุณาเปิดใหม่"); }
        }));
        video.srcObject = stream;
        await video.play();
        if (cancelled) return;
        setLoading(false);
        setMessage("เล็ง QR จากหน้า Wallet สมาชิกให้อยู่กลางภาพ");
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("CAMERA_UNAVAILABLE");
        function scan(now: number) {
          if (cancelled || detected || document.hidden || !video) return;
          if (now - lastFrame >= 180 && video.readyState >= 2 && video.videoWidth > 0) {
            lastFrame = now;
            // Cap decoding size and rate for mobile battery/CPU use.
            const scale = Math.min(1, 720 / video.videoWidth);
            canvas.width = Math.round(video.videoWidth * scale);
            canvas.height = Math.round(video.videoHeight * scale);
            try {
              context!.drawImage(video, 0, 0, canvas.width, canvas.height);
              const pixels = context!.getImageData(0, 0, canvas.width, canvas.height);
              const result = decode(pixels.data, pixels.width, pixels.height, { inversionAttempts: "dontInvert" });
              if (result) {
                const token = memberQrToken(result.data);
                if (token) {
                  detected = true;
                  stop();
                  setActive(false);
                  setMessage("อ่าน QR สำเร็จ ปิดกล้องแล้ว");
                  onScanRef.current(token);
                  return;
                }
                setMessage("QR นี้ไม่ใช่ QR สมาชิก Smart Canteen กรุณาเปิด QR จากหน้า Wallet");
              }
            } catch {
              stop(); setActive(false); setMessage("อ่านภาพจากกล้องไม่ได้ กรุณาเปิดใหม่ หรือใช้ช่องกรอกรหัสด้านล่าง"); return;
            }
          }
          frame = requestAnimationFrame(scan);
        }
        frame = requestAnimationFrame(scan);
      } catch (error) {
        if (cancelled) return;
        stop(); setActive(false); setLoading(false);
        const code = error instanceof Error ? error.name === "Error" ? error.message : error.name : "";
        const messages: Record<string, string> = {
          NotAllowedError: "ยังไม่ได้อนุญาตกล้อง กรุณาเปิดสิทธิ์กล้องในเมนูรูปกุญแจ/การตั้งค่าเว็บไซต์ แล้วลองใหม่",
          NotFoundError: "ไม่พบกล้องในเครื่องนี้ ใช้เครื่องสแกน USB หรือวางรหัสสมาชิกด้านล่างได้",
          NotReadableError: "กล้องอาจถูกแอปอื่นใช้อยู่ กรุณาปิดแอปนั้นแล้วเปิดกล้องใหม่",
          CAMERA_UNAVAILABLE: "เบราว์เซอร์นี้เปิดกล้องไม่ได้ กรุณาใช้ Chrome หรือ Safari ผ่าน HTTPS หรือ localhost",
        };
        setMessage(messages[code] ?? "เปิดกล้องไม่สำเร็จ ลองเปิดใหม่ หรือใช้เครื่องสแกน USB/ช่องกรอกรหัสด้านล่าง");
      }
    }
    void start();
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", hide);
      stop();
    };
  }, [active, disabled, facing]);

  return <div className="qr-camera">
    {!active ? <Button type="button" disabled={disabled} onClick={() => setActive(true)}>📷 เปิดกล้องสแกน QR สมาชิก</Button> : <>
      <div className="qr-camera-preview" aria-busy={loading}>
        <video ref={videoRef} muted playsInline autoPlay aria-label="ภาพกล้องสำหรับสแกน QR สมาชิก" />
        <div className="qr-camera-guide" aria-hidden="true" />
      </div>
      <div className="row">
        <Button type="button" variant="outline" onClick={() => { setActive(false); setMessage("ปิดกล้องแล้ว"); }}>ปิดกล้อง</Button>
        <Button type="button" variant="outline" onClick={() => setFacing(current => current === "environment" ? "user" : "environment")}>สลับกล้องหน้า / หลัง</Button>
      </div>
    </>}
    {disabled && <p className="muted">เปิดกะและยืนยันยอดก่อนจึงจะสแกนได้ หากมีรายการค้างให้ตรวจสอบรายการเดิมก่อน</p>}
    {message && <p role="status" className="qr-camera-message">{message}</p>}
    <small>อ่านภาพในเครื่อง ไม่บันทึกหรือส่งภาพกล้องขึ้นเซิร์ฟเวอร์ เมื่อเงินพอ สแกนแล้วตัดยอดที่ยืนยันไว้ทันที</small>
  </div>;
}
