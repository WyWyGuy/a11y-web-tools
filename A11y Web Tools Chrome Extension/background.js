const HANDLE_RETRY_DELAY = 2000;

const DEFAULT_SETTINGS = {
    a11yAltText: false,
    a11yIframes: false,
    a11yHeadings: false,
    a11yContrast: false,
    a11yLang: false,
    a11yTables: false,
    defaultEditor: false,
    defaultDropdownMenus: false,
    alwaysRun: false,
    a11yHotkeys: false,
    dropdownHotkeys: false,
    h5pHotkeys: false,
    editorHighlights: false,
    extraEditorHelps: false,
    expandEditBoxes: false,
    tableHeaders: false,
    countModules: false,
    canvasFilePath: false,
    h5pLanguage: "english",
};

const DEFAULT_SETTING_KEYS = new Set(Object.keys(DEFAULT_SETTINGS));

let dictionaryCache = null;
async function getDictionary() {
    if (dictionaryCache !== null) {
        return dictionaryCache;
    }
    try {
        const response = await fetch(chrome.runtime.getURL("englishWords.txt"));
        if (!response.ok) {
            console.warn(`Failed to load dictionary: ${response.status} ${response.statusText}`);
            return "";
        }
        const text = await response.text();
        dictionaryCache = text;
        return dictionaryCache;
    } catch (error) {
        console.warn("Failed to load dictionary:", error);
        return "";
    }
}

async function setSetting(key, value) {
    if (!DEFAULT_SETTING_KEYS.has(key)) {
        console.error("Invalid setting:", key);
        return false;
    }
    if (typeof value !== "boolean" && typeof value !== "string") {
        console.error("Invalid setting value:", value);
        return false;
    }
    await chrome.storage.local.set({ [key]: value });
    return true;
}

async function getSetting(key) {
    if (!DEFAULT_SETTING_KEYS.has(key)) {
        console.error("Invalid setting:", key);
        return null;
    }
    const defaultValue = DEFAULT_SETTINGS[key];
    const result = await chrome.storage.local.get({ [key]: defaultValue });
    return result[key];
}

async function setSettingRuntime(k, val) {
    try {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        const result = await chrome.tabs.sendMessage(tab.id, { action: "setSettingRuntime", key: k, value: val });
        if (result?.success === true) {
            return true;
        } else {
            console.warn("Failed to set runtime setting:", result?.error);
            return false;
        }
    } catch (error) {
        console.warn("Unable to set runtime setting:", error);
        return false;
    }
}

async function getSettingRuntime(k) {
    try {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        return await chrome.tabs.sendMessage(tab.id, { action: "getSettingRuntime", key: k});
    } catch (error) {
        console.warn("Unable to get runtime setting:", error);
        return null;
    }
}

let popupOpen = false;
chrome.runtime.onConnect.addListener((port) => {
    if (port.name === "popup") {
        popupOpen = true;
        port.onDisconnect.addListener(() => {
            popupOpen = false;
        });
    }
});

// Userscripts with their matching URL patterns
const USERSCRIPTS = [
    {
        file: "userscripts/autoA11yTools.bundle.js",
        matches(url) {
            return true;
        }
    },
    {
        file: "userscripts/canvasFilePathTool.js",
        matches(url) {
            return /^https:\/\/(?:.*\.)?instructure\.com\/courses\/.*/.test(url);
        }
    },
    {
        file: "userscripts/colorChecker.js",
        matches(url) {
            return true;
        }
    },
    {
        file: "userscripts/downloadSLASpreadsheets.js",
        matches(url) {
            return /^https:\/\/(?:.*\.)?teamwork\.com\/.*/.test(url);
        }
    },
    {
        file: "userscripts/dropdownControlTool.js",
        matches(url) {
            return /^https:\/\/(?:.*\.)?instructure\.com\/courses\/.*/.test(url);
        }
    },
    {
        file: "userscripts/elementCountingTool.js",
        matches(url) {
            return true;
        }
    },
    {
        file: "userscripts/h5pLanguageSelector.js",
        matches(url) {
            return /^https:\/\/(?:.*\.)?h5p\.com\/.*/.test(url);
        }
    },
    {
        file: "userscripts/moduleCountingTool.js",
        matches(url) {
            return /^https:\/\/(?:.*\.)?instructure\.com\/courses\/.*/.test(url);
        }
    },
    {
        file: "userscripts/rawHTMLEditorHelper.js",
        matches(url) {
            return /^https:\/\/(?:.*\.)?instructure\.com\/courses\/.*/.test(url);
        }
    }
];

// Only inject scripts if they match URL pattern and have settings enabled
async function decideShouldInject(script, url) {
    try {
        if (!script.matches(url)) return false;
        if (script.file === "userscripts/moduleCountingTool.js" && await getSetting("countModules") === false) return false;
        if (script.file === "userscripts/canvasFilePathTool.js" && await getSetting("canvasFilePath") === false) return false;
        return true;
    } catch (error) {
        console.warn("Unable to decide script injection:", error);
        return false;
    }
}

const injectedTabs = new Map();

// Inject userscripts when the page loads
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status !== "complete" || !tab.url) return;
    const lastUrl = injectedTabs.get(tabId);
    const url = tab.url;
    if (lastUrl === url) return;
    for (const script of USERSCRIPTS) {
        const shouldInject = await decideShouldInject(script, url);
        if (shouldInject) {
            try {
                await chrome.scripting.executeScript({
                    target: { tabId },
                    files: [script.file]
                });
            } catch (e) {
                console.warn(`A11y Web Tools: Failed to add ${script.file} into ${url}:`, e);
            }
        }
    }
    injectedTabs.set(tabId, url); 
});

// Insert into any iframes when they are loaded
chrome.webNavigation.onCompleted.addListener(async (details) => {
    if (details.frameId === 0) return;
    const tabId = details.tabId;
    const url = details.url;
    for (const script of USERSCRIPTS) {
        const shouldInject = await decideShouldInject(script, url);
        if (shouldInject) {
            try {
                await chrome.scripting.executeScript({
                    target: { tabId, frameIds: [details.frameId] },
                    files: [script.file]
                });
            } catch (e) {
                console.warn(`A11y Web Tools: Failed to add ${script.file} into ${url}:`, e);
            }
        }
    }
});

chrome.tabs.onRemoved.addListener((tabId) => {
    injectedTabs.delete(tabId);
});

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
    if (details.frameId === 0) {
        injectedTabs.delete(details.tabId);
    }
});

// Function to load the offscreen document
async function ensureOffscreenDocument() {
    const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ["OFFSCREEN_DOCUMENT"]
    });
    if (existingContexts.length > 0) {
        return;
    }
    await chrome.offscreen.createDocument({
        url: "offscreen.html",
        reasons: ["WORKERS"],
        justification: "Run the ONNX language model"
    });
}
ensureOffscreenDocument().catch(error => {
    console.error("Failed to create offscreen document:", error);
});
// End function to load the offscreen document

// Listen for when the user interacts with the popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
        case "loadSettings":
            loadAllSettings()
            .then(sendResponse)
            .catch(error => {
                console.error("Failed to load settings:", error);
                sendResponse(null);
            });
            return true;
        case "getSetting":
            if (Object.hasOwn(DEFAULT_SETTINGS, message.value)) {
                getSetting(message.value)
                .then(sendResponse)
                .catch(error => {
                    console.warn("Failed to get setting:", error);
                    sendResponse(null);
                });
            } else {
                getSettingRuntime(message.value)
                .then(sendResponse)
                .catch(error => {
                    console.warn("Failed to get runtime setting:", error);
                    sendResponse(null);
                });
            }
            return true;
        case "setSetting":
            if (Object.hasOwn(DEFAULT_SETTINGS, message.key)) {
                setSetting(message.key, message.value)
                .then(sendResponse)
                .catch(error => {
                    console.warn("Failed to set setting:", error);
                    sendResponse(false);
                });
            } else {
                setSettingRuntime(message.key, message.value)
                .then(sendResponse)
                .catch(error => {
                    console.warn("Failed to set runtime setting:", error);
                    sendResponse(false);
                });
            }
            return true;
        case "getTopPageUrl":
            sendResponse(sender.tab?.url ?? null);
            break;
        case "getDictionary":
            getDictionary()
            .then(sendResponse)
            .catch(error => {
                console.warn("Failed to load dictionary:", error);
                sendResponse("");
            });
            return true;
        case "activateAllA11yTools":
            handleToggleAll(message.action, sender).catch(error => console.warn(`Failed to handle ${message.action}`, error));
            break;
        case "deactivateAllA11yTools":
            handleToggleAll(message.action, sender).catch(error => console.warn(`Failed to handle ${message.action}`, error));
            break;
        case "expandAllDropdowns":
            handleToggleDropdowns(message.action, sender.tab?.id).catch(error => console.warn(`Failed to handle ${message.action}`, error));
            break;
        case "collapseAllDropdowns":
            handleToggleDropdowns(message.action, sender.tab?.id).catch(error => console.warn(`Failed to handle ${message.action}`, error));
            break;
        case "toggleImageOverlays":
            handleToggleImageOverlays().catch(error => console.warn(`Failed to handle ${message.action}`, error));
            break;
        case "toggleIframeOverlays":
            handleToggleIframeOverlays().catch(error => console.warn(`Failed to handle ${message.action}`, error));
            break;
        case "toggleHeadingOverlays":
            handleToggleHeadingOverlays().catch(error => console.warn(`Failed to handle ${message.action}`, error));
            break;
        case "toggleTableOverlays":
            handleToggleTableOverlays().catch(error => console.warn(`Failed to handle ${message.action}`, error));
            break;
        case "toggleContrastHighlights":
            handleToggleContrastHighlights().catch(error => console.warn(`Failed to handle ${message.action}`, error));
            break;
        case "toggleLangTagHighlights":
            handleToggleLangTagHighlights().catch(error => console.warn(`Failed to handle ${message.action}`, error));
            break;
        case "toggleTableCounting":
            handleToggleTableCounting(0).catch(error => console.warn(`Failed to handle ${message.action}`, error));
            break;
        case "toggleIframeCounting":
            handleToggleIframeCounting(0).catch(error => console.warn(`Failed to handle ${message.action}`, error));
            break;
        case "toggleParagraphCounting":
            handleToggleParagraphCounting(0).catch(error => console.warn(`Failed to handle ${message.action}`, error));
            break;
        case "toggleDefaultEditor":
            handleToggleDefaultEditor().catch(error => console.warn(`Failed to handle ${message.action}`, error));
            break;
        case "toggleDefaultDropdownMenus":
            handleToggleDefaultDropdownMenus().catch(error => console.warn(`Failed to handle ${message.action}`, error));
            break;
        case "toggleContrastInspector":
            handleToggleContrastInspector(0).catch(error => console.warn(`Failed to handle ${message.action}`, error));
            break;
        case "downloadSLAFiles":
            handleDownloadSLAFiles().catch(error => console.warn(`Failed to handle ${message.action}`, error));
            break;
        case "toggleAlwaysRun":
            if (typeof message.value !== "boolean") {
                console.error("Invalid setting value:", message.value);
                return;
            }
            handleToggleAlwaysRun(message.value).catch(error => console.warn(`Failed to handle ${message.action}`, error));
            break;
        case "toggleA11yHotkeys":
            if (typeof message.value !== "boolean") {
                console.error("Invalid setting value:", message.value);
                return;
            }
            handleToggleA11yHotkeys(message.value).catch(error => console.warn(`Failed to handle ${message.action}`, error));
            break;
        case "toggleDropdownHotkeys":
            if (typeof message.value !== "boolean") {
                console.error("Invalid setting value:", message.value);
                return;
            }
            handleToggleDropdownHotkeys(message.value).catch(error => console.warn(`Failed to handle ${message.action}`, error));
            break;
        case "toggleH5PHotkeys":
            if (typeof message.value !== "boolean") {
                console.error("Invalid setting value:", message.value);
                return;
            }
            handleToggleH5PHotkeys(message.value).catch(error => console.warn(`Failed to handle ${message.action}`, error));
            break;
        case "toggleEditorHighlights":
            if (typeof message.value !== "boolean") {
                console.error("Invalid setting value:", message.value);
                return;
            }
            handleToggleEditorHighlights(message.value).catch(error => console.warn(`Failed to handle ${message.action}`, error));
            break;
        case "toggleExtraEditorHelps":
            if (typeof message.value !== "boolean") {
                console.error("Invalid setting value:", message.value);
                return;
            }
            handleToggleExtraEditorHelps(message.value).catch(error => console.warn(`Failed to handle ${message.action}`, error));
            break;
        case "toggleExpandEditBoxes":
            if (typeof message.value !== "boolean") {
                console.error("Invalid setting value:", message.value);
                return;
            }
            handleToggleExpandEditBoxes(message.value).catch(error => console.warn(`Failed to handle ${message.action}`, error));
            break;
        case "toggleTableHeaders":
            if (typeof message.value !== "boolean") {
                console.error("Invalid setting value:", message.value);
                return;
            }
            handleToggleTableHeaders(message.value).catch(error => console.warn(`Failed to handle ${message.action}`, error));
            break;
        case "toggleCountModules":
            if (typeof message.value !== "boolean") {
                console.error("Invalid setting value:", message.value);
                return;
            }
            handleToggleCountModules(message.value).catch(error => console.warn(`Failed to handle ${message.action}`, error));
            break;
        case "toggleCanvasFilePath":
            if (typeof message.value !== "boolean") {
                console.error("Invalid setting value:", message.value);
                return;
            }
            handleToggleCanvasFilePath(message.value).catch(error => console.warn(`Failed to handle ${message.action}`, error));
            break;
        case "changeH5PLanguage":
            if (typeof message.value !== "string") {
                console.error("Invalid H5P language:", message.value);
                return;
            }
            handleChangeH5PLanguage(message.value).catch(error => console.warn(`Failed to handle ${message.action}`, error));
            break;
    }
});

// Send a message to update the color of an input
async function changeInputStyle(type, id, newValue) {
    try {
        await chrome.runtime.sendMessage({
            action: type,
            id: id,
            value: newValue
        });
    } catch (error) {
        console.warn("Unable to change input style:", error);
    }
}

// Reply with all settings to initialize the UI
async function loadAllSettings() {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const currentSettings = {};
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
        if (["a11yAltText", "a11yIframes", "a11yHeadings", "a11yContrast", "a11yLang", "a11yTables"].includes(key)) {
            currentSettings[key] = await getA11ySetting(key);
        } else {
            try {
                currentSettings[key] = await getSetting(key);
            } catch (error) {
                currentSettings[key] = DEFAULT_SETTINGS[key];
                console.warn(`Unable to get ${key} setting:`, error);
            }
        }
    }
    var runtimeSettings;
    try {
        runtimeSettings = await chrome.tabs.sendMessage(tab.id, { action: "getRuntimeSettings" });
    } catch {
        runtimeSettings = {
            countTables: false,
            countIframes: false,
            countParagraphs: false,
            contrastInspector: false,
        };
    }
    return {...currentSettings, ...runtimeSettings};
}

// Helpers for interacting with autoA11yTools.js in case of runtime settings
const keyToColor = {
    "a11yAltText": "toggleImageOverlays",
    "a11yIframes": "toggleIframeOverlays",
    "a11yHeadings": "toggleHeadingOverlays",
    "a11yContrast": "toggleContrastHighlights",
    "a11yLang": "toggleLangTagHighlights",
    "a11yTables": "toggleTableOverlays"
}

const a11yKeys = ["a11yAltText", "a11yIframes", "a11yHeadings", "a11yContrast", "a11yLang", "a11yTables"];

async function setA11ySetting(key, value) {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    await chrome.tabs.sendMessage(tab.id, { action: "toggleTool", key: key, value: value});
}

async function getA11ySetting(key) {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    try {
        const foundSetting = await chrome.tabs.sendMessage(tab.id, { action: "getA11ySetting", value: key });
        return foundSetting ?? false;
    } catch (error) {
        console.warn(`Unable to get ${key} from current page:`, error);
        return false;
    }
}

// Queue logic for handling multiple keyboard commands
let commandQueue = Promise.resolve();
function enqueueCommand(command) {
    const result = commandQueue.then(command);
    commandQueue = result.catch(error => {
        console.warn("Queued command failed:", error);
    });
    return result;
}

async function toggleAllFrames(action, tabId, shouldIncludeFrame) {
    const frames = await chrome.webNavigation.getAllFrames({ tabId }) ?? [];
    const targetFrames = frames.filter(frame => frame.url && shouldIncludeFrame(frame.url));
    const results = await Promise.allSettled(
        targetFrames.map(({ frameId }) => 
            Promise.resolve().then(async () => {
                const response = await chrome.tabs.sendMessage(tabId, { action }, { frameId });
                if (response !== true) {
                    throw new Error(`Frame returned ${String(response)}`);
                }
                return frameId;
            })
        )
    );
    results.forEach((result, index) => {
        const frameId = targetFrames[index].frameId;
        if (result.status === "rejected") {
            console.warn(`Frame ${frameId} did not complete ${action}:`, result.reason);
        }
    });
    return results;
}

async function performToggleAll(action, tabId) {
    if (tabId == null) {
        return;
    }
    const a11yScript = USERSCRIPTS.find(script => script.file === "userscripts/autoA11yTools.bundle.js");
    if (!a11yScript) {
        console.warn("Could not find the a11y script configuration.");
        return;
    }
    await Promise.all(
        a11yKeys.map(async key => {
            await changeInputStyle("buttonColorChange", keyToColor[key], "loading");
        })
    );
    try {
        await toggleAllFrames(action, tabId, url => a11yScript.matches(url));
    } catch (error) {
        console.warn("Could not toggle all frames:", error);
    } finally {
        await Promise.all(
            a11yKeys.map(async key => {
                const enabled = await getA11ySetting(key);
                await changeInputStyle("buttonColorChange", keyToColor[key], enabled);
            })
        );
    }
}

async function performToggleDropdowns(action, tabId) {
    if (tabId == null) {
        return;
    }
    const dropdownScript = USERSCRIPTS.find(script => script.file === "userscripts/dropdownControlTool.js");
    if (!dropdownScript) {
        console.warn("Could not find the dropdown script configuration.");
        return;
    }
    try {
        await toggleAllFrames(action, tabId, url => dropdownScript.matches(url));
    } catch (error) {
        console.warn("Could not toggle all dropdowns:", error);
    }
}

// Handlers with logic for each button (update settings, input style, and interact with userscripts)
async function handleToggleAll(toggleType, sender) {
    let action;
    if (toggleType === "activateAllA11yTools") {
        action = "activateAll";
    } else if (toggleType === "deactivateAllA11yTools") {
        action = "deactivateAll";
    } else {
        return Promise.resolve();
    }
    let tabId = sender.tab?.id;
    if (tabId == null) {
        try {
            const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
            tabId = tab?.id ?? null;
        } catch (error) {
            console.warn(`Could not find the active tab:`, error);
            return;
        }
    }
    return enqueueCommand(() => performToggleAll(action, tabId));
}

function handleToggleDropdowns(toggleType, tabId) {
    let action;
    if (toggleType === "expandAllDropdowns") {
        action = "expandAll";
    } else if (toggleType === "collapseAllDropdowns") {
        action = "collapseAll";
    } else {
        return Promise.resolve();
    }
    return enqueueCommand(() => performToggleDropdowns(action, tabId));
}

async function handleToggleImageOverlays() {
    await changeInputStyle("buttonColorChange", "toggleImageOverlays", "loading");
    const current = await getA11ySetting("a11yAltText");
    const newVal = !current;
    try {
        await setA11ySetting("a11yAltText", newVal);
    } catch (error) {
        console.warn("Unable to update a11yAltText on current page:", error);
    } finally {
        const actual = await getA11ySetting("a11yAltText");
        await changeInputStyle("buttonColorChange", "toggleImageOverlays", actual);
    }
}

async function handleToggleIframeOverlays() {
    await changeInputStyle("buttonColorChange", "toggleIframeOverlays", "loading");
    const current = await getA11ySetting("a11yIframes");
    const newVal = !current;
    try {
        await setA11ySetting("a11yIframes", newVal);
    } catch (error) {
        console.warn("Unable to update a11yIframes on current page:", error);
    } finally {
        const actual = await getA11ySetting("a11yIframes");
        await changeInputStyle("buttonColorChange", "toggleIframeOverlays", actual);
    }
}

async function handleToggleHeadingOverlays() {
    await changeInputStyle("buttonColorChange", "toggleHeadingOverlays", "loading");
    const current = await getA11ySetting("a11yHeadings");
    const newVal = !current;
    try {
        await setA11ySetting("a11yHeadings", newVal);
    } catch (error) {
        console.warn("Unable to update a11yHeadings on current page:", error);
    } finally {
        const actual = await getA11ySetting("a11yHeadings");
        await changeInputStyle("buttonColorChange", "toggleHeadingOverlays", actual);
    }
}

async function handleToggleTableOverlays() {
    await changeInputStyle("buttonColorChange", "toggleTableOverlays", "loading");
    const current = await getA11ySetting("a11yTables");
    const newVal = !current;
    try {
        await setA11ySetting("a11yTables", newVal);
    } catch (error) {
        console.warn("Unable to update a11yTables on current page:", error);
    } finally {
        const actual = await getA11ySetting("a11yTables");
        await changeInputStyle("buttonColorChange", "toggleTableOverlays", actual);
    }
}

async function handleToggleContrastHighlights() {
    await changeInputStyle("buttonColorChange", "toggleContrastHighlights", "loading");
    const current = await getA11ySetting("a11yContrast");
    const newVal = !current;
    try {
        await setA11ySetting("a11yContrast", newVal);
    } catch (error) {
        console.warn("Unable to update a11yContrast on current page:", error);
    } finally {
        const actual = await getA11ySetting("a11yContrast");
        await changeInputStyle("buttonColorChange", "toggleContrastHighlights", actual);
    }
}

async function handleToggleLangTagHighlights() {
    await changeInputStyle("buttonColorChange", "toggleLangTagHighlights", "loading");
    const current = await getA11ySetting("a11yLang");
    const newVal = !current;
    try {
        await setA11ySetting("a11yLang", newVal);
    } catch (error) {
        console.warn("Unable to update a11yLang on current page:", error);
    } finally {
        const actual = await getA11ySetting("a11yLang");
        await changeInputStyle("buttonColorChange", "toggleLangTagHighlights", actual);
    }
}

async function handleToggleTableCounting(tries = 0) {
    await changeInputStyle("buttonColorChange", "toggleTableCounting", "loading");
    const current = await getSettingRuntime("countTables");
    if (current === null) {
        setTimeout(async function() {
            if (!popupOpen || tries >= 5) {
                await changeInputStyle("buttonColorChange", "toggleTableCounting", false);
                return;
            }
            handleToggleTableCounting(tries + 1).catch(error => console.warn(`Failed toggle table counting retry ${tries + 1}:`, error));
        }, HANDLE_RETRY_DELAY);
        return;
    }
    const newVal = !current;
    let successfullySet = false;
    try {
        const setResponse = await setSettingRuntime("countTables", newVal);
        if (!setResponse) {
            return;
        }
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        await chrome.tabs.sendMessage(tab.id, { action: "toggleCounting", key: "table", value: newVal });
        successfullySet = true;
    } catch (error) {
        console.warn("Unable to update countTables on current page:", error);
    } finally {
        let actual = await getSettingRuntime("countTables");
        if (actual === null) {
            actual = successfullySet ? newVal : current;
        }
        await changeInputStyle("buttonColorChange", "toggleTableCounting", actual);
    }
}

async function handleToggleIframeCounting(tries = 0) {
    await changeInputStyle("buttonColorChange", "toggleIframeCounting", "loading");
    const current = await getSettingRuntime("countIframes");
    if (current === null) {
        setTimeout(async function() {
            if (!popupOpen || tries >= 5) {
                await changeInputStyle("buttonColorChange", "toggleIframeCounting", false);
                return;
            }
            handleToggleIframeCounting(tries + 1).catch(error => console.warn(`Failed toggle iframe counting retry ${tries + 1}:`, error));
        }, HANDLE_RETRY_DELAY);
        return;
    }
    const newVal = !current;
    let successfullySet = false;
    try {
        const setResponse = await setSettingRuntime("countIframes", newVal);
        if (!setResponse) {
            return;
        }
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        await chrome.tabs.sendMessage(tab.id, { action: "toggleCounting", key: "iframe", value: newVal });
        successfullySet = true;
    } catch (error) {
        console.warn("Unable to update countIframes on current page:", error);
    } finally {
        let actual = await getSettingRuntime("countIframes");
        if (actual === null) {
            actual = successfullySet ? newVal : current;
        }
        await changeInputStyle("buttonColorChange", "toggleIframeCounting", actual);
    }
}

async function handleToggleParagraphCounting(tries = 0) {
    await changeInputStyle("buttonColorChange", "toggleParagraphCounting", "loading");
    const current = await getSettingRuntime("countParagraphs");
    if (current === null) {
        setTimeout(async function() {
            if (!popupOpen || tries >= 5) {
                await changeInputStyle("buttonColorChange", "toggleParagraphCounting", false);
                return;
            }
            handleToggleParagraphCounting(tries + 1).catch(error => console.warn(`Failed toggle paragraph counting retry ${tries + 1}:`, error));
        }, HANDLE_RETRY_DELAY);
        return;
    }
    const newVal = !current;
    let successfullySet = false;
    try {
        const setResponse = await setSettingRuntime("countParagraphs", newVal);
        if (!setResponse) {
            return;
        }
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        await chrome.tabs.sendMessage(tab.id, { action: "toggleCounting", key: "p", value: newVal });
        successfullySet = true;
    } catch (error) {
        console.warn("Unable to update countParagraphs on current page:", error);
    } finally {
        let actual = await getSettingRuntime("countParagraphs");
        if (actual === null) {
            actual = successfullySet ? newVal : current;
        }
        await changeInputStyle("buttonColorChange", "toggleParagraphCounting", actual);
    }
}

async function handleToggleDefaultEditor() {
    await changeInputStyle("buttonColorChange", "toggleDefaultEditor", "loading");
    let current;
    try {
        current = await getSetting("defaultEditor");
    } catch {
        setTimeout(function() {
            if (!popupOpen) {
                return;
            }
            handleToggleDefaultEditor().catch(error => console.warn(`Failed toggle default editor counting retry ${tries + 1}:`, error));
        }, HANDLE_RETRY_DELAY);
        return;
    }
    const newVal = !current;
    let successfullySet = false;
    try {
        await setSetting("defaultEditor", newVal);
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        await chrome.tabs.sendMessage(tab.id, { action: "toggleDefaultEditor", value: newVal });
        successfullySet = true;
    } catch (error) {
        console.warn("Unable to toggle default editor on current page:", error);
    } finally {
        let actual;
        try {
            actual = await getSetting("defaultEditor");
        } catch {
            actual = successfullySet ? newVal : current;
        } finally {
            await changeInputStyle("buttonColorChange", "toggleDefaultEditor", actual);
        }
    }
}

async function handleToggleDefaultDropdownMenus() {
    await changeInputStyle("buttonColorChange", "toggleDefaultDropdownMenus", "loading");
    let current;
    try {
        current = await getSetting("defaultDropdownMenus");
    } catch {
        setTimeout(function() {
            if (!popupOpen) {
                return;
            }
            handleToggleDefaultDropdownMenus().catch(error => console.warn("Failed toggle default dropdown menus retry:", error));
        }, HANDLE_RETRY_DELAY);
        return;
    }
    const newVal = !current;
    let successfullySet = false;
    try {
        await setSetting("defaultDropdownMenus", newVal);
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        await chrome.tabs.sendMessage(tab.id, { action: "toggleDefaultDropdownMenus", value: newVal });
        successfullySet = true;
    } catch (error) {
        console.warn("Unable to toggle default dropdown menus on current page:", error);
    } finally {
        let actual;
        try {
            actual = await getSetting("defaultDropdownMenus");
        } catch {
            actual = successfullySet ? newVal : current;
        }
        await changeInputStyle("buttonColorChange", "toggleDefaultDropdownMenus", actual);
    }
    
}

async function handleToggleContrastInspector(tries = 0) {
    await changeInputStyle("buttonColorChange", "toggleContrastInspector", "loading");
    const current = await getSettingRuntime("contrastInspector");
    if (current === null) {
        setTimeout(async function() {
            if (!popupOpen || tries >= 5) {
                await changeInputStyle("buttonColorChange", "toggleContrastInspector", false);
                return;
            }
            handleToggleContrastInspector(tries + 1).catch(error => console.warn(`Failed toggle contrast inspector retry ${tries + 1}:`, error));
        }, HANDLE_RETRY_DELAY);
        return;
    }
    const newVal = !current;
    let successfullySet = false;
    try {
        const setResponse = await setSettingRuntime("contrastInspector", newVal);
        if (!setResponse) {
            return;
        }
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        await chrome.tabs.sendMessage(tab.id, { action: "toggleContrastInspector", value: newVal });
        successfullySet = true;
    } catch (error) {
        console.warn("Unable to update contrastInspector on current page:", error);
    } finally {
        let actual = await getSettingRuntime("contrastInspector");
        if (actual === null) {
            actual = successfullySet ? newVal : current;
        }
        await changeInputStyle("buttonColorChange", "toggleContrastInspector", actual);
        try {
            await chrome.runtime.sendMessage({ action: "closePopup" });
        } catch (error) {
            console.warn("Unable to close popup:", error);
        }
    }
}

async function handleDownloadSLAFiles() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        const currentUrl = tab?.url || "";
        if (USERSCRIPTS.find(script => script.file === "userscripts/downloadSLASpreadsheets.js")?.matches(currentUrl)) {
            await chrome.tabs.sendMessage(tab.id, { action: "downloadSLAFiles" });
        } else {
            await chrome.tabs.sendMessage(tab.id, { action: "createAlert", value: "Please navigate to Teamwork to run this tool." });
        }
    } catch (error) {
        console.warn("Unable to download SLA files on current page:", error);
    } finally {
        try {
            await chrome.runtime.sendMessage({ action: "closePopup" });
        } catch (error) {
            console.warn("Unable to close popup:", error);
        }
    }
}

async function handleToggleAlwaysRun(value) {
    try {
        await setSetting("alwaysRun", value);
        await changeInputStyle("toggleColorChange", "toggleAlwaysRun", value);
    } catch (error) {
        console.warn("Unable to update alwaysRun setting:", error);
    }
}

async function handleToggleA11yHotkeys(value) {
    try {
        await setSetting("a11yHotkeys", value);
        await changeInputStyle("toggleColorChange", "toggleA11yHotkeys", value);
    } catch (error) {
        console.warn("Unable to update a11yHotkeys setting:", error);
    }
}

async function handleToggleDropdownHotkeys(value) {
    try {
        await setSetting("dropdownHotkeys", value);
        await changeInputStyle("toggleColorChange", "toggleDropdownHotkeys", value);
    } catch (error) {
        console.warn("Unable to update dropdownHotkeys setting:", error);
    }
}

async function handleToggleH5PHotkeys(value) {
    try {
        await setSetting("h5pHotkeys", value);
        await changeInputStyle("toggleColorChange", "toggleH5PHotkeys", value);
    } catch (error) {
        console.warn("Unable to update h5pHotkeys setting:", error);
    }
}

async function handleToggleEditorHighlights(value) {
    try {
        await setSetting("editorHighlights", value);
        await changeInputStyle("toggleColorChange", "toggleEditorHighlights", value);
    } catch (error) {
        console.warn("Unable to update editorHighlights setting:", error);
    }
}

async function handleToggleExtraEditorHelps(value) {
    try {
        await setSetting("extraEditorHelps", value);
        await changeInputStyle("toggleColorChange", "toggleExtraEditorHelps", value);
    } catch (error) {
        console.warn("Unable to update extraEditorHelps setting:", error);
    }
}

async function handleToggleExpandEditBoxes(value) {
    try {
        await setSetting("expandEditBoxes", value);
        await changeInputStyle("toggleColorChange", "toggleExpandEditBoxes", value);
    } catch (error) {
        console.warn("Unable to update expandEditBoxes setting:", error);
    }
}

async function handleToggleTableHeaders(value) {
    try {
        await setSetting("tableHeaders", value);
        await changeInputStyle("toggleColorChange", "toggleTableHeaders", value);
    } catch (error) {
        console.warn("Unable to update tableHeaders setting:", error);
    }
}

async function handleToggleCountModules(value) {
    try {
        await setSetting("countModules", value);
        await changeInputStyle("toggleColorChange", "toggleCountModules", value);
    } catch (error) {
        console.warn("Unable to update countModules setting:", error);
    }
}

async function handleToggleCanvasFilePath(value) {
    try {
        await setSetting("canvasFilePath", value);
        await changeInputStyle("toggleColorChange", "toggleCanvasFilePath", value);
    } catch (error) {
        console.warn("Unable to update canvasFilePath setting:", error);
    }
}

async function handleChangeH5PLanguage(value) {
    try {
        await setSetting("h5pLanguage", value);
        await changeInputStyle("inputValueChange", "changeH5PLanguage", value);
    } catch (error) {
        console.warn("Unable to update h5pLanguage setting:", error);
    }
}
