// Personajes especiales: si un jugador se anota con cierto nombre, su avatar pasa a ser
// una caricatura propia (cara para los avatares chicos, cuerpo entero para los juegos).
//
// El repo es público, así que los nombres no se guardan en texto: solo su huella (hash)
// del nombre normalizado (minúsculas, sin tildes). Para agregar uno:
//   1. Poné las imágenes en public/personajes/ (cuerpo .webp con fondo transparente + cara cuadrada)
//   2. Calculá la huella con  npm run hash -- "Nombre Apellido"  y agregá la entrada abajo.

import { normalize } from './text';

export interface SpecialCharacter {
  id: string;
  hash: string;
  face: string; // imagen cuadrada de la cara, fondo transparente
  body: string; // cuerpo entero, fondo transparente
}

/** Hash de 53 bits (cyrb53) del nombre normalizado, en hexadecimal. */
export function nameHash(name: string): string {
  const str = normalize(name);
  let h1 = 0xdeadbeef ^ 0x6d6a;
  let h2 = 0x41c6ce57 ^ 0x6d6a;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

export const SPECIALS: SpecialCharacter[] = [
  { id: 'manuel', hash: '108b462ff03c91', face: '/personajes/manuel-cara.webp', body: '/personajes/manuel.webp' },
  { id: 'facundo', hash: '1fd6f6b3d2017e', face: '/personajes/facundo-cara.webp', body: '/personajes/facundo.webp' }
];

export function specialForName(name: string): string | undefined {
  const h = nameHash(name);
  return SPECIALS.find((s) => s.hash === h)?.id;
}

export function specialById(id: string | undefined): SpecialCharacter | undefined {
  return id ? SPECIALS.find((s) => s.id === id) : undefined;
}
