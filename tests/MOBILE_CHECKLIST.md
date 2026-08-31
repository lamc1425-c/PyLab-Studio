# Checklist móvil — PyLab Studio 0.5.0

Los tests estáticos protegen la estructura, pero estas comprobaciones deben hacerse en al menos un teléfono real antes de publicar.

## Viewports recomendados

- 320 × 568
- 360 × 800
- 390 × 844
- 412 × 915
- 768 × 1024
- tablet horizontal

## Layout base

- La toolbar sigue siendo una única fila con scroll horizontal.
- No aparece una barra móvil adicional.
- El botón TAB solo aparece en dispositivos táctiles.
- El editor y la terminal conservan su proporción base si nunca se ha movido el divisor.
- Abrir el selector de temas o el menú Archivos no desplaza el layout.
- El teclado virtual no tapa permanentemente `input()` ni rompe el scroll del editor.

## Guardar

- El botón Guardar es accesible en la toolbar sin crear una fila nueva.
- Guardar un archivo abierto sobrescribe el original cuando el navegador ofrece un handle escribible.
- Guardar un documento sin handle abre Guardar como o descarga una copia.
- Guardar como permite un nombre nuevo; un Notebook conserva `.ipynb`.
- Tras guardar desaparece el indicador de cambios sin guardar.

## Notebook

- Crear Notebook desde el menú Archivos.
- La primera celda es editable y el teclado virtual permanece estable.
- El botón ▶ de cada celda tiene un objetivo táctil cómodo.
- Crear una variable en una celda y usarla en otra.
- `2 + 2` muestra `4` sin `print()`.
- Añadir una celda desde `+ Celda de código`.
- Cambiar el tipo de celda y eliminar una celda.
- La salida larga de una celda puede desplazarse sin provocar scroll horizontal de página.
- Abrir y guardar un `.ipynb` real.

## Divisor del terminal

- Arrastrar hacia arriba aumenta la terminal.
- Arrastrar hacia abajo aumenta el editor.
- El gesto solo bloquea el scroll cuando el dedo comienza sobre el divisor.
- El divisor no crea espacio visible extra cuando no se interactúa con él.
- Plegar/desplegar terminal sigue funcionando después de redimensionar.
- Rotar el dispositivo no rompe la distribución.
- Doble toque/clic sobre el divisor restaura el tamaño base cuando el navegador genera `dblclick` correctamente; el teclado ofrece `0` como alternativa.

## Regresiones existentes

- TAB añade 4 espacios.
- Selección múltiple + TAB indenta todas las líneas.
- `Ctrl+/` en teclado físico comenta/descomenta.
- Los 8 temas son legibles.
- NumPy/Pandas cargan sin `Loading...` en la salida.
- `input()` funciona.
- Stop recupera el Studio de un bucle infinito.
- Renombrar sigue siendo inline en la pestaña y `×` sigue cerrando.


## 0.4.2 — comprobaciones nuevas

- En Notebook, tocar ▶ en una celda ejecuta `print("hola")` y el contador cambia de `[ ]` a `[1]`.
- Crear un Notebook abre una pestaña nueva y permite nombrarla sin perder `.ipynb`.
- `Archivos → Abrir carpeta / proyecto…` abre un explorador temporal, no un panel permanente.
- Tocar un `.py` del proyecto abre únicamente ese archivo en una pestaña.
- En Android, verificar el fallback de selector de carpeta cuando `showDirectoryPicker` no esté disponible.
- El nuevo botón Copiar del terminal copia toda la salida visible/acumulada sin modificar el tamaño del terminal.


## 0.4.3 — regresiones de pestañas y Notebook

- [ ] Crear un `.py` nuevo lo muestra inmediatamente sin recargar la página.
- [ ] Crear un Notebook nuevo lo muestra inmediatamente y permite renombrarlo con `.ipynb`.
- [ ] Abrir un `.ipynb` usa todo el ancho disponible del editor.
- [ ] Cerrar el Notebook activo cambia inmediatamente al siguiente archivo y no deja celdas residuales.
- [ ] Cerrar un archivo con cambios muestra el diálogo interno y Cancelar/Cerrar responden sin bloquear la interfaz.
- [ ] Repetir crear/cerrar 10 veces no deja la aplicación congelada ni requiere refrescar.
