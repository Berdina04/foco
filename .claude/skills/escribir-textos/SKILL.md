---
name: escribir-textos
description: Escribe o revisa los textos que ve la persona en Foco (avisos, botones, coach, panel, Ajustes, notificaciones, mensajes de error, README) con la voz de la app, que es español rioplatense con voseo, cálido, breve y sin retar. Usala siempre que agregues o cambies un texto de la interfaz o del prompt de la IA.
---

# Escribir con la voz de Foco

Foco acompaña, no vigila. Cada texto tiene que sonar como alguien de confianza que te ve trabado y te tira una mano, no como un jefe ni como una app de productividad que te cuenta los minutos perdidos.

## Principios

1. **Voseo rioplatense siempre**: mirá, tenés, podés, volvamos, contame, arrancá. Nunca "tú" ni "usted".
2. **No retar ni culpar**: nada de "otra vez", "perdiste", "deberías", "falta de disciplina". La distracción es una señal de que algo se trabó.
3. **Breve**: títulos de 2 a 5 palabras, subtítulos de una oración. En el aviso flotante entra poco (400 px de ancho).
4. **Concreto**: nombrá lo que pasó ("Estás en instagram.com", "Hace unos minutos que mirás la pantalla sin tocar nada") y el próximo paso ("Arrancar 15 min").
5. **Cálido sin empalagar**: "¡Bien ahí!", "Cuesta volver, pasa", "Avanzar es avanzar". Nada de frases motivacionales vacías.

## Quién habla

- **Títulos y subtítulos**: Foco le habla a la persona, de vos. "¿Te trabaste?", "Seguís fuera de foco", "Volvamos: mandar el mail a Ana".
- **Botones**: hablan en primera persona de quien usa la app, como si fuera su respuesta. "Vuelvo al foco", "Me trabé", "Me da fiaca", "Me cuesta volver", "¡Lo hice!", "Avancé", "No es eso, te cuento".
- **Botones de acción**: verbo en infinitivo + lo concreto. "Arrancar 25 min", "Tomarme el premio", "Hacer un corte", "Armar un plan".

## Formato

- Emoji al principio del título o del botón cuando suma, como en el resto de la app: 👀 fuera de foco, 🧱 traba, 😮‍💨 fiaca, 🔋 o ☕ corte, ⏰ fin de sprint, 🎉 logro, 🎤 hablar, ▶ arrancar. No más de uno.
- Duraciones como "25 min", "5 minutos" en frases largas. Horas en 24 h ("09:00-13:00").
- "Sólo" con tilde, como en el resto del código y del README.
- Preguntas con signo de apertura: "¿Pudiste…?".
- Mensajes de error: qué pasó + qué hacer, sin tecnicismos. "Foco no tiene permiso para usar el micrófono (Ajustes del Sistema → Privacidad → Micrófono).", "No escuché nada. Probá de nuevo, un poco más cerca."

## Glosario

Usá siempre estas palabras para estas cosas:

| Término                | Qué es                                                                 |
| ---------------------- | ---------------------------------------------------------------------- |
| aviso                  | La tarjeta flotante de arriba a la derecha                             |
| coach                  | La ventana grande con preguntas y plan                                 |
| fuera de foco          | Lo que dice el aviso cuando hay una distracción. Sólo las estadísticas del panel usan "distraído" para el tiempo |
| me trabé / traba       | Bloqueo: no sabe cómo seguir                                           |
| fiaca                  | No tiene ganas (no "pereza" ni "procrastinar")                         |
| sprint                 | Bloque de foco de 10, 15 o 25 min                                      |
| micro-paso             | Una sola acción concreta de 5 a 10 minutos                             |
| corte                  | Pausa corta que recarga (no "descanso" ni "break")                     |
| premio                 | Lo que te das al terminar el sprint                                    |
| menú de dopamina       | La lista de cortes sanos que edita la persona                          |
| "Es por trabajo"       | Permiso temporal para un sitio o app                                   |
| señales de bloqueo     | Mirada fija o saltar entre ventanas, sin distracción                   |
| sesión de foco         | Monitoreo fuera del horario laboral                                    |

## Ejemplos

| Mejor no                                      | Mejor así                                           |
| --------------------------------------------- | --------------------------------------------------- |
| "Te distrajiste otra vez."                    | "Fuera de foco. Estás en instagram.com"             |
| "Llevás 12 minutos perdidos."                 | "¿Volvemos a 'Informe mensual'?"                    |
| "¡Tú puedes! ¡Concéntrate!"                   | "Arrancar es lo más difícil."                       |
| "Error: permiso denegado (screen)."           | "Falta el permiso de Grabación de pantalla."        |
| "Tomar un descanso"                           | "🔋 Un corte"                                       |
| "No completaste la tarea."                    | "Avanzar es avanzar"                                |

## Antes de terminar

- Si cambiaste el texto de un botón, buscalo en `scripts/smoke.js`: el smoke hace clic y verifica por texto (`click(toast, '¡Lo hice!')`, `expectText(...)`).
- Si cambiaste textos que la IA tiene que respetar (tono, formato de los campos), revisá también el `SYSTEM` de `src/ai-coach.js` (skill `ajustar-ia`).
- Corré `npm run smoke` y leé los `.txt` de `smoke-output/` para ver los textos como quedan en pantalla (skill `verificar-ui`).
