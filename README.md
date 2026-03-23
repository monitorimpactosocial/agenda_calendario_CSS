# PARACEL · Gestor Colaborativo de Proyectos (v2 - Web App GAS)

Esta es la versión mejorada de la Web App basada en Google Apps Script para el Monitoreo de Impacto Social de PARACEL.

## 🚀 Mejoras en esta versión (v2)

Esta versión incluye mejoras significativas en la experiencia de usuario y diseño:

*   **Identidad Visual Premium:** Interfaz con la paleta de colores verde institucional de PARACEL (`#14532d`, `#16a34a`, etc.).
*   **Jerarquía Visual por Tipo de Tarea:** Colores específicos de la marca asocidos automáticamente a:
    *   **Tema** (Verde muy oscuro / casi negro)
    *   **Subtema** (Verde medio oscuro)
    *   **Actividad** (Verde estándar)
    *   **Hito** (Aquamarina/Teal)
*   **Cronograma (Gantt) Interactivo:**
    *   Colores de bloque según la jerarquía.
    *   Filas sombreadas para mejor visualización de jerarquía.
    *   **Doble Clic para Editar:** Al hacer doble clic en un bloque del diagrama de Gantt, se abre un panel flotante contextual para ver detalles y editar rápidamente.
*   **Tooltips Enriquecidos:** Al posicionar el cursor sobre una tarea, aparece un tooltip elegante que muestra:
    *   Título, Estado, Prioridad, Fechas.
    *   **Barra de progreso visual.**
    *   **Días restantes calculados** (con advertencias automáticas si está atrasada o vence hoy).
    *   **Ruta de trabajo** y **Enlace a Google Drive** clickeable directamente desde el tooltip.
    *   Comparativa de horas reales vs horas estimadas.
*   **Dashboard KPI:** Indicadores clave de rendimiento (KPIs) equipados con *barras de progreso visuales* relativas al total de tareas.
*   **Tablero Kanban de Equipo:** La pestaña de Equipos ahora incluye un tablero Kanban (Columnas: Pendiente, En curso, Completada) para dar visibilidad inmediata del estado de todas las tareas del proyecto.
*   **Gestión de Archivos Mejorada:** Vista previa automática de la imagen seleccionada antes de enviarla.
*   **Alertas Dinámicas:** La barra superior muestra un mensaje con un "badge" pulsante rojo si existen tareas urgentes.

## ⚙️ Estructura del Proyecto

*   `appsscript.json`: Manifiesto de la aplicación (IDs de zona horaria y accesos).
*   `Config.gs`: Configuraciones globales (IDs de Hojas de Cálculo, Carpetas Raíz en Drive, zona horaria y secret salt).
*   `Auth.gs`: Lógica de autenticación simple.
*   `Utils.gs`: Funciones de persistencia y enrutadores.
*   `Data.gs`: Consultas y operaciones CRUD de la aplicación que se devuelven al cliente.
*   `Index.html`, `Styles.html`, `Scripts.html`: Frontend completo de la SPA (PWA).

## 📥 Despliegue en Google Apps Script

1.  Puedes usar `clasp push` para enviar este repositorio directamente a Google Apps Script.
2.  Asegúrate de ejecutar la función `Init.gs > setupSystem()` en el editor de Apps Script para generar la base de datos estructural en tu Spreadsheet si realizas una nueva instalación.
3.  Implementa como **Aplicación Web** ejecutada "como el usuario que accede a la aplicación web" y con acceso para "Cualquiera" (la app maneja su propio login internamente).
