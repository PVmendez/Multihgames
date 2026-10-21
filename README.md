# Multihgames — Noche de juegos

Plataforma de multijuegos para juntadas, estilo "pizarrón de club". Sirve para cualquier grupo: el admin arma el evento con su nombre y elige qué juegos se juegan. Los jugadores entran desde el celu con un código o un QR y arman su personaje.

- **Pantalla grande (host):** se pone en la tele o el proyector. Muestra los juegos, el progreso y la **tabla general**, que corona un campeón al final.
- **Celulares:** cada jugador juega su parte en privado y todo se sincroniza en tiempo real con la sala.

## Juegos

| Juego | Cómo funciona |
|---|---|
| **Ajedrez 9 casillas** | Tablero 3x3 con Rey, Dama, Torre, Alfil y Caballo. Todos juegan a la vez, cada uno en su celu, partiendo del mismo tablero, y nadie ve el de los demás. Hay que dejar las piezas como en la tarjeta del reto. Gana el de menos movimientos y, si empatan, el más rápido. La app calcula el mínimo posible de cada reto (BFS). |
| **Nombres al revés** | La pantalla grande reproduce un famoso al revés (voz sintética de Workers AI, invertida en el navegador). Cada uno se graba imitándolo y el celu da vuelta la grabación para escucharla al derecho. Acertar da 5 puntos, más +3, +2 y +1 para los tres más rápidos. Acepta apellido, tildes y errores de tipeo chicos. |
| **GeoGuesser Montevideo** | Todos ven la misma imagen de Mapillary (360° cuando hay) y clavan su imán en el mapa. Pegarle justo da 1000 puntos y el puntaje baja con la distancia. Si un lugar no convence, el admin puede pedir otro antes de que alguien marque. |
| **Penales** | Animado: cada remate se ve en la pantalla grande y en el celu, con la carrera, el tiro y la estirada del arquero, usando el personaje de cada jugador. Mini liga todos contra todos, con varios partidos a la vez por fecha (si son impares, uno descansa). En cada tanda los dos eligen, al mismo tiempo, a qué lado patean y hacia dónde se tiran. Si uno mete y el otro no, gana; si los dos meten o los dos fallan, se patea otra tanda. Si alguien no elige en 20 segundos, patea al azar. La liga se ordena por partidos ganados y después por diferencia de goles. |
| **No digas tu palabra** | Todos tienen a la vez una palabra secreta que no conocen y ven las de los demás. Si hacés que alguien diga la suya, apretás «¡La dijo!» y el admin confirma: la palabra está tapada en la pantalla y se ve manteniéndola apretada. Las palabras valen de 1 a 3 según la dificultad. Una vez por palabra podés arriesgar cuál es la tuya: si acertás sumás, si le errás es -1. |

**Tabla general:** en cada juego los puestos dan 10 / 8 / 6 / 5 / 4 / 3 / 2 / 1 puntos, y los empates comparten puesto.

**Personajes:** se hacen con [Blobatar](https://blobatar.dev). Cada uno elige forma, color y expresión.

**Personajes especiales:** si alguien se anota con un nombre clave, su avatar pasa a ser una caricatura propia: se ve en el lobby, en las tablas, en el mapa y haciendo los penales. Se configuran en `src/shared/specials.ts`, con las imágenes en `public/personajes/` (cuerpo entero con fondo transparente y la cara). Como el repo es público, los nombres no se guardan en texto: solo su huella, que se calcula con `npm run hash -- "Nombre Apellido"`.

Máximo 12 jugadores por sala.

## Stack

- **Cloudflare Workers + Durable Objects:** cada sala es un Durable Object con su estado y los WebSockets del host y de los celulares. Usa la API de hibernación, así que no consume mientras nadie juega. El servidor arma una vista distinta para cada jugador, así ningún celular recibe lo que no debe ver (tableros ajenos, su propia palabra, el famoso).
- **Workers AI** (`@cf/myshell-ai/melotts`) para la voz de los famosos. Cada nombre se genera una vez y queda guardado en la sala.
- **React + Vite** para el front, **Leaflet** con OpenStreetMap para el mapa y **MapillaryJS** para la vista de calle.

```
src/
  shared/   reglas y tipos compartidos (ajedrez, puntajes, palabras, famosos, lugares)
  worker/   Worker + Durable Object Room + lógica de cada juego
  client/   pantallas del host y del celular
tests/      tests de reglas (vitest)
```

## Desarrollo local

```bash
npm install
npm run build          # compila el front a dist/
npm run dev:worker     # Worker en http://localhost:8787
npm run dev            # (opcional) Vite con recarga en caliente, le pasa /api al Worker
npm test
```

En local, la voz de **Nombres al revés** necesita estar logueado en Cloudflare (`npx wrangler login`), porque Workers AI corre en remoto.

## Deploy a Cloudflare

**Desde el panel de Cloudflare (Workers → Create → Import a repository):**

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Después del primer deploy: *Settings → Variables and Secrets → Add* → tipo **Secret**, nombre `MAPILLARY_TOKEN`, valor el Client Token de Mapillary (`MLY|…`, se saca en https://www.mapillary.com/dashboard/developers).

**O desde la terminal:**

```bash
npx wrangler login
npm run deploy
npx wrangler secret put MAPILLARY_TOKEN   # pegás el token
```

Wrangler crea el Worker, el Durable Object y el binding de Workers AI. Queda andando en `https://multihgames.<tu-subdominio>.workers.dev`.

Para desarrollo local, copiá `.dev.vars.example` a `.dev.vars` y poné el token ahí.

## Uso

1. Entrá a la web y tocá **Armar un evento**: nombre, PIN de admin, juegos (se pueden reordenar y elegir cantidad de rondas), y si querés tus propios famosos o palabras.
2. La pantalla grande queda en `/host/CÓDIGO` y pide el PIN si la abrís en otra compu.
3. Cada uno entra desde el celu en `/j/CÓDIGO` (o escaneando el QR) y arma su personaje.
4. El admin va avanzando cada juego desde la pantalla grande y, al final, toca **Coronar al campeón**.
