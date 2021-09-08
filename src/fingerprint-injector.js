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

        this.log = log.child({ prefix: 'FingerprintInjector' });
        this.utilsString = '';
    }

    /**
    * Builds utils to be injected with a randomized prefix to the browser
    */
    async initialize() {
        this.utilsString = await fsPromise.readFile(path.join(__dirname, UTILS_FILE_NAME));
        this.log.info('Successfully initialized');
    }

    /**
     * Adds init script to the browser context so the fingerprint is changed before every document creation.
     * @param {BrowserContext} browserContext - playwright browser context
     * @param {object} fingerprint - fingerprint from `fingerprint-generator`
     */
    async attachFingerprintToPlaywright(browserContext, fingerprint = this.fingerprint) {
        const transformedFingerprint = this._transformFp(fingerprint);

        this.log.info(`Using fingerprint`, { fingerprint: transformedFingerprint });

        await browserContext.addInitScript({
            content: this._getInjectFingerprintFunctionString(transformedFingerprint),
        });
    }

    /**
     * Adds scripts that is evaluated before every document creation.
     * @param {Page} page - puppeteer page
     * @param {object} fingerprint - fingerprint from `fingerprint-generator`
     */
    async attachFingerprintToPuppeteer(page, fingerprint = this.fingerprint) {
        const transformedFingerprint = this._transformFp(fingerprint);

        this.log.info(`Using fingerprint`, { fingerprint: transformedFingerprint });

        await page.evaluateOnNewDocument(this._getInjectFingerprintFunction(transformedFingerprint));
    }

    /**
     * Create injection function string.
     * @private
     * @param {object} fingerprint - transformed fingerprint.
     * @returns {string} - script that overrides browser fingerprint.
     */
    _getInjectFingerprintFunctionString(fingerprint) {
        function inject() {
            // eslint-disable-next-line
            const { batteryInfo, navigator: newNav, screen: newScreen, webGl, historyLength, audioCodecs, videoCodecs } = fp;
            // override navigator
            // eslint-disable-next-line
            overrideInstancePrototype(window.navigator, newNav);

            // override screen
            // eslint-disable-next-line
            overrideInstancePrototype(window.screen, newScreen);
            // eslint-disable-next-line
            overrideInstancePrototype(window.history, { length: historyLength });

            // override webGl
            // eslint-disable-next-line
            overrideWebGl(webGl);

            // override codecs
            // eslint-disable-next-line
            overrideCodecs(audioCodecs, videoCodecs);

            // override batteryInfo
            // eslint-disable-next-line
            overrideBattery(navigator, 'getBattery', async () => batteryInfo);
        }
        const mainFunctionString = inject.toString();
        return `${this.utilsString}; const fp=${JSON.stringify(fingerprint)}; console.log(fp, "RPDE"); (${mainFunctionString})() `;
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
            deviceMemory: Number.isNaN(parsedMemory) ? undefined : parsedMemory, // FF does not have deviceMemory available
            hardwareConcurrency: parseInt(hardwareConcurrency, 10),
            productSub,
            vendor,
            maxTouchPoints: Number.isNaN(parsedTouchPoints) ? 0 : parsedTouchPoints,
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
}

module.exports = FingerprintInjector;
