---
name: verificar-ui
description: Verifica cambios de interfaz de Foco con la prueba de humo (npm run smoke), revisa las capturas y los textos que guarda, y suma pasos nuevos al smoke. Usala después de tocar renderer/, src/main.js, src/preload.js o cualquier flujo de avisos, coach, sprints o cortes, antes de dar el cambio por terminado.
---

# Verificar la interfaz con el smoke

`scripts/smoke.js` abre la app de verdad (Electron) con una carpeta de datos temporal, la cámara apagada, sin loop de monitoreo (`FOCO_NO_TICK=1`) y una API key inválida a propósito. Recorre el panel, el coach y el aviso flotante, primero en español y después en inglés, y guarda una captura (`.png`) y el texto visible (`.txt`) de cada pantalla en `smoke-output/`.

## 1. Correrlo

```bash
npm test         # primero lo rápido
npm run smoke    # ~1 minuto, abre ventanas reales en la pantalla
```

Leé la salida:

- Cada paso que anduvo imprime una línea con `✓`.
- Al final aparece `Errores/advertencias en consola:` si hubo algo. Los que empiezan con `SMOKE:` son pasos que fallaron y hacen que salga con código 1. El resto (errores y warnings de consola de las ventanas) no lo hace fallar, pero hay que mirarlos: suelen ser bugs reales.
- Los logs internos de MediaPipe (`W1015 …`, `INFO: …`) ya están filtrados.

## 2. Mirar las capturas

Abrí con Read los PNG de las pantallas que tocaste (y su `.txt` para leer el texto exacto):

| Archivo                         | Qué muestra                                                         |
| ------------------------------- | ------------------------------------------------------------------- |
| `01-panel-hoy`                  | Panel, pestaña Hoy                                                  |
| `02-panel-ajustes`              | Panel, pestaña Ajustes                                              |
| `03`…`07-coach-*`               | Coach: intro, dónde te trabaste, tipo de traba, plan, corte         |
| `08-panel-sprint`               | Panel con un sprint en curso                                        |
| `09-aviso-ia-con-error`         | Aviso de distracción cuando la IA falla (key inválida)              |
| `10-aviso-con-lectura`          | Aviso con la lectura de la IA (respuesta de prueba)                 |
| `11-aviso-insiste`              | Aviso que insiste (naranja)                                         |
| `12-coach-desde-aviso`          | Coach abierto desde el aviso con lo que contaste                    |
| `13`…`18-aviso-*sprint*`        | Fin de sprint: pregunta, ¡Lo hice!, Avancé, Otro sprint, Me trabé   |
| `15`, `19`, `20-aviso-*corte*`  | Fin de corte: sin nota, con nota, Me cuesta volver                  |
| `21-coach-fin-sprint-ventana`   | Fin de sprint con el estilo "ventana" (coach grande)                |
| `22-panel-ingles`               | Panel en inglés, después de tocar EN                                |
| `23-panel-ajustes-ingles`       | Ajustes en inglés                                                   |
| `24-aviso-ingles`               | Aviso de distracción en inglés                                      |
| `25-coach-ingles`               | Coach en inglés                                                     |

Qué revisar:

- Que nada se corte ni desborde. El aviso mide 400 px de ancho y ajusta su alto solo (`toast:resize`, entre 80 y 700 px).
- Que los botones sean los que corresponden a ese estado.
- Que los textos estén en voseo y con el tono de la app (ver la skill `escribir-textos`).
- Que en las capturas 22 a 25 no quede nada en español: si aparece, falta una entrada en `EN` o un `t()`. El inglés suele ser más corto, pero fijate igual que no se corte nada.
- Las capturas salen con el tema actual de macOS (claro u oscuro). Si tocaste colores, confirmá en el código que usás variables de `styles.css`, que cubren los dos temas.

Contale al usuario qué capturas miraste y qué viste; si algo no se pudo verificar (por ejemplo la cámara real, permisos o la IA con una key válida), decilo.

## 3. Sumar un paso al smoke

Si agregaste un flujo o un estado nuevo, agregale un paso en `scripts/smoke.js`, dentro del `try`, en el lugar que tenga sentido del recorrido.

Helpers disponibles:

- `shot(win, 'NN-nombre')`: guarda PNG + texto. Seguí la numeración (el próximo libre es `26`) con nombres cortos en español.
- `click(win, 'Texto del botón')`: busca un `<button>` cuyo texto *incluya* eso, o un selector CSS. Tira `No encontré: …` si no está.
- `type(win, selector, valor)`: escribe en un campo y dispara `input`.
- `byUrl('toast.html')`: encuentra una ventana por su URL.
- Sólo para el aviso: `expectText(parte, qué)`, `finishSprint()`, `finishBreak()` (vencen el temporizador y corren un `tick`), `waitInsight()` (espera a que termine el intento de IA).
- Para cualquier ventana (definido en el paso 9): `expectIn(win, parte, qué)`.
- Idioma: `click(panel, '[data-lang="en"]')` pasa la app al inglés y `'[data-lang="es"]'` la devuelve. El smoke corre en español salvo el paso 9: si tu paso hace clic por texto, ponelo fuera de ese bloque o usá el texto en inglés.
- `foco` es lo que exporta `src/main.js`: `showAlert`, `pushToast`, `state`, `work`, `tick`, `startSprint`, `startBreak`, `config()`. Si necesitás otra función interna, sumala a ese `module.exports` (el comentario dice que es para el smoke).

Reglas:

- No dependas de la IA real. Para mostrar una lectura, cargala a mano en `foco.state.alert` con `Object.assign(...)` y llamá a `foco.pushToast()`, como en el paso 10.
- Si el paso verifica algo, que falle con `throw new Error('qué esperaba: qué pasó')`, en español y claro.
- Si cambiás un ajuste para un paso (por ejemplo `alerts.style`), dejalo como estaba al final, como hace el paso 21.
- `smoke-output/` se borra al empezar y está en `.gitignore`.

## Si falla

- `No encontré: <texto>`: cambió el texto de un botón o ese botón ya no se muestra en ese estado. Decidí si el cambio era a propósito (actualizá el smoke) o es un bug.
- `No se abrió el panel` / `No apareció el aviso flotante`: algo rompe al cargar la ventana. Buscá `preload …` o errores de consola en la salida.
- `Canal no permitido: …`: falta el canal en `INVOKE` o `EVENTS` de `src/preload.js`.
- `sprint_end registrados: …`: cambió qué se registra en stats al terminar un sprint.
