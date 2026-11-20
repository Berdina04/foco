@AGENTS.md

## Notas para Claude Code

- Hablale al usuario en español rioplatense, como la app.
- Las guías de `.claude/skills/` son skills del proyecto: usalas cuando la tarea coincida (también se invocan con `/verificar-ui`, `/nuevo-disparador`, `/nuevo-ajuste`, `/ajustar-ia`, `/escribir-textos`).
- Para verificar la interfaz corré `npm run smoke` y mirá los PNG de `smoke-output/` con Read (podés ver imágenes). No uses `npm start` para verificar: abre la app real, pide permisos de macOS y queda corriendo en la barra de menú.
- Antes de usar algo de la API de Claude que no esté ya en `src/ai-coach.js` (parámetros, betas, modelos), cargá la skill `claude-api` en vez de confiar en la memoria.
- No hagas pedidos reales a la API (gastan créditos del usuario) sin preguntar antes.
