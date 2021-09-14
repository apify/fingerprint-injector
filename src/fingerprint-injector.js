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
        const enhancedFingerprint = this._enhanceFingerprint(fingerprint);

        this.log.info(`Using fingerprint`, { fingerprint: enhancedFingerprint });

        await browserContext.addInitScript({
            content: this._getInjectFingerprintFunctionString(enhancedFingerprint),
        });
    }

    /**
     * Adds scripts that is evaluated before every document creation.
     * @param {Page} page - puppeteer page
     * @param {object} fingerprint - fingerprint from `fingerprint-generator`
     */
    async attachFingerprintToPuppeteer(page, fingerprint = this.fingerprint) {
        const enhancedFingerprint = this._enhanceFingerprint(fingerprint);
        this.log.info(`Using fingerprint`, { fingerprint: enhancedFingerprint });

        await page.evaluateOnNewDocument(this._getInjectFingerprintFunction(enhancedFingerprint));
    }

    /**
     * Create injection function string.
     * @private
     * @param {object} fingerprint - enhanced fingerprint.
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
        return `${this.utilsString}; const fp=${JSON.stringify(fingerprint)}; (${mainFunctionString})() `;
    }

    _enhanceFingerprint(fingerprint) {
        const {
            battery,
            navigator,
            userAgent,
            ...rest
        } = fingerprint;

        const parsedUa = useragent.parse(userAgent);

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
        let batteryData;

        if (battery) {
            batteryData = { level: 0.25, chargingTime: 322, dischargingTime: Infinity }; // TODO: randomize
        }

        return {
            ...rest,
            navigator,
            batteryData,
            userAgent,
        };
    }
}

module.exports = FingerprintInjector;
