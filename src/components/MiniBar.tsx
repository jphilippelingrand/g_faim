import { useEffect, useState, type RefObject } from "react";
import { ModePicker, type Mode } from "./ModePicker";
import { t } from "../i18n";

/** Barre compacte fixée en haut, qui apparaît quand l'élément surveillé (la grande dame) sort de l'écran. */
export function MiniBar({
  watch,
  mode,
  onMode,
}: {
  watch: RefObject<HTMLElement | null>;
  mode: Mode;
  onMode: (mode: Mode) => void;
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
        aria-label={t("backToTop")}
      >
        <img src="/icon.svg" alt="" width={34} height={34} />
        <span>{t("appName")}</span>
      </button>
      <ModePicker mode={mode} onChange={onMode} compact />
    </div>
  );
}
