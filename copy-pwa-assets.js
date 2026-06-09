const fs = require('fs');
fs.copyFileSync('assets/latte-art.png', 'dist/apple-touch-icon.png');
fs.writeFileSync('dist/robots.txt', 'User-agent: *\nDisallow: /\n');
