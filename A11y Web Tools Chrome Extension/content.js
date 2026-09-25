const RUNTIME_SETTINGS = {
    countTables: false,
    countIframes: false,
    countParagraphs: false,
    contrastInspector: false
}

const RUNTIME_SETTING_KEYS = new Set(Object.keys(RUNTIME_SETTINGS));

function customAlert(text) {
    const toast = document.createElement("div");
    toast.textContent = text;

    Object.assign(toast.style, {
        position: "fixed",
        top: "40px",
        left: "50%",
        transform: "translateX(-50%)",
        background: "rgba(117, 220, 238, 0.85)",
        color: "#000",
        padding: "16px 24px",
        borderRadius: "8px",
        fontSize: "18px",
        fontFamily: "sans-serif",
        textAlign: "center",
        maxWidth: "500px",
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.25)",
        zIndex: "999999999",
        opacity: "0",
        transition: "opacity 0.3s ease",
        pointerEvents: "none"
    });

    if (!document.body) {
        console.error("Unable to create alert: document body is unavailable.");
        return;
    }

    document.body.appendChild(toast);

    requestAnimationFrame(() => {
        toast.style.opacity = "1";
    });

    setTimeout(() => {
        toast.style.opacity = "0";
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    switch (msg.action) {
        case "getRuntimeSettings":
            sendResponse({ ...RUNTIME_SETTINGS });
            break;
        case "setSettingRuntime":
            if (!RUNTIME_SETTING_KEYS.has(msg.key)) {
                sendResponse({ success: false, error: "Invalid runtime setting key." });
                return;
            }
            if (typeof msg.value !== "boolean") {
                sendResponse({ success: false, error: "Invalid setting value." });
                return;
            }
            RUNTIME_SETTINGS[msg.key] = msg.value;
            sendResponse({ success: true });
            break;
        case "getSettingRuntime":
            if (!RUNTIME_SETTING_KEYS.has(msg.key)) {
                console.error("Invalid runtime setting:", msg.key);
                return;
            }
            sendResponse(RUNTIME_SETTINGS[msg.key]);
            break;
        case "createAlert":
            if (typeof msg.value !== "string") {
                console.error("Invalid alert text.");
                return;
            }
            customAlert(msg.value);
            break;
    }
});
