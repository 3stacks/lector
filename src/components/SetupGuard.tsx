"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getSetting } from "@/lib/data-layer";

export default function SetupGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  // Check localStorage synchronously to avoid flash for returning users
  const [ready, setReady] = useState(() => {
    if (typeof window === "undefined") return false;
    if (pathname === "/setup") return true;
    return !!localStorage.getItem("lector-target-language");
  });

  useEffect(() => {
    if (pathname === "/setup") {
      setReady(true);
      return;
    }

    // Fast path: localStorage already has the language
    if (localStorage.getItem("lector-target-language")) {
      setReady(true);
      return;
    }

    // Slow path: check server setting (first visit or cleared localStorage)
    async function check() {
      try {
        const lang = await getSetting<string>("targetLanguage");
        if (!lang) {
          router.replace("/setup");
          return;
        }
        localStorage.setItem("lector-target-language", lang);
      } catch {
        // If the API is down, don't block — just continue
      }
      setReady(true);
    }

    check();
  }, [pathname, router]);

  if (!ready && pathname !== "/setup") {
    return null;
  }

  return <>{children}</>;
}
