// Contenido incluido por defecto. El admin puede sumar el suyo al crear el evento.

/** Famosos para "Nombres al revés". */
export const FAMOUS: string[] = [
  'Luis Suárez', 'Lionel Messi', 'Shakira', 'Natalia Oreiro', 'Jorge Drexler', 'Diego Forlán',
  'Edinson Cavani', 'Federico Valverde', 'Rubén Rada', 'China Zorrilla', 'Bad Bunny', 'Taylor Swift',
  'Ricardo Arjona', 'Mirtha Legrand', 'Marcelo Tinelli', 'Freddie Mercury', 'Michael Jackson',
  'Cristiano Ronaldo', 'Lady Gaga', 'Brad Pitt', 'Diego Maradona', 'Juanes', 'Ricky Martin',
  'Gustavo Cerati', 'Charly García', 'Pepe Mujica', 'Darwin Núñez', 'Luciano Pereyra', 'Karol G',
  'Leonardo DiCaprio', 'Elon Musk', 'Bizarrap'
];

/**
 * Palabras para "No digas tu palabra", por dificultad (lo difícil es hacer que la DIGAN).
 * Nivel 1 = salen solas en una charla (vale 1), nivel 3 = hay que ingeniárselas (vale 3).
 */
export const WORDS: Record<1 | 2 | 3, string[]> = {
  1: [
    'dale', 'obvio', 'mate', 'plata', 'bondi', 'laburo', 'finde', 'celular', 'asado', 'cerveza',
    'verano', 'playa', 'fútbol', 'hambre', 'sueño', 'tarde', 'temprano', 'perro', 'auto', 'casa',
    'nada', 'genial', 'cansado', 'frío', 'calor', 'pizza'
  ],
  2: [
    'rambla', 'feria', 'chivito', 'murga', 'tormenta', 'cumpleaños', 'aeropuerto', 'dentista',
    'heladera', 'garrafa', 'vecino', 'peluquería', 'pileta', 'paraguas', 'mudanza', 'abuela',
    'semáforo', 'champión', 'contraseña', 'alfajor', 'tatuaje', 'ascensor', 'farmacia', 'cebolla'
  ],
  3: [
    'murciélago', 'jirafa', 'submarino', 'pingüino', 'volcán', 'astronauta', 'castillo', 'pirata',
    'cocodrilo', 'telescopio', 'acordeón', 'canguro', 'dinosaurio', 'trompeta', 'tiburón',
    'ornitorrinco', 'esquimal', 'brújula', 'faraón', 'escafandra', 'tobogán', 'zanahoria'
  ]
};

export interface Place {
  name: string;
  lat: number;
  lng: number;
}

/**
 * Lugares de Montevideo para el GeoGuesser. Las coordenadas son aproximadas: el juego busca
 * la imagen de Mapillary más cercana y usa la ubicación exacta de esa imagen para puntuar.
 */
export const PLACES: Place[] = [
  { name: 'Plaza Independencia', lat: -34.9069, lng: -56.2001 },
  { name: 'Teatro Solís', lat: -34.9077, lng: -56.2012 },
  { name: 'Mercado del Puerto', lat: -34.9063, lng: -56.2127 },
  { name: 'Plaza Matriz', lat: -34.9068, lng: -56.2048 },
  { name: 'Peatonal Sarandí', lat: -34.9067, lng: -56.2080 },
  { name: 'Palacio Legislativo', lat: -34.8912, lng: -56.1873 },
  { name: 'Intendencia de Montevideo', lat: -34.9056, lng: -56.1857 },
  { name: 'Estadio Centenario', lat: -34.8945, lng: -56.1528 },
  { name: 'Monumento a La Carreta', lat: -34.8996, lng: -56.1531 },
  { name: 'Terminal Tres Cruces', lat: -34.8944, lng: -56.1666 },
  { name: 'Parque Rodó', lat: -34.9122, lng: -56.1686 },
  { name: 'Playa Ramírez', lat: -34.9174, lng: -56.1700 },
  { name: 'Faro de Punta Carretas', lat: -34.9232, lng: -56.1597 },
  { name: 'Punta Carretas Shopping', lat: -34.9228, lng: -56.1588 },
  { name: 'Rambla de Pocitos', lat: -34.9136, lng: -56.1495 },
  { name: 'Castillo Pittamiglio', lat: -34.9146, lng: -56.1393 },
  { name: 'Puertito del Buceo', lat: -34.9077, lng: -56.1302 },
  { name: 'Montevideo Shopping', lat: -34.9033, lng: -56.1365 },
  { name: 'Playa Malvín', lat: -34.8959, lng: -56.1040 },
  { name: 'Plaza Virgilio', lat: -34.8912, lng: -56.0930 },
  { name: 'Hotel Casino Carrasco', lat: -34.8834, lng: -56.0527 },
  { name: 'Rosedal del Prado', lat: -34.8578, lng: -56.2067 },
  { name: 'Jardín Japonés', lat: -34.8616, lng: -56.2097 },
  { name: 'Fortaleza del Cerro', lat: -34.8888, lng: -56.2603 },
  { name: 'Torre de las Telecomunicaciones', lat: -34.8995, lng: -56.1911 },
  { name: 'Plaza Cagancha', lat: -34.9055, lng: -56.1920 },
  { name: 'Palacio Salvo', lat: -34.9066, lng: -56.1993 },
  { name: 'Parque Batlle', lat: -34.8975, lng: -56.1560 }
];

/** Límites del mapa de Montevideo (sur-oeste, nor-este). */
export const MVD_BOUNDS: [[number, number], [number, number]] = [[-34.94, -56.30], [-34.78, -56.02]];
