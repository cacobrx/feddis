#!/bin/bash
# Sube los cambios del proyecto a GitHub.
# Uso: ./bin/subir.sh "mensaje opcional"
cd "$(dirname "$0")/.." || exit 1
git add -A
if git diff --cached --quiet; then
  echo "Sin cambios para subir."
  exit 0
fi
git commit -q -m "${1:-Actualización $(date '+%Y-%m-%d %H:%M')}"
git push
