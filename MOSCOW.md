# Prioridades de la demo (MoSCoW)

Qué entra en la demo del 20 de noviembre y qué no. Se ordena con MoSCoW:

- **Must:** sin esto no hay demo.
- **Should:** debería estar si da tiempo.
- **Could:** solo si sobra tiempo.
- **Won't:** no entra ahora; se cuenta como siguiente fase.

Borrador a partir de la reunión del 10 de noviembre. Cualquier cambio, por pull request.

## Must: sin esto no hay demo

| Qué | Por qué | Responsable |
| --- | --- | --- |
| Web app pública que se abre con un QR y se ve bien en el móvil | Es lo que va a tocar el jurado | Hugo (despliegue), Gonzalo y Alejandro (front) |
| Buscar una parada o línea y ver lo que anuncia la app junto con cuánto fiarse | Es el producto: «la app dice 21 min; en 8 de cada 10 casos llega entre 20 y 27» | Precisión y front |
| Datos reales de 1 o 2 líneas (por ejemplo, el 691 interurbano y una línea de EMT o Renfe) | Demuestra que funciona con datos de verdad | Precisión |
| Dato oficial del portal de la Comunidad junto al medido (intervalo programado frente a real) | Sin datos del portal no se evalúa el proyecto; además valen 25 puntos | Precisión |
| Atribución de fuentes y licencias en la web, y aviso cuando no hay dato | Lo exigen las licencias y evita inventar resultados | Front |
| Un caso real contado en la demo o en el pitch (el 104 en Mar de Cristal: la app decía «ya está» y no había bus) | Hace que el problema se entienda sin tablas | Pitch |
| Nombre del proyecto, guion de 5 min y las 3+1 diapositivas de las bases | Es lo que se entrega | Miguel y pitch |
| Repositorio que alguien de fuera pueda ejecutar siguiendo el README | Tecnologías abiertas y reproducibilidad valen 10 puntos | Todos |

## Should: debería estar si da tiempo

| Qué | Por qué |
| --- | --- |
| Pantalla «¿Cuándo salgo?»: a qué hora salir para llegar a tiempo | Convierte la fiabilidad en una decisión útil |
| Mapa de la parada (Leaflet u OpenStreetMap) que muestre en qué lado de la calle está | Las apps actuales no lo dejan claro |
| Ejemplo de los avisos estilo Waze con datos simulados, marcado como «simulación» | Enseña la siguiente fase sin prometer datos que no tenemos |
| Avisos oficiales de la EMT junto al resultado (huelgas, desvíos) | Ya los grabamos; explican muchos retrasos |
| Ventana de confianza también para EMT, Metro y Renfe | Que la demo no se quede solo en un modo |
| Vídeo corto de la demo | Por si el material del 20 lo pide o falla la conexión en la final |
| Pruebas con usuarios (QA) hechas por los de primero | Detecta lo que no se entiende antes del jurado |

## Could: solo si sobra tiempo

| Qué | Por qué |
| --- | --- |
| Pantalla con el tiempo real de la línea | Al jurado le gusta el tiempo real |
| Recorrido de la línea en grande sobre el mapa | Las apps actuales muestran las líneas muy pequeñas |
| Elegir primero el medio (metro, bus…) y ver las líneas cercanas | Pantalla de inicio más cómoda |
| Indicar si el retraso es de la carretera (las líneas que comparten corredor también van tarde) o solo de la línea | Ya está medido en Zoco con el 691 |
| Tráfico del Ayuntamiento y de la DGT como explicación del retraso | Los datos ya están en el repositorio |

## Won't: no entra ahora, siguiente fase

| Qué | Por qué no ahora |
| --- | --- |
| Registro e inicio de sesión de usuarios | No hace falta para la demo |
| Avisos de usuarios reales (retrasos, bus lleno, parada en la que te bajas, reputación) | Hacen falta muchos usuarios y tratar datos personales |
| Modo pasivo: detectar que vas en el bus con el GPS | Necesita una app nativa, permisos y cuidado con la batería |
| Modelo de IA entrenado | Con pocas semanas de datos no hay suficiente para entrenarlo |
| Planificador de rutas con transbordos (algoritmo RAPTOR) | Es otro producto; se cuenta como evolución |
| Todas las paradas de Madrid | La API no permite consultarlas todas; se demuestra con 1 o 2 líneas |
| Ocupación de los autobuses | No hay datos públicos |
| Viaje gratis en BiciMAD si pierdes el bus por un mal anuncio | Necesita un acuerdo; se puede contar como idea en el pitch |
| Recomendar en qué vagón subir | Fuera del problema que resolvemos |

## Fechas

- **Viernes 13 de noviembre:** primera versión de cada área.
- **Martes 17 de noviembre:** demo publicada con QR y pruebas con usuarios hechas.
- **Miércoles 18 de noviembre:** ensayo completo del pitch.
- **Jueves 19 o viernes 20 de noviembre:** envío del material de preselección.
