import { spawnSync } from 'child_process';
import { readFileSync, rmSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

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

if (process.platform === 'linux' && args[0] === 'dev') {
  // WebKitGTK's NetworkProcess crashes when it revalidates a disk-cached dev
  // module while Vite is holding responses open (which Vite does whenever it
  // re-optimizes deps mid-page-load). Every in-flight load then fails at once:
  //
  //   ERROR: WebKit encountered an internal error. This is a WebKit bug.
  //   Source/WebKit/WebProcess/Network/WebLoaderStrategy.cpp(641) :
  //     void WebKit::WebLoaderStrategy::internallyFailedLoadTimerFired()
  //
  // leaving a half-loaded window that never recovers. vite.config.js keeps new
  // dev responses out of that cache, but entries written before then are still
  // enough to trigger it -- no request header can un-store them -- so drop the
  // cache on the way in. It only holds dev-server responses and WebKit rebuilds
  // it on demand.
  try {
    const { identifier } = JSON.parse(
      readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'),
    );
    if (identifier) {
      const dataHome =
        process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share');
      rmSync(join(dataHome, identifier, 'WebKitCache'), {
        recursive: true,
        force: true,
      });
    }
  } catch (e) {
    console.warn(`Could not clear the WebKit dev cache: ${e.message}`);
  }
}

// NOTE: this deliberately does not set WEBKIT_DISABLE_DMABUF_RENDERER. Forcing
// it put WebKit on a software-composited path that cannot render a transparent
// window, which black-boxed the corners of the frame the Linux build draws for
// itself (see src-tauri/src/lib.rs). Machines that need it set it themselves;
// the child inherits the environment either way.
const result = spawnSync(cmd[0], cmd.slice(1), { stdio: 'inherit', shell: true });
process.exit(result.status ?? 1);
