# Manual de pantallas de la app

Especificación de cada pantalla de la demo, escrita para pasársela a una IA (Claude, Stitch, Copilot...) y que genere el código con el menor margen de error posible. Todo lo que no está aquí, no se hace.

La demo es una web app para móvil que se abre con un QR. No sustituye a las apps oficiales: les añade **cuánto fiarse** de lo que anuncian, con datos que hemos medido nosotros. Prioridades en [MOSCOW.md](MOSCOW.md).

**Boceto visual:** capturas de cada pantalla en [`boceto/`](boceto/). Si el boceto y este manual no coinciden, manda el manual.

**Principio de diseño:** las pantallas que más se usan (Paradas, Parada y ¿Cuándo salgo?) muestran solo lo crítico: cuándo llega y si fiarse. Las estadísticas, los porcentajes y las rarezas de cada línea van en la pantalla 2b, a la que se llega con el botón «i» de cada línea.

---

## 0. Cómo usar este manual con una IA

1. **Una pantalla por petición.** Pásale a la IA la sección 1 («Reglas fijas»), la sección 2 («Datos») y la sección de **una sola** pantalla. No le pidas toda la app de golpe.
2. **Copia este texto al principio de cada petición:**

```text
Vas a programar una pantalla de una web app estática. Sigue el manual al pie de la letra.
- Usa solo HTML, CSS y JavaScript sin frameworks ni librerías, salvo Leaflet donde el manual lo diga.
- No inventes datos, textos, pantallas ni botones que no estén en el manual.
- Copia los textos entre comillas exactamente como están, con sus tildes.
- Si algo no está definido, déjalo fuera y añade un comentario // PENDIENTE en el código. No lo supongas.
- Al terminar, enumera qué casos de la «Comprobación» de la pantalla cumple tu código.
```

3. **Revisa siempre** la lista «Comprobación» de cada pantalla antes de aceptar el código.
4. **Si la IA cambia una regla de este manual, rechaza el cambio.** Si la regla está mal, se corrige aquí por pull request.

---

## 1. Reglas fijas (valen para todas las pantallas)

### 1.1 Tecnología y archivos

- Web estática publicada en GitHub Pages. Sin servidor, sin base de datos, sin inicio de sesión.
- Estructura de archivos fija:

```text
/index.html          una sola página; cada pantalla es un <section id="pantalla-...">
/css/estilos.css
/js/app.js           navegación entre pantallas y arranque
/js/consultar.js     copiado tal cual del repositorio de datos (demo/consultar.js); no se modifica
/js/ventana.js       funciones de la sección 2.3; se copian tal cual
/datos/fiabilidad.json   copiado del repositorio de datos (demo/fiabilidad.json); no se modifica
/datos/demo.json     datos fijos de la demo (sección 2.4)
```

- La navegación cambia de pantalla mostrando y ocultando cada `section`, sin recargar la página.
- Favoritas en `localStorage` con la clave `"favoritas"` (lista de identificadores de parada). Siempre dentro de `try { } catch { }`: si falla, la app funciona igual sin favoritas.

### 1.2 Aspecto

| Elemento | Valor fijo |
| --- | --- |
| Ancho de diseño | 390 px; debe verse bien de 360 a 430 px |
| Fuente | `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` |
| Tamaño mínimo de texto | 14 px |
| Tamaño de la cifra principal (ventana, hora de salida) | 32 px, negrita |
| Altura mínima de botones y elementos tocables | 44 px |
| Color principal | `#1F5FD1` |
| Fondo | `#F6F5F2` |
| Tarjetas | fondo `#FFFFFF`, esquinas de 16 px, sombra suave |
| Verde (fiable) | `#1E8E3E` |
| Ámbar (con margen) | `#B26A00` |
| Rojo (poco fiable) | `#C5221F` |
| Avisos oficiales | fondo `#FFF4D6` |
| Avisos simulados | fondo `#EDE7F6` |

- No usar logotipos ni colores corporativos de EMT, Metro, Renfe ni del Consorcio. Los modos de transporte se distinguen con iconos genéricos de bus, tren y metro, en SVG dentro del HTML.
- No nombrar otras apps (ni Google Maps ni las apps oficiales) en ningún texto.

### 1.3 Barra inferior (en todas las pantallas)

Cuatro botones, en este orden, con estos textos exactos: **«Paradas» · «¿Cuándo salgo?» · «Avisos» · «Info»**. El botón de la pantalla activa va en color principal. Las pantallas 2b y 4 no tienen botón: se abren desde la 2.

Encima de la barra, cuando el usuario sigue un viaje, va la **franja de seguimiento** (sección 1.6).

### 1.4 Etiqueta de fiabilidad

Siempre se calcula con la función `nivelFiabilidad(p)` de la sección 2.3, y siempre se muestra con texto además del color.

| `p` (probabilidad de acertar a ±2 min) | Texto exacto | Color |
| --- | --- | --- |
| `p >= 0.75` | «Fiable» | verde |
| `0.50 <= p < 0.75` | «Con margen» | ámbar |
| `p < 0.50` | «Poco fiable» | rojo |

### 1.5 Prohibido

- Mostrar un porcentaje o una ventana cuando `consultar()` devuelve `null`.
- Redondear `p` a algo distinto de un número entero de porcentaje (0,823 → «82 %»).
- Inventar paradas, líneas o cifras que no estén en `fiabilidad.json` o en `demo.json`.
- Mezclar avisos simulados con avisos oficiales en la misma lista.
- Poner porcentajes, intervalos o número de llegadas en las pantallas 1, 2 y 3. Van en la 2b.

### 1.6 Franja de seguimiento (encima de la barra inferior)

Una franja fija de 66 a 80 px de alto, pegada encima de la barra inferior, que aparece cuando el usuario sigue un viaje. Muestra un vehículo que avanza por una línea según lo que le falta. Se ve en las pantallas 1, 2 y 3. Si no se sigue ningún viaje, no aparece.

| Parte | Contenido exacto |
| --- | --- |
| Texto izquierdo | «Siguiendo el {linea} · hasta tu parada» o «Siguiendo el {linea} · hasta tu destino» |
| Texto derecho, color principal | Hasta tu parada: «{v.desde}–{v.hasta} min», o «Llegando» si `minutos <= 1`. Hasta destino: «Llegas {hora}» |
| Línea | Gris `#D5D3CE`, de 3 px; la parte ya recorrida, en color principal |
| Punto final | Círculo negro de 18 px a la derecha: tu parada o tu destino |
| Vehículo | Caja de 30 × 26 px en color principal con el icono blanco de bus, tren o metro, según la red |
| Paradas intermedias (solo hasta destino) | Círculo blanco con borde negro en cada transbordo, con su nombre debajo en 12 px |
| El siguiente, debajo de la línea, en 13 px gris | Bus: «El siguiente sale en {v2.desde}–{v2.hasta} min», con la ventana de la segunda llegada. Tren: «Si lo pierdes: {linea} de las {hora}, llegas {hora}». Si no hay segunda llegada: «No hay otro anunciado todavía» |

**Dónde va el vehículo** (copiar tal cual en `ventana.js`):

```js
// Posición del vehículo en la franja, en %, hasta tu parada. 30 min o más = al principio.
export function posicionVehiculo(minutosAnunciados) {
  return Math.max(4, Math.min(94, (1 - minutosAnunciados / 30) * 100));
}
```

Hasta destino, la posición es la parte del viaje ya hecha: `(ahora - salida) / (llegada - salida) * 100`, con los mismos límites de 4 y 94.

**Cambiar de modo:** al tocar el texto izquierdo se pasa de «hasta tu parada» a «hasta tu destino» y al revés. Si no hay destino elegido, en lugar de la línea aparece: «Elige a dónde vas para seguir el viaje hasta tu destino.»

**Accesibilidad:** la línea lleva `role="img"` y un `aria-label` del tipo «El 104 está a 12 minutos de tu parada». Toda la franja es tocable y lleva a la pantalla 2 de esa parada.

---

## 2. Datos

### 2.1 `fiabilidad.json`

Se carga una vez al arrancar:

```js
const datos = await (await fetch("datos/fiabilidad.json")).json();
```

Contiene `meta` (descripción, fuentes, fechas, advertencias) y `tabla` con tres redes: `"emt"`, `"metro"` y `"renfe"`.

### 2.2 `consultar()`

```js
import { consultar } from "./consultar.js";
const r = consultar(datos, { red: "emt", minutos: 18, hora: 8.5, finde: false, linea: "104", tipo: "intermedia" });
```

| Parámetro | Tipo | Valores válidos |
| --- | --- | --- |
| `red` | texto | `"emt"`, `"metro"`, `"renfe"` |
| `minutos` | número | Lo que anuncia la app oficial, de 0 a 39. Con 40 o más devuelve `null` |
| `hora` | número | Hora del día con decimales: 8:30 → `8.5` |
| `finde` | sí/no | `true` en sábado, domingo o festivo |
| `linea` | texto | EMT: el número tal como lo muestra la EMT (`"104"`, `"27"`). Metro: `"1"` a `"12"`. Renfe: `"C1"`, `"C5"`... |
| `tipo` | texto | EMT: `"cabecera"` o `"intermedia"`. Metro y Renfe: `"estacion"` |

Devuelve `null` si no hay datos, o un objeto así:

```json
{ "p": 0.638, "ic": [0.596, 0.678], "n": 524, "tarde": 0.195, "antes": 0.167,
  "mediana": 0.02, "p10": -2.98, "p90": 5.48, "nivel": "linea" }
```

| Campo | Significado |
| --- | --- |
| `p` | Probabilidad de llegar a ±2 min de lo anunciado |
| `p10`, `p90` | Retraso (llegada real menos anunciada), en minutos, en los percentiles 10 y 90. Pueden ser negativos |
| `mediana` | Retraso mediano, en minutos |
| `tarde`, `antes` | Probabilidad de llegar más de 2 min tarde o más de 2 min antes |
| `n` | Número de llegadas medidas |
| `nivel` | `"linea"` si el dato es de esa línea; `"tipo"`, `"franja"` o `"red"` si es una estimación más general |

### 2.3 `ventana.js` (copiar tal cual, no reescribir)

```js
// Convierte el resultado de consultar() en lo que se pinta. No cambiar estas reglas.
export function nivelFiabilidad(p) {
  if (p >= 0.75) return { texto: "Fiable", clase: "verde" };
  if (p >= 0.50) return { texto: "Con margen", clase: "ambar" };
  return { texto: "Poco fiable", clase: "rojo" };
}

// Ventana en la que llega 8 de cada 10 veces.
// Si el margen pasa de 30 min el dato está mal (hay casillas con percentiles de ~900 min): se trata como sin datos.
export function ventana(minutosAnunciados, r) {
  if (!r) return null;
  const desde = Math.max(0, Math.floor(minutosAnunciados + r.p10));
  const hasta = Math.ceil(minutosAnunciados + r.p90);
  if (hasta - minutosAnunciados > 30 || minutosAnunciados - desde > 30) return null;
  return { desde, hasta, normal: Math.round(minutosAnunciados + r.mediana) };
}

// Tablero de 10 casillas para la pantalla 2b: cuántas de cada 10 veces llegó a tiempo, tarde o antes.
export function casillas(r) {
  const aTiempo = Math.round(r.p * 10);
  const tarde = Math.min(10 - aTiempo, Math.round(r.tarde * 10));
  return { aTiempo, tarde, antes: 10 - aTiempo - tarde };
}

export function porcentaje(x) {
  return `${Math.round(x * 100)} %`;
}

export function horaDecimal(fecha = new Date()) {
  return fecha.getHours() + fecha.getMinutes() / 60;
}

export function esFinde(fecha = new Date()) {
  const d = fecha.getDay();
  return d === 0 || d === 6;
}
```

### 2.4 `demo.json` (datos fijos de la demo)

Las paradas de la demo, sus llegadas de ejemplo y los casos de las pantallas 3, 4 y 5. Mientras no haya tiempo real conectado, la pantalla 2 lee las llegadas de aquí.

```json
{
  "paradas": [
    {
      "id": "emt-5848", "nombre": "Mar de Cristal", "red": "emt", "tipo": "cabecera",
      "lat": 40.46939, "lon": -3.63887,
      "llegadas": [ { "linea": "104", "destino": "Ciudad Lineal", "minutos": 12 },
                    { "linea": "104", "destino": "Ciudad Lineal", "minutos": 18 } ]
    }
  ],
  "lineas": {
    "104": {
      "avisos": [
        { "titulo": "A veces aparece un autobús que no estaba en la lista",
          "texto": "Si la app dice 15 min o más, 4 de cada 10 veces sale otro antes. Mira la parada aunque falte mucho." },
        { "titulo": "Aquí empieza la línea: «1 min» no es «ya»",
          "texto": "Si marca 1 min, el autobús suele estar parado o está llegando; ha habido casos en que sale unos 6 min después. Si marca «>>», ya está recogiendo gente." },
        { "titulo": "Pasa algo menos de lo que promete",
          "texto": "Programado cada 10 a 12 min; de verdad, cada 13. 1 de cada 8 esperas pasa de 20 min." }
      ]
    }
  },
  "aviso_oficial": null,
  "cuando_salgo": {
    "desde": "Móstoles Central", "hasta": "Nuevos Ministerios", "llegar_antes": "9:00", "dia": "laborable",
    "recomendada": { "salida": "7:35", "trayecto": "C5 de las 7:47 → Atocha → cualquier tren a Nuevos Ministerios",
                     "llegada_habitual": "8:39", "peor_dia": "8:56", "dias": [1,1,1,1,1,1,1,1],
                     "siguiente": { "linea": "C5", "hora": "7:49", "llegada": "8:44" } },
    "rapida": { "salida": "8:05", "trayecto": "C5 de las 8:17 con transbordo en Atocha",
                "dias": [0,0,0,0,0,0,0,0,1] }
  },
  "prometido_real": [
    { "titulo": "691 en Zoco, hacia la sierra, de 7:00 a 9:30, laborable",
      "prometido": "Un autobús cada 20 min", "fuente_prometido": "Portal de datos abiertos de la Comunidad de Madrid (dataset 1919185) y horario oficial",
      "enlace": "https://datos.comunidad.madrid/dataset/1919185",
      "medido": "Cada 21 min de mediana, pero el 34 % de las esperas pasa de 30 min" }
  ],
  "avisos_simulados": [
    { "linea": "27", "texto": "Bus lleno, no para", "hace_min": 2, "confirman": 3 },
    { "linea": "14", "texto": "Atasco en Atocha", "hace_min": 4, "confirman": 2 },
    { "linea": "691", "texto": "El 691 no ha pasado", "hace_min": 6, "confirman": 1 }
  ]
}
```

En `dias`, cada número es un día medido: `1` es que llegó a tiempo y `0` que llegó tarde. Las coordenadas salen del GTFS de la EMT (parada 5848). Las paradas definitivas las fija el equipo de precisión, y sus coordenadas se toman siempre del GTFS, nunca a ojo.

---

## 3. Pantalla 1: Paradas (inicio)

**Objetivo:** llegar en dos toques a una parada.

**Elementos, en este orden de arriba abajo:**

| # | Elemento | Texto o contenido exacto |
| --- | --- | --- |
| 1 | Título | «Mis paradas» |
| 2 | Buscador | Marcador de posición: «Busca parada, línea o estación» |
| 3 | Filtros (botones de selección única) | «Todo» (activo por defecto) · «Bus EMT» · «Interurbano» · «Metro» · «Cercanías» |
| 4 | Aviso oficial | Solo si `demo.json.aviso_oficial` no es `null`. Fondo de aviso oficial |
| 5 | Lista de favoritas | Una tarjeta por parada favorita: nombre, red y números de línea |
| 6 | Lista sin favoritas | «Busca tu parada y pulsa la estrella para tenerla aquí.» |
| 7 | Franja de seguimiento | Sección 1.6, solo si el usuario sigue un viaje. Al tocarla se abre la pantalla 2 de esa parada |

**Comportamiento:**

- El buscador filtra `demo.json.paradas` por nombre o número de línea, sin distinguir mayúsculas ni tildes, a partir de 2 caracteres. Sin resultados: «No tenemos datos de esa parada todavía.»
- Al tocar una tarjeta o un resultado se abre la pantalla 2 con esa parada.
- Los filtros de modo solo cambian qué paradas se listan.

**Comprobación:**

- [ ] Sin favoritas se ve el texto del punto 6.
- [ ] «MAR DE CRISTAL», «mar de cristal» y «104» encuentran Mar de Cristal.
- [ ] Una búsqueda sin resultados muestra el texto exacto.

---

## 4. Pantalla 2: Parada

**Objetivo:** responder «¿me fío de lo que dice la app?». Es la pantalla más importante.

**Elementos, en este orden:**

| # | Elemento | Contenido exacto |
| --- | --- | --- |
| 1 | Cabecera | Nombre de la parada, en grande; debajo, la red. A la derecha, una estrella para favoritas |
| 2 | Minimapa | Leaflet con OpenStreetMap, 160 px de alto, marcador en `lat`/`lon`, zoom 17, sin poder arrastrarlo |
| 3 | Tarjeta de la primera llegada (la única con sombra) | Ver tabla siguiente |
| 4 | Una fila por cada llegada siguiente | «{linea}» · «Entre {v.desde} y {v.hasta} min» · a la derecha, el texto de `nivelFiabilidad(r.p)` en su color. Sin datos: «Sin datos suficientes» |
| 5 | Pie | «{tipo de día}, {hora}. Más datos en la i de cada línea.» |
| 6 | Franja de seguimiento | Sección 1.6, siguiendo la primera llegada |

**Tarjeta de la primera llegada, con `r = consultar(...)` y `v = ventana(minutos, r)`:**

| Parte | Si `v` existe | Si `v` es `null` |
| --- | --- | --- |
| Línea y destino | «{linea} · {destino}» | igual |
| Botón «i» a la derecha (44 × 44 px, `aria-label` «Qué conviene saber del {linea}») | Abre la pantalla 2b de esa línea | igual |
| Lo que dice la app oficial (texto pequeño, gris) | «La app oficial dice {minutos} min» | igual |
| Cifra principal (32 px) | «Llega entre {v.desde} y {v.hasta} min» | «Sin datos suficientes» |
| Etiqueta y consejo, en una fila | Etiqueta `nivelFiabilidad(r.p).texto` con su color de fondo y texto blanco, y al lado: «Si a los {v.hasta} min no ha llegado, algo pasa.» | no se muestra |
| Aviso de estimación | Solo si `r.nivel !== "linea"`: «Estimación general de la red» | no se muestra |

En esta pantalla **no** se muestran porcentajes, barras de rango ni número de llegadas: están en la 2b. El enlace a la pantalla 4 («Lo prometido frente a lo real →») va en la 2b.

**Casos especiales:**

- `minutos >= 40`: la cifra principal dice «Demasiado lejos para estimar» y no se llama a `consultar()`.
- Mientras carga `fiabilidad.json`: tarjetas grises vacías.
- Si `fiabilidad.json` no carga: «No hemos podido cargar los datos. Vuelve a intentarlo.» y un botón «Reintentar».

**Ejemplo para comprobar:** EMT, línea 104, `tipo: "cabecera"`, laborable a las 8:30, la app dice 12 min. La tarjeta debe mostrar la ventana que salga de `ventana(12, r)` sin redondeos distintos a los de la función.

**Comprobación:**

- [ ] Con `r = null` no aparece ningún porcentaje ni ventana.
- [ ] Con `minutos = 45` aparece «Demasiado lejos para estimar».
- [ ] Si `ventana()` devuelve `null` por un margen de más de 30 min, aparece «Sin datos suficientes».
- [ ] La etiqueta coincide con la tabla de la sección 1.4 para `p = 0.80`, `0.60` y `0.40`.
- [ ] Si `nivel` es `"red"`, aparece «Estimación general de la red».
- [ ] No aparece ningún porcentaje en esta pantalla.
- [ ] El botón «i» abre la pantalla 2b de esa línea.
- [ ] La franja de seguimiento muestra el bus y «El siguiente sale en…».
- [ ] La estrella añade y quita la parada de favoritas, y la pantalla 1 lo refleja.

---

## 4b. Pantalla 2b: Lo que conviene saber de la línea

**Objetivo:** contar a quien no suele usar esa línea sus rarezas y lo fiable que es, de forma que se entienda de un vistazo. Aquí van todas las estadísticas que no caben en las pantallas principales.

**Elementos, en este orden:**

| # | Elemento | Contenido exacto |
| --- | --- | --- |
| 1 | Volver | «← {nombre de la parada}» |
| 2 | Título | Número de la línea y «Lo que conviene saber» |
| 3 | Rarezas de la línea | Una fila por elemento de `demo.json.lineas[linea].avisos`: `titulo` en negrita y `texto` debajo. Sin rarezas: «Esta línea no tiene nada raro que contar.» |
| 4 | Tablero de 10 casillas | Título «De cada 10 veces que la app dijo «{minutos} min»». Diez casillas en una fila, de las que `casillas(r)` da cuántas: verdes (llegó cuando decía), ámbar (más de 2 min tarde) y blancas con borde discontinuo gris (más de 2 min antes), en ese orden |
| 5 | Leyenda del tablero | «{aTiempo} llegaron cuando decía (±2 min)» · «{tarde} llegó/llegaron más de 2 min tarde» · «{antes} llegó/llegaron más de 2 min antes» (singular si es 1) |
| 6 | Pie del tablero | «{tipo de día} por la {franja}, {n} llegadas medidas del {datos_desde} al {datos_hasta}.» |
| 7 | Datos completos (cerrado por defecto, con `<details>`) | «Acierta a ±2 min el {porcentaje(r.p)} (intervalo del {porcentaje(r.ic[0])} al {porcentaje(r.ic[1])}). Tarde el {porcentaje(r.tarde)}, antes el {porcentaje(r.antes)}.» |
| 8 | Enlace | «Lo prometido frente a lo real →» (abre la pantalla 4) |

**Por qué un tablero y no porcentajes:** «8 de 10 casillas verdes» se entiende sin pensar; «77 % ± 3» no. Es la misma idea que el panel de los últimos números de una ruleta.

**Comprobación:**

- [ ] Con `p = 0.769`, `tarde = 0.137` y `antes = 0.094` salen 8 verdes, 1 ámbar y 1 blanca.
- [ ] Las tres casillas se distinguen también sin color (la blanca lleva borde discontinuo).
- [ ] «Datos completos» está cerrado al abrir la pantalla.
- [ ] Una línea sin rarezas muestra el texto exacto del punto 3.

---

## 5. Pantalla 3: ¿Cuándo salgo?

**Objetivo:** convertir la fiabilidad en una hora de salida. En la demo es un caso fijo, sacado de `demo.json.cuando_salgo`.

**Elementos, en este orden:**

| # | Elemento | Contenido exacto |
| --- | --- | --- |
| 1 | Título | «¿Cuándo salgo?» |
| 2 | Resumen del viaje (no editable en la demo) | «Desde {desde}» · «Hasta {hasta}» · «Llegar antes de las {llegar_antes} · {dia}» |
| 3 | Tarjeta recomendada (borde en color principal) | Etiqueta «Te recomendamos» · cifra principal «Sal a las {recomendada.salida}» · trayecto · dos cajas: «Llegada habitual {llegada_habitual}» y «Peor día medido {peor_dia}» · fila de cuadrados (`dias`) · texto «A tiempo {número de unos} de {total} días medidos» |
| 4 | Tarjeta de la opción rápida | Etiqueta «La opción más rápida» · «Sal a las {rapida.salida}» · trayecto · fila de cuadrados · texto «A tiempo {número de unos} de {total} días medidos» · etiqueta roja «Arriesgado» si llegó a tiempo menos de la mitad de los días |
| 5 | Leyenda | Cuadrado azul «A tiempo» · cuadrado rojo «Tarde» |
| 6 | Nota | «Caso real medido con el GPS de los trenes.» |
| 7 | Franja de seguimiento | Sección 1.6, en modo «hasta tu destino»: tren, paradas Móstoles · Atocha · N. Ministerios, «Llegas {llegada_habitual}» y debajo «Si lo pierdes: {siguiente.linea} de las {siguiente.hora}, llegas {siguiente.llegada}» |

**Fila de cuadrados:** un cuadrado de 16 × 16 px por cada elemento de `dias`, separados 4 px. Azul (`#1F5FD1`) si vale `1`; rojo si vale `0`.

**Comprobación:**

- [ ] La recomendada muestra 8 cuadrados azules y «A tiempo 8 de 8 días medidos».
- [ ] La rápida muestra «A tiempo 1 de 9 días medidos» y la etiqueta «Arriesgado».
- [ ] No aparece el nombre de ninguna otra app.

---

## 6. Pantalla 4: Lo prometido frente a lo real

**Objetivo:** enseñar el dato oficial del portal de la Comunidad junto a lo medido. **Es obligatoria:** sin datos del portal, el jurado no evalúa el proyecto.

**Elementos, por cada caso de `demo.json.prometido_real`:**

| # | Elemento | Contenido exacto |
| --- | --- | --- |
| 1 | Título | `titulo` |
| 2 | Caja «Prometido» | Etiqueta «Prometido» · cifra `prometido` · fuente `fuente_prometido`, enlazada a `enlace` |
| 3 | Caja «Medido» | Etiqueta «Medido por nosotros» · cifra `medido` |
| 4 | Conclusión | «La media cumple. Lo que falla es la regularidad.» |

Las dos cajas van una al lado de la otra si caben y una debajo de otra si no. Botón «← Volver» arriba a la izquierda, que regresa a la pantalla 2.

**Comprobación:**

- [ ] El enlace abre `https://datos.comunidad.madrid/dataset/1919185`.
- [ ] Los textos coinciden carácter a carácter con `demo.json`.

---

## 7. Pantalla 5: Avisos (simulación)

**Objetivo:** enseñar la siguiente fase, los avisos de viajeros al estilo Waze, **dejando claro que es una simulación**.

**Elementos, en este orden:**

| # | Elemento | Contenido exacto |
| --- | --- | --- |
| 1 | Banda fija arriba, siempre visible | «SIMULACIÓN · Así funcionarían los avisos de viajeros» (fondo de aviso simulado) |
| 2 | Lista | Una tarjeta por elemento de `avisos_simulados`: «{linea}» · «{texto}» · «hace {hace_min} min» · «{confirman} viajeros lo confirman» (con 1: «1 viajero lo confirma») |
| 3 | Botones de cada tarjeta | «Sigue pasando» · «Ya no» (solo cambian el contador en pantalla, no guardan nada) |
| 4 | Botón flotante | «+ Avisar» → abre una lista: «Retraso», «Bus lleno», «No ha pasado», «Desvío», «Parada anulada», «Accesibilidad». Al elegir una opción: mensaje «Gracias. En la versión real tu aviso se compartiría con otros viajeros.» |

**Comprobación:**

- [ ] La banda «SIMULACIÓN» se ve aunque se haga scroll.
- [ ] Ningún aviso simulado aparece en las pantallas 1 a 4.
- [ ] Con `confirman = 1` el texto va en singular.

---

## 8. Pantalla 6: Info

**Objetivo:** explicar el método y cumplir las licencias. Todo el texto es fijo, salvo las fechas y las advertencias.

| # | Bloque | Contenido exacto |
| --- | --- | --- |
| 1 | Título | «Cómo funciona» |
| 2 | Explicación | «Grabamos lo que anuncian las apps oficiales y lo comparamos con cuándo llega de verdad. Con eso calculamos cuánto fiarse de cada anuncio.» |
| 3 | Periodo | «Datos del {datos_desde} al {datos_hasta}.» (de `meta`, en formato dd/mm/aaaa) |
| 4 | Fuentes | Lista: «Portal de Datos Abiertos de la Comunidad de Madrid» · «Powered by EMT de Madrid» · «Fuente: Renfe» · «Fuente: Consorcio Regional de Transportes de Madrid. Datos extraídos del {datos_desde} al {datos_hasta}.» Cada una enlazada a su dirección en `meta.fuentes` |
| 5 | Licencia | «Los datos derivados se publican con licencia ODbL.» |
| 6 | Límites | Cada texto de `meta.advertencias`, tal cual, en una lista |
| 7 | Código | «Código abierto en GitHub» con enlace al repositorio (// PENDIENTE: dirección cuando sea público) |

**Comprobación:**

- [ ] Aparecen las cuatro fuentes con sus enlaces.
- [ ] Las advertencias salen de `meta.advertencias`, no escritas a mano.

---

## 9. Comprobación final antes de publicar

- [ ] Se abre desde el QR en Android y en iPhone, y se ve bien a 360 px de ancho.
- [ ] Las siete pantallas (1, 2, 2b, 3, 4, 5 y 6) cumplen su lista de comprobación.
- [ ] Las pantallas 1, 2 y 3 no muestran porcentajes.
- [ ] No hay ningún porcentaje ni ventana sin datos detrás.
- [ ] No aparece el nombre de ninguna otra app ni los logotipos de los operadores.
- [ ] `consultar.js` y `fiabilidad.json` son idénticos a los del repositorio de datos.
- [ ] Todos los `// PENDIENTE` del código están resueltos o anotados en una issue.
