---
name: nuevo-disparador
description: Agrega o cambia un disparador de aviso en Foco, ya sea una distracción nueva o una señal de bloqueo (como la mirada fija o saltar entre ventanas). Cubre el engine, los datos que entran en cada tick, los textos del aviso, el prompt de la IA, el panel, los tests y el README. Usala cuando haya que detectar algo nuevo o cambiar cuándo o cómo avisa Foco.
---

# Agregar o cambiar un disparador

Un disparador es el `trigger` que devuelve `FocusEngine.tick()`: `{ type, key, label }`. Hoy existen `site`, `app`, `gaze`, `drowsy`, `stuck`, `hopping`, más `manual`, `sprint_end` y `break_end`, que no salen del engine. Un tipo nuevo toca varios archivos y, si te olvidás de alguno, el aviso queda con textos genéricos o engañosos.

## 1. Elegí qué clase de disparador es

| Clase                     | `action` del engine          | Cómo se comporta                                                                                          | Ejemplos          |
| ------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------- |
| Distracción               | `nudge` y después `coach`    | Aviso con sonido. Si seguís, insiste (`#escalate`, `nudgeToCoachSeconds`). Se va solo si volvés a trabajar. | `site`, `app`, `gaze` |
| Directo                   | `coach`                      | Aviso que insiste desde el principio.                                                                      | `drowsy`          |
| Señal de bloqueo          | `signal`                     | Aviso suave, sin sonido, cooldown de 10 min (`SIGNAL_COOLDOWN_MS`). Se va solo a los 3 min.                | `stuck`, `hopping` |

Recordá la regla de producto: no estás "atrapando" a nadie, estás detectando que algo se trabó. Si la señal puede fallar seguido, que sea una señal suave y no una distracción.

## 2. Conseguí el dato en cada tick

`engine.js` es puro: no puede llamar a Electron. Todo lo que necesita entra por los parámetros de `engine.tick({...})` en `tick()` de `src/main.js`.

- Ventana y navegador: `state.activity` (de `active-window.js`) y `WorkContext` en `context.js` (historial reciente, `isHopping`). Si hace falta una medición nueva sobre ventanas, agregala como método de `WorkContext`, que también es puro y tiene tests.
- Cámara: `state.attention.status` (`focused`, `looking_away`, `eyes_closed`, `no_face`), calculado en `renderer/lib/attention.mjs`. Las métricas crudas (pose, mirada) también llegan en `state.attention`.
- Teclado y mouse: `powerMonitor.getSystemIdleTime()`, que llega como `idleSeconds`.

Pasá el dato con un nombre claro y documentalo en el JSDoc de `tick()`.

## 3. Lógica en `src/engine.js`

- Respetá el orden de prioridad: distracción en pantalla > ojos cerrados > mirada > señales. Una señal nunca se dispara si hay una distracción en pantalla.
- Devolvé un `trigger` con `type` nuevo, una `key` estable y un `label` en español que se entienda solo, porque aparece en el panel ("mirada fija sin avanzar").
- La `key` se usa para "Es por trabajo" (`state.allows`) y para saber si un aviso abierto es el mismo. Para sitios y apps es `site:…` / `app:…`.
- Los umbrales van en la config (`config.signals`, `config.camera`…), con un valor por defecto razonable. Para exponerlos en Ajustes, seguí la skill `nuevo-ajuste`.
- Si la señal no debería repetirse mientras la situación sigue igual, usá un flag como `stareFired`, que se reinicia cuando la persona vuelve a tocar algo.

## 4. Textos

- `renderer/toast.js` → `HEAD[type]`: `[emoji, título, subtítulo]`. Sin esto cae en `HEAD.manual` ("¿Qué está pasando?").
- `src/ai-coach.js` → `TRIGGER_TEXT[type]`: describe en tercera persona qué pasó, para la IA. Sin esto cae en "Pidió ayuda por su cuenta", que la confunde.
- `src/main.js`: con el estilo "ventana", `nudge()` arma el texto de la notificación (sólo `gaze` tiene un texto propio; el resto usa `Estás en ${label}`) y `onEscalate()` arma la notificación que insiste. Fijate que tengan sentido para tu tipo.
- `renderer/panel.js`: la línea de tiempo usa `trigger.label` y "Lo que más te tentó" sólo cuenta `site` y `app`. Decidí si tu tipo tiene que sumarse ahí.
- Todo con la voz de la app (skill `escribir-textos`).

## 5. Capturas para la IA

En `requestInsight()` de `src/main.js`, `onWorkNow` decide si la captura se saca en ese momento (la persona sigue en su pantalla de trabajo, como en `stuck` y `hopping`) o si se usa la última de `lastShots` (la persona se fue a una distracción). Sumá tu tipo a la lista que corresponda. Las exclusiones (`isExcluded`) se respetan siempre.

## 6. Tests

En `test/logic.test.js`, con `now` simulado en milisegundos y el helper `engineConfig()`:

- Dispara cuando tiene que disparar, y no antes.
- No dispara con `paused: true` ni durante el cooldown.
- Una distracción en pantalla le gana.
- Si es una señal: respeta el cooldown y no se repite mientras no cambie nada.
- `buildPrompt` incluye el texto nuevo de `TRIGGER_TEXT`.

## 7. Smoke, README y verificación

- Sumá un paso en `scripts/smoke.js` que llame a `foco.showAlert({ type, key, label }, { gentle })` y saque una captura (skill `verificar-ui`).
- Agregalo a "Qué detecta" en el README y, si suma un ajuste, a "Ajustes que vale la pena conocer".
- Corré `npm test` y `npm run smoke`.
