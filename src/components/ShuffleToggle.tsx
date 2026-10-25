import { useEffect, useRef, useState } from "react";

const TIP = "Mode surprise : 5 restos ouverts tirés au sort, bien notés ou pas. Pour sortir des sentiers battus.";
const LONG_PRESS_MS = 450;

/**
 * Interrupteur du mode surprise, avec une bulle d'explication : au survol à la souris,
 * ou par appui long au doigt (sur mobile, un appui long ne bascule pas le mode).
 */
export function ShuffleToggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  const [tip, setTip] = useState(false);
  const pressTimer = useRef<number | undefined>(undefined);
  const longPressed = useRef(false);

  useEffect(() => () => window.clearTimeout(pressTimer.current), []);

  return (
    <div className="shuffle">
      <button
        type="button"
        className={`shuffle-button${on ? " on" : ""}`}
        aria-pressed={on}
        aria-label="Mode surprise"
        aria-describedby="shuffle-tip"
        onPointerEnter={(e) => e.pointerType === "mouse" && setTip(true)}
        onPointerLeave={(e) => e.pointerType === "mouse" && setTip(false)}
        onPointerDown={(e) => {
          if (e.pointerType === "mouse") return;
          longPressed.current = false;
          pressTimer.current = window.setTimeout(() => {
            longPressed.current = true;
            setTip(true);
            navigator.vibrate?.(15);
          }, LONG_PRESS_MS);
        }}
        onPointerUp={() => window.clearTimeout(pressTimer.current)}
        onPointerCancel={() => window.clearTimeout(pressTimer.current)}
        onContextMenu={(e) => e.preventDefault()}
        onClick={() => {
          if (longPressed.current) {
            // Fin d'un appui long : on a juste montré la bulle, on la laisse lire un instant.
            longPressed.current = false;
            window.setTimeout(() => setTip(false), 2500);
            return;
          }
          setTip(false);
          onChange(!on);
        }}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path
            fill="currentColor"
            d="M10.59 9.17 5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"
          />
        </svg>
      </button>
      <div id="shuffle-tip" role="tooltip" className={`shuffle-tip${tip ? " visible" : ""}`}>
        {TIP}
      </div>
    </div>
  );
}
