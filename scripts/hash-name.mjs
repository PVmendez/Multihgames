// Uso: npm run hash -- "Nombre Apellido"   → imprime la huella para src/shared/specials.ts
// (misma normalización y hash que src/shared/specials.ts; lo verifica un test)
export const normalize = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim();

export function nameHash(name) {
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

if (process.argv[2]) console.log(nameHash(process.argv.slice(2).join(' ')));
