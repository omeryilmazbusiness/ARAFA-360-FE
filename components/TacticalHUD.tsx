"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useArafaStore } from "@/store/useArafaStore";
import { getTentInfo } from "@/utils/campLayout";

type FieldProps = { label: string; value: string; note?: string };

/** One label / value pair: a whisper-quiet caption over a crisp, light-weight figure. */
function Field({ label, value, note }: FieldProps) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-widest text-white/40">{label}</dt>
      <dd className="mt-1.5 flex items-baseline gap-2 whitespace-nowrap text-lg font-light tabular-nums text-white/90">
        {value}
        {note && <span className="truncate text-[11px] font-normal tracking-wide text-white/35">{note}</span>}
      </dd>
    </div>
  );
}

/**
 * Tent metadata card: a single pane of polished glass that breathes in when a tent is selected and
 * fades back out when it is dismissed. It only reads the Zustand store – selecting never re-renders
 * the 3D canvas.
 *
 * The wrapper never intercepts the canvas (`pointer-events-none`); only the glass itself opts back in.
 */
export default function TacticalHUD() {
  const selectedId = useArafaStore((s) => s.selectedTentId);
  const selectTent = useArafaStore((s) => s.selectTent);
  const visible = selectedId !== null;

  // Keep the last tent's data on screen while the card fades out.
  const [lastId, setLastId] = useState<number | null>(null);
  useEffect(() => {
    if (selectedId !== null) setLastId(selectedId);
  }, [selectedId]);
  const shownId = selectedId ?? lastId;
  const info = shownId === null ? null : getTentInfo(shownId);

  // Escape dismisses, like any native sheet.
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && selectTent(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, selectTent]);

  return (
    <div className="pointer-events-none absolute bottom-5 right-4 sm:bottom-8 sm:right-8">
      <aside
        role="status"
        aria-live="polite"
        aria-hidden={!visible}
        className={[
          "pointer-events-auto relative w-[min(19rem,calc(100vw-2rem))] overflow-hidden rounded-2xl",
          "border border-white/10 bg-black/20 shadow-2xl backdrop-blur-xl backdrop-saturate-150",
          "font-[family-name:var(--font-geist-sans)] [text-shadow:0_1px_14px_rgba(0,0,0,0.35)]",
          // Breathe in / out: opacity + a short rise + a hint of scale. `invisible` flips at the end of the fade.
          "transition-all duration-500 ease-out motion-reduce:transition-none",
          visible ? "visible translate-y-0 scale-100 opacity-100" : "invisible translate-y-3 scale-[0.98] opacity-0",
        ].join(" ")}
      >
        {/* Glass sheen: a faint top-left light and a polished 1px inner edge. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-white/[0.07] via-transparent to-transparent shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]"
        />

        <div className="relative p-6">
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-[0.3em] text-white/40">Selected tent</p>
            <button
              type="button"
              onClick={() => selectTent(null)}
              aria-label="Close"
              tabIndex={visible ? 0 : -1}
              className={[
                "-mr-2 -mt-2 flex h-8 w-8 items-center justify-center rounded-full text-white/30",
                "transition-all duration-300 ease-out hover:text-white hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.55)]",
                "focus-visible:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40",
              ].join(" ")}
            >
              <X size={16} strokeWidth={1} aria-hidden="true" />
            </button>
          </div>

          <div className="my-5 h-px bg-gradient-to-r from-white/15 via-white/5 to-transparent" />

          {info && (
            // Re-keyed per tent so the figures softly re-appear when the selection changes.
            <dl key={shownId} className="hud-swap grid grid-cols-2 gap-x-6 gap-y-6">
              <Field label="Zone" value={info.zone} />
              <Field label="Tent no" value={info.tentNo} />
              <Field
                label="Capacity"
                value={info.capacity === null ? "—" : info.capacity.toLocaleString("en-US")}
                note={info.capacity === null ? undefined : "hajj"}
              />
              <Field label="Dims" value={info.dims} />
            </dl>
          )}
        </div>
      </aside>
    </div>
  );
}
