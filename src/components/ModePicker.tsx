import { t } from "../i18n";

/** Ce qu'on cherche : le top par note, de quoi manger vite tout près, ou un tirage au sort. */
export type Mode = "top" | "fast" | "surprise";

const OPTIONS: { mode: Mode; emoji: string; label: "modeTop" | "modeFast" | "modeSurprise" }[] = [
  { mode: "top", emoji: "⭐", label: "modeTop" },
  { mode: "fast", emoji: "⚡", label: "modeFast" },
  { mode: "surprise", emoji: "🎲", label: "modeSurprise" },
];

/** Trois choix exclusifs, toujours visibles ; en version compacte (barre du haut), les emojis seuls. */
export function ModePicker({ mode, onChange, compact = false }: { mode: Mode; onChange: (mode: Mode) => void; compact?: boolean }) {
  return (
    <div className={`modes${compact ? " compact" : ""}`} role="radiogroup" aria-label={t("modeLabel")}>
      {OPTIONS.map((o) => (
        <button
          key={o.mode}
          type="button"
          role="radio"
          aria-checked={mode === o.mode}
          aria-label={compact ? t(o.label) : undefined}
          title={compact ? t(o.label) : undefined}
          onClick={() => onChange(o.mode)}
        >
          <span aria-hidden="true">{o.emoji}</span>
          {!compact && <span>{t(o.label)}</span>}
        </button>
      ))}
    </div>
  );
}
