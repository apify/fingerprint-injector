import path from 'path';
import log from '@apify/log';
import { readFileSync } from 'fs';
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

export type Fingerprint = {
    screen: Record<string, number>,
    navigator: Record<string, string|number|[]|undefined>,
    webGl: Record<string, string>,
    userAgent: string,
    audioCodecs: Record<string, string>[],
    videoCodecs: Record<string, string>[],
    battery?: boolean,
}

// Supporting types
type addInitScriptOptions = {
    content: string
}

type BrowserContext = {
    addInitScript: (options: addInitScriptOptions)=> Promise<void>
}

type Page = {
    evaluateOnNewDocument: (functionToEvaluate: string) => Promise<void>
}

/**
 * Fingerprint injector class.
 * @class
 */
export class FingerprintInjector {
    log = log.child({ prefix: 'FingerprintInjector' });

    utilsJs = readFileSync(path.join(__dirname, UTILS_FILE_NAME));

    constructor() {
        this.log.info('Successfully initialized.');
    }

    /**
     * Adds init script to the browser context so the fingerprint is changed before every document creation.
     * @param {import("playwright").BrowserContext} browserContext - playwright browser context
     * @param fingerprint fingerprint from `fingerprint-generator`
     */
    async attachFingerprintToPlaywright(browserContext: BrowserContext, fingerprint: Fingerprint): Promise<void> {
        const enhancedFingerprint = this._enhanceFingerprint(fingerprint);

        this.log.debug(`Using fingerprint`, { fingerprint: enhancedFingerprint });
        const content = this._getInjectableFingerprintFunction(enhancedFingerprint);

        await browserContext.addInitScript({
            content,
        });
    }

    /**
     * Adds scripts that is evaluated before every document creation.
     * @param {Page} page - puppeteer page
     * @param fingerprint - fingerprint from `fingerprint-generator`
     */
    async attachFingerprintToPuppeteer(page: Page, fingerprint: Fingerprint): Promise<void> {
        const enhancedFingerprint = this._enhanceFingerprint(fingerprint);

        this.log.debug(`Using fingerprint`, { fingerprint: enhancedFingerprint });

        await page.evaluateOnNewDocument(this._getInjectableFingerprintFunction(enhancedFingerprint));
    }

    /**
     * Create injection function string.
     * @private
     * @param fingerprint - enhanced fingerprint.
     * @returns {string} - script that overrides browser fingerprint.
     */
    _getInjectableFingerprintFunction(fingerprint: EnhancedFingerprint): string {
        function inject() {
            // @ts-expect-error Internal browser code for injection
            const { batteryInfo, navigator: newNav, screen: newScreen, webGl, historyLength, audioCodecs, videoCodecs } = fp;

            // override navigator
            // @ts-expect-error Internal browser code for injection
            overrideInstancePrototype(window.navigator, newNav);

            // override screen
            // @ts-expect-error Internal browser code for injection
            overrideInstancePrototype(window.screen, newScreen);
            // @ts-expect-error Internal browser code for injection
            overrideInstancePrototype(window.history, { length: historyLength });

            // override webGl
            // @TODO: Find another way out of this.
            // This feels like a dirty hack, but without this it throws while running tests.
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore Internal browser code for injection
            overrideWebGl(webGl);

            // override codecs
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore Internal browser code for injection
            overrideCodecs(audioCodecs, videoCodecs);

            // override batteryInfo
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore Internal browser code for injection
            overrideBattery(batteryInfo);
        }

        const mainFunctionString: string = inject.toString();

        return `(()=>{${this.utilsJs}; const fp=${JSON.stringify(fingerprint)}; (${mainFunctionString})()})()`;
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
