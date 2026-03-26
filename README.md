# PARACEL · Gestor Colaborativo de Proyectos — v3 Ultra Premium

Esta es la versión **v3** de la Web App GAS de PARACEL — una refactorización completa del frontend con diseño premium, nuevas funcionalidades y código más limpio y eficiente.

---

## 🚀 Novedades v3 vs v2

### 🎨 Diseño & UX
- **Nueva tipografía**: Sora (display) + DM Sans (cuerpo) + DM Mono (código) — via Google Fonts
- **Modo oscuro completo** — toggle persistente en localStorage (ícono ☀️/🌙 en topbar)
- **Glassmorphism refinado** — superficies translúcidas con `backdrop-filter: blur()` en sidebar, login card, panel flotante
- **KPI rings** — cada tarjeta KPI tiene un indicador circular SVG animado (transición 1.2s)
- **Animaciones de entrada** — `fadeTab` en cambio de sección, `loginIn` al cargar, `modalIn` en modales
- **Barra de progreso en filas del Gantt** — visible en modo expandido
- **Chips de etiquetas** renderizados desde el campo `tags` (separados por coma)
- **Hover más suave** con `cubic-bezier(.175,.885,.32,1.275)` en todas las transiciones
- **Scrollbars personalizados** finos y con color institucional
- **Estado vacío** (`empty-state`) con ícono y mensaje amigable cuando no hay datos

### ⚙️ Funcionalidades nuevas
| Funcionalidad | Descripción |
|---|---|
| **Modo oscuro** | Toggle en topbar, persiste en localStorage |
| **Línea "Hoy" en Gantt** | Línea verde vertical que marca el día actual en el cronograma |
| **Vista Gantt compacta** | Botón "Compactar/Expandir" — filas de 34px para ver más tareas a la vez |
| **Botón "Hoy" en Gantt** | Scroll automático al día actual |
| **Sección Actividad** (nueva) | Tareas recientes + distribución por estado + distribución por tipo |
| **Colores de proyecto** en Gantt | Borde izquierdo de cada bloque con el color del proyecto |
| **Indicador de avance** en tabla urgentes | Barra de progreso inline en la lista ejecutiva |
| **Navegación "Hoy"** en calendario | Botón para volver al mes actual |

### 🛠 Calidad de código
- **Funciones cortas y nombradas** — sin `innerHTML` mega-strings anidados de 400 líneas
- **`normalClass()`** unificado para clases CSS de badges
- **`filtered()`** centralizado para todos los render que usan filtros
- **`kpiCard()`** reutilizable con configuración por objeto
- **Dark mode** con variables CSS — sin JavaScript extra, solo toggle de clase `.dark` en `<html>`
- **`store`** wrapper para localStorage (no rompe si está bloqueado)
- **Carga de imágenes** preview en el `onchange` del input file, sin esperar guardar

---

## ⚙️ Estructura del Proyecto

| Archivo | Descripción |
|---|---|
| `appsscript.json` | Manifiesto: zona horaria, permisos |
| `Config.gs` | IDs de Spreadsheet, Drive, constantes globales |
| `Auth.gs` | Login, logout, sesiones |
| `Utils.gs` | Persistencia GAS, enrutadores, helpers |
| `Data.gs` | CRUD completo: tareas, proyectos, usuarios, adjuntos |
| `Init.gs` | `setupSystem()` — inicialización de hojas y triggers |
| `SeedData.gs` | Datos de demo |
| `Notifications.gs` | Digest diario por email |
| `Index.html` | HTML base de la SPA — estructura semántica mejorada |
| `Styles.html` | CSS v3 — diseño premium con variables, dark mode, animaciones |
| `Scripts.html` | JS v3 — estado reactivo, renders modulares, modo oscuro |

---

## 📥 Despliegue

1. `clasp push` desde el directorio del proyecto para enviar al GAS editor.
2. Ejecutar `Init.gs > setupSystem()` para crear hojas y datos de demo.
3. Implementar como **Aplicación Web** — ejecutar como "usuario que accede" — acceso "Cualquiera".

### Credenciales de demo
```
user / 123
diego / Diego2026!
```
