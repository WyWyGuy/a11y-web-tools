import shutil
import os
import json
import subprocess
import zipfile

base = os.path.dirname(os.path.abspath(__file__))
chrome_src = os.path.join(base, "A11y Web Tools Chrome Extension")
firefox_src = os.path.join(base, "A11y Web Tools Firefox Extension")

programs_dir = os.path.dirname(base)
node_dir = os.path.join(programs_dir, "NodeJS")
npx_path = os.path.join(node_dir, "npx.cmd")

chrome_zip = os.path.join(
    base,
    "chrome.zip"
)
firefox_zip = os.path.join(
    base,
    "firefox.zip"
)

env = os.environ.copy()
env["PATH"] = node_dir + os.pathsep + env.get("PATH", "")

# Re-bundle the Chrome userscript
subprocess.run(
    [
        npx_path,
        "esbuild",
        "userscripts/autoA11yTools.js",
        "--bundle",
        "--outfile=userscripts/autoA11yTools.bundle.js"
    ],
    cwd=chrome_src,
    env=env,
    check=True
)

# Copy Chrome project to Firefox
if os.path.exists(firefox_src):
    shutil.rmtree(firefox_src)
shutil.copytree(chrome_src, firefox_src)

# Modify the Firefox manifest
manifest_path = os.path.join(firefox_src, "manifest.json")
with open(manifest_path, "r") as f:
    manifest = json.load(f)
manifest["background"] = {
    "scripts": ["background.js"],
    "type": "module"
}
manifest["permissions"] = [
    p for p in manifest.get("permissions", []) if p != "offscreen"
]
manifest["browser_specific_settings"] = {
    "gecko": {
        "id": "wywyguyfirefoxextensions@gmail.com",
        "strict_min_version": "109.0",
        "data_collection_permissions": {
            "required": ["none"]
        }
    }
}
for resource_group in manifest.get("web_accessible_resources", []):
    resource_group["resources"] = [
        "language_model_compact.onnx"
        if resource == "language_model.onnx"
        else resource
        for resource in resource_group.get("resources", [])
    ]
with open(manifest_path, "w", encoding="utf-8") as f:
    json.dump(manifest, f, indent=2)

# Remove offscreen files from Firefox
for filename in ["offscreen.js", "offscreen.html", "language_model.onnx"]:
    path = os.path.join(firefox_src, filename)
    if os.path.exists(path):
        os.remove(path)

# Remove offscreen logic from background.js for Firefox
background_js_path = os.path.join(firefox_src, "background.js")
with open(background_js_path, "r", encoding="utf-8") as f:
    background_js = f.read()
offscreen_start = background_js.find("// Function to load the offscreen document")
if offscreen_start != -1:
    offscreen_call = background_js.find("ensureOffscreenDocument();", offscreen_start)
    if offscreen_call != -1:
        offscreen_end = offscreen_call + len("ensureOffscreenDocument();")
        background_js = (background_js[:offscreen_start] + background_js[offscreen_end:])

# Make background.js work like offscreen did for Firefox
firefox_model_code = r'''
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
'''
background_js = firefox_model_code.strip() + "\n\n" + background_js
with open(background_js_path, "w", encoding="utf-8") as f:
    f.write(background_js)

# Update Firefox support email in popup.js
popup_js_path = os.path.join(firefox_src, "popup.js")
with open(popup_js_path, "r", encoding="utf-8") as f:
    popup_js = f.read()
popup_js = popup_js.replace(
    "wywyguychromeextensions@gmail.com",
    "wywyguyfirefoxextensions@gmail.com"
)
with open(popup_js_path, "w", encoding="utf-8") as f:
    f.write(popup_js)

# Create ZIP files while excluding development files
def zip_project(source_dir, zip_path, excluded_files=None):
    if excluded_files is None:
        excluded_files = set()
    excluded_files = {
        *excluded_files,
        "package.json",
        "package-lock.json"
    }
    excluded_dirs = {
        "node_modules"
    }
    with zipfile.ZipFile(
        zip_path,
        "w",
        zipfile.ZIP_DEFLATED
    ) as zip_file:
        for root, dirs, files in os.walk(source_dir):
            # Prevent walking into excluded directories.
            dirs[:] = [
                d for d in dirs
                if d not in excluded_dirs
            ]
            for file in files:
                if file in excluded_files:
                    continue
                full_path = os.path.join(root, file)
                # Path inside ZIP relative to project root.
                arcname = os.path.relpath(
                    full_path,
                    source_dir
                )
                zip_file.write(
                    full_path,
                    arcname
                )

zip_project(
    chrome_src,
    chrome_zip,
    excluded_files={"language_model_compact.onnx"}
)
zip_project(
    firefox_src,
    firefox_zip
)