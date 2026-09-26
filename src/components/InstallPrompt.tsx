import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const KEY = "votix-install-dismissed";
const WAIT_DAYS = 3;

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return;
    const last = Number(localStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < WAIT_DAYS * 86400000) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    const ua = navigator.userAgent;
    const isIos = /iphone|ipad|ipod/i.test(ua) && !/crios|fxios/i.test(ua);
    let t: number | undefined;
    if (isIos) {
      setIos(true);
      t = window.setTimeout(() => setShow(true), 1500);
    }
    const onInstalled = () => setShow(false);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      if (t) clearTimeout(t);
    };
  }, []);

  function dismiss() {
    localStorage.setItem(KEY, String(Date.now()));
    setShow(false);
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    dismiss();
  }

  if (!show) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-md rounded-xl border border-border bg-card p-4 shadow-2xl sm:bottom-6">
      <button onClick={dismiss} aria-label="Close" className="absolute right-3 top-3 text-muted-foreground hover:text-foreground">
        <X className="size-4" />
      </button>
      <div className="flex items-center gap-3 pr-6">
        <img src="/icon-192.png" alt="" width={48} height={48} className="size-12 rounded-lg" />
        <div>
          <p className="font-semibold text-foreground">Install the VOTIX app</p>
          <p className="text-sm text-muted-foreground">
            {ios ? (
              <>Tap <Share className="inline size-4" /> Share, then “Add to Home Screen”.</>
            ) : (
              "Get tickets and vote faster from your home screen."
            )}
          </p>
        </div>
      </div>
      {!ios && (
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={dismiss}>Not now</Button>
          <Button size="sm" onClick={install} className="votix-gradient-bg gap-2 font-semibold text-primary-foreground">
            <Download className="size-4" /> Install
          </Button>
        </div>
      )}
    </div>
  );
}
