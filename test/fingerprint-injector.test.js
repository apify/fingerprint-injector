const fs = require('fs');
const FingerprintGenerator = require('fingerprint-generator');
const playwright = require('playwright');
const Apify = require('apify');

const { FingerprintInjector } = require('../src/main');

jest.setTimeout(400000);

describe('FingerprintInjector', () => {
    let fpInjector;
    beforeEach(() => {
        const fingerprintGenerator = new FingerprintGenerator({
            devices: ['desktop'],
            operatingSystems: ['linux'],
            browsers: [{ name: 'firefox', minVersion: 86 }],
        });

        const { fingerprint } = fingerprintGenerator.getFingerprint();

        console.log(fingerprint);

        fpInjector = new FingerprintInjector({ fingerprint });
    });

    test('should initialize', async () => {
        await fpInjector.initialize();
        expect(fs.existsSync(fpInjector.buildUtilsPath)).toBe(true);
    });

    describe('fingerprint overrides', () => {
        let browser;
        let page;

        beforeEach(async () => {
            jest.setTimeout(60000);
            await fpInjector.initialize();
            browser = await playwright.firefox.launch({ headless: false });

            const context = await browser.newContext();
            await fpInjector.attachFingerprintToPlaywright(context);

            page = await context.newPage();
            await page.goto('https://google.com');
        });

        afterEach(async () => {
            if (browser) {
                await browser.close();
            }
        });

        test('should override codecs', async () => {
            jest.setTimeout(60000);

            const { fingerprint } = fpInjector;
            const { videoCodecs, audioCodecs } = fingerprint;

            for (const [codec, canPlay] of Object.entries(videoCodecs)) {
                const canPlayBrowser = await page.evaluate((videoCodec) => {
                    const videoEl = document.createElement('video');
                    return videoEl.canPlayType(`video/${videoCodec}`);
                }, codec);
                expect(canPlay).toEqual(canPlayBrowser);
            }

            for (const [codec, canPlay] of Object.entries(audioCodecs)) {
                const canPlayBrowser = await page.evaluate((audioCodec) => {
                    const audioEl = document.createElement('audio');
                    return audioEl.canPlayType(`audio/${audioCodec}`);
                }, codec);
                expect(canPlay).toEqual(canPlayBrowser);
            }

            console.log(videoCodecs);
        });
    });
});
