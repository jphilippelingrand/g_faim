#!/bin/zsh
# Le robot Instagram sur le Mac : lancé toutes les 5 minutes par launchd (social/com.groubl.instagram.plist).
# Plus ponctuel que GitHub Actions (qui ne passe que toutes les quelques heures), et il publie aussi les stories.
# Il lit la file sur GitHub (origin/main) sans toucher aux fichiers du dépôt, publie ce qui est dû,
# et le fête par une notification. GitHub reste en secours : un post déjà en ligne n'est jamais republié.
set -u
cd "${0:A:h}/.." || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

QUEUE_COPY="${TMPDIR:-/tmp}/groubl-queue.json"
git fetch -q origin main 2>/dev/null && git show origin/main:social/queue.json > "$QUEUE_COPY" || exit 0
# Les images doivent être en ligne : c'est groubl.com (déployé depuis main) qui les sert, pas ce Mac.

OUT=$(QUEUE="$QUEUE_COPY" node --env-file=.env social/publish.mjs 2>&1)
STATUS=$?
echo "$(date '+%F %T') $OUT"

# Une petite fête par publication.
CHEERS=("GRROOOUUBBLL ! 🍟" "Miam. C'est parti. 🌮" "Le ventre a parlé. 📣" "Servi chaud. 🔥" "Nan, nan… MIAM ! ❤️")
for id in ${(f)"$(print -r -- "$OUT" | sed -n 's/^Publié : \([^ ]*\).*/\1/p')"}; do
  cheer=${CHEERS[$(( RANDOM % ${#CHEERS} + 1 ))]}
  osascript -e "display notification \"« $id » est en ligne sur @groubl_app\" with title \"$cheer\" sound name \"Glass\"" 2>/dev/null
done
if [ $STATUS -ne 0 ]; then
  osascript -e "display notification \"$(print -r -- "$OUT" | grep -m1 -E 'Error|Instagram' | cut -c1-120 | tr -d '\"')\" with title \"Groubl : le robot Instagram a calé 😬\"" 2>/dev/null
fi
exit $STATUS
