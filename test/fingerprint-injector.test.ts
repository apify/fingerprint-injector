import FingerprintGenerator from 'fingerprint-generator';
import playwright from 'playwright';
import FingerprintInjector from '../src';

describe('FingerprintInjector', () => {
    let fpInjector: FingerprintInjector;
    let fingerprintGenerator: any;
    let fingerprint: any;

    beforeEach(() => {
        fingerprintGenerator = new FingerprintGenerator({
            devices: ['desktop'],
            operatingSystems: ['linux'],
            browsers: [{ name: 'firefox', minVersion: 86 }],
        });

        fingerprint = fingerprintGenerator.getFingerprint().fingerprint;

        fpInjector = new FingerprintInjector();
    });

    test('should build utils', async () => {
        expect(fpInjector.utilsJs).toBeTruthy();
    });

    describe('Fingerprint overrides', () => {
        let browser: import("playwright").Browser;
        let page: import("playwright").Page;

        beforeEach(async () => {
            browser = await playwright.firefox.launch({ headless: false });

            const context = await browser.newContext();
            await fpInjector.attachFingerprintToPlaywright(context, fingerprint);

            page = await context.newPage();
            await page.goto('https://google.com');
        });

        afterEach(async () => {
            if (browser) {
                await browser.close();
            }
        });

        test('should override navigator', async () => {

            const { navigator: navigatorFp } = fingerprint

            const navigatorPrimitiveProperties = Object.keys(navigatorFp).filter((key) => {
                const type = typeof navigatorFp[key]
                return type === "string" || type === "number"
            })

            for (const navigatorProperty of navigatorPrimitiveProperties) {
                const browserValue = await page.evaluate((propName) => {
                    // @ts-expect-error
                    return navigator[propName]
                }, navigatorProperty)

                expect(browserValue).toBe(navigatorFp[navigatorProperty])
            }

            expect.assertions(navigatorPrimitiveProperties.length);

        });

        test('should override screen', async () => {

            const { screen: screenFp } = fingerprint

            const screenProperties = Object.keys(screenFp)

            for (const navigatorProperty of screenProperties) {
                const browserValue = await page.evaluate((propName) => {
                    // @ts-expect-error
                    return screen[propName]
                }, navigatorProperty)

                expect(browserValue).toBe(screenFp[navigatorProperty])
            }

            expect.assertions(screenProperties.length);

        });

        test('should override webGl', async () => {

            const { webGl: {vendor, renderer} } = fingerprint
            const [browserVendor , browserRenderer] = await page.evaluate(()=>{
                //@ts-expect-error
                const canvas = document.createElement('canvas');
                const webGl = canvas.getContext('webgl')
                const debugInfo = webGl.getExtension('WEBGL_debug_renderer_info');
                const vendor = webGl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
                const renderer = webGl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);

                return [vendor, renderer]
            })

            expect(browserVendor).toBe(vendor)
            expect(browserRenderer).toBe(renderer)

        });

        test('should override codecs', async () => {

            const { videoCodecs, audioCodecs } = fingerprint;

            for (const [codec, canPlay] of Object.entries(videoCodecs)) {
                const canPlayBrowser = await page.evaluate((videoCodec) => {
                    // @ts-expect-error
                    const videoEl = document.createElement('video');
                    return videoEl.canPlayType(`video/${videoCodec}`);
                }, codec);
                expect(canPlay).toEqual(canPlayBrowser);
            }

            for (const [codec, canPlay] of Object.entries(audioCodecs)) {
                const canPlayBrowser = await page.evaluate((audioCodec) => {
                    // @ts-expect-error
                    const audioEl = document.createElement('audio');
                    return audioEl.canPlayType(`audio/${audioCodec}`);
                }, codec);
                expect(canPlay).toEqual(canPlayBrowser);
            }
        });
    });
});
