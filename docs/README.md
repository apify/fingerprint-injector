# Fingerprint injector
The Fingerprint injector is a sparse javascript library build for stealth override of browser signatures or so-called fingerprints.
This library can inject fingerprints through a unified interface to `playwright` and `puppeteer` controlled browsers.
It is highly recommended to use this library with the Apify `fingerprint-generator` to achieve the best results.

<!-- toc -->

- [Installation](#installation)
- [Usage](#usage)
- [API Reference](#api-reference)

<!-- tocstop -->

## Installation
At this stage of development the `fingerprint-injector` is a standalone private package - soon to be public with some stealthy additions to the code.
The installation process is the same as for the `unblockers`. Please refer to this tutorial - https://www.notion.so/apify/Installing-unblockers-2c0db985c84d45f7a81d1a11d826d263.

```bash
npm install fingerprint-injector
```

## Usage
This simple example shows how to use fingerprint injector with `browser-pool` plugin system, `playwright` firefox browser and the Apify [`fingerprint-generator`]()

```js
const { PlaywrightPlugin } = require('browser-pool');
const FingerprintGenerator = require('fingerprint-generator');
const FingerprintInjector  = require('@apify-packages/fingerprint-injector');

// An asynchronous IIFE (immediately invoked function expression)
// allows us to use the 'await' keyword.
(async () => {
    const playwrightPlugin = new PlaywrightPlugin(playwright.firefox, pluginOptions);
    
    const fingerprintGenerator = new FingerprintGenerator({
        devices: ['desktop'],
        browsers: [{ name: 'firefox', minVersion: 88 }],
    });

    const { fingerprint } = fingerprintGenerator.getFingerprint();

    const fingerprintInjector = new FingerprintInjector({ fingerprint });
    // Initialize fingerprint - it needs to load utils script.
    await fingerprintInjector.initialize();

    const launchContext = playwrightPlugin.createLaunchContext();
    const browser = await playwrightPlugin.launch(launchContext);
    // For now this needs to be set manually to the context.
    const context = await browser.newContext({
        userAgent: fingerprint.userAgent,
        locale: fingerprint.navigator.language,
    });
   // Attach fingerprint
   await fingerprintInjector.attachFingerprintToPlaywright(context);

   const page = await context.newPage();
})();
```
## API Reference
All public classes, methods and their parameters can be inspected in this API reference.

{{>all-docs~}}
