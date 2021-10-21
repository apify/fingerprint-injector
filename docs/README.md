# Fingerprint injector
The Fingerprint injector is a sparse javascript library built for stealth override of browser signatures or so-called fingerprints. Overriding browser fingerprints help simulate real user browsers.
This library can inject fingerprints to `playwright` and `puppeteer` controlled browsers through a unified interface.
It is recommended to use this library with the Apify [`fingerprint-generator`](https://github.com/apify/fingerprint-generator) to achieve the best results and meet the necessary fingerprint structure.

<!-- toc -->

- [Installation](#installation)
- [Usage with the playwright](#usage-with-the-playwright)
- [Usage with the puppeteer](#usage-with-the-puppeteer)
- [API Reference](#api-reference)

<!-- tocstop -->

## Installation

```bash
npm install fingerprint-injector
```

## Usage with the playwright
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

## Usage with the puppeteer
This example demonstrates, how to use the fingerprint injector library with puppeteer.
```js
const FingerprintGenerator = require('fingerprint-generator');
const { FingerprintInjector } = require('fingerprint-injector');
const puppeteer = require('puppeteer')

// An asynchronous IIFE (immediately invoked function expression)
// allows us to use the 'await' keyword.
(async () => {
    const fingerprintInjector = new FingerprintInjector();

    const fingerprintGenerator = new FingerprintGenerator({
        devices: ['desktop'],
        browsers: [{ name: 'chrome', minVersion: 88 }],
    });

    const { fingerprint } = fingerprintGenerator.getFingerprint();
    const browser = await puppeteer.launch({headless: false})
    const page = await browser.newPage();
    // Attach fingerprint to page
    await fingerprintInjector.attachFingerprintToPuppeteer(page, fingerprint);
    // Now you can use the page
    await page.goto('https://google.com')

})();
```
## API Reference
All public classes, methods and their parameters can be inspected in this API reference.

{{>all-docs~}}
