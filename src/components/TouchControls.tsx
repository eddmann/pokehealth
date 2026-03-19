import { useCallback, useRef } from "react";
import { emulator } from "../lib/emulator";
import type { JoypadButton } from "../lib/types";

type DpadDir = "up" | "down" | "left" | "right";

function DpadButton({
  dir,
  className,
  label,
}: {
  dir: DpadDir;
  className: string;
  label: string;
}) {
  const onDown = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      e.preventDefault();
      emulator.setButton(dir, true);
    },
    [dir]
  );
  const onUp = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      e.preventDefault();
      emulator.setButton(dir, false);
    },
    [dir]
  );

  return (
    <button
      className={`bg-slate-700 active:bg-slate-500 rounded-lg flex items-center justify-center text-slate-400 text-lg font-bold select-none touch-none ${className}`}
      onTouchStart={onDown}
      onTouchEnd={onUp}
      onMouseDown={onDown}
      onMouseUp={onUp}
      onMouseLeave={onUp}
    >
      {label}
    </button>
  );
}

function ActionButton({
  button,
  label,
  className = "",
  size = "large",
}: {
  button: JoypadButton;
  label: string;
  className?: string;
  size?: "large" | "small";
}) {
  const onDown = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      e.preventDefault();
      emulator.setButton(button, true);
    },
    [button]
  );
  const onUp = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      e.preventDefault();
      emulator.setButton(button, false);
    },
    [button]
  );

  const sizeClass =
    size === "large" ? "w-16 h-16 text-sm" : "w-14 h-7 text-xs";

  return (
    <button
      className={`rounded-full font-bold select-none touch-none active:scale-95 transition-transform ${sizeClass} ${className}`}
      onTouchStart={onDown}
      onTouchEnd={onUp}
      onMouseDown={onDown}
      onMouseUp={onUp}
      onMouseLeave={onUp}
    >
      {label}
    </button>
  );
}

export default function TouchControls() {
  return (
    <div className="w-full max-w-md mx-auto px-4 pb-4 select-none">
      <div className="flex items-end justify-between">
        {/* D-Pad */}
        <div className="grid grid-cols-3 grid-rows-3 gap-1 w-36 h-36">
          <div />
          <DpadButton dir="up" className="col-start-2 row-start-1" label="▲" />
          <div />
          <DpadButton
            dir="left"
            className="col-start-1 row-start-2"
            label="◀"
          />
          <div className="bg-slate-800 rounded-lg col-start-2 row-start-2" />
          <DpadButton
            dir="right"
            className="col-start-3 row-start-2"
            label="▶"
          />
          <div />
          <DpadButton
            dir="down"
            className="col-start-2 row-start-3"
            label="▼"
          />
          <div />
        </div>

        {/* A/B Buttons */}
        <div className="flex gap-3 items-center mb-4">
          <ActionButton
            button="b"
            label="B"
            className="bg-red-800 active:bg-red-600 text-red-200"
          />
          <ActionButton
            button="a"
            label="A"
            className="bg-red-700 active:bg-red-500 text-red-100 -mt-6"
          />
        </div>
      </div>

      {/* Start/Select */}
      <div className="flex justify-center gap-6 mt-3">
        <ActionButton
          button="select"
          label="SELECT"
          size="small"
          className="bg-slate-600 active:bg-slate-400 text-slate-300"
        />
        <ActionButton
          button="start"
          label="START"
          size="small"
          className="bg-slate-600 active:bg-slate-400 text-slate-300"
        />
      </div>
    </div>
  );
}
