import { useEffect, useState, type RefObject } from "react";
import { ShuffleToggle } from "./ShuffleToggle";

/** Barre compacte fixée en haut, qui apparaît quand l'élément surveillé (la grande dame) sort de l'écran. */
export function MiniBar({
  watch,
  surprise,
  onSurprise,
}: {
  watch: RefObject<HTMLElement | null>;
  surprise: boolean;
  onSurprise: (on: boolean) => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = watch.current;
    if (!el) return;
    // Visible dès que le bas du titre passe sous le haut de l'écran.
    const observer = new IntersectionObserver(([entry]) => setVisible(!entry.isIntersecting), {
      rootMargin: "-56px 0px 0px 0px",
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [watch]);

  return (
    <div className={`minibar${visible ? " visible" : ""}`} aria-hidden={!visible} inert={!visible}>
      <button
        type="button"
        className="minibar-home"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        aria-label="Remonter en haut"
      >
        <img src="/icon.svg" alt="" width={34} height={34} />
        <span>J'ai faim</span>
      </button>
      <ShuffleToggle on={surprise} onChange={onSurprise} />
    </div>
  );
}
