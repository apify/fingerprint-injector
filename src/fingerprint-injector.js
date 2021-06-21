const { nanoid } = require('nanoid');
const webpack = require('webpack');
const path = require('path');
const log = require('@apify/log');
const fsPromise = require('fs').promises;

const UTILS_FILE_NAME = 'utils.js';

class FingerprintInjector {
    constructor(options = {}) {
        const {
            fingerprint,
        } = options;

        this.fingerprint = this._transformFp(fingerprint);
        log.info(`Injectiong`, { fingerprint: this.fingerprint });

        this.prefix = nanoid();
        this.log = log.child({ prefix: 'FingerprintInjector' });
        this.buildUtils = '';
    }

    /**
    * Builds utils to be injected with a randomized prefix to the browser
    */
    async initialize() {
        this.buildUtilsPath = await this._buildUtils();
    }

    /**
     * Adds init script to the browser context so the fingerprint is changed before every document creation.
     * @param {BrowserContext} browserContext - playwright browser context
     */
    async attachFingerprintToPlaywright(browserContext) {
        await browserContext.addInitScript({
            path: this.buildUtilsPath,
        });

        await browserContext.addInitScript(this._getInjectFingerprintFunction(), { fp: this.fingerprint, prefix: this.prefix });
    }

    /**
     * @deprecated
     * @param {BrowserController} browserController
     */
    async _overrideNewPageToUseFingerprint(browserController) {
        const { fingerprint } = browserController.userData;
        const { screen, language, userAgent } = fingerprint;

        const oldLaunch = browserController.browser.newPage;
        browserController.browser.newPage = async () => {
            return oldLaunch.bind(browserController.browser)({
                locale: language,
                userAgent,
                viewport: {
                    width: screen.width,
                    height: screen.height,
                },
            });
        };
    }

    /**
     * Adds scripts that is evaluated before every document creation.
     * @param {Page} page - puppeteer page
     */
    async attachFingerprintToPuppeteer(page) {
        const script = await fsPromise.readFile(this.buildUtilsPath, 'utf-8');

        await page.evaluateOnNewDocument(script);

        await page.evaluateOnNewDocument(this._getInjectFingerprintFunction(), this.fingerprint, this.prefix);
    }

    _getInjectFingerprintFunction() {
        return (arg1, arg2) => {
            let fp = arg1;
            let prefix = arg2;
            // compatibility with playwright and puppeteer.
            if (!arg2) {
                fp = arg1.fp;
                prefix = arg1.prefix;
            }

            const { batteryInfo, navigator: newNav, screen: newScreen, webGl, historyLength, audioCodecs, videoCodecs } = fp;
            const utils = window[prefix];

            const { overrideInstancePrototype, overrideWebGl, overrideCodecs, overrideBattery } = utils;
            // override navigator
            console.log(newScreen, 'override1');

            overrideInstancePrototype(window.navigator, newNav);

            // override screen
            console.log(newScreen, 'override2');
            overrideInstancePrototype(window.screen, newScreen);
            overrideInstancePrototype(window.history, { length: historyLength });

            // override webGl
            overrideWebGl(webGl);

            // override codecs
            overrideCodecs(audioCodecs, videoCodecs);

            // override batteryInfo
            overrideBattery(navigator, 'getBattery', async () => batteryInfo);
        };
    }

    _transformFp(fp) {
        const {
            availableScreenResolution,
            colorDepth,
            screenResolution,
            userAgent,
            cookiesEnabled,
            languages,
            platform,
            mimeTypes,
            plugins,
            deviceMemory,
            hardwareConcurrency,
            productSub,
            vendor,
            touchSupport,
            videoCard,
            audioCodecs,
            videoCodecs,
            battery,
        } = fp;

        const screen = {
            availHeight: availableScreenResolution[0],
            availWidth: availableScreenResolution[1],
            pixelDepth: colorDepth,
            height: screenResolution[0],
            width: screenResolution[1],
        };

        const navigator = {
            cookieEnabled: this._stringToBoolean(cookiesEnabled),
            doNotTrack: '1',
            language: languages[0],
            languages,
            platform,
            deviceMemory: deviceMemory && parseInt(deviceMemory, 10),
            hardwareConcurrency: parseInt(hardwareConcurrency, 10),
            productSub,
            vendor,
            maxTouchPoints: parseInt(touchSupport.maxTouchPoints, 10),
        };

        const pluginsData = {
            mimeTypes,
            plugins,
        };
        const webGl = {
            vendor: videoCard[0],
            renderer: videoCard[1],
        };
        let batteryData;

        if (this._stringToBoolean(battery)) {
            batteryData = { level: 0.25, chargingTime: 322, dischargingTime: Infinity }; // TODO: randomize
        }

        return {
            screen,
            navigator,
            webGl,
            audioCodecs,
            videoCodecs,
            pluginsData,
            batteryData,
            userAgent,
        };
    }

    _stringToBoolean(string) {
        return string === 'True';
    }

    async _buildUtils() {
        return new Promise((resolve, reject) => {
            webpack({
                mode: 'production',
                entry: path.join(__dirname, UTILS_FILE_NAME),
                output: {
                    filename: UTILS_FILE_NAME,
                    path: path.resolve(__dirname, 'dist'),
                    library: {
                        type: 'window',
                        name: this.prefix,
                    },
                },

            }, (err, stats) => { // [Stats Object](#stats-object)
                if (err || stats.hasErrors()) {
                    return reject(new Error(`Webpack compilation failed. Reason: ${err.message}`));
                }

                resolve(path.resolve(__dirname, 'dist', UTILS_FILE_NAME));
            });
        });
    }
}

module.exports = FingerprintInjector;
