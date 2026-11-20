# 🎯 Foco

Foco es una app para Mac que te acompaña en el horario laboral. Si te distraés, no te reta: te pregunta qué pasó y te ayuda a volver. No hace falta tener la app abierta: los avisos aparecen arriba a la derecha y los podés responder ahí mismo, con un botón o hablando.

## Qué detecta

**Distracciones**

- **Pantalla**: abriste un sitio o una app de tu lista (Instagram, YouTube, WhatsApp…).
- **Mirada**: hace rato que no mirás la pantalla y tampoco estás usando el teclado ni el mouse (por ejemplo, porque estás con el celular).
- **Cansancio**: tenés los ojos cerrados varios segundos seguidos.

**Señales de que estás bloqueado**, aunque no te hayas ido a ninguna distracción:

- **Mirada fija**: hace varios minutos que mirás la pantalla sin tocar nada (por defecto 4; necesita la cámara).
- **Saltos**: cambiás entre muchas ventanas o pestañas en poco tiempo.

## El aviso flotante

Cuando detecta algo, aparece un aviso arriba a la derecha que dice que estás **fuera de foco**. No te saca de lo que estás haciendo, y si volvés a trabajar por tu cuenta, desaparece solo. Si seguís en la distracción, insiste: se marca en naranja y vuelve a sonar.

Ir a una distracción es una señal de que algo pasa. Por eso, con la IA activada, Foco mira en qué venías trabajando (el título de la ventana y una captura de esa pantalla) y te dice dónde parece que te trabaste. Por ejemplo: *"Estabas escribiendo la intro del informe. Parece que no sabés cómo arrancar el primer párrafo. ¿Es eso?"*. Abajo te propone un próximo paso concreto y un botón para arrancar un sprint.

Si no acertó, tocás **🎤 No es eso, te cuento**, le decís qué te pasa en voz alta y rearma el plan con lo que contaste. Sin IA, el aviso te ofrece opciones rápidas: me trabé, me da fiaca, un corte o contarlo hablando.

El fin de un sprint y el de un corte también llegan como aviso, sin abrir la app:

- **Fin del sprint**: *"¿Pudiste: tu micro-paso?"* con **¡Lo hice!** (te ofrece el premio de 5 min u otro sprint), **Avancé** (seguís 15 min más con lo mismo) y **Me trabé** (lectura de la IA o 🎤 contame).
- **Fin del corte**: *"Volvamos: lo que anotaste"* con un botón para arrancar un sprint de 25 min, o **Me cuesta volver** si no te sale.

Si no lo tocás y seguís usando la compu, se va solo a los 5 minutos.

## El coach

Para ir más a fondo (o desde **Me trabé, ayudame** en el menú) está el coach completo. En cada campo hay un botón 🎤 para hablar en vez de escribir.

| Elegís                  | El coach…                                                                                                                                                            |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🧱 **Me trabé**         | Te pregunta en qué estás, en qué parte exacta te trabaste y qué tipo de traba es (no sé por dónde empezar, me falta info, es difícil, es confuso, es enorme, miedo). |
| 😮‍💨 **Me da fiaca**       | Te pregunta qué parte es la que más fiaca te da y por qué (aburrida, larga, sin sentido, incómoda, sin energía).                                                     |
| 🔋 **Necesito un corte** | Te ofrece tu "menú de dopamina sana" (caminar, agua, respiración guiada, estirar…) con un temporizador, y te pide anotar con qué vas a arrancar al volver.               |
| 🤷 **Fue automático**   | Hace un reset de 30 segundos con respiración y te pide el próximo paso concreto.                                                                                      |

El plan trae un reencuadre de lo que te pasa, 3 estrategias, un **micro-paso** de 5 a 10 minutos, un **sprint** (10, 15 o 25 min) y un **premio** para el final: la dopamina llega igual, pero como premio y no como escape. Al terminar el sprint te pregunta cómo te fue.

En el panel ves cuánto tiempo estuviste en foco, qué te frenó más durante el día y qué te tentó más. La **cámara flotante** te muestra cómo te ve la cámara y cuánto falta para cada aviso.

## Cómo usarla

Necesitás una Mac (Foco usa APIs de macOS para leer la ventana activa y pedir permisos) y Node.js 22 o más nuevo. `npm install` también descarga el modelo de detección de cara (unos 4 MB).

```bash
npm install
npm start
```

Aparece 🎯 en la barra de menú y se abre el panel. El ícono cambia según el estado:

`🎯` monitoreando · `🎯 12:34` sprint en curso · `👀` fuera de foco · `☕ 4:59` en un corte · `⏸` en pausa · `🌙` fuera de horario

Primeros pasos:

1. En **Ajustes**, configurá tu horario (por defecto lunes a viernes, 09:00-13:00 y 14:00-18:00) y revisá la lista de sitios y apps.
2. Abrí **Calibrar**. Sentate como trabajás normalmente, mirá la pantalla y apretá **Calibrar**. Si usás dos monitores, mirá el otro y apretá **Agregar otra pantalla**.
3. Para que entienda en qué te trabaste: cargá tu API key de Claude en **Ajustes → Coach con IA** y, en **Entender en qué te trabaste**, dale los permisos de Accesibilidad y Grabación de pantalla.
4. Escribí en el panel en qué estás trabajando.

### Permisos de macOS

| Permiso                          | Para qué                                                   | Si lo negás                                         |
| -------------------------------- | ---------------------------------------------------------- | --------------------------------------------------- |
| Cámara                           | Saber si estás mirando la pantalla                         | Sólo detecta sitios y apps.                         |
| Automatización (Chrome, Safari…) | Leer la URL de la pestaña activa                           | Sólo detecta apps, no sitios.                       |
| Accesibilidad                    | Leer el título de la ventana en la que trabajás            | El aviso no sabe en qué ventana estabas.            |
| Grabación de pantalla            | La captura de tu pantalla de trabajo para la IA            | La IA se basa sólo en los títulos de las ventanas.  |
| Micrófono                        | Hablar en vez de escribir                                  | Tenés que escribir.                                 |

En modo desarrollo macOS muestra estos permisos a nombre de **"Electron"**. Después de dar Grabación de pantalla o Accesibilidad, reiniciá la app. Si negaste alguno, lo cambiás en Ajustes del Sistema → Privacidad y seguridad.

## Privacidad

- **Cámara**: se procesa en tu Mac con MediaPipe. No se graban ni se envían imágenes. Sólo está prendida mientras se monitorea.
- **Voz**: se pasa a texto en tu Mac con Whisper. El audio no sale de tu compu. La primera vez se descarga el modelo (unos 250 MB).
- **Capturas de pantalla**: quedan sólo en memoria, nunca en disco. Se mandan a la IA únicamente cuando te distraés o aparece una señal de bloqueo, y nunca de las apps y sitios excluidos (gestores de contraseñas, bancos; la lista es editable).
- **IA (opcional)**: Foco le manda a Claude lo que contás, los títulos de tus ventanas recientes y, si lo activaste, la captura de la pantalla en la que trabajabas. La API key se guarda cifrada en el llavero de macOS.
- Las estadísticas se guardan en `~/Library/Application Support/Foco/`, en un JSON por día.

## Ajustes que vale la pena conocer

- **Sitios con ruta**: si ponés `youtube.com/shorts`, bloquea los Shorts pero no los tutoriales.
- **"Es por trabajo"**: habilita ese sitio o app por 30 minutos (configurable).
- **Cómo te aviso**: aviso flotante (por defecto) o la ventana grande del coach, como antes. Podés sumar la notificación del sistema.
- **Sólo sin teclado ni mouse** (activado por defecto): mirar el teclado o un papel mientras escribís no cuenta como distracción.
- **Sensibilidad de la cámara**: si te avisa de más, bajala o recalibrá.
- **Menú de dopamina**: editalo con lo que a vos te recarga de verdad.
- **Idioma**: el botón **ES | EN** arriba a la derecha del panel (o 🌐 en el menú 🎯) pasa toda la app al inglés: ventanas, avisos, notificaciones, el coach con IA y la voz. Si no editaste el menú de dopamina, también se traduce.

## Desarrollo

Electron sin frameworks ni paso de build: JavaScript plano, HTML y CSS. Si vas a tocar el código (vos o un agente de IA), leé primero [AGENTS.md](AGENTS.md): ahí están las convenciones, las reglas de privacidad que no se negocian y cómo verificar cada cambio. Las guías paso a paso para los cambios más comunes están en [`.claude/skills/`](.claude/skills/).

### Cómo está hecha

```
src/                    Proceso principal (Node, CommonJS)
  main.js               Barra de menú, ventanas, loop cada 2 s, avisos, sprints, cortes e IPC
  engine.js             Decide cuándo avisar (pantalla, mirada, cansancio, señales de bloqueo). Pura
  classifier.js         ¿Es una distracción? (dominios, rutas, apps, permisos temporales). Pura
  context.js            Dónde venías trabajando, saltos entre ventanas, exclusiones. Pura
  schedule.js           Horario laboral por bloques. Pura
  config.js             Ajustes por defecto y config.json con merge profundo
  stats.js              Registro diario (un JSON por día)
  active-window.js      App al frente (lsappinfo) + URL del navegador y título de ventana (AppleScript)
  screenshot.js         Captura de la pantalla de trabajo (sólo en memoria)
  ai-coach.js           Lectura de la traba y plan con Claude (capturas + contexto + lo que contaste)
  voice.js              Voz a texto con Whisper, en tu Mac
  preload.js            Puente window.foco: lista blanca de canales IPC
renderer/               Ventanas (ES modules, sin bundler), servidas por el protocolo app://foco/
  toast.*               Aviso flotante arriba a la derecha
  panel.*               Panel: Hoy + Ajustes
  coach.*               El coach (preguntas, plan, cortes, respiración guiada, check-in)
  vision.*              Cámara: MediaPipe Face Landmarker, ~5 análisis por segundo
  styles.css            Colores y componentes compartidos (claro y oscuro)
  lib/attention.mjs     Pose de la cabeza + mirada → mirando / a otro lado / ojos cerrados / no está
  lib/strategies.mjs    Estrategias por tipo de traba o fiaca (el plan sin IA)
  lib/recorder.mjs      Grabación del micrófono a 16 kHz
scripts/
  smoke.js              Prueba de humo de punta a punta
  download-model.js     Descarga models/face_landmarker.task
test/                   node:test, sin dependencias extra
```

Cada 2 segundos `main.js` lee la ventana activa, la clasifica, actualiza el contexto de trabajo y le pasa todo a `FocusEngine.tick()`, que devuelve `nudge`, `coach`, `signal` o `none`. Según eso se abre el aviso flotante (o el coach, con el estilo "ventana") y, si la IA está activada, se le pide a Claude una lectura de la traba. La ventana de la cámara corre oculta y manda el estado de atención por IPC.

### Comandos

| Comando         | Qué hace                                                                                                             |
| --------------- | -------------------------------------------------------------------------------------------------------------------- |
| `npm start`     | Abre la app.                                                                                                         |
| `npm test`      | Lógica pura, cámara, estrategias y el pedido a la IA contra un servidor falso (no gasta ni necesita key).            |
| `npm run smoke` | Abre la app con datos temporales, recorre panel, coach y avisos, y guarda capturas y textos en `smoke-output/`.      |
| `npm run model` | Vuelve a bajar el modelo de detección de cara si falló en el `npm install`.                                          |

### Variables de entorno

- `ANTHROPIC_API_KEY`: si no cargaste una key en Ajustes, la IA usa esta.
- `FOCO_NO_TICK=1`: arranca sin el loop de monitoreo (no lee ventanas ni pide permisos). La usa la prueba de humo.
- `FOCO_SMOKE_WAV` y `FOCO_SMOKE_VOICE_CACHE`: opcionales, para que la prueba de humo transcriba un audio real con Whisper.

## Próximos pasos posibles

- Empaquetarla como `.app` (con electron-builder) y abrirla al iniciar sesión.
- Bloqueo opcional: cerrar o minimizar la pestaña distractora si seguís ahí después del aviso.
- Resumen semanal con patrones, por ejemplo "los martes a la tarde te cuesta más arrancar".
