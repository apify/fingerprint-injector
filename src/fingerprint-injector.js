const { nanoid } = require('nanoid');
const webpack = require('webpack');
const path = require('path');
const log = require('@apify/log').default;
const fsPromise = require('fs').promises;
const useragent = require('useragent');

const UTILS_FILE_NAME = 'utils.js';
/**
 * Fingerprint injector class.
 * @class
 */
class FingerprintInjector {
    constructor(options = {}) {
        const {
            fingerprint,
        } = options;

        if (fingerprint) {
            this.fingerprint = fingerprint;
        }

        this.prefix = nanoid();
        this.log = log.child({ prefix: 'FingerprintInjector' });
        this.buildUtils = '';
    }

    /**
    * Builds utils to be injected with a randomized prefix to the browser
    */
    async initialize() {
        this.buildUtilsPath = await this._buildUtils();
        this.log.info('Successfully initialized');
    }

    /**
     * Adds init script to the browser context so the fingerprint is changed before every document creation.
     * @param {BrowserContext} browserContext - playwright browser context
     * @param {object} fingerprint - fingerprint from `fingerprint-generator`
     */
    async attachFingerprintToPlaywright(browserContext, fingerprint = this.fingerprint) {
        const transformedFingerprint = this._transformFp(fingerprint);
        await browserContext.addInitScript({
            path: this.buildUtilsPath,
        });

        this.log.info(`Using fingerprint`, { fingerprint: transformedFingerprint });

        await browserContext.addInitScript(this._getInjectFingerprintFunction(), { fp: transformedFingerprint, prefix: this.prefix });
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

    // Create evaluated bundle
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

            overrideInstancePrototype(window.navigator, newNav);

            // override screen
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
            availableScreenResolution = [],
            colorDepth,
            screenResolution = [],
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
            touchSupport = {},
            videoCard,
            audioCodecs,
            videoCodecs,
            battery,
        } = fp;
        const parsedUa = useragent.parse(userAgent);

        const screen = {
            availHeight: availableScreenResolution[0],
            availWidth: availableScreenResolution[1],
            pixelDepth: colorDepth,
            height: screenResolution[0],
            width: screenResolution[1],
        };

        const parsedMemory = parseInt(deviceMemory, 10);
        const parsedTouchPoints = parseInt(touchSupport.maxTouchPoints, 10);

        const navigator = {
            cookieEnabled: this._convertBoolean(cookiesEnabled),
            doNotTrack: '1',
            language: languages[0],
            languages,
            platform,
            deviceMemory: isNaN(parsedMemory) ? undefined : parsedMemory, // FF does not have deviceMemory available
            hardwareConcurrency: parseInt(hardwareConcurrency, 10),
            productSub,
            vendor,
            maxTouchPoints: isNaN(parsedTouchPoints) ? 0 : parsedTouchPoints,
        };

        if (useragent.is(userAgent).firefox) {
            navigator.vendor = '';

            const os = parsedUa.os.toString();
            const [major, minor] = parsedUa.os.toVersion().split('.');

            if (os.toLowerCase().includes('windows')) {
                navigator.oscpu = userAgent.includes('x64') ? `Windows NT ${major}.${minor}; Win64; x64` : `Windows NT ${major}.${minor};`;
            } else if (os.toLowerCase().includes('mac')) {
                navigator.oscpu = `Intel Mac OS X ${major}.${minor}`;
            }
        }

        const pluginsData = {
            mimeTypes,
            plugins,
        };
        const webGl = {
            vendor: videoCard[0],
            renderer: videoCard[1],
        };
        let batteryData;

        if (this._convertBoolean(battery)) {
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

    _convertBoolean(value) {
        if (typeof value === 'boolean') {
            return value;
        }

        // there were sometimes strings like this.
        // This data format error should be fixed in the new fp collector.
        return value === 'True';
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
