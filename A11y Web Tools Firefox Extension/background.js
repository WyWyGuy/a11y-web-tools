import * as ort from "./ort/ort.wasm.min.mjs";

ort.env.wasm.wasmPaths = {
    mjs: chrome.runtime.getURL("ort/ort-wasm-simd-threaded.mjs"),
    wasm: chrome.runtime.getURL("ort/ort-wasm-simd-threaded.wasm")
};

const modelUrl = chrome.runtime.getURL("language_model_compact.onnx");

let langSessionPromise = null;

async function getSession() {
    if (!langSessionPromise) {
        langSessionPromise = ort.InferenceSession.create(modelUrl);
    }
    return await langSessionPromise;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action !== "runLanguageModel") {
        return;
    }
    (async () => {
        try {
            const text = message.value;
            const langSession = await getSession();
            const inputName = langSession.inputNames[0];
            const inputTensor = new ort.Tensor(
                "string",
                [text],
                [1, 1]
            );
            const results = await langSession.run({
                [inputName]: inputTensor
            });
            const language = results.label.data[0];
            const probabilities = Array.from(results.probabilities.data);
            const confidence = Math.max(...probabilities);
            sendResponse({
                success: true,
                language,
                confidence,
                probabilities
            });
        } catch (error) {
            sendResponse({
                success: false,
                error: error.message
            });
        }
    })();
    return true;
});

async function setSetting(key, value) {
    await chrome.storage.local.set({ [key]: value });
}

async function getSetting(key) {
    const defaultValue = DEFAULT_SETTINGS[key];
    const result = await chrome.storage.local.get({ [key]: defaultValue });
    return result[key];
}

async function setSettingLocal(k, val) {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        await chrome.tabs.sendMessage(tab.id, { action: "setSettingLocal", key: k, value: val });
        return true;
    } catch {
        return false;
    }
}

async function getSettingLocal(k) {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        return await chrome.tabs.sendMessage(tab.id, { action: "getSettingLocal", key: k});
    } catch {
        return false;
    }
}

const DEFAULT_SETTINGS = {
    a11yAltText: true,
    a11yIframes: true,
    a11yHeadings: true,
    a11yContrast: true,
    a11yLang: true,
    a11yTables: true,
    defaultEditor: true,
    defaultDropdownMenus: true,
    alwaysRun: false,
    a11yHotkeys: true,
    dropdownHotkeys: true,
    h5pHotkeys: true,
    editorHighlights: true,
    extraEditorHelps: true,
    expandEditBoxes: true,
    tableHeaders: true,
    countModules: true,
    canvasFilePath: true,
    h5pLanguage: "english",
};

// Userscripts with their matching URL patterns
const USERSCRIPTS = [
    {
        file: "userscripts/autoA11yTools.bundle.js",
        matches: [
            "*://*/*",
            "file:///*"
        ]
    },
    {
        file: "userscripts/canvasFilePathTool.js",
        matches: [
            "https://*.instructure.com/courses/*"
        ]
    },
    {
        file: "userscripts/colorChecker.js",
        matches: [
            "https://*/*"
        ]
    },
    {
        file: "userscripts/downloadSLASpreadsheets.js",
        matches: [
            "https://*.teamwork.com/*"
        ]
    },
    {
        file: "userscripts/dropdownControlTool.js",
        matches: [
            "https://*.instructure.com/courses/*"
        ]
    },
    {
        file: "userscripts/elementCountingTool.js",
        matches: [
            "https://*/*"
        ]
    },
    {
        file: "userscripts/h5pLanguageSelector.js",
        matches: [
            "https://*.h5p.com/*"
        ]
    },
    {
        file: "userscripts/moduleCountingTool.js",
        matches: [
            "https://*.instructure.com/courses/*"
        ]
    },
    {
        file: "userscripts/rawHTMLEditorHelper.js",
        matches: [
            "https://*.instructure.com/courses/*"
        ]
    }
];

// Only inject scripts if they match URL pattern and have settings enabled
async function decideShouldInject(script, url) {
    const matchesURL = script.matches.some(pattern => {
        const regexStr = pattern.replace(/\./g, '\\.').replace(/\*/g, '.*');
        const regex = new RegExp(`^${regexStr}$`);
        return regex.test(url);
    });
    if (!matchesURL) return false;
    if (script.file == "userscripts/moduleCountingTool.js" && await getSetting("countModules") == false) return false;
    if (script.file == "userscripts/canvasFilePathTool.js" && await getSetting("canvasFilePath") == false) return false;
    return true;
}

const injectedTabs = new Map();

// Inject userscripts when the page loads
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status !== "complete" || !tab.url) return;
    const lastUrl = injectedTabs.get(tabId);
    const url = tab.url;
    if (lastUrl === url) return;
    injectedTabs.set(tabId, url); 
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



// Listen for when the user interacts with the popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
        case "loadSettings":
            loadAllSettings().then(sendResponse);
            return true;
        case "getSetting":
            if (message.value in DEFAULT_SETTINGS) {
                getSetting(message.value).then(sendResponse);
            } else {
                getSettingLocal(message.value).then(sendResponse);
            }
            return true;
        case "setSetting":
            if (message.key in DEFAULT_SETTINGS) {
                setSetting(message.key, message.value).then(sendResponse);
            } else {
                setSettingLocal(message.key, message.value).then(sendResponse);
            }
            return true;
        case "activateAllA11yTools":
            handleActivateAll();
            break;
        case "deactivateAllA11yTools":
            handleDeactivateAll();
            break;
        case "toggleImageOverlays":
            handleToggleImageOverlays();
            break;
        case "toggleIframeOverlays":
            handleToggleIframeOverlays();
            break;
        case "toggleHeadingOverlays":
            handleToggleHeadingOverlays();
            break;
        case "toggleTableOverlays":
            handleToggleTableOverlays();
            break;
        case "toggleContrastHighlights":
            handleToggleContrastHighlights();
            break;
        case "toggleLangTagHighlights":
            handleToggleLangTagHighlights();
            break;
        case "toggleTableCounting":
            handleToggleTableCounting();
            break;
        case "toggleIframeCounting":
            handleToggleIframeCounting();
            break;
        case "toggleParagraphCounting":
            handleToggleParagraphCounting();
            break;
        case "toggleDefaultEditor":
            handleToggleDefaultEditor();
            break;
        case "toggleDefaultDropdownMenus":
            handleToggleDefaultDropdownMenus();
            break;
        case "toggleContrastInspector":
            handleToggleContrastInspector();
            break;
        case "downloadSLAFiles":
            handleDownloadSLAFiles();
            break;
        case "toggleAlwaysRun":
            handleToggleAlwaysRun(message.value);
            break;
        case "toggleA11yHotkeys":
            handleToggleA11yHotkeys(message.value);
            break;
        case "toggleDropdownHotkeys":
            handleToggleDropdownHotkeys(message.value);
            break;
        case "toggleH5PHotkeys":
            handleToggleH5PHotkeys(message.value);
            break;
        case "toggleEditorHighlights":
            handleToggleEditorHighlights(message.value);
            break;
        case "toggleExtraEditorHelps":
            handleToggleExtraEditorHelps(message.value);
            break;
        case "toggleExpandEditBoxes":
            handleToggleExpandEditBoxes(message.value);
            break;
        case "toggleTableHeaders":
            handleToggleTableHeaders(message.value);
            break;
        case "toggleCountModules":
            handleToggleCountModules(message.value);
            break;
        case "toggleCanvasFilePath":
            handleToggleCanvasFilePath(message.value);
            break;
        case "changeH5PLanguage":
            handleChangeH5PLanguage(message.value);
            break;
    }
});

// Send a message to update the color of an input
async function changeInputStyle(type, id, newValue) {
    await chrome.runtime.sendMessage({
        action: type,
        id: id,
        value: newValue
    });
}

// Reply with all settings to initialize the UI
async function loadAllSettings() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const currentSettings = {};
    for (const key in DEFAULT_SETTINGS) {
        if (["a11yAltText", "a11yIframes", "a11yHeadings", "a11yContrast", "a11yLang", "a11yTables"].includes(key)) {
            currentSettings[key] = await getA11ySetting(key);
        } else {
            currentSettings[key] = await getSetting(key);
        }
    }
    var localSettings;
    try {
        localSettings = await chrome.tabs.sendMessage(tab.id, { action: "getLocalSettings" });
    } catch {
        localSettings = {
            countTables: false,
            countIframes: false,
            countParagraphs: false,
            contrastInspector: false,
        };
    }
    return {...currentSettings, ...localSettings};
}

// Helpers for interacting with autoA11yTools.js in case of local settings
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
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    try {
        await chrome.tabs.sendMessage(tab.id, { action: "toggleTool", key: key, value: value});
    } catch {
        /* ignore */
    }
}

async function getA11ySetting(key) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    try {
        return await chrome.tabs.sendMessage(tab.id, { action: "getA11ySetting", value: key });
    } catch {
        return false;
    }
}

// Handlers with logic for each button (update settings, input style, and interact with userscripts)
async function handleActivateAll() {
    for (const key of a11yKeys) {
        await changeInputStyle("buttonColorChange", keyToColor[key], "loading");
    }
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    try {
        await chrome.tabs.sendMessage(tab.id, { action: "activateAll" });
    } catch {
        /* ignore */
    } finally {
        for (const key of a11yKeys) {
            const enabled = await getA11ySetting(key);
            await changeInputStyle("buttonColorChange", keyToColor[key], enabled);
        }
    }
}

async function handleDeactivateAll() {
    for (const key of a11yKeys) {
        await changeInputStyle("buttonColorChange", keyToColor[key], "loading");
    }
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    try {
        await chrome.tabs.sendMessage(tab.id, { action: "deactivateAll" });
    } catch {
        /* ignore */
    } finally {
        for (const key of a11yKeys) {
            const enabled = await getA11ySetting(key);
            await changeInputStyle("buttonColorChange", keyToColor[key], enabled);
        }
    }
}

async function handleToggleImageOverlays() {
    await changeInputStyle("buttonColorChange", "toggleImageOverlays", "loading");
    const current = await getA11ySetting("a11yAltText");
    const newVal = !current;
    try {
        await setA11ySetting("a11yAltText", newVal);
    } catch {
        /* ignore */
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
    } catch {
        /* ignore */
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
    } catch {
        /* ignore */
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
    } catch {
        /* ignore */
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
    } catch {
        /* ignore */
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
    } catch {
        /* ignore */
    } finally {
        const actual = await getA11ySetting("a11yLang");
        await changeInputStyle("buttonColorChange", "toggleLangTagHighlights", actual);
    }
}

async function handleToggleTableCounting() {
    await changeInputStyle("buttonColorChange", "toggleTableCounting", "loading");
    const current = await getSettingLocal("countTables");
    const newVal = !current;
    if (await setSettingLocal("countTables", newVal)) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        await chrome.tabs.sendMessage(tab.id, { action: "toggleCounting", key: "table", value: newVal });
        await changeInputStyle("buttonColorChange", "toggleTableCounting", newVal);
    } else {
        await changeInputStyle("buttonColorChange", "toggleTableCounting", current);
    }
}

async function handleToggleIframeCounting() {
    await changeInputStyle("buttonColorChange", "toggleIframeCounting", "loading");
    const current = await getSettingLocal("countIframes");
    const newVal = !current;
    if (await setSettingLocal("countIframes", newVal)) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        await chrome.tabs.sendMessage(tab.id, { action: "toggleCounting", key: "iframe", value: newVal });
        await changeInputStyle("buttonColorChange", "toggleIframeCounting", newVal);
    } else {
        await changeInputStyle("buttonColorChange", "toggleIframeCounting", current);
    }
}

async function handleToggleParagraphCounting() {
    await changeInputStyle("buttonColorChange", "toggleParagraphCounting", "loading");
    const current = await getSettingLocal("countParagraphs");
    const newVal = !current;
    if (await setSettingLocal("countParagraphs", newVal)) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        await chrome.tabs.sendMessage(tab.id, { action: "toggleCounting", key: "p", value: newVal });
        await changeInputStyle("buttonColorChange", "toggleParagraphCounting", newVal);
    } else {
        await changeInputStyle("buttonColorChange", "toggleParagraphCounting", current);
    }
}

async function handleToggleDefaultEditor() {
    await changeInputStyle("buttonColorChange", "toggleDefaultEditor", "loading");
    const current = await getSetting("defaultEditor");
    const newVal = !current;
    await setSetting("defaultEditor", newVal);
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        await chrome.tabs.sendMessage(tab.id, { action: "toggleDefaultEditor", value: newVal });
    } catch {
        /* ignore */
    } finally {
        await changeInputStyle("buttonColorChange", "toggleDefaultEditor", newVal);
    }
}

async function handleToggleDefaultDropdownMenus() {
    await changeInputStyle("buttonColorChange", "toggleDefaultDropdownMenus", "loading");
    const current = await getSetting("defaultDropdownMenus");
    const newVal = !current;
    await setSetting("defaultDropdownMenus", newVal);
    await changeInputStyle("buttonColorChange", "toggleDefaultDropdownMenus", newVal);
}

async function handleToggleContrastInspector() {
    await changeInputStyle("buttonColorChange", "toggleContrastInspector", "loading");
    const current = await getSettingLocal("contrastInspector");
    const newVal = !current;
    if (await setSettingLocal("contrastInspector", newVal)) {
        await changeInputStyle("buttonColorChange", "toggleContrastInspector", newVal);
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        await chrome.tabs.sendMessage(tab.id, { action: "toggleContrastInspector", value: newVal });
        await chrome.runtime.sendMessage({ action: "closePopup" });
    } else {
        await changeInputStyle("buttonColorChange", "toggleContrastInspector", current);
    }
}

async function handleDownloadSLAFiles() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const currentUrl = tab?.url || "";
    const teamworkPattern = /^https:\/\/.*\.teamwork\.com\/.*$/;
    if (teamworkPattern.test(currentUrl)) {
        try {
            await chrome.tabs.sendMessage(tab.id, { action: "downloadSLAFiles" });
        } catch {
            /* ignore */
        }
    } else {
        await chrome.tabs.sendMessage(tab.id, { action: "createAlert", value: "Please navigate to Teamwork to run this tool." });
    }
    await chrome.runtime.sendMessage({ action: "closePopup" });
}

async function handleToggleAlwaysRun(value) {
    await setSetting("alwaysRun", value);
    await changeInputStyle("toggleColorChange", "toggleAlwaysRun", value);
}

async function handleToggleA11yHotkeys(value) {
    await setSetting("a11yHotkeys", value);
    await changeInputStyle("toggleColorChange", "toggleA11yHotkeys", value);
}

async function handleToggleDropdownHotkeys(value) {
    await setSetting("dropdownHotkeys", value);
    await changeInputStyle("toggleColorChange", "toggleDropdownHotkeys", value);
}

async function handleToggleH5PHotkeys(value) {
    await setSetting("h5pHotkeys", value);
    await changeInputStyle("toggleColorChange", "toggleH5PHotkeys", value);
}

async function handleToggleEditorHighlights(value) {
    await setSetting("editorHighlights", value);
    await changeInputStyle("toggleColorChange", "toggleEditorHighlights", value);
}

async function handleToggleExtraEditorHelps(value) {
    await setSetting("extraEditorHelps", value);
    await changeInputStyle("toggleColorChange", "toggleExtraEditorHelps", value);
}

async function handleToggleExpandEditBoxes(value) {
    await setSetting("expandEditBoxes", value);
    await changeInputStyle("toggleColorChange", "toggleExpandEditBoxes", value);
}

async function handleToggleTableHeaders(value) {
    await setSetting("tableHeaders", value);
    await changeInputStyle("toggleColorChange", "toggleTableHeaders", value);
}

async function handleToggleCountModules(value) {
    await setSetting("countModules", value);
    await changeInputStyle("toggleColorChange", "toggleCountModules", value);
}

async function handleToggleCanvasFilePath(value) {
    await setSetting("canvasFilePath", value);
    await changeInputStyle("toggleColorChange", "toggleCanvasFilePath", value);
}

async function handleChangeH5PLanguage(value) {
    await setSetting("h5pLanguage", value);
    await changeInputStyle("inputValueChange", "changeH5PLanguage", value);
}
