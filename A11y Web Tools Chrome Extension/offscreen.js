import * as ort from "./ort/ort.wasm.min.mjs";

ort.env.wasm.wasmPaths = {
    mjs: chrome.runtime.getURL("ort/ort-wasm-simd-threaded.mjs"),
    wasm: chrome.runtime.getURL("ort/ort-wasm-simd-threaded.wasm")
};

const modelUrl = chrome.runtime.getURL('language_model.onnx');

let langSessionPromise = null;

async function getSession() {
    if (!langSessionPromise) {
        langSessionPromise = ort.InferenceSession.create(modelUrl).catch(error => {
            langSessionPromise = null;
            throw error;
        });
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
            if (typeof text !== "string" || text.trim() === "") {
                sendResponse({
                    success: false,
                    error: "Invalid input"
                });
                return;
            }
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
            if (!results?.label?.data || !results?.probabilities?.data) {
                throw new Error("Language model returned an unexpected result.");
            }
            const language = results.label.data[0];
            const probabilities = Array.from(results.probabilities.data);
            if (probabilities.length === 0) {
                throw new Error("Language model returned no probabilities.");
            }
            const confidence = Math.max(...probabilities);
            sendResponse({
                success: true,
                language,
                confidence,
                probabilities
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            sendResponse({
                success: false,
                error: errorMessage
            });
        }
    })();
    return true;
});