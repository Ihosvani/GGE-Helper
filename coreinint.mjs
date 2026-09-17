import {
    getGameSource,
    getItemVersion,
    getItemVersionForSource,
    getLangVersion,
    loadLanguage,
    loadItems,
    loadItemsForSource,
    logResolvedDataUrls
} from "./DataService.mjs";

import { buildEffectContext }
    from "./EffectService.mjs";

import { loadImageMaps }
    from "./ImageService.mjs";
import { createLoader }
    from "./ErrorScreenService.mjs";


export async function coreInit({
    loader,
    langCode = "en",
    gameSource: requestedGameSource,
    normalizeNameFn,
    itemLabel = "items",

    assets = {},

    onReady
}) {
    const activeLoader = loader || createLoader();
    activeLoader.set();

    try {
        const gameSource = String(requestedGameSource || getGameSource()).toLowerCase() === "e4k"
            ? "e4k"
            : "empire";

        const [itemVersion, langVersion] = await Promise.all([
            requestedGameSource ? getItemVersionForSource(gameSource) : getItemVersion(),
            getLangVersion()
        ]);

        await logResolvedDataUrls({ langCode, itemVersion, langVersion, gameSource });

        const imageMapsPromise =
            Object.keys(assets).length > 0
                ? loadImageMaps({
                    ...assets,
                    normalizeNameFn
                })
                : Promise.resolve({});

        const [langRaw, json, imageMaps] = await Promise.all([
            loadLanguage(langCode, langVersion, gameSource),
            requestedGameSource ? loadItemsForSource(gameSource, itemVersion) : loadItems(itemVersion),
            imageMapsPromise
        ]);

        const lang =
            lowercaseKeysRecursive(langRaw);

        const effectCtx =
            buildEffectContext(json, lang);


        await onReady({
            lang,
            data: json,
            imageMaps,

            effectCtx,

            versions: {
                itemVersion,
                langVersion,
                gameSource
            }
        });
        activeLoader.hide();
    } catch (error) {
        activeLoader.error();
        throw error;
    }
}

function lowercaseKeysRecursive(input) {

    if (!input || typeof input !== "object")
        return input;

    if (Array.isArray(input))
        return input.map(lowercaseKeysRecursive);

    const o = {};

    for (const k in input) {

        o[k.toLowerCase()] =
            lowercaseKeysRecursive(input[k]);
    }

    return o;
}
