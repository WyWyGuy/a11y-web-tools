const LOCAL_SETTINGS = {
    countTables: false,
    countIframes: false,
    countParagraphs: false,
    contrastInspector: false,
}

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
        zIndex: "10000",
        opacity: "0",
        transition: "opacity 0.3s ease",
        pointerEvents: "none"
    });

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
        case "getLocalSettings":
            sendResponse({ ...LOCAL_SETTINGS });
            break;
        case "setSettingLocal":
            LOCAL_SETTINGS[msg.key] = msg.value;
            break;
        case "getSettingLocal":
            sendResponse(LOCAL_SETTINGS[msg.key]);
            break;
        case "createAlert":
            customAlert(msg.value);
            break;
    }
});
