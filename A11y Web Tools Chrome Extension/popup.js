POPUP_LOADING_TIMEOUT = 5000;

async function buildSupportEmail() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    const diagnostics = {
        browser: navigator.userAgentData?.brands?.[0]?.brand || "Unknown",
        version: navigator.userAgentData?.brands?.[0]?.version || "Unknown",
        platform: navigator.userAgentData?.platform || navigator.platform || "Unknown",
        ua: navigator.userAgent,
        url: tab?.url || "Unknown",
        timestamp: new Date().toISOString()
    };

    const rawBody = `
Name: 
Reason for Contact: 
Additional Information:


---------------------------
Diagnostics (please do not remove this section)
---------------------------
Browser: ${diagnostics.browser}
Browser Version: ${diagnostics.version}
Platform: ${diagnostics.platform}
User Agent:${diagnostics.ua}
Page URL: ${diagnostics.url}
Timestamp: ${diagnostics.timestamp}
`.trim();

    const body = encodeURIComponent(rawBody);
    const subject = encodeURIComponent("A11y Web Tools Support");
    return `mailto:wywyguychromeextensions@gmail.com?subject=${subject}&body=${body}`;
}

document.addEventListener("DOMContentLoaded", async () => {
    // Wait until the current page is finished loading
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id == null) {
        console.error("No valid tab found.");
        return;
    }
    const timeoutAt = Date.now() + POPUP_LOADING_TIMEOUT;
    while (Date.now() < timeoutAt) {
        const currentTab = await chrome.tabs.get(tab.id);
        if (currentTab.status === "complete") {
            break;
        }
        await new Promise(resolve => setTimeout(resolve, 250));
    }

    await new Promise(resolve => setTimeout(resolve, 250));

    // Lock the body height to ensure additional content in scrolled portion
    document.body.style.maxHeight = document.body.scrollHeight + 'px';

    // Add additional scrollable content
    const container = document.createElement("div");
    const isMac = navigator.userAgentData?.platform === 'macOS' || navigator.userAgent.includes('Mac') || navigator.platform?.includes('Mac');
    const modifierKey = isMac ? 'Cmd' : 'Ctrl';
    const altKey = isMac ? 'Opt' : 'Alt';
    container.innerHTML = `
        <div id="settingsControls">
            <hr class="separator" />

            <h2 class="subTitle">Settings</h2>

            <div class="grid">
                <div class="settingLabel">
                    Run Enabled Tools on <strong>All</strong> Pages
                </div>
                <div>
                    <label class="toggleLabel">
                        <input type="checkbox" id="toggleAlwaysRun" />
                        <span class="toggle"></span>
                    </label>
                </div>

                <div class="settingLabel">
                    Enable Numpad + / - Hotkeys for A11y Tools
                </div>
                <div>
                    <label class="toggleLabel">
                        <input type="checkbox" id="toggleA11yHotkeys" />
                        <span class="toggle"></span>
                    </label>
                </div>

                <div class="settingLabel">
                    Enable ${altKey} + &darr; / &uarr; to Expand/Collapse Dropdowns
                </div>
                <div>
                    <label class="toggleLabel">
                        <input type="checkbox" id="toggleDropdownHotkeys" />
                        <span class="toggle"></span>
                    </label>
                </div>

                <div class="settingLabel">
                    Enable Raw HTML Editor Highlights
                </div>
                <div>
                    <label class="toggleLabel">
                        <input type="checkbox" id="toggleEditorHighlights" />
                        <span class="toggle"></span>
                    </label>
                </div>

                <div class="settingLabel">
                    Enable Additional Raw Editor Toolbar
                </div>
                <div>
                    <label class="toggleLabel">
                        <input type="checkbox" id="toggleExtraEditorHelps" />
                        <span class="toggle"></span>
                    </label>
                </div>

                <div class="settingLabel">
                    Expand Canvas Edit Pages by Default
                </div>
                <div>
                    <label class="toggleLabel">
                        <input type="checkbox" id="toggleExpandEditBoxes" />
                        <span class="toggle"></span>
                    </label>
                </div>

                <div class="settingLabel">
                    Highlight Table Headers
                </div>
                <div>
                    <label class="toggleLabel">
                        <input type="checkbox" id="toggleTableHeaders" />
                        <span class="toggle"></span>
                    </label>
                </div>
                
                <div class="settingLabel">
                    Enable Counting Canvas Modules
                </div>
                <div>
                    <label class="toggleLabel">
                        <input type="checkbox" id="toggleCountModules" />
                        <span class="toggle"></span>
                    </label>
                </div>

                <div class="settingLabel">
                    Enable Canvas File Paths on Hover
                </div>
                <div>
                    <label class="toggleLabel">
                        <input type="checkbox" id="toggleCanvasFilePath" />
                        <span class="toggle"></span>
                    </label>
                </div>

                
                <div class="settingLabel">
                    Enable ${modifierKey} + Q for H5P Language Replacement
                </div>
                <div>
                    <label class="toggleLabel">
                        <input type="checkbox" id="toggleH5PHotkeys" />
                        <span class="toggle"></span>
                    </label>
                </div>

                <div class="settingLabel">
                    Current H5P Language:
                </div>
                <div>
                    <input type="text" class="h5pInput" id="changeH5PLanguage" />
                </div>
            </div>

            <div class="lineBreak"></div>
            <hr class="separator" />

            <div class="footer">
                <div class="footer"><i><a class="supportLink" title="Learn how to use A11y Web Tools" href="help.html?mac=${isMac}" target="_blank">How to Use</a>&nbsp&nbsp&nbsp|&nbsp&nbsp&nbsp<a class="supportLink" title="Contact Wyatt Nilsson" href="#" id="supportLink">Contact</a></i></div>
                <div><i>Version ${chrome.runtime.getManifest().version} &middot; &copy; 2026 Wyatt Nilsson</i></div>
            </div>
        </div>
    `;

    document.body.appendChild(container);
    document.getElementById("supportLink").addEventListener("click", async () => {
        window.location.href = await buildSupportEmail();
    });

    // Add button functionality to send messages to background.js
    const clickActions = [
        "activateAllA11yTools",
        "deactivateAllA11yTools",
        "toggleImageOverlays",
        "toggleIframeOverlays",
        "toggleHeadingOverlays",
        "toggleTableOverlays",
        "toggleContrastHighlights",
        "toggleLangTagHighlights",
        "toggleTableCounting",
        "toggleIframeCounting",
        "toggleParagraphCounting",
        "toggleDefaultEditor",
        "toggleDefaultDropdownMenus",
        "toggleContrastInspector",
        "downloadSLAFiles"
    ];
    clickActions.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener("click", async () => {
            await chrome.runtime.sendMessage({ action: id });
        });
    });
    const changeActions = [
        "toggleAlwaysRun",
        "toggleA11yHotkeys",
        "toggleDropdownHotkeys",
        "toggleH5PHotkeys",
        "toggleEditorHighlights",
        "toggleExtraEditorHelps",
        "toggleExpandEditBoxes",
        "toggleTableHeaders",
        "toggleCountModules",
        "toggleCanvasFilePath",
        "changeH5PLanguage"
    ];
    changeActions.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener("change", async (event) => {
            const value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
            await chrome.runtime.sendMessage({ action: id, value });
        });
    });

    // Load current settings and color inputs accordingly
    chrome.runtime.sendMessage({
        action: "loadSettings"
    }, (settings) => {
            initializeUI(settings);
        }
    );

    function initializeUI(settings) {
        document.getElementById("toggleImageOverlays").classList.toggle("green", settings.a11yAltText);
        document.getElementById("toggleIframeOverlays").classList.toggle("green", settings.a11yIframes);
        document.getElementById("toggleHeadingOverlays").classList.toggle("green", settings.a11yHeadings);
        document.getElementById("toggleTableOverlays").classList.toggle("green", settings.a11yTables);
        document.getElementById("toggleContrastHighlights").classList.toggle("green", settings.a11yContrast);
        document.getElementById("toggleLangTagHighlights").classList.toggle("green", settings.a11yLang);
        document.getElementById("toggleTableCounting").classList.toggle("green", settings.countTables);
        document.getElementById("toggleIframeCounting").classList.toggle("green", settings.countIframes);
        document.getElementById("toggleParagraphCounting").classList.toggle("green", settings.countParagraphs);
        document.getElementById("toggleDefaultEditor").classList.toggle("green", settings.defaultEditor);
        document.getElementById("toggleDefaultDropdownMenus").classList.toggle("green", settings.defaultDropdownMenus);
        document.getElementById("toggleContrastInspector").classList.toggle("green", settings.contrastInspector);
        document.getElementById("toggleAlwaysRun").checked = settings.alwaysRun;
        document.getElementById("toggleA11yHotkeys").checked = settings.a11yHotkeys;
        document.getElementById("toggleDropdownHotkeys").checked = settings.dropdownHotkeys;
        document.getElementById("toggleH5PHotkeys").checked = settings.h5pHotkeys;
        document.getElementById("toggleEditorHighlights").checked = settings.editorHighlights;
        document.getElementById("toggleExtraEditorHelps").checked = settings.extraEditorHelps;
        document.getElementById("toggleExpandEditBoxes").checked = settings.expandEditBoxes;
        document.getElementById("toggleTableHeaders").checked = settings.tableHeaders;
        document.getElementById("toggleCountModules").checked = settings.countModules;
        document.getElementById("toggleCanvasFilePath").checked = settings.canvasFilePath;
        document.getElementById("changeH5PLanguage").value = settings.h5pLanguage;
        document.getElementById("loadingOverlay").remove();
    }

    // Listen for updates to color the UI
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        switch (message.action) {
            case "buttonColorChange":
                const btn = document.getElementById(message.id);
                if (!btn) return;
                if (message.value == "loading") {
                    btn.classList.add("loading");
                    btn.disabled = true;
                } else {
                    btn.classList.remove("loading");
                    btn.disabled = false;
                    
                    btn.classList.toggle("green", message.value);
                }
                break;
            case "toggleColorChange":
                const toggle = document.getElementById(message.id);
                if (!toggle) return;
                toggle.checked = message.value;
                break;
            case "inputValueChange":
                const input = document.getElementById(message.id);
                if (!input) return;
                input.value = message.value;
                break;
            case "closePopup":
                window.close();
                break;
        }
    });

});
