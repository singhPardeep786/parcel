const fs = require('fs');
const path = require('path');
const { encodePNG, paintAppIcon } = require('../electron/png');

const out = path.join(__dirname, '..', 'assets', 'icon.png');
fs.writeFileSync(out, encodePNG(512, paintAppIcon));
console.log('wrote', out);
