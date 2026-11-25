# DATAMAD 2026: aplicación

Repositorio de la aplicación del equipo para DATAMAD 2026. Los datos y los análisis están en el repositorio `datamad-2026-datos`.

## La app: YaVoy

YaVoy te dice **entre cuántos minutos llega de verdad** tu bus, metro o tren, en vez de un único número que muchas veces falla. Las ventanas salen de lo que hemos medido entre el 24/09 y el 22/11/2026.

Está en la carpeta [`web/`](web/). Para verla en tu ordenador:

```bash
cd web
npm install
npm run dev
```

Abre la dirección que salga (normalmente http://localhost:5173) y entra con la **cuenta de demostración**: `demo@yavoy.app` / `yavoy2026` (también hay un botón que la rellena).

| Pantalla | Para qué sirve |
|---|---|
| **Paradas** | Tus paradas favoritas y, en cada una, cuándo llega cada línea |
| **Rutas** | Tus trayectos de siempre: a qué hora salir y en qué vagón ponerte |
| **Avisos** | Lo que cuentan otros viajeros (simulación) |
| **Info** | De dónde salen los datos y sus límites |

Todo el detalle (pantalla a pantalla, de dónde sale cada dato y qué es simulación) está en [`web/README.md`](web/README.md).

## Cómo trabajamos

- La rama `main` siempre funciona.
- Cada tarea va en su propia rama y entra en `main` con una pull request revisada por otra persona.
