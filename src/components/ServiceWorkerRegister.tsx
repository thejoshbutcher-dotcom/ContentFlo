"use client";

import { useEffect } from "react";

/**
 * Registers the service worker (public/sw.js) once the page has loaded, so the
 * app is installable and has an offline fallback. No-op where service workers
 * aren't supported. Registration is at the root scope ("/").
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // Never run the SW in development. Its cache-first rule on /_next/static is
    // safe in production (chunk filenames are content-hashed, so a deploy busts
    // the cache) but in dev the chunk names are stable, so it would serve stale
    // JS and mask HMR. Tear down anything a previous dev session registered.
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => regs.forEach((r) => r.unregister()))
        .catch(() => {});
      if (typeof caches !== "undefined") {
        caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
      }
      return;
    }

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.error("[sw] registration failed", err);
      });
    };
    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register);
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
