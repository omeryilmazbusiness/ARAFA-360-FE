"use client";

import { useArafaStore } from "@/store/useArafaStore";

/** Brand mark: black over the daytime sky, white over the night void. No glow, just type. */
export default function HudHeader() {
  const isDay = useArafaStore((s) => s.isDay);

  return (
    <header className="absolute left-1/2 top-5 -translate-x-1/2 text-center sm:top-7">
      <h1
        className={[
          "font-[family-name:var(--font-geist-sans)] text-[13px] font-light uppercase sm:text-sm",
          // Trailing letter-spacing is added after the last glyph; pad the left to keep it optically centred.
          "pl-[0.5em] tracking-[0.5em] transition-colors duration-700",
          isDay ? "text-black" : "text-white",
        ].join(" ")}
      >
        ARAFA 360
      </h1>
    </header>
  );
}
