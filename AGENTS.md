# AGENTS.md

Guía para agentes de IA (y personas) que trabajan en Foco. El [README](README.md) explica qué hace la app para quien la usa; este archivo explica cómo cambiarla sin romperla.

## Qué es Foco

App de barra de menú para macOS, hecha con Electron. Durante el horario laboral detecta distracciones (sitios y apps, mirada fuera de la pantalla, ojos cerrados) y señales de bloqueo (mirada fija sin tocar nada, saltar entre ventanas). Cuando pasa algo, muestra un aviso flotante que pregunta qué pasó y propone un próximo paso, un sprint y un premio. Con IA (Claude) mira en qué venías trabajando y te dice dónde parece que te trabaste. Está en español y en inglés.

**La regla de producto que manda sobre todo lo demás:** Foco no reta. Irse a una distracción se trata como una señal de que algo se trabó o da fiaca, no como falta de voluntad. Cualquier texto, flujo o detección nueva tiene que respetar eso.

## Comandos

```bash
npm install      # dependencias + descarga models/face_landmarker.task
npm test         # node:test: lógica pura, cámara, estrategias, IA contra un servidor falso (~1 s)
npm run smoke    # abre la app con datos temporales, recorre la UI y guarda capturas en smoke-output/ (~1 min)
npm run model    # vuelve a bajar el modelo de la cámara si falló
npm start        # abre la app real
```

- Sólo corre en macOS (`lsappinfo`, AppleScript, `systemPreferences`, `safeStorage`). Node 22 o más nuevo.
- Para verificar, usá `npm test` y `npm run smoke`. `npm start` abre la app real: pide permisos de macOS, lee tus ventanas y queda corriendo en la barra de menú.
- Antes de dar algo por terminado: `npm test` siempre; además `npm run smoke` si tocaste `src/main.js`, `src/preload.js`, `renderer/` o cualquier flujo de avisos, coach, sprints o cortes.

## Arquitectura

```
src/main.js  ── tick() cada 2 s ──►  active-window ─► classifier ─► context ─► engine.tick()
     │                                                                          │
     │   nudge / coach / signal ◄───────────────────────────────────────────────┘
     ▼
 showAlert() ─► state.alert ─► toast.html (aviso flotante)  ──► ai-coach (si hay IA)
 openCoach() ─► state.coach ─► coach.html (coach grande)
 vision.html (oculta) ── 'attention' IPC ──► state.attention
 panel.html ◄── 'state' (snapshot) en cada tick
```

**Proceso principal (`src/`, CommonJS)**

- `main.js` tiene todo el estado en el objeto `state` (alerta, coach, sprint, corte, pausas, permisos "es por trabajo") y lo maneja desde `tick()`, que corre cada `TICK_MS`. También registra el IPC (`registerIpc`), crea las ventanas y arma el menú de la barra.
- Módulos **puros** (sin `require('electron')`, testeables con Node): `engine.js`, `classifier.js`, `context.js`, `schedule.js`, `config.js` y `buildPrompt` en `ai-coach.js`. Mantenelos puros: si necesitan un dato de Electron, calculalo en `main.js` y pasalo como parámetro (por ejemplo `idleSeconds`, `hopping`).
- `engine.tick()` devuelve `{ action, state, trigger }`. `action`: `none` | `nudge` (primer aviso) | `coach` (insistir) | `signal` (señal de bloqueo, aviso suave sin sonido). Prioridad: distracción en pantalla > ojos cerrados > mirada > señales. No dispara si recibe `paused` (coach abierto, aviso que insiste o fin de sprint/corte en curso) ni durante el cooldown de `engine.resolved()`.
- Disparadores (`trigger.type`): `site`, `app`, `gaze`, `drowsy`, `stuck`, `hopping`, `manual`, `sprint_end`, `break_end`. Cada uno tiene texto en `toast.js` (`HEAD` / `MOMENT_HEAD`) y en `ai-coach.js` (`COPY.es.trigger` y `COPY.en.trigger`). Los `label` que arma el engine están en español y se traducen al mostrarlos (ver "Idiomas").
- Aviso flotante: `showAlert()` → `openAlert()` crea `state.alert` → `showToast()` / `pushToast()` mandan `toastPayload()` a la ventana. Las respuestas vuelven por los canales `toast:*` y terminan en `resolveAlert(outcome)`, que registra en stats y activa un cooldown de 30 s. El fin de sprint y de corte usan el mismo aviso con `state.alert.moment` (`sprint_end` | `break_end`) y `phase` (`ask` | `done` | `partial` | `stuck`).
- Hay dos estilos de aviso (`alerts.style`): `toast` (por defecto) y `window` (notificación del sistema + coach grande). Los dos tienen que seguir funcionando; el paso 21 del smoke cubre el estilo `window`.

**Ventanas (`renderer/`, ES modules sin bundler)**

- Cuatro ventanas: `panel` (Hoy + Ajustes), `coach`, `toast` y `vision` (cámara, oculta salvo en calibración o modo flotante). Cada una es un `.html` + `.js` con `await` de nivel superior.
- Se sirven por el protocolo `app://foco/renderer/…` (`serveAppProtocol` en `main.js`), que sólo deja leer `renderer/`, `models/` y `node_modules/@mediapipe/tasks-vision/`. Cada HTML tiene una CSP con `script-src 'self'`: nada de scripts inline ni CDNs.
- No hay framework de UI. El DOM se arma con un helper `h(tag, props, ...children)` local a cada archivo. Las ventanas no leen la config directamente: reciben lo que necesitan por `toastPayload()`, `coachContext()` o `snapshot()`.
- La lógica que se puede testear vive en `renderer/lib/*.mjs` (`attention`, `strategies`, `recorder`, `i18n`).

**IPC**

- Las ventanas sólo hablan con el proceso principal por `window.foco.invoke(canal, ...args)` y `window.foco.on(evento, cb)`, definidos en `src/preload.js` con listas blancas (`INVOKE` y `EVENTS`).
- Canal nuevo = `ipcMain.handle(...)` en `registerIpc()` **y** agregarlo a `INVOKE` (o `EVENTS`) en `preload.js`. Si te olvidás, el renderer tira `Canal no permitido`.
- No relajes `baseWebPrefs` (`contextIsolation`, `sandbox`, sin `nodeIntegration`).

**Datos** (en `app.getPath('userData')`, o sea `~/Library/Application Support/Foco/`)

- `config.json`: los ajustes. `ConfigStore` hace un merge profundo con `DEFAULTS`; los arrays del usuario reemplazan a los por defecto.
- `secrets.json`: la API key cifrada con `safeStorage`.
- `stats/AAAA-MM-DD.json`: tiempos y eventos del día (`nudge`, `coach`, `answer`, `sprint_start`, `sprint_end`, `break_start`, `coach_end`, `insight`…). El panel los lee para "Hoy" y la semana.
- `voice-models/`: el modelo de Whisper, que se baja la primera vez que se usa el micrófono.

## Privacidad: reglas que no se negocian

1. **Cámara**: se procesa sólo en `vision.js`. Al proceso principal llegan métricas (pose, mirada, estado), nunca imágenes. Ninguna imagen de la cámara se guarda ni se manda a ningún lado.
2. **Capturas de pantalla**: quedan sólo en memoria (`lastShots` en `main.js`). Nunca a disco, logs ni stats. Se mandan a la IA sólo si `context.readScreen` está activo, hay permiso y hay un aviso o una señal, y nunca de apps o sitios excluidos (`isExcluded`).
3. **Audio**: se transcribe en la Mac con Whisper. No se manda a servicios externos.
4. **API key**: sólo en `secrets.json` cifrada con `safeStorage` (o la variable `ANTHROPIC_API_KEY`). Nunca en `config.json`, logs, stats ni mensajes de error.
5. Cualquier dato nuevo que salga de la Mac tiene que ser opcional (que la persona lo active) y quedar documentado en la sección "Privacidad" del README.

## Convenciones

- **JavaScript plano**: `src/` en CommonJS (`require`), `renderer/` en ES modules. Sin TypeScript, sin bundler, sin framework de UI. No sumes dependencias sin una razón fuerte; si hace falta una, consultalo antes.
- **Estilo**: 2 espacios, comillas simples, punto y coma, coma final en literales de varias líneas, líneas de hasta unos 120 caracteres. No hay Prettier ni ESLint configurados: seguí el estilo del archivo que tocás.
- Constantes en mayúsculas arriba del archivo (`TICK_MS`, `SIGNAL_COOLDOWN_MS`, `MOMENT_TIMEOUT_S`). Unidades en el nombre (`graceSeconds`, `stareMinutes`, `…_MS`). Campos privados con `#`.
- JSDoc en las funciones públicas de los módulos puros.
- **Comentarios en español**, cortos, explicando el porqué. Cada archivo arranca con un comentario de una o dos líneas que dice qué hace.
- **CSS**: usá las variables de `renderer/styles.css` (`--accent`, `--warn`, `--surface`, `--muted`…), que ya tienen su versión oscura. No pongas colores fijos.
- **Textos de la interfaz**: se escriben en español y se traducen al inglés (ver "Idiomas"). En español, rioplatense con voseo; en los dos idiomas, cálido, breve y sin retar. Los botones hablan en primera persona de quien usa la app ("Vuelvo al foco" / "Back to it", "Me trabé" / "I'm stuck"); los títulos le hablan a la persona ("¿Te trabaste?" / "Stuck?"). Detalle y glosario en [`.claude/skills/escribir-textos/SKILL.md`](.claude/skills/escribir-textos/SKILL.md).
- Si cambiás el texto de un botón, buscalo en `scripts/smoke.js`: el smoke hace clic por texto.

## Idiomas (español e inglés)

La app tiene dos idiomas: `config.language` es `'es'` (por defecto) o `'en'` (`LANGUAGES` en `src/config.js`). **El texto en español es la clave**: se escribe en español y la traducción vive en un diccionario `EN` aparte. Si una entrada falta, se muestra el español, así nunca queda un texto vacío.

**Cómo se cambia.** El botón ES | EN del panel (`config:update` con `language`) o 🌐 en el menú de la barra llaman a `setLanguage()` en `main.js`. Esa función usa `languageChange()` (pura, en `config.js`), guarda el cambio, le manda el evento `lang` a todas las ventanas abiertas y rearma el menú. Si el menú de dopamina era el de fábrica del idioma anterior, lo cambia por el del nuevo (`DOPAMINE_MENU`); si la persona lo editó, lo deja como está.

**Dónde está cada traducción**

| Qué                                       | Dónde                                                                                          |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Textos de las ventanas (scripts y HTML)   | `EN` en `renderer/lib/i18n.mjs`. En el código, `t('Texto', { valores })`                        |
| Textos fijos del HTML                     | El mismo `EN`. `translatePage()` los traduce solos (texto, `placeholder`, `title`, `aria-label`) |
| Menú de la barra, notificaciones, errores | `EN` en `src/i18n.js`. En `main.js`, `t()` llama a `translate(lang(), …)`                      |
| `label` de los disparadores del engine    | En los **dos** `EN` (se ven en notificaciones y en el panel). El engine los deja en español     |
| Prompt y errores de la IA                 | `SYSTEM` / `SYSTEM_EN` y `COPY.es` / `COPY.en` en `ai-coach.js`; `aiCoach` recibe `lang`        |
| Plan sin IA (estrategias)                 | `EN_REASONS` en `strategies.mjs`; `reasonsFor()`, `findReason()` y `rulePlan()` reciben `lang`  |
| Resumen de ventanas para la IA            | `WorkContext.summary(now, lang)` ("hace 3 min" / "3 min ago")                                  |
| Menú de dopamina de fábrica               | `DOPAMINE_MENU.es` / `.en` en `config.js`                                                      |
| Voz                                       | Whisper transcribe en el idioma de la app (`voiceOptions()` en `main.js`)                       |
| Horas y fechas                            | `locale()` de `i18n.mjs` (`es-AR` / `en-US`)                                                   |

**Reglas**

- Todo texto que ve la persona pasa por `t()`, aunque no tenga tildes.
- Si cambiás un texto en español, cambiá también su clave en `EN`; si no, la traducción se pierde.
- Los `{valores}` tienen que ser los mismos en las dos versiones (`'Estás en {label}'` → `"You're on {label}"`).
- Cada ventana se redibuja al cambiar el idioma: `toast`, `coach` y `vision` escuchan el evento `lang`, y el panel lo toma de `snapshot().config.language`. Una ventana nueva tiene que llamar a `setLang()` al arrancar y en cada cambio, a `translatePage()` si tiene textos fijos en el HTML, y volver a dibujar lo dinámico.
- Lo que se ve igual en los dos idiomas ("Foco", "ES", "EN"…) va en `SAME` de `test/renderer.test.mjs`.
- Los tests `idioma: …` revisan el HTML de las cuatro ventanas, todo lo que pasa por `t('…')` y cualquier texto con tildes o signos del español (`áéíóúñ¿¡…`) en los scripts de las ventanas y en `main.js`. **No ven** un texto sin tildes que no pase por `t()` ni los `label` de `engine.js`: eso lo tenés que cuidar vos.
- El paso 9 del smoke (capturas 22 a 25) pasa la app al inglés, revisa panel, aviso y coach, y vuelve al español. El resto del smoke corre en español.

## Tests y verificación

- `test/logic.test.js`: engine, classifier, schedule, config, context, `buildPrompt` y las traducciones del proceso principal. El engine se prueba con `now` simulado en milisegundos (`e.tick({ now: s * 1000, … })`), sin timers reales.
- `test/ai-coach.test.js`: el pedido a Claude contra un servidor HTTP falso (via `ANTHROPIC_BASE_URL`). Nunca hagas pedidos reales a la API en los tests.
- `test/renderer.test.mjs`: `attention.mjs`, `strategies.mjs` y las traducciones de las ventanas.
- Lógica nueva en un módulo puro → test nuevo en el archivo que corresponda.
- `scripts/smoke.js` usa una carpeta temporal de datos, cámara apagada, `FOCO_NO_TICK=1` y una API key inválida a propósito. Recorre panel, coach, aviso de distracción, fin de sprint, fin de corte y el cambio de idioma, y guarda `smoke-output/NN-nombre.png` y `.txt`. Sale con código 1 si falla un paso. Si agregás un flujo de UI, agregale un paso.

## Cosas que no son obvias

- En desarrollo, macOS muestra los permisos a nombre de "Electron". Después de dar Accesibilidad o Grabación de pantalla hay que reiniciar la app.
- Cuando alguien aprieta **Guardar** en Ajustes, `saveSettings()` escribe todos los campos del formulario en `config.json`. Por eso, cambiar un valor en `DEFAULTS` sólo afecta a quien nunca guardó; una clave nueva sí le llega a todos por el merge.
- `tick()` es async (`getActivity` llama a `osascript`) y `ticking` evita que dos ticks se pisen.
- `active-window.js` deja de preguntarle por 60 s a un navegador que falló (sin permiso de Automatización), así no reintenta cada 2 s.
- La lectura de la IA se cachea 10 minutos por ventana de trabajo (`insightCache`), salvo que la persona haya contado algo.
- El modelo por defecto es `claude-opus-5-5`. `ai-coach.js` usa `client.beta.messages.create` con salida en JSON Schema y fallback del lado del servidor para los modelos de `FALLBACK_MODELS`. Si cambiás `SCHEMA`, actualizá a quienes lo usan (`toast.js`, `coach.js`, el handler `toast:sprint`) y las respuestas de prueba (`PLAN` en el test y el paso 10 del smoke).
- `models/face_landmarker.task` y `smoke-output/` están en `.gitignore`. Sin el modelo, la cámara no funciona (`npm run model`).
- `main.js` exporta algunas cosas internas (`showAlert`, `state`, `tick`…) sólo para `scripts/smoke.js`.

## Guías paso a paso

Están en `.claude/skills/`. Claude Code las carga solas cuando hacen falta; cualquier otro agente puede leer el `SKILL.md` directamente.

| Guía                                                                    | Cuándo                                                                                 |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| [`verificar-ui`](.claude/skills/verificar-ui/SKILL.md)                  | Después de tocar la interfaz o los flujos; para correr el smoke, leer las capturas y sumar pasos. |
| [`nuevo-disparador`](.claude/skills/nuevo-disparador/SKILL.md)          | Detectar algo nuevo o cambiar cuándo avisa (distracciones y señales de bloqueo).       |
| [`nuevo-ajuste`](.claude/skills/nuevo-ajuste/SKILL.md)                  | Hacer configurable algo o cambiar un valor por defecto.                                |
| [`ajustar-ia`](.claude/skills/ajustar-ia/SKILL.md)                      | Tocar el prompt, el esquema del plan, el contexto que se manda o el modelo.            |
| [`escribir-textos`](.claude/skills/escribir-textos/SKILL.md)            | Escribir o revisar cualquier texto que ve la persona.                                  |
