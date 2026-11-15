const { spawnSync } = require('node:child_process');
const fs = require('node:fs');

const compiler = process.env.INNO_SETUP_COMPILER || 'C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe';
if (!fs.existsSync(compiler)) {
  console.error('未找到 Inno Setup 编译器。请安装 Inno Setup 6，或设置 INNO_SETUP_COMPILER 指向 ISCC.exe。');
  process.exit(1);
}
const result = spawnSync(compiler, ['installer.iss'], { stdio: 'inherit', windowsHide: true });
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
