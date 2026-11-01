"use client";
import { useEffect, useState } from "react";
type InstallEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> };
export function InstallApp() {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(true);
  const [help, setHelp] = useState(false);
  const [ios, setIos] = useState(false);
  useEffect(() => {
    const mode = matchMedia("(display-mode: standalone)");
    const update = () => setInstalled(mode.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    update(); setIos(/iPad|iPhone|iPod/.test(navigator.userAgent));
    const capture = (event: Event) => { event.preventDefault(); setPrompt(event as InstallEvent); };
    const done = () => { setInstalled(true); setPrompt(null); };
    addEventListener("beforeinstallprompt", capture); addEventListener("appinstalled", done); mode.addEventListener("change", update);
    return () => { removeEventListener("beforeinstallprompt", capture); removeEventListener("appinstalled", done); mode.removeEventListener("change", update); };
  }, []);
  if (installed) return null;
  return <aside className="install-banner">
    <img src="/icons/icon-192.png" width="44" height="44" alt="" />
    <div><strong>เปิด Wallet ได้ในแตะเดียว</strong><small>เพิ่ม Smart Canteen ลงหน้าจอมือถือ</small></div>
    <button className="button outline" onClick={async () => {
      if (!prompt) { setHelp(!help); return; }
      try { await prompt.prompt(); await prompt.userChoice; setPrompt(null); } catch { setHelp(true); }
    }}>เพิ่มลงหน้าจอ</button>
    {help && <p className="install-help" role="status">{ios ? "เปิดเว็บด้วย Safari → แตะปุ่มแชร์ → เพิ่มไปยังหน้าจอโฮม → เพิ่ม" : "เปิดเมนู ⋮ ของเบราว์เซอร์ → ติดตั้งแอป หรือ เพิ่มลงในหน้าจอหลัก หากไม่มีเมนูนี้ ให้เปิดเว็บด้วย Chrome หรือ Safari โดยตรง"}</p>}
  </aside>;
}
