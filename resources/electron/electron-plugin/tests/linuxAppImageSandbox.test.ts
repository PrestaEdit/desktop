import { mkdtemp, readFile, rm, stat, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import wrapAppImageExecutable, { WRAPPER_MARKER, wrapperScript } from '../../build/linux-appimage-sandbox.js';

describe('AppImage sandbox wrapper', () => {
    let appOutDir: string;

    beforeEach(async () => {
        appOutDir = await mkdtemp(join(tmpdir(), 'nativephp-appimage-'));
        await writeFile(join(appOutDir, 'my-app'), 'ELF binary');
    });

    afterEach(async () => {
        await rm(appOutDir, { recursive: true, force: true });
    });

    const context = (platform: string) => ({
        electronPlatformName: platform,
        appOutDir,
        packager: { executableName: 'my-app' },
    });

    it('wraps the Linux executable so an AppImage starts with --no-sandbox', async () => {
        await wrapAppImageExecutable(context('linux'));

        expect(await readFile(join(appOutDir, 'my-app.bin'), 'utf8')).toBe('ELF binary');
        expect(await readFile(join(appOutDir, 'my-app'), 'utf8')).toBe(wrapperScript('my-app.bin'));
        expect((await stat(join(appOutDir, 'my-app'))).mode & 0o777).toBe(0o755);
    });

    it('adds --no-sandbox only when chrome-sandbox is not setuid root', () => {
        const script = wrapperScript('my-app.bin');

        expect(script).toContain('if [ ! -u "$SANDBOX" ] || [ "$(stat -c %u "$SANDBOX" 2>/dev/null)" != "0" ]; then\n    exec "$HERE/my-app.bin" --no-sandbox "$@"');
        expect(script.trimEnd().split('\n').pop()).toBe('exec "$HERE/my-app.bin" "$@"');
    });

    it('does not wrap the wrapper twice', async () => {
        await wrapAppImageExecutable(context('linux'));
        await wrapAppImageExecutable(context('linux'));

        expect(await readFile(join(appOutDir, 'my-app.bin'), 'utf8')).toBe('ELF binary');
        expect(await readFile(join(appOutDir, 'my-app'), 'utf8')).toContain(WRAPPER_MARKER);
    });

    it('leaves macOS and Windows builds alone', async () => {
        await wrapAppImageExecutable(context('darwin'));
        await wrapAppImageExecutable(context('win32'));

        expect(await readFile(join(appOutDir, 'my-app'), 'utf8')).toBe('ELF binary');
    });
});
