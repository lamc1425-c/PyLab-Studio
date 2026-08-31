# PyLab Studio

PyLab Studio es un proyecto que he ido construyendo para poder escribir y probar Python desde el navegador, tanto en una computadora como en el móvil.

La idea es sencilla: tener un espacio cómodo para trabajar con archivos Python, notebooks y pequeños proyectos sin llenar la pantalla de paneles innecesarios.

## Qué tiene ahora

- Editor de Python con sangría de 4 espacios y comentarios.
- Jupyter Notebook `.ipynb` con ejecución por celdas.
- NumPy, Pandas y otros paquetes disponibles en Pyodide.
- Apertura de archivos y carpetas/proyectos.
- Guardar y Guardar como.
- Terminal redimensionable y opción para copiar toda la salida.
- Varios temas, con PyLab Dark como tema inicial.
- Mensaje de bienvenida: `Less bugs, more code.`
- Interfaz en English, Español e Italiano, con inglés como idioma inicial.
- Diseño pensado para escritorio y móvil.
- PWA instalable desde el navegador.

## Ejecutarlo en local

Necesitas Node.js 20.19 o superior.

```bash
npm ci
npm run dev
```

Para comprobar el proyecto:

```bash
npm test
npm run build
```

Y para probar el build de producción:

```bash
npm run preview
```

## Python en el navegador

PyLab Studio usa Pyodide, así que Python se ejecuta directamente en el navegador y no necesita un servidor Python para lo básico.

Esto funciona muy bien con librerías como NumPy y Pandas, pero no todos los paquetes de Python son compatibles. Streamlit, por ejemplo, necesita otro tipo de runtime y por ahora no está soportado.

## Despliegue

El proyecto está preparado para Vite y Netlify.

- Build command: `npm run build`
- Publish directory: `dist`

PyLab Studio sigue creciendo, pero la prioridad es mantenerlo simple y no romper lo que ya funciona, especialmente en móvil.
