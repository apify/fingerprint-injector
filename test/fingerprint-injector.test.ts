import playwright from 'playwright';
import puppeteer from 'puppeteer';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore bypass unnecessary module declaration for tests
import { BrowserFingerprintWithHeaders, Fingerprint, FingerprintGenerator } from 'fingerprint-generator';

// USe fingerprint injector from dist to test if the published version works.
// Historically injection was not working from build files, but all tests passed.
import { FingerprintInjector } from '../dist';

const cases = [
    ['Playwright',
        [
            {
                name: 'Firefox',
                launcher: playwright.firefox,
                options: {

                },
                fingerprintGeneratorOptions: {
                    browsers: [{ name: 'firefox', minVersion: 96 }],
                },
            },
            {
                name: 'Chrome',
                launcher: playwright.chromium,
                options: {
                    channel: 'chrome',
                },
                fingerprintGeneratorOptions: {
                    browsers: [{ name: 'chrome', minVersion: 90 }],
                },
            },
        ],
    ],
    [
        'Puppeteer',
        [
            {
                name: 'Chrome',
                launcher: puppeteer,
                options: {
                    channel: 'chrome',
                },
                fingerprintGeneratorOptions: {
                    browsers: [{ name: 'chrome', minVersion: 90 }],
                },
            },
            {
                name: 'Chromium',
                launcher: puppeteer,
                options: {},
                fingerprintGeneratorOptions: {
                    browsers: [{ name: 'chrome', minVersion: 90 }],
                },
            },
        ],
    ],
];

describe('FingerprintInjector', () => {
    let fpInjector: FingerprintInjector;

    beforeEach(() => {
        fpInjector = new FingerprintInjector();
    });

    test('should build utils', async () => {
        expect(fpInjector.utilsJs).toBeTruthy();
    });
    // @ts-expect-error test only
    describe.each(cases)('%s', (frameworkName, testCases) => {
        // @ts-expect-error test only
        describe.each(testCases)('$name', ({ name, launcher, options, fingerprintGeneratorOptions }) => {
            let browser: any;
            let page: any;
            let response: any;
            let fingerprintGenerator: FingerprintGenerator;
            let fingerprintWithHeaders: BrowserFingerprintWithHeaders;
            let fingerprint: Fingerprint;

            beforeEach(async () => {
                fingerprintGenerator = new FingerprintGenerator({
                    devices: ['desktop'],
                    operatingSystems: ['linux'],
                    browsers: [{ name: 'firefox', minVersion: 86 }],
                    locales: ['cs-CZ'],
                    ...fingerprintGeneratorOptions,
                });

                fingerprintWithHeaders = fingerprintGenerator.getFingerprint();
                fingerprint = fingerprintWithHeaders.fingerprint;

                if (frameworkName === 'Playwright') {
                    browser = await launcher.launch({ headless: false, ...options }) as import('playwright').Browser;

                    const context = await browser.newContext();
                    await fpInjector.attachFingerprintToPlaywright(context, fingerprintWithHeaders);

                    page = await context.newPage();
                    response = await page.goto(`file://${__dirname}/test.html`, { waitUntil: 'commit' });
                } else if (frameworkName === 'Puppeteer') {
                    browser = await launcher.launch({ headless: false, ...options });

                    page = await browser.newPage() as import('puppeteer').Page;
                    await fpInjector.attachFingerprintToPuppeteer(page, fingerprintWithHeaders);

                    response = await page.goto(`file://${__dirname}/test.html`);
                }
            });

            afterEach(async () => {
                if (browser) {
                    await browser.close();
                }
            });

            test('should override navigator', async () => {
                const { navigator: navigatorFp } = fingerprint as any;

                const navigatorPrimitiveProperties = Object.keys(navigatorFp).filter((key) => {
                    const type = typeof navigatorFp[key];
                    return type === 'string' || type === 'number';
                });

                for (const navigatorProperty of navigatorPrimitiveProperties) {
                    const browserValue = await page.evaluate((propName: string) => {
                        // @ts-expect-error internal browser code
                        return navigator[propName];
                    }, navigatorProperty);
                    expect(browserValue).toBe(navigatorFp[navigatorProperty]);
                }

                if (name === 'Chrome') {
                    const userAgentData = await page.evaluate(() => {
                        // @ts-expect-error internal browser code

                        return navigator.userAgentData;
                    });
                    const { userAgentData: userAgentDataFp } = navigatorFp;
                    expect(userAgentData.brands).toBeDefined();
                    expect(userAgentData.mobile).toBe(userAgentDataFp.mobile);
                    expect(userAgentData.platform).toBe(userAgentDataFp.platform);
                    expect(userAgentData.architecture).toBe(userAgentDataFp.architecture);
                }
            });

            test('should override window.screen', async () => {
                const { screen: screenFp } = fingerprint as any;
                const {
                    availHeight,
                    availWidth,
                    pixelDepth,
                    height,
                    width,
                    availTop,
                    availLeft,
                    colorDepth,
                } = screenFp;
                const screenObj = {
                    availHeight,
                    availWidth,
                    pixelDepth,
                    height,
                    width,
                    availTop,
                    availLeft,
                    colorDepth,
                };

                const screenProperties = Object.keys(screenObj);

                for (const screenProperty of screenProperties) {
                    const browserValue = await page.evaluate((propName: string) => {
                        // @ts-expect-error internal browser code
                        return window.screen[propName];
                    }, screenProperty);

                    expect(browserValue).toBe(screenFp[screenProperty]);
                }
            });

            test('should override screen props on window', async () => {
                const { screen } = fingerprint as any;
                const {
                    outerHeight,
                    outerWidth,
                    devicePixelRatio,
                } = screen;
                const screenObj = {
                    outerHeight,
                    outerWidth,
                    devicePixelRatio,
                };

                const screenProperties = Object.keys(screenObj);

                for (const screenProperty of screenProperties) {
                    const propValue = screen[screenProperty];
                    // The 0 values are introduced by collecting in the hidden iframe.
                    // They are document sizes anyway so no need to test them or inject them.
                    if (propValue > 0) {
                        const browserValue = await page.evaluate((propName: string) => {
                            // @ts-expect-error internal browser code
                            return window[propName];
                        }, screenProperty);

                        expect(browserValue).toBe(screen[screenProperty]);
                    }
                }

                expect.assertions(screenProperties.length);
            });

            test('should override webGl', async () => {
                const { videoCard: { vendor, renderer } } = fingerprint;
                const [browserVendor, browserRenderer] = await page.evaluate(() => {
                    // @ts-expect-error internal browser code
                    const canvas = document.createElement('canvas');
                    const webGl = canvas.getContext('webgl');
                    const debugInfo = webGl.getExtension('WEBGL_debug_renderer_info');
                    const loadedVendor = webGl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
                    const loadedRenderer = webGl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);

                    return [loadedVendor, loadedRenderer];
                });

                expect(browserVendor).toBe(vendor);
                expect(browserRenderer).toBe(renderer);
            });

            test('should override codecs', async () => {
                const { videoCodecs, audioCodecs } = fingerprint;

                for (const [codec, canPlay] of Object.entries(videoCodecs)) {
                    const canPlayBrowser = await page.evaluate((videoCodec: string) => {
                        // @ts-expect-error internal browser code
                        const videoEl = document.createElement('video');
                        return videoEl.canPlayType(`video/${videoCodec}`);
                    }, codec);
                    expect(canPlay).toEqual(canPlayBrowser);
                }

                for (const [codec, canPlay] of Object.entries(audioCodecs)) {
                    const canPlayBrowser = await page.evaluate((audioCodec: string) => {
                        // @ts-expect-error internal browser code
                        const audioEl = document.createElement('audio');
                        return audioEl.canPlayType(`audio/${audioCodec}`);
                    }, codec);
                    expect(canPlay).toEqual(canPlayBrowser);
                }
            });

            test('should override locales', async () => {
                response = await page.goto('https://google.com');
                const requestHeaders = response.request().headers();

                expect(requestHeaders['accept-language']?.includes('cs')).toBe(true);
            });
        });
    });
});
