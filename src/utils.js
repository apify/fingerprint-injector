// This file contains utils that are build and included on the window object with some randomized prefix.

// some protections can mess with these to prevent the overrides - our script is first so we can reference the old values.
const cache = {
    Reflect: {
        get: Reflect.get.bind(Reflect),
        apply: Reflect.apply.bind(Reflect),
    },
    // Used in `makeNativeString`
    nativeToStringStr: `${Function.toString}`, // => `function toString() { [native code] }`
};

/**
 * @param {object} masterObject - Object ot override
 * @param {string} propertyName - property to override
 * @param {function} proxyHandler - proxy handled with the new value
 */
function overridePropertyWithProxy(masterObject, propertyName, proxyHandler) {
    const originalObject = masterObject[propertyName];
    const proxy = new Proxy(masterObject[propertyName], stripProxyFromErrors(proxyHandler));

    redefineProperty(masterObject, propertyName, { value: proxy });
    redirectToString(proxy, originalObject);
}

/**
 * @param {object} masterObject - Object ot override
 * @param {string} propertyName - property to override
 * @param {function} proxyHandler - proxy handled with getter handler
 */
function overrideGetterWithProxy(masterObject, propertyName, proxyHandler) {
    const fn = Object.getOwnPropertyDescriptor(masterObject, propertyName).get;
    const fnStr = fn.toString(); // special getter function string
    const proxyObj = new Proxy(fn, stripProxyFromErrors(proxyHandler));

    redefineProperty(masterObject, propertyName, { get: proxyObj });
    redirectToString(proxyObj, fnStr);
}

/**
 * @param {Object} instance - instance to override such as navigator.
 * @param {Object} overrideObj - new instance values such as userAgent.
 */
// eslint-disable-next-line no-unused-vars
function overrideInstancePrototype(instance, overrideObj) {
    Object.keys(overrideObj).forEach((key) => {
        try {
            overrideGetterWithProxy(
                Object.getPrototypeOf(instance),
                key,
                makeHandler().getterValue(overrideObj[key]),
            );
        } catch (e) {
            console.error(`Could not override property: ${key} on ${instance}. Reason: ${e.message} `);
        }
    });
}

/**
 * Generate a convincing and functional MimeType or Plugin array from scratch.
 */
function generateMagicArray(
    pluginsOrMimeTypes = [],
    proto = MimeTypeArray.prototype,
    itemProto = MimeType.prototype,
    itemMainProp = 'type',
) {
    // Quick helper to set props with the same descriptors vanilla is using
    const defineProp = (obj, prop, value) => Object.defineProperty(obj, prop, {
        value,
        writable: false,
        enumerable: false, // Important for mimeTypes & plugins: `JSON.stringify(navigator.mimeTypes)`
        configurable: true,
    });

    // Loop over our fake data and construct items
    const makeItem = (data) => {
        const item = {};
        for (const prop of Object.keys(data)) {
            if (prop.startsWith('__')) {
                // eslint-disable-next-line no-continue
                continue;
            }
            defineProp(item, prop, data[prop]);
        }
        return patchItem(item, data);
    };

    const patchItem = (item, data) => {
        let descriptor = Object.getOwnPropertyDescriptors(item);

        // Special case: Plugins have a magic length property which is not enumerable
        // e.g. `navigator.plugins[i].length` should always be the length of the assigned mimeTypes
        if (itemProto === Plugin.prototype) {
            descriptor = {
                ...descriptor,
                length: {
                    // eslint-disable-next-line no-underscore-dangle
                    value: data.__mimeTypes.length,
                    writable: false,
                    enumerable: false,
                    configurable: true, // Important to be able to use the ownKeys trap in a Proxy to strip `length`
                },
            };
        }

        // We need to spoof a specific `MimeType` or `Plugin` object
        const obj = Object.create(itemProto, descriptor);

        // Virtually all property keys are not enumerable in vanilla
        const blacklist = [...Object.keys(data), 'length', 'enabledPlugin'];
        return new Proxy(obj, {
            ownKeys(target) {
                return Reflect.ownKeys(target).filter((k) => !blacklist.includes(k));
            },
            getOwnPropertyDescriptor(target, prop) {
                if (blacklist.includes(prop)) {
                    return undefined;
                }
                return Reflect.getOwnPropertyDescriptor(target, prop);
            },
        });
    };

    const magicArray = [];

    // Loop through our fake data and use that to create convincing entities
    pluginsOrMimeTypes.forEach((data) => {
        magicArray.push(makeItem(data));
    });

    // Add direct property access  based on types (e.g. `obj['application/pdf']`) afterwards
    magicArray.forEach((entry) => {
        defineProp(magicArray, entry[itemMainProp], entry);
    });

    // This is the best way to fake the type to make sure this is false: `Array.isArray(navigator.mimeTypes)`
    const magicArrayObj = Object.create(proto, {
        ...Object.getOwnPropertyDescriptors(magicArray),

        // There's one ugly quirk we unfortunately need to take care of:
        // The `MimeTypeArray` prototype has an enumerable `length` property,
        // but headful Chrome will still skip it when running `Object.getOwnPropertyNames(navigator.mimeTypes)`.
        // To strip it we need to make it first `configurable` and can then overlay a Proxy with an `ownKeys` trap.
        length: {
            value: magicArray.length,
            writable: false,
            enumerable: false,
            configurable: true, // Important to be able to use the ownKeys trap in a Proxy to strip `length`
        },
    });

    // Generate our functional function mocks :-)
    const functionMocks = overridePropertyWithProxy(
        proto,
        itemMainProp,
        magicArray,
    );

    // We need to overlay our custom object with a JS Proxy
    const magicArrayObjProxy = new Proxy(magicArrayObj, {
        get(target, key = '') {
            // Redirect function calls to our custom proxied versions mocking the vanilla behavior
            if (key === 'item') {
                return functionMocks.item;
            }
            if (key === 'namedItem') {
                return functionMocks.namedItem;
            }
            if (proto === PluginArray.prototype && key === 'refresh') {
                return functionMocks.refresh;
            }
            // Everything else can pass through as normal
            // eslint-disable-next-line prefer-rest-params
            return cache.Reflect.get(...arguments);
        },
        ownKeys(target) {
            // There are a couple of quirks where the original property demonstrates "magical" behavior that makes no sense
            // This can be witnessed when calling `Object.getOwnPropertyNames(navigator.mimeTypes)` and the absense of `length`
            // My guess is that it has to do with the recent change of not allowing data enumeration and this being implemented weirdly
            // For that reason we just completely fake the available property names based on our data to match what regular Chrome is doing
            // Specific issues when not patching this: `length` property is available,
            //  direct `types` props (e.g. `obj['application/pdf']`) are missing
            const keys = [];
            const typeProps = magicArray.map((mt) => mt[itemMainProp]);
            typeProps.forEach((_, i) => keys.push(`${i}`));
            typeProps.forEach((propName) => keys.push(propName));
            return keys;
        },
        getOwnPropertyDescriptor(target, prop) {
            if (prop === 'length') {
                return undefined;
            }
            return Reflect.getOwnPropertyDescriptor(target, prop);
        },
    });

    return magicArrayObjProxy;
}

// eslint-disable-next-line no-unused-vars
function overridePluginsAndMimeTypes(pluginsData) {
    const { mimeTypes, plugins } = pluginsData;

    const hasPlugins = 'plugins' in navigator && navigator.plugins.length;

    if (!hasPlugins) {
        return; // nothing to do here plugins not supported by the browser
    }

    const magicMimeTypes = generateMagicArray(
        mimeTypes,
        MimeTypeArray.prototype,
        MimeType.prototype,
        'type',
    );

    const magicPlugins = generateMagicArray(
        plugins,
        PluginArray.prototype,
        Plugin.prototype,
        'name',
    );

    for (const pluginData of plugins) {
        pluginData.mime.forEach((type, index) => {
            magicPlugins[pluginData.name][index] = magicMimeTypes[type];

            Object.defineProperty(magicPlugins[pluginData.name], type, {
                value: magicMimeTypes[type],
                writable: false,
                enumerable: false, // Not enumerable
                configurable: true,
            });
            Object.defineProperty(magicMimeTypes[type], 'enabledPlugin', {
                value:
                    type === 'application/x-pnacl'
                        ? mimeTypes['application/x-nacl'].enabledPlugin // these reference the same plugin, so we need to re-use the Proxy in order to avoid leaks
                        : new Proxy(magicPlugins[pluginData.name], {}), // Prevent circular references
                writable: false,
                enumerable: false, // Important: `JSON.stringify(navigator.plugins)`
                configurable: true,
            });
        });
    }

    const patchNavigator = (name, value) => redefineProperty(Object.getPrototypeOf(navigator), name, {
        get() {
            return value;
        },
    });

    patchNavigator('mimeTypes', mimeTypes);
    patchNavigator('plugins', plugins);
}

function redirectToString(proxyObj, originalObj) {
    const handler = {
        apply(target, ctx) {
            // This fixes e.g. `HTMLMediaElement.prototype.canPlayType.toString + ""`
            if (ctx === Function.prototype.toString) {
                return makeNativeString('toString');
            }

            // `toString` targeted at our proxied Object detected
            if (ctx === proxyObj) {
                const fallback = () => (originalObj && originalObj.name
                    ? makeNativeString(originalObj.name)
                    : makeNativeString(proxyObj.name));

                // Return the toString representation of our original object if possible
                return `${originalObj}` || fallback();
            }

            // Check if the toString prototype of the context is the same as the global prototype,
            // if not indicates that we are doing a check across different windows., e.g. the iframeWithdirect` test case
            const hasSameProto = Object.getPrototypeOf(
                Function.prototype.toString,
            ).isPrototypeOf(ctx.toString); // eslint-disable-line no-prototype-builtins
            if (!hasSameProto) {
                // Pass the call on to the local Function.prototype.toString instead
                return ctx.toString();
            }

            return target.call(ctx);
        },
    };

    const toStringProxy = new Proxy(
        Function.prototype.toString,
        stripProxyFromErrors(handler),
    );
    redefineProperty(Function.prototype, 'toString', {
        value: toStringProxy,
    });
}

function makeNativeString(name = '') {
    return cache.nativeToStringStr.replace('toString', name || '');
}

function redefineProperty(masterObject, propertyName, descriptorOverrides = {}) {
    return Object.defineProperty(masterObject, propertyName, {
        // Copy over the existing descriptors (writable, enumerable, configurable, etc)
        ...(Object.getOwnPropertyDescriptor(masterObject, propertyName) || {}),
        // Add our overrides (e.g. value, get())
        ...descriptorOverrides,
    });
}

function stripProxyFromErrors(handler) {
    const newHandler = {};
    // We wrap each trap in the handler in a try/catch and modify the error stack if they throw
    const traps = Object.getOwnPropertyNames(handler);
    traps.forEach((trap) => {
        newHandler[trap] = function () {
            try {
                // Forward the call to the defined proxy handler
                return handler[trap].apply(this, arguments || []); //eslint-disable-line
            } catch (err) {
                // Stack traces differ per browser, we only support chromium based ones currently
                if (!err || !err.stack || !err.stack.includes(`at `)) {
                    throw err;
                }

                // When something throws within one of our traps the Proxy will show up in error stacks
                // An earlier implementation of this code would simply strip lines with a blacklist,
                // but it makes sense to be more surgical here and only remove lines related to our Proxy.
                // We try to use a known "anchor" line for that and strip it with everything above it.
                // If the anchor line cannot be found for some reason we fall back to our blacklist approach.

                const stripWithBlacklist = (stack, stripFirstLine = true) => {
                    const blacklist = [
                        `at Reflect.${trap} `, // e.g. Reflect.get or Reflect.apply
                        `at Object.${trap} `, // e.g. Object.get or Object.apply
                        `at Object.newHandler.<computed> [as ${trap}] `, // caused by this very wrapper :-)
                    ];
                    return (
                        err.stack
                            .split('\n')
                            // Always remove the first (file) line in the stack (guaranteed to be our proxy)
                            .filter((line, index) => !(index === 1 && stripFirstLine))
                            // Check if the line starts with one of our blacklisted strings
                            .filter((line) => !blacklist.some((bl) => line.trim().startsWith(bl)))
                            .join('\n')
                    );
                };

                const stripWithAnchor = (stack, anchor) => {
                    const stackArr = stack.split('\n');
                    anchor = anchor || `at Object.newHandler.<computed> [as ${trap}] `; // Known first Proxy line in chromium
                    const anchorIndex = stackArr.findIndex((line) => line.trim().startsWith(anchor));
                    if (anchorIndex === -1) {
                        return false; // 404, anchor not found
                    }
                    // Strip everything from the top until we reach the anchor line
                    // Note: We're keeping the 1st line (zero index) as it's unrelated (e.g. `TypeError`)
                    stackArr.splice(1, anchorIndex);
                    return stackArr.join('\n');
                };

                // Special cases due to our nested toString proxies
                err.stack = err.stack.replace(
                    'at Object.toString (',
                    'at Function.toString (',
                );
                if ((err.stack || '').includes('at Function.toString (')) {
                    err.stack = stripWithBlacklist(err.stack, false);
                    throw err;
                }

                // Try using the anchor method, fallback to blacklist if necessary
                err.stack = stripWithAnchor(err.stack) || stripWithBlacklist(err.stack);

                throw err; // Re-throw our now sanitized error
            }
        };
    });
    return newHandler;
}

// eslint-disable-next-line no-unused-vars
function overrideWebGl(webGl) {
    // try to override WebGl
    try {
        // Remove traces of our Proxy
        const stripErrorStack = (stack) => stack
            .split('\n')
            .filter((line) => !line.includes('at Object.apply'))
            .filter((line) => !line.includes('at Object.get'))
            .join('\n');

        const getParameterProxyHandler = {
            get(target, key) {
                try {
                    // Mitigate Chromium bug (#130)
                    if (typeof target[key] === 'function') {
                        return target[key].bind(target);
                    }
                    return Reflect.get(target, key);
                } catch (err) {
                    err.stack = stripErrorStack(err.stack);
                    throw err;
                }
            },
            apply(target, thisArg, args) {
                const param = (args || [])[0];
                // UNMASKED_VENDOR_WEBGL
                if (param === 37445) {
                    return webGl.vendor;
                }
                // UNMASKED_RENDERER_WEBGL
                if (param === 37446) {
                    return webGl.renderer;
                }
                try {
                    return cache.Reflect.apply(target, thisArg, args);
                } catch (err) {
                    err.stack = stripErrorStack(err.stack);
                    throw err;
                }
            },
        };

        const addProxy = (obj, propName) => {
            overridePropertyWithProxy(obj, propName, getParameterProxyHandler);
        };

        addProxy(WebGLRenderingContext.prototype, 'getParameter');
        addProxy(WebGL2RenderingContext.prototype, 'getParameter');
    } catch (err) {
        console.warn(err);
    }
}
function injectPlugins(plugins) {

}
// eslint-disable-next-line no-unused-vars
const overrideCodecs = (audioCodecs, videoCodecs) => {
    const codecs = {
        ...audioCodecs,
        ...videoCodecs,
    };
    const findCodec = (codecString) => {
        for (const [name, state] of Object.entries(codecs)) {
            const codec = { name, state };
            if (codecString.includes(codec.name)) {
                return codec;
            }
        }
    };

    const canPlayType = {
        // eslint-disable-next-line
        apply: function(target, ctx, args) {
            if (!args || !args.length) {
                return target.apply(ctx, args);
            }
            const [codecString] = args;
            const codec = findCodec(codecString);

            if (codec) {
                return codec.state;
            }

            // If the codec is not in our collected data use
            return target.apply(ctx, args);
        },
    };

    overridePropertyWithProxy(
        HTMLMediaElement.prototype,
        'canPlayType',
        canPlayType,
    );
};

// eslint-disable-next-line no-unused-vars
function overrideBattery(batteryInfo) {
    const getBattery = {
        // eslint-disable-next-line
        apply: async function () {
            return batteryInfo;
        },
    };

    overridePropertyWithProxy(
        Object.getPrototypeOf(navigator),
        'getBattery',
        getBattery,
    );
}

function makeHandler() {
    return {
        // Used by simple `navigator` getter evasions
        getterValue: (value) => ({
            apply(target, ctx, args) {
                // Let's fetch the value first, to trigger and escalate potential errors
                // Illegal invocations like `navigator.__proto__.vendor` will throw here
                const ret = cache.Reflect.apply(...arguments); // eslint-disable-line
                if (args && args.length === 0) {
                    return value;
                }
                return ret;
            },
        }),
    };
}
