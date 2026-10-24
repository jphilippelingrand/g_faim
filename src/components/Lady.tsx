import { useEffect, useState } from "react";

/** starving = ça gargouille non-stop (recherche) ; hungry = gros gargouillis réguliers ; happy = elle a trouvé, elle bave. */
export type Mood = "starving" | "hungry" | "happy";

const GRR = "GRROOOUUBBLL";

export function Lady({ mood }: { mood: Mood }) {
  // Un clic sur la dame la fait gargouiller à fond pendant un instant.
  const [poked, setPoked] = useState(false);
  useEffect(() => {
    if (!poked) return;
    const t = setTimeout(() => setPoked(false), 1800);
    return () => clearTimeout(t);
  }, [poked]);

  const effective = poked ? "starving" : mood;

  return (
    <button
      type="button"
      className="lady"
      data-mood={effective}
      onClick={() => setPoked(true)}
      aria-label="La petite dame a faim"
    >
      <span className="grr" aria-hidden="true">
        {[...GRR].map((ch, i) => (
          <span key={i} style={{ animationDelay: `${i * 35}ms` }}>
            {ch}
          </span>
        ))}
      </span>

      <svg viewBox="0 0 240 270" width="220" height="248" aria-hidden="true">
        <g className="figure">
          {/* pieds */}
          <ellipse cx="100" cy="258" rx="16" ry="7" fill="var(--ink)" />
          <ellipse cx="140" cy="258" rx="16" ry="7" fill="var(--ink)" />

          {/* robe */}
          <path d="M92 84 Q120 76 148 84 L172 252 L68 252 Z" fill="var(--dress)" />

          {/* lignes de grondement ((( ))) */}
          <g className="waves waves-left" fill="none" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round">
            <path d="M52 150 q-9 18 0 36" />
            <path d="M38 142 q-13 26 0 52" />
            <path d="M24 134 q-17 34 0 68" />
          </g>
          <g className="waves waves-right" fill="none" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round">
            <path d="M188 150 q9 18 0 36" />
            <path d="M202 142 q13 26 0 52" />
            <path d="M216 134 q17 34 0 68" />
          </g>

          {/* le ventre */}
          <g className="belly">
            <ellipse cx="120" cy="168" rx="60" ry="52" fill="var(--dress-dark)" />
            <ellipse cx="104" cy="150" rx="22" ry="12" fill="#fff" opacity=".12" />
            <path className="ripple" d="M76 178 q11 -10 22 0 t22 0 t22 0 t22 0" fill="none" stroke="var(--ink)" strokeOpacity=".25" strokeWidth="3" strokeLinecap="round" />
            <circle className="navel" cx="120" cy="172" r="3.5" fill="var(--ink)" opacity=".55" />
          </g>

          {/* bras, mains posées sur le ventre */}
          <path d="M94 92 Q66 120 78 150" fill="none" stroke="var(--skin)" strokeWidth="10" strokeLinecap="round" />
          <path d="M146 92 Q174 120 162 150" fill="none" stroke="var(--skin)" strokeWidth="10" strokeLinecap="round" />
          <circle cx="80" cy="152" r="8" fill="var(--skin)" />
          <circle cx="160" cy="152" r="8" fill="var(--skin)" />

          {/* tête */}
          <circle cx="120" cy="22" r="14" fill="var(--hair)" />
          <circle cx="120" cy="54" r="28" fill="var(--skin)" />
          <path d="M92 50 Q96 24 120 24 Q144 24 148 50 Q136 36 120 38 Q104 36 92 50 Z" fill="var(--hair)" />
          <circle cx="100" cy="66" r="5" fill="var(--blush)" />
          <circle cx="140" cy="66" r="5" fill="var(--blush)" />

          {effective === "happy" ? (
            <g fill="none" stroke="var(--ink)" strokeWidth="2.5" strokeLinecap="round">
              <path d="M102 56 q6 -7 12 0" />
              <path d="M126 56 q6 -7 12 0" />
              <path d="M110 68 q10 10 20 0" />
              <path className="drool" d="M127 72 q1 6 0 9" stroke="#8ec5e8" strokeWidth="3.5" />
            </g>
          ) : (
            <g>
              <g fill="none" stroke="var(--ink)" strokeWidth="2.5" strokeLinecap="round">
                <path d="M100 46 l11 -4" />
                <path d="M140 46 l-11 -4" />
              </g>
              <circle cx="108" cy="55" r="3" fill="var(--ink)" />
              <circle cx="132" cy="55" r="3" fill="var(--ink)" />
              <ellipse className="mouth" cx="120" cy="71" rx="4" ry="5" fill="var(--ink)" />
            </g>
          )}
        </g>
      </svg>
    </button>
  );
}
