# Fingerprint injector
The Fingerprint injector is a sparse javascript library built for stealth override of browser signatures or so-called fingerprints. Overriding browser fingerprints help simulate real user browsers.
This library can inject fingerprints to `playwright` and `puppeteer` controlled browsers through a unified interface.
It is recommended to use this library with the Apify [`fingerprint-generator`](https://github.com/apify/fingerprint-generator) to achieve the best results and meet the necessary fingerprint structure.

<!-- toc -->

- [Installation](#installation)
- [Usage with playwright](#usage-with-playwright)
- [API Reference](#api-reference)

<!-- tocstop -->

## Installation

```bash
npm install fingerprint-injector
```

## Usage with playwright
This example shows how to use fingerprint injector with `browser-pool` plugin system, `playwright` firefox browser, and the Apify [`fingerprint-generator`](https://github.com/apify/fingerprint-generator)

```js
const { PlaywrightPlugin } = require('browser-pool');
const FingerprintGenerator = require('fingerprint-generator');
const { FingerprintInjector }  = require('fingerprint-injector');

// An asynchronous IIFE (immediately invoked function expression)
// allows us to use the 'await' keyword.
(async () => {
    const playwrightPlugin = new PlaywrightPlugin(playwright.firefox, pluginOptions);
    
    const fingerprintGenerator = new FingerprintGenerator({
        devices: ['desktop'],
        browsers: [{ name: 'firefox', minVersion: 88 }],
    });

    const { fingerprint } = fingerprintGenerator.getFingerprint();

    const fingerprintInjector = new FingerprintInjector();
    // Initialize fingerprint - it needs to load utils script.
    await fingerprintInjector.initialize();

    const launchContext = playwrightPlugin.createLaunchContext();
    const browser = await playwrightPlugin.launch(launchContext);
    // Forward properties to the browserContext
    const context = await browser.newContext({
        userAgent: fingerprint.userAgent,
        locale: fingerprint.navigator.language,
    });
   // Attach fingerprint
   await fingerprintInjector.attachFingerprintToPlaywright(context, fingerprint);

   const page = await context.newPage();
})();
```
## API Reference
All public classes, methods and their parameters can be inspected in this API reference.

<a name="FingerprintInjector"></a>

### FingerprintInjector
Fingerprint injector class.


* [FingerprintInjector](#FingerprintInjector)
    * [`.attachFingerprintToPlaywright(browserContext, fingerprint)`](#FingerprintInjector+attachFingerprintToPlaywright)
    * [`.attachFingerprintToPuppeteer(page, fingerprint)`](#FingerprintInjector+attachFingerprintToPuppeteer)


* * *

<a name="FingerprintInjector+attachFingerprintToPlaywright"></a>

#### `fingerprintInjector.attachFingerprintToPlaywright(browserContext, fingerprint)`
Adds init script to the browser context, so the fingerprint is changed before every document creation.
DISCLAIMER: Since the playwright does not support changing viewport and User-agent after the context is created,
you have to set it manually when the context is created. Check the playwright usage example.


| Param | Description |
| --- | --- |
| browserContext | playwright browser context |
| fingerprint | fingerprint from [`fingerprint-generator`](https://github.com/apify/fingerprint-generator) |


* * *

<a name="FingerprintInjector+attachFingerprintToPuppeteer"></a>

#### `fingerprintInjector.attachFingerprintToPuppeteer(page, fingerprint)`
Adds script that is evaluated before every document creation.
Sets User-Agent and viewport using native puppeteer interface


| Param | Description |
| --- | --- |
| page | puppeteer page |
| fingerprint | fingerprint from [`fingerprint-generator`](https://github.com/apify/fingerprint-generator) |


* * *

