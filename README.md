# Clave

Interfaz privada para encontrar credenciales en una hoja de Google Sheets. Búsqueda por colaborador, correo y servicio; filtros por departamento y plataforma; favoritos durante la sesión; copia de usuario o contraseña; consulta automática cada 60 segundos mientras la pestaña está visible.

## Abrir en Chrome en tu computadora (sin publicar)

1. Instala **Node.js 24 LTS** desde https://nodejs.org si todavía no lo tienes. Cierra y vuelve a abrir la terminal después de instalarlo.
2. En Windows, pulsa **Copiar para Windows** en el menú de Clave y sigue el apartado de transferencia de abajo: crea el proyecto sin descargar archivos desde el chat. Si ya dispones del ZIP, extráelo y abre la carpeta `clave`. Deben quedar juntos `package.json`, `package-lock.json`, `server.js`, `public/` y `lib/`. El código creado en este chat no se ha subido automáticamente a GitHub; clonar el repositorio vacío no descarga esta interfaz.
3. Abre una terminal en esa carpeta (la que contiene `package.json`). En Windows puedes abrirla desde el Explorador con **Abrir en Terminal**. En macOS o Linux utiliza `cd` con la ruta donde extrajiste el proyecto.
4. Ejecuta:

```sh
npm ci
npm start
```

5. Deja la terminal abierta y escribe **http://localhost:3000** en la barra de direcciones de Chrome. Esta dirección debe abrirse en tu computadora, después de ejecutar allí los comandos; un servidor iniciado en el entorno de ChatGPT no se ejecuta en tu equipo.
6. Para detenerlo, vuelve a la terminal y pulsa **Ctrl+C**. Para abrirlo otro día basta con `npm start` desde la misma carpeta; `npm ci` solo es necesario la primera vez o cuando cambien las dependencias.

`npm start` y `npm run dev` escuchan solo en `127.0.0.1`, accesible desde tu propia computadora. No necesitas dominio, hosting, túneles ni publicar nada. Sin crear `.env` ni configurar Google se muestran datos ficticios y puedes probar búsqueda, filtros y botones. La conexión a tu hoja es un paso posterior.

La descarga incluye únicamente una lista explícita de archivos de código, instrucciones y configuración de ejemplo. No incluye `.env`, credenciales reales, sesiones ni `node_modules`.

### Windows: si ChatGPT bloquea la descarga

Una vista previa incrustada puede impedir las descargas si su contenedor no concede `allow-downloads`. La aplicación no puede concederse ese permiso. Para transferir el proyecto sin descargar archivos desde el navegador:

1. Pulsa **Copiar para Windows** en el menú de la interfaz.
2. Espera a que se prepare el bloque y pulsa **Copiar bloque**. Si el navegador también bloquea la copia automática, pulsa **Seleccionar texto** y luego **Ctrl+C**.
3. Abre **Windows PowerShell** desde Inicio. Pega el bloque completo y pulsa Enter. Si Windows Terminal pide confirmar un pegado de varias líneas, revisa el bloque y acepta para ejecutarlo. No hace falta ejecutar como administrador ni cambiar la política de ejecución.
4. El bloque verifica la integridad del ZIP, crea una carpeta nueva `Clave-…` en el Escritorio (o en tu carpeta personal si no hay Escritorio), extrae el proyecto y deja PowerShell en su carpeta. No descarga ni ejecuta código remoto y no sobrescribe una carpeta anterior.
5. Con **Node.js 24 LTS** instalado, ejecuta `npm ci` y `npm start`. Abre `http://localhost:3000` en Chrome.

El bloque contiene una copia codificada del mismo ZIP de código fuente, sin `.env` ni contraseñas reales. Este mecanismo utiliza texto visible y selección manual, sin depender de las descargas ni del permiso de portapapeles de la vista previa.

No abras `public/index.html` con doble clic para probar las funciones: el diseño puede cargar, pero los datos, la sincronización y la sesión requieren el servidor Node. Tampoco sirve un servidor estático o la extensión Live Server como sustituto de `npm start`.

### Si no se ve bien

- Comprueba que la terminal diga `CLAVE en 127.0.0.1:3000` y abre exactamente `http://localhost:3000`, no una ruta `file://` ni la carpeta `public/`.
- Recarga Chrome con **Ctrl+Shift+R** (Windows/Linux) o **Cmd+Shift+R** (macOS).
- En las herramientas de desarrollador de Chrome, pestaña Red/Network, `style.css` y `app.js` deben responder **200**. El CSS debe tener tipo `text/css`; si devuelven HTML o 404 se está usando una dirección o servidor diferente.
- Si aparece `EADDRINUSE`, el puerto 3000 está ocupado. Detén la otra copia de la aplicación. Como alternativa, copia `.env.example` a `.env`, cambia `PORT=3001` y `APP_URL=http://localhost:3001`, reinicia y abre esa dirección. Si usas Google, registra también su callback con el puerto nuevo.

### Vista previa en un entorno de nube

Solo para la vista previa dentro de un contenedor, ejecuta `npm run preview` desde `/workspace/Prueba`. Este comando escucha en `0.0.0.0` para que el proxy de la vista previa pueda acceder al proceso; no es el comando recomendado para las pruebas privadas en tu computadora. No crea una publicación ni un despliegue por sí mismo.

En modo de demostración y desarrollo, esta orden permite que `https://chatgpt.com` y `https://chat.openai.com` incrusten la interfaz. Evita una pantalla en blanco causada por `X-Frame-Options: SAMEORIGIN` y `frame-ancestors 'self'`. La autorización para incrustar se limita a esos dos orígenes, además del propio. `npm start`, producción y cualquier configuración con acceso real a Google conservan la restricción de mismo origen.

### Estilos y comprobaciones

La interfaz utiliza **CSS normal**, sin Tailwind, compilación de CSS, CDN ni fuentes externas. `public/index.html` enlaza `./style.css` y `./app.js` con rutas relativas para que los recursos también se encuentren cuando se abre desde una subcarpeta. La política de seguridad mantiene la actualización automática a HTTPS solo en producción, no en el servidor local HTTP.

`npm test` ejecuta las pruebas de lectura, acceso y carga HTTP de los recursos. `npm run dev` reinicia el servidor al cambiar archivos.

## URL pública y acceso del equipo

El proyecto incluye un `Dockerfile` con Node.js 24 y `render.yaml` para una única instancia en Render, con el plan gratuito seleccionado en el archivo. Verifica las condiciones vigentes y cualquier cargo en Render antes de confirmar. No se ha creado un servicio ni activado un plan desde este repositorio.

La URL será pública; los datos requieren iniciar sesión con Google y un correo autorizado. **Todas las personas autorizadas ven todas las credenciales de la hoja**, según el modelo acordado. Cada persona también debe tener acceso privado de lectura a esa hoja en Google Sheets. Esta versión no ofrece permisos distintos por departamento.

### Crear el servicio

1. Crea una cuenta en https://render.com y conecta GitHub, concediendo acceso solo a `PlanetGrop/Prueba` cuando sea posible.
2. Selecciona **New → Blueprint**, el repositorio y su rama `main`. Revisa el servicio `clave-cuentas`, el plan y las variables antes de confirmar. La alternativa manual es **New → Web Service**, el mismo repositorio, entorno **Docker**, una instancia y health check `/healthz`.
3. Introduce los valores privados `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_SPREADSHEET_ID` y `GOOGLE_ALLOWED_EMAILS`. El último contiene los correos separados por comas, por ejemplo `persona1@example.com,persona2@example.com`. No pegues el secreto en el chat ni en archivos de GitHub. Opcionalmente añade `GOOGLE_SHEET_TAB` con el nombre exacto de la pestaña.
4. El Blueprint genera un `SESSION_SECRET` aleatorio. En configuración manual, genera uno de al menos 32 caracteres y guárdalo en los ajustes seguros del servicio. Configura también `NODE_ENV=production`, `TRUST_PROXY=1` y `SESSION_DB_PATH=/tmp/clave/sessions.sqlite`. `TRUST_PROXY=1` supone un único proxy de confianza delante del proceso; no expongas directamente el puerto Node a internet.
5. Render proporciona `RENDER_EXTERNAL_URL`; la aplicación lo usa como origen si no has configurado `APP_URL`. Copia la URL **real que muestre Render** cuando el servicio esté creado. No uses `localhost` en la configuración pública.
6. En Google Auth Platform → Clientes, abre tu cliente OAuth y añade `https://TU-URL-REAL/auth/google/callback` como URI de redireccionamiento autorizado. Conserva el callback de localhost si también quieres utilizar la instalación de Windows.
7. Agrega a cada integrante en **Público → Usuarios de prueba** mientras la aplicación OAuth siga en modo Prueba. Comparte la hoja privadamente con esos mismos correos como lectores. No publiques la hoja.
8. Abre la URL HTTPS en Chrome. Debe mostrarse la pantalla de inicio de sesión. Prueba tu cuenta, otra autorizada y una no autorizada. En una ventana de incógnito, `/api/credentials` debe devolver 401 sin mostrar datos. Verifica también cierre de sesión y sincronización con datos ficticios antes de usarla para el equipo.

No se puede validar el inicio de sesión real del servicio hasta que estén configurados su URL, secretos y callback en Google. El acceso de prueba de Google seguirá mostrando el aviso de aplicación no verificada; utiliza únicamente el proyecto y cliente que administras. Si luego se distribuye fuera del grupo de prueba, revisa los requisitos de verificación de Google.

### Sesiones y disponibilidad

- En producción se requieren las credenciales de Google, la lista de correos y una clave de sesión estable. Si faltan, el proceso no arranca con una demostración pública por accidente.
- Las sesiones usan cookies `__Host-`, Secure, HttpOnly y SameSite=Lax. El servidor hace vencer la autorización a los 15 minutos aunque se siga consultando la hoja; el navegador cierra la vista tras cinco minutos de inactividad.
- Los tokens de Google se cifran con AES-256-GCM en SQLite antes de escribirlos en el servidor. La clave se deriva de `SESSION_SECRET` con HKDF. Las contraseñas de la hoja no se guardan en la base de sesiones.
- La configuración gratuita usa disco temporal: un reinicio o despliegue puede exigir iniciar sesión otra vez. El servicio puede suspenderse por inactividad y tardar en arrancar. Los cambios siguen guardándose en Google Sheets.
- Esta configuración soporta **una instancia**. Para escalar a varios procesos se necesita un almacén compartido y una revisión de los límites de solicitudes. No aumentes las instancias conservando una base SQLite local por instancia.
- Para revocar a una persona, quita su correo de `GOOGLE_ALLOWED_EMAILS`, aplica la nueva configuración en el servicio y revisa también sus permisos de la hoja. Cada solicitud revalida el correo de la sesión contra la lista configurada. Usa verificación en dos pasos en las cuentas de Google del equipo.
- Para un dominio propio, conecta el dominio en Render, espera a que esté activo su HTTPS, configura `APP_URL=https://TU-DOMINIO` y añade el callback exacto en Google. Un dominio propio es opcional.

## Conectar la hoja privada

1. En Google Cloud Console crea o selecciona un proyecto y habilita **Google Sheets API**.
2. Configura la pantalla de consentimiento de Google Auth Platform. Si la aplicación está en modo de prueba, agrega tu correo como usuario de prueba. Para una organización, utiliza una aplicación interna cuando esté disponible. Una aplicación externa distribuida podría requerir verificación de Google.
3. Crea un cliente OAuth de tipo **Aplicación web**. Registra como URI de redirección `http://localhost:3000/auth/google/callback` para desarrollo, o `https://TU-DOMINIO/auth/google/callback` para un despliegue. Debe coincidir exactamente con `APP_URL` más `/auth/google/callback`.
4. Copia `.env.example` a `.env` y configura en privado `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_ALLOWED_EMAIL` y `GOOGLE_SPREADSHEET_ID`. Nunca envíes secretos por chat ni los añadas a Git. Para un equipo, `GOOGLE_ALLOWED_EMAILS` acepta varios correos separados por comas y tiene prioridad sobre `GOOGLE_ALLOWED_EMAIL`. Todas las cuentas deben tener acceso a la hoja. `SESSION_SECRET` es opcional solo en desarrollo: por defecto se genera una clave criptográfica en memoria en cada arranque. Si proporcionas una clave propia, debe tener al menos 32 caracteres.
5. El ID es el segmento de la URL entre `/spreadsheets/d/` y `/edit`. No se necesita publicar ni compartir públicamente la hoja. Si hay varias pestañas, indica la deseada en `GOOGLE_SHEET_TAB`; sin ese valor se lee la primera.
6. Reinicia el servidor e inicia sesión con **Conectar Google Sheets**. Edita un dato ficticio en la hoja de prueba y pulsa Sincronizar, o espera 60 segundos, para comprobar la integración real.

El servidor requiere conexiones HTTPS salientes a `accounts.google.com`, `oauth2.googleapis.com`, `openidconnect.googleapis.com` y `sheets.googleapis.com`. La instalación requiere `registry.npmjs.org`. En un entorno restringido, habilita estos destinos en sus ajustes de red. En el entorno de nube puedes suministrar `GOOGLE_CLIENT_SECRET` mediante el ajuste seguro del entorno con destino `oauth2.googleapis.com`; la sustitución del secreto en la solicitud HTTPS debe comprobarse al validar la conexión real. No uses un secreto sustituido por proxy como `SESSION_SECRET`, ya que la clave de sesión se utiliza localmente.

## Formato de tu hoja

Se admiten las dos filas de encabezados proporcionadas:

| Fila | A | B | C | D | E | F | G | H | I | J | K | L |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Departamento/Area | Colaborador(nombre completo) | Cuenta de Googlev | | | MOCHAHOST (995-465) | | SIRETT | | | SERVIDOR | |
| 2 | | | Correo | Contraseña | BITRIX | Correo | Contraseña | Usuario | Contraseña | | USUARIO | CONTRASEÑA |

Los datos empiezan en la tercera fila. Cada par de usuario y contraseña se muestra como una cuenta del colaborador. BITRIX es una contraseña independiente: se muestra sin usuario y no se inventa uno. Se aceptan encabezados de servicio combinados. Los departamentos vacíos heredan el último departamento indicado, para admitir celdas combinadas verticalmente. Las contraseñas se preservan sin recortarlas. **Configura sus celdas como texto sin formato en Sheets** para conservar ceros iniciales y evitar conversiones de números o fórmulas.

También se admiten hojas simples con una fila de encabezados: `Servicio`, `Correo` (o `Usuario`), `Contraseña`, y opcionalmente `Categoría`, `Notas` y `URL`. Para añadir Apple ID al formato de equipo, agrega un encabezado de servicio con un par `Usuario` y `Contraseña` debajo. La lectura abarca A:ZZ hasta la fila 10001 (9999 filas de datos en formato de equipo).

## Seguridad y límites de esta primera versión

- El servidor tiene acceso de solo lectura a la hoja indicada. El permiso OAuth solicitado permite leer las hojas accesibles para la cuenta autorizada; usa una cuenta dedicada con acceso limitado si necesitas reducir ese alcance.
- Solo los correos autorizados pueden ver datos reales. La autorización OAuth usa estado aleatorio, PKCE y renovación de sesión al iniciar sesión. En desarrollo, las sesiones viven en memoria; en producción los tokens se guardan cifrados en SQLite. Las cookies son HttpOnly y SameSite=Lax, y en producción también Secure.
- No se guardan contraseñas en disco, localStorage ni IndexedDB. Sheets sigue siendo el origen y el navegador recibe las contraseñas durante una sesión autorizada para poder mostrarlas y copiarlas. No hay una base de datos cifrada propia. Google Sheets no sustituye a un gestor de contraseñas con cifrado de extremo a extremo.
- Las contraseñas mostradas se ocultan tras 20 segundos y al perder el foco. La sesión se cierra después de cinco minutos de inactividad en la interfaz y la cookie vence a los 15 minutos. El portapapeles queda bajo control del sistema operativo: no se borra automáticamente.
- Las respuestas llevan `Cache-Control: no-store`; hay una política CSP y restricciones de origen para el cierre de sesión. No hay analítica, fuentes externas ni scripts de terceros. Los favoritos viven solo en memoria durante la sesión y sus IDs corresponden a la posición de las filas.
- La configuración de producción es para una sola instancia. Aplica límites de solicitudes y de intentos de acceso. Cambiar `SESSION_SECRET` invalida las sesiones guardadas. El disco temporal de Render puede perder las sesiones al reiniciar; se vuelve a entrar con Google.
- En producción, usa HTTPS y `NODE_ENV=production`; configura `APP_URL` con el origen real. Usa `TRUST_PROXY=1` exclusivamente detrás de un único proxy confiable. No actives producción con HTTP ni registres cuerpos de respuestas o secretos en un proxy.

Las pruebas automatizadas simulan Google y verifican el formato de la hoja, autorización, restricción de correo, cierre de sesión y errores. La conexión con una hoja real requiere tus valores OAuth y todavía debe validarse con datos ficticios antes de usar credenciales reales.
