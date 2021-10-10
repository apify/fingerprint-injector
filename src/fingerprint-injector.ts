import path from 'path';
import log, { Log } from '@apify/log';
import { readFileSync } from 'fs'
import * as useragent from 'useragent';
import { UTILS_FILE_NAME } from './constants';

type EnhancedFingerprint = {
    screen: Record<string, number>,
    navigator: Record<string, any>,
    webGl: Record<string, string>,
    userAgent: string,
    audioCodecs: Record<string, string>[],
    videoCodecs: Record<string, string>[],
    batteryData?: Record<string, number>,
}

type Fingerprint = {
    screen: Record<string, number>,
    navigator: Record<string, any>,
    webGl: Record<string, string>,
    userAgent: string,
    audioCodecs: Array<Record<string, string>>
    videoCodecs: Array<Record<string, string>>
    battery?: boolean,
}

/**
 * Fingerprint injector class.
 * @class
 */
export class FingerprintInjector {
    log = log.child({ prefix: 'FingerprintInjector' });
    utilsJs = fs.readFileSync(path.join(__dirname, UTILS_FILE_NAME));

    constructor() {
        this.log = log.child({ prefix: 'FingerprintInjector' });

        // For the simplicity of calling only the constructor and avoid having an initialize method.
        this.utilsJs = fs.readFileSync(path.join(__dirname, UTILS_FILE_NAME))

        this.log.info('Successfully initialized.');
    }

    /**
     * Adds init script to the browser context so the fingerprint is changed before every document creation.
     * @param {BrowserContext} browserContext - playwright browser context
     * @param fingerprint fingerprint from `fingerprint-generator`
     */
    async attachFingerprintToPlaywright(browserContext: import("playwright").BrowserContext, fingerprint: Fingerprint): Promise<void> {
        const enhancedFingerprint = this._enhanceFingerprint(fingerprint);

        this.log.debug(`Using fingerprint`, { fingerprint: enhancedFingerprint });
        const content = this._getInjectableFingerprintFunction(enhancedFingerprint)

        await browserContext.addInitScript({
            content,
        });
    }

    /**
     * Adds scripts that is evaluated before every document creation.
     * @param {Page} page - puppeteer page
     * @param {object} fingerprint - fingerprint from `fingerprint-generator`
     */
    async attachFingerprintToPuppeteer(page: import("puppeteer").Page, fingerprint: Fingerprint): Promise<void> {
        const enhancedFingerprint = this._enhanceFingerprint(fingerprint);
        
        this.log.debug(`Using fingerprint`, { fingerprint: enhancedFingerprint });

        await page.evaluateOnNewDocument(this._getInjectableFingerprintFunction(enhancedFingerprint));
    }

    /**
     * Create injection function string.
     * @private
     * @param {object} fingerprint - enhanced fingerprint.
     * @returns {string} - script that overrides browser fingerprint.
     */
    _getInjectableFingerprintFunction(fingerprint: EnhancedFingerprint): string {
        function inject() {
            // @ts-expect-error
            const { batteryInfo, navigator: newNav, screen: newScreen, webGl, historyLength, audioCodecs, videoCodecs } = fp;
            // @ts-expect-error
            console.log(fp)
            // override navigator
            // @ts-expect-error
            overrideInstancePrototype(window.navigator, newNav);

            // override screen
            // @ts-expect-error
            overrideInstancePrototype(window.screen, newScreen);
            // @ts-expect-error
            overrideInstancePrototype(window.history, { length: historyLength });

            // override webGl
            // @ts-expect-error
            overrideWebGl(webGl);

            // override codecs
            // @ts-expect-error
            overrideCodecs(audioCodecs, videoCodecs);

            // override batteryInfo
            // @ts-expect-error
            overrideBattery(batteryInfo);
        }

        const mainFunctionString: string = inject.toString();

        return `${this.utilsJs}; const fp=${JSON.stringify(fingerprint)}; (${mainFunctionString})() `;
    }

    _enhanceFingerprint(fingerprint: Fingerprint): EnhancedFingerprint {
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
            } else if (os.toLowerCase().includes('ubuntu')) {
                navigator.oscpu = 'Linux x86_64';
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

