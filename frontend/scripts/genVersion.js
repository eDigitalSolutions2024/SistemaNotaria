// frontend/scripts/genVersion.js
// Se ejecuta solo antes de `npm run build` (script "prebuild"). Genera un
// identificador único de esta compilación y lo deja en dos lugares:
//  - frontend/.env.production.local  -> REACT_APP_BUILD_ID, que queda
//    incrustado en el JS compilado (la versión que trae cada navegador).
//  - frontend/public/version.json    -> se copia a build/ y es lo que cada
//    navegador consulta para saber cuál es la versión vigente en el servidor.
// Si ambos difieren, hay una versión nueva y el sistema avisa/recarga.
const fs = require('fs');
const path = require('path');

const id = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14); // AAAAMMDDHHmmss
const root = path.join(__dirname, '..');

fs.writeFileSync(path.join(root, '.env.production.local'), `REACT_APP_BUILD_ID=${id}\n`);
fs.writeFileSync(path.join(root, 'public', 'version.json'), JSON.stringify({ version: id }) + '\n');

console.log(`[version] build ${id}`);
