---
name: nuevo-ajuste
description: Agrega un ajuste configurable a Foco o cambia un valor por defecto. Cubre DEFAULTS en src/config.js, el campo en la pestaña Ajustes del panel (panel.html y panel.js), cómo se guarda y se lee en el proceso principal, cómo llega a las otras ventanas, los tests y el README. Usala cuando algo que hoy está fijo en el código tenga que ser configurable o cuando haya que cambiar un default.
---

# Agregar un ajuste

Los ajustes viven en `config.json` dentro de userData. `ConfigStore` (`src/config.js`) hace un merge profundo entre `DEFAULTS` y lo que guardó la persona: los objetos se mezclan y **los arrays del usuario reemplazan a los por defecto**.

## 1. Valor por defecto en `src/config.js`

- Ubicalo en el grupo que corresponda: `schedule`, `camera`, `alerts`, `context`, `signals`, `voice`, `ai`, o arriba de todo si es general (`graceSeconds`, `allowMinutes`…).
- Poné la unidad en el nombre (`…Seconds`, `…Minutes`) y un comentario en español arriba que explique qué hace y qué significa `0` si aplica ("0 = no avisar").
- Elegí un valor por defecto que funcione bien para alguien que nunca abre Ajustes.

## 2. Campo en Ajustes (`renderer/panel.html`)

Buscá la tarjeta (`<div class="card stack">` con su `<h2>`) que corresponde y seguí el patrón que ya existe:

```html
<!-- Número con unidad -->
<label class="field">
  Avisar después de
  <span class="inline-num"><input type="number" id="graceSeconds" min="0" max="600" /> segundos en una distracción</span>
  <span class="hint">Aclaración opcional.</span>
</label>

<!-- Sí / no -->
<label class="check"><input type="checkbox" id="hopping" /> …saltás entre muchas ventanas o pestañas en poco tiempo</label>

<!-- Lista: un elemento por línea -->
<textarea id="sites" rows="8"></textarea>

<!-- Opciones -->
<select id="alertStyle">…</select>
```

El `id` del campo es el nombre de la clave. Poné `min` y `max` razonables en los números. El texto tiene que entenderse sin conocer el código (skill `escribir-textos`).

## 3. Cargar y guardar (`renderer/panel.js`)

- En `loadSettings()`: `$('miAjuste').value = c.grupo.miAjuste;` (o `.checked` para casillas, `.join('\n')` para listas).
- En `saveSettings()`, sumalo al objeto que se manda a `config:update`, dentro de su grupo:
  - números: `num('miAjuste', c.grupo.miAjuste)` (descarta negativos y valores que no son números);
  - casillas: `$('miAjuste').checked`;
  - listas: `lines($('miAjuste').value)`.

## 4. Usarlo

- En el proceso principal, leelo con `config.get().grupo.miAjuste` cada vez que lo uses. No lo guardes en una variable al arrancar: así el cambio se aplica en el próximo tick sin reiniciar.
- Si lo usa un módulo puro (`engine`, `context`…), pasáselo como parámetro o dentro de `config`.
- Las ventanas no leen la config por su cuenta. El panel la recibe en `snapshot().config`; el aviso, en `toastPayload()`; el coach, en `coachContext()`. Si el aviso o el coach lo necesitan, sumalo ahí.
- Si es de la cámara (`camera.*`), el handler `config:update` ya le reenvía la config a la ventana de la cámara (`vision:config`).

## 5. Tests

- Si cambia el comportamiento del engine, agregá un caso en `test/logic.test.js` usando `engineConfig({ ... })`.
- Si agregaste un array por defecto o un grupo nuevo, el test `config: merge profundo respeta defaults` te sirve de modelo.

## 6. Cambiar un valor por defecto

Cuando alguien aprieta **Guardar**, `saveSettings()` escribe *todos* los campos del formulario en `config.json`. Por eso un default nuevo sólo le llega a quien nunca guardó Ajustes. Si el cambio importa para todos (por ejemplo porque el valor viejo estaba mal), hace falta una migración al leer la config en `ConfigStore`. Consultalo con el usuario antes de agregarla.

Un ajuste nuevo, en cambio, le llega a todos con su valor por defecto gracias al merge.

## 7. Cerrar

- Si a quien usa la app le sirve saberlo, agregalo a "Ajustes que vale la pena conocer" en el README.
- Corré `npm test` y `npm run smoke` (skill `verificar-ui`). `02-panel-ajustes.png` muestra sólo lo que entra en la ventana; si tu campo queda más abajo, confirmá en `02-panel-ajustes.txt` que aparece con el texto correcto.
