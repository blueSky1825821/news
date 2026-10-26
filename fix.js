const fs = require('fs');
const s = fs.readFileSync('f:\\\\program\\\\ai\\\\news\\\\backend\\\\tests\\\\cleanup.test.js', 'utf8');
const start = s.indexOf(describe('Cleanup Scheduler');
const end = s.lastIndexOf('});');
const scheduler = s.substring(start, end + 3);
const model = s.substring(0, start).trimEnd() + '\n});\n\n' + scheduler + '\n';
fs.writeFileSync('f:\\\\program\\\\ai\\\\news\\\\backend\\\\tests\\\\cleanup.test.js', model);
