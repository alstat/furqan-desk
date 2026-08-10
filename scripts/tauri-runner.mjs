import { spawnSync } from 'child_process';

const args = process.argv.slice(2); // e.g. ['dev', '--tablet', 'ipad']
const tabletIdx = args.indexOf('--tablet');

let cmd;
if (tabletIdx !== -1) {
  const platform = args[tabletIdx + 1];
  const restArgs = args.filter((_, i) => i !== tabletIdx && i !== tabletIdx + 1);
  if (platform === 'ipad') {
    cmd = ['tauri', 'ios', ...restArgs];
  } else if (platform === 'android') {
    cmd = ['tauri', 'android', ...restArgs];
  } else {
    console.error(`Unknown tablet platform: "${platform}". Use "ipad" or "android".`);
    process.exit(1);
  }
} else if (args[0] === 'desktop') {
  // One command that produces the right desktop bundle on whichever OS you're on,
  // so `pnpm build:desktop` is the same on macOS and Windows.
  const restArgs = args.slice(1);
  if (process.platform === 'darwin') {
    cmd = ['tauri', 'build', '--target', 'universal-apple-darwin', '--bundles', 'app', ...restArgs];
  } else if (process.platform === 'win32') {
    cmd = ['tauri-windows-bundle', 'build', '--runner', 'pnpm', ...restArgs];
  } else {
    console.error(`No desktop build configured for platform "${process.platform}".`);
    process.exit(1);
  }
} else {
  cmd = ['tauri', ...args];
}

const result = spawnSync(cmd[0], cmd.slice(1), { stdio: 'inherit', shell: true });
process.exit(result.status ?? 1);
