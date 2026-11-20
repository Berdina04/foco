---
name: ajustar-ia
description: Cambia cómo Foco usa a Claude. Cubre el prompt del coach (SYSTEM), el esquema JSON del plan (SCHEMA), qué contexto se manda (capturas, ventanas, lo que contó la persona), el modelo, los fallbacks y los mensajes de error en src/ai-coach.js, más requestInsight y el handler coach:ai en src/main.js. Usala antes de tocar cualquiera de esas partes o cuando la lectura de la IA salga mal.
---

# Ajustar el coach con IA

La IA es opcional: sin ella, el coach usa el plan de reglas de `renderer/lib/strategies.mjs` (`rulePlan`) y el aviso ofrece opciones rápidas. Todo lo que cambies tiene que seguir funcionando con la IA apagada o con error.

## Por dónde entra un pedido

| Desde                    | Dónde                                     | Qué agrega                                                                                     |
| ------------------------ | ----------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Aviso flotante           | `requestInsight()` en `src/main.js`       | Disparador, ventanas recientes, tarea, lo que contó (`transcript`), la lectura anterior (`previous`), menú de dopamina, capturas |
| Coach grande             | handler `coach:ai` en `src/main.js`, llamado por `plan()` en `renderer/coach.js` | Lo mismo, más `flow`, `part` y `reasonLabel` del cuestionario                     |

Las dos terminan en `aiCoach({ apiKey, model, lang, input, images })` de `src/ai-coach.js`, que arma el mensaje con `buildPrompt(input, lang)` y devuelve `{ plan }` o `{ error }`. Nunca tira excepciones hacia afuera.

## Dos idiomas

`lang` (`'es'` o `'en'`, de `config.language`) elige todo lo que va en el pedido: el prompt (`SYSTEM` o `SYSTEM_EN`), las líneas del mensaje, los textos de cada disparador, las etiquetas de las capturas y los errores, agrupados en `COPY.es` y `COPY.en`. El resumen de ventanas también llega en el idioma de la app (`work.summary(now, lang)`), y el plan vuelve en ese idioma porque así lo pide el prompt.

Cualquier cambio en un idioma va también en el otro: si tocás `SYSTEM`, tocá `SYSTEM_EN`; si sumás una línea o un error a `COPY.es`, sumalo a `COPY.en`. Los dos prompts tienen que pedir lo mismo con el mismo tono (en inglés, cálido y directo, sin el voseo).

La lectura del aviso se cachea 10 minutos por ventana de trabajo (`insightCache`), salvo que la persona haya contado algo.

## El esquema del plan y quién lo usa

`SCHEMA` usa salida estructurada (JSON Schema): todos los campos van en `required` y cada objeto lleva `additionalProperties: false`. Si agregás, sacás o renombrás un campo, actualizá a quienes lo usan:

| Campo                          | Lo usa                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------ |
| `working_on`, `likely_block`   | `toast.js` (`body`), `coach.js` (`renderPlan`), stats (`insight`)                          |
| `question`                     | `toast.js`                                                                                 |
| `flow`                         | `toast.js` (`tired` muestra "Hacer un corte" en vez del sprint), stats                     |
| `reflection`                   | `coach.js`                                                                                 |
| `strategies` (3)               | `toast.js` ("Más ideas para destrabarte"), `coach.js`                                      |
| `micro_step`                   | `toast.js`, `coach.js`, handler `toast:sprint` (objetivo del sprint)                       |
| `sprint_minutes` (10, 15 o 25) | `toast.js`, `coach.js`, `toast:sprint`                                                     |
| `reward_idea`                  | `coach.js`, `toast:sprint`                                                                 |

`aiCoach` corrige la respuesta después de parsearla: recorta `strategies` a 3 y fuerza `sprint_minutes` a 10, 15 o 25 (15 si vino otra cosa). Si cambiás esos valores, cambiá también `SYSTEM` y `SYSTEM_EN`, la corrección y los chips del coach.

Respuestas de prueba que hay que mantener al día: `PLAN` en `test/ai-coach.test.js` y la lectura del paso 10 de `scripts/smoke.js`.

## El prompt (`SYSTEM`)

Mantené estas partes en los dos prompts, que son del producto y no de estilo:

- Cálido, directo, breve, sin sermones; en `SYSTEM`, español rioplatense con voseo.
- La distracción es una búsqueda de alivio porque algo se trabó o da fiaca, no falta de voluntad.
- Con capturas: ser concreto con lo que se ve, no inventar lo que no se ve y **no mencionar datos personales o sensibles** que aparezcan.
- Si la persona está cansada, un corte real. Si expresa angustia fuerte, pausa real y hablar con alguien de confianza.

Las descripciones de cada campo en `SYSTEM` y `SYSTEM_EN` tienen que coincidir con `SCHEMA` (los valores de `flow`, los minutos posibles, la cantidad de estrategias).

Para un disparador nuevo, sumá su texto a `COPY.es.trigger` y `COPY.en.trigger` (ver la skill `nuevo-disparador`).

## Qué se manda (privacidad)

- Nunca imágenes de la cámara.
- Capturas de pantalla sólo si `context.readScreen` está activo, hay permiso de Grabación de pantalla y la app o el sitio no está excluido (`isExcluded`). Quedan en memoria (`lastShots`) y sólo se usan si tienen menos de 5 minutos.
- Si empezás a mandar un dato nuevo, que sea opcional y documentalo en "Privacidad" del README.

## Modelo y parámetros

- El modelo sale de `config.ai.model`, que se elige en Ajustes (`<select id="aiModel">` en `panel.html`). El default es `claude-opus-5-5`, en `DEFAULTS` de `src/config.js` y en la firma de `aiCoach`.
- El pedido usa `client.beta.messages.create` con `output_config: { effort: 'low', format: { type: 'json_schema', schema } }`, `max_tokens: 16000`, timeout de 90 s y un reintento.
- Para los modelos de `FALLBACK_MODELS` se suma la beta de fallback del lado del servidor (`fallbacks: 'default'`). Si agregás un modelo al `<select>`, decidí si va en ese set y cubrilo con un test como `ia: sin fallback en modelos que no lo aceptan`.
- Antes de usar un parámetro, beta o modelo que no esté ya en el código, cargá la skill `claude-api` para confirmar cómo se usa hoy. No lo escribas de memoria.

## Errores

`friendlyError(err, lang)` traduce los errores del SDK a frases cortas, tomadas de `COPY[lang].errors` ("La API key no es válida." / "The API key is not valid."). El aviso las muestra como `No pude analizarlo: …` y el coach como `No se pudo usar la IA: … Te muestro el plan básico.` (o su versión en inglés), así que tienen que leerse bien dentro de esas frases en los dos idiomas. Nunca incluyas la key ni datos de la persona en un error.

## Probar

- `npm test`: `test/ai-coach.test.js` levanta un servidor HTTP falso y apunta el SDK ahí con `ANTHROPIC_BASE_URL`. Verifica qué se manda (capturas, formato, fallback) y cómo se leen las respuestas y los errores. `test/logic.test.js` cubre `buildPrompt` en los dos idiomas (`idioma: el contexto y el pedido a la IA en inglés`).
- `npm run smoke`: el paso 09 muestra el aviso cuando la IA falla (key inválida a propósito) y el 10 con una lectura de prueba.
- Probar con la API real gasta créditos del usuario: **preguntale antes**. Si dice que sí y tiene `ANTHROPIC_API_KEY` en el entorno, alcanza con un script de Node que llame a `aiCoach` con un `input` de ejemplo (sin capturas, o con un JPEG que no tenga datos personales) e imprima el plan.
