import { chmod, readFile, rename, writeFile } from 'fs/promises';
import { join } from 'path';

/*
 * Ubuntu 24.04 and later restrict unprivileged user namespaces with AppArmor
 * (kernel.apparmor_restrict_unprivileged_userns = 1). Chromium then falls back to its
 * setuid sandbox helper, which inside an AppImage can't be owned by root, so the app
 * aborts on launch: "The SUID sandbox helper binary was found, but is not configured
 * correctly". The .deb is fine: its postinst makes chrome-sandbox setuid root.
 *
 * electron-builder's AppRun runs the executable directly, without the desktop file's
 * arguments, so linux.executableArgs doesn't help. Instead the executable becomes a small
 * shell script that runs the real binary, adding --no-sandbox only when chrome-sandbox isn't
 * setuid root: an AppImage, mounted or extracted, or an unpacked archive. The .deb keeps
 * Chromium's sandbox. app.relaunch() keeps process.argv, so the flag survives restarts.
 */
export const WRAPPER_MARKER = '# nativephp: appimage-sandbox-wrapper';

export function wrapperScript(binaryName) {
    return `#!/bin/sh
${WRAPPER_MARKER}
HERE="$(dirname "$(readlink -f "$0")")"
SANDBOX="$HERE/chrome-sandbox"
if [ ! -u "$SANDBOX" ] || [ "$(stat -c %u "$SANDBOX" 2>/dev/null)" != "0" ]; then
    exec "$HERE/${binaryName}" --no-sandbox "$@"
fi
exec "$HERE/${binaryName}" "$@"
`;
}

export default async function wrapAppImageExecutable(context) {
    if (context.electronPlatformName !== 'linux') return;

    const executable = join(context.appOutDir, context.packager.executableName);
    const binaryName = `${context.packager.executableName}.bin`;

    // afterPack runs once per arch, on a fresh appOutDir; never wrap the wrapper.
    const head = await readFile(executable).then((buffer) => buffer.subarray(0, 128).toString('latin1'));
    if (head.includes(WRAPPER_MARKER)) return;

    await rename(executable, join(context.appOutDir, binaryName));
    await writeFile(executable, wrapperScript(binaryName));
    await chmod(executable, 0o755);

    console.log(`  • wrapped ${context.packager.executableName} so the AppImage starts with --no-sandbox`);
}
