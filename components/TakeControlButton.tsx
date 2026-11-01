"use client";

import type { LucideIcon } from "lucide-react";
import { MousePointer2, Play } from "lucide-react";
import { useArafaStore } from "@/store/useArafaStore";

type SegmentProps = {
  icon: LucideIcon;
  label: string;
  /** This segment represents the current camera mode. */
  active: boolean;
  isDay: boolean;
  onClick: () => void;
};

function Segment({ icon: Icon, label, active, isDay, onClick }: SegmentProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={active}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={[
        "pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full",
        "transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-1",
        isDay
          ? "focus-visible:ring-black/60"
          : "focus-visible:ring-white/70",
        active
          ? [isDay ? "bg-black text-white" : "bg-white text-black", "cursor-default"].join(" ")
          : [
              isDay
                ? "text-black/60 hover:bg-black/10 hover:text-black"
                : "text-white/60 hover:bg-white/10 hover:text-white",
              "active:scale-90",
            ].join(" "),
      ].join(" ")}
    >
      <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
    </button>
  );
}

/**
 * Camera mode switch: [ mouse ] = take manual control, [ play ] = resume the cinematic sequence.
 * The segment of the current mode is filled; the other one is the action.
 */
export default function TakeControlButton() {
  const cinematicMode = useArafaStore((s) => s.cinematicMode);
  const isDay = useArafaStore((s) => s.isDay);
  const takeControl = useArafaStore((s) => s.takeControl);
  const resumeCinematic = useArafaStore((s) => s.resumeCinematic);

  return (
    <div
      role="group"
      aria-label="Camera mode"
      className={[
        "pointer-events-auto flex items-center gap-1 rounded-full border p-1 backdrop-blur-md",
        "transition-colors duration-700",
        isDay ? "border-black/20 bg-white/30" : "border-white/20 bg-black/30",
      ].join(" ")}
    >
      <Segment
        icon={MousePointer2}
        label="Take manual control"
        active={!cinematicMode}
        isDay={isDay}
        onClick={takeControl}
      />
      <Segment
        icon={Play}
        label="Resume cinematic camera"
        active={cinematicMode}
        isDay={isDay}
        onClick={resumeCinematic}
      />
    </div>
  );
}
