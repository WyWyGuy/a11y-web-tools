(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __commonJS = (cb, mod) => function __require() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e) {
      throw mod = 0, e;
    }
  };

  // userscripts/autoA11yTools.js
  var require_autoA11yTools = __commonJS({
    "userscripts/autoA11yTools.js"() {
      (async () => {
        "use strict";
        if (window.top !== window.self) return;
        const LANGUAGE_MODEL_CHARACTER_THRESHOLD = 20;
        const LANGUAGE_MODEL_CONFIDENCE_THRESHOLD = 0.9;
        const languageCache = /* @__PURE__ */ new Map();
        const DICT_URL = "https://raw.githubusercontent.com/WyWyGuy/tampermonkey-a11y-tools/refs/heads/main/englishWords.txt";
        async function loadDictionary() {
          const response = await fetch(DICT_URL);
          if (response.ok) return await response.text();
        }
        const dictText = await loadDictionary();
        if (!dictText) {
          console.error("A11y dictionary not loaded.");
        }
        const englishWords = new Set(
          dictText.split("\n").map((w) => w.trim().toLowerCase()).filter(Boolean)
        );
        const autoRunDomains = [
          ".instructure.com"
        ];
        const excludedPaths = [
          /^https:\/\/[^/]+\.instructure\.com\/courses\/1026(\/|$)/,
          // Training course
          /^https:\/\/[^/]+\.instructure\.com\/courses\/\d+\/modules$/,
          // Any course's modules page
          /^https:\/\/[^/]+\.instructure\.com\/courses\/\d+\/(pages|assignments|quizzes)\/[^/]+\/edit(?:[?#].*)?$/,
          // Any course's edit view
          /^https:\/\/[^/]+\.instructure\.com\/courses\/\d+\/files(?:\/.*|\?.*)?$/,
          // Any course's files page or subfolder
          /^https:\/\/[^/]+\.instructure\.com\/courses\/?$/,
          // Canvas courses page
          /^https:\/\/[^/]+\.instructure\.com\/?$/,
          // Canvas main page
          /^https:\/\/[^/]+\.instructure\.com\/calendar(?:\/.*|[#?].*)?$/,
          // Canvas calendar page
          /^https:\/\/[^/]+\.instructure\.com\/conversations(?:\/.*|[#?].*)?$/,
          // Canvas inbox page
          /^https:\/\/[^/]+\.instructure\.com\/courses\/\d+\/?$/,
          // Any course's home page
          /^https:\/\/[^/]+\.instructure\.com\/profile\/settings(?:[/?#].*)?$/
          // Canvas settings page
        ];
        async function setAutoRun() {
          const alwaysRunSetting = await getSetting("alwaysRun");
          const currentHost = window.location.hostname;
          const isAutoRunDomain = autoRunDomains.some((domain) => currentHost.endsWith(domain));
          const isExcludedPage = excludedPaths.some((pattern) => pattern.test(window.location.href));
          return isAutoRunDomain && !isExcludedPage || alwaysRunSetting;
        }
        let shouldAutoRun = await setAutoRun();
        const TOOLS = {
          HEADING: {
            id: "heading",
            label: "Heading Tags",
            key: "a11yHeadings",
            run: runHeadingTagOverlay,
            remove: removeHeadingTagOverlay
          },
          IMG: {
            id: "img",
            label: "Image Alt Text",
            key: "a11yAltText",
            run: runImageAltOverlay,
            remove: removeImageAltOverlay
          },
          IFRAME: {
            id: "iframe",
            label: "Iframe Labels",
            key: "a11yIframes",
            run: runIframeLabelOverlay,
            remove: removeIframeLabelOverlay
          },
          TABLE: {
            id: "table",
            label: "Table Problems",
            key: "a11yTables",
            run: runTableOverlay,
            remove: removeTableOverlay
          },
          /*
          IB: {
              id: "ib",
              label: "<i>/<b> Usage",
              key: "a11yIBTags",
              run: runIBTagHighlights,
              remove: removeIBTagHighlights
          },
          */
          CONTRAST: {
            id: "contrast",
            label: "Contrast Issues",
            key: "a11yContrast",
            run: runContrastHighlights,
            remove: removeContrastHighlights
          },
          LANG: {
            id: "lang",
            label: "Lang Attributes",
            key: "a11yLang",
            run: runLangHighlights,
            remove: removeLangHighlights
          }
        };
        let tempToolStates = {};
        for (const tool of Object.values(TOOLS)) {
          tempToolStates[tool.key] = false;
          shouldAutoRun = await setAutoRun();
          if (shouldAutoRun) {
            const globallyActivated = await getSetting(tool.key);
            tempToolStates[tool.key] = globallyActivated;
          }
        }
        function ensureGlobalStyles() {
          if (document.getElementById("a11y-overlay-styles")) return;
          const style = document.createElement("style");
          style.id = "a11y-overlay-styles";
          style.textContent = `
      .AccessibilityHelper { font-family: Arial, Helvetica, sans-serif; }
      .A11y-img-label { position: absolute; background: #FFF; border: 3px solid #CCC; border-radius: 7px; padding: 5px; text-align: left; white-space: pre-wrap; font-size: 12px; width: 150px; z-index: 9994; color: black; display: none; transition: all 0.2s ease; }
      .A11y-img-border { position: absolute; border: 3px solid #CCC; border-radius: 7px; z-index: 9993; display: none; pointer-events: none; transition: border-color 0.2s ease, box-shadow 0.2s ease; }
      .A11y-iframe-label { position: absolute; background: #FFF; border: 3px solid #CCC; border-radius: 7px; padding: 5px; text-align: left; white-space: pre-wrap; font-size: 12px; width: 300px; z-index: 9994; color: black; display: none; transition: all 0.2s ease; }
      .A11y-iframe-border { position: absolute; border: 3px solid #CCC; border-radius: 7px; z-index: 9993; display: none; pointer-events: none; transition: border-color 0.2s ease, box-shadow 0.2s ease; }
      .A11y-header-label { position: absolute; background: #FFF; border: 3px solid #CCC; border-radius: 4px; padding: 2px 4px; text-align: left; white-space: nowrap; font-size: 12px; z-index: 9995; color: black; display: none; transition: all 0.2s ease; }
      .A11y-header-border { position: absolute; border: 3px solid #CCC; border-radius: 4px; z-index: 9993; display: none; pointer-events: none; transition: border-color 0.2s ease, box-shadow 0.2s ease; }
      .A11y-ib-border { position: absolute; border: 2px solid red; border-radius: 4px; z-index: 9996; pointer-events: none; transition: all 0.2s ease; display: none; }
      .A11y-ib-highlight { border-color: #c00 !important; box-shadow: 1px 2px 5px #f99; z-index: 9996; }
      .A11y-contrast-border { position: absolute; border: 2px solid blue; border-radius: 4px; z-index: 9996; pointer-events: none; transition: all 0.2s ease; display: none; }
      .A11y-contrast-highlight { border-color: #339 !important; box-shadow: 1px 2px 5px #99f; z-index: 9996; }
      .A11y-contrast-recommended { position: absolute; transition: all 0.2s ease; opacity: 0; visibility: hidden; border-radius: 4px; min-width: 250px; z-index: 9997; }
      .A11y-contrast-recommended.visible {  opacity: 1; visibility: visible; }
      .A11y-contrast-segment { padding: 2px 4px; font-size: 12px; }
      .A11y-table-label { position: absolute; background: #FFF; border: 3px solid #CCC; border-radius: 7px; padding: 5px; text-align: left; white-space: pre-wrap; font-size: 12px; width: 300px; z-index: 9994; color: black; display: none; transition: all 0.2s ease; }
      .A11y-table-border { position: absolute; border: 3px solid #CCC; border-radius: 7px; z-index: 9993; display: none; pointer-events: none; transition: border-color 0.2s ease, box-shadow 0.2s ease; }
      .A11y-lang-border { position: absolute; border: 2px solid green; border-radius: 4px; z-index: 9996; pointer-events: none; transition: all 0.2s ease; display: none; }
      .A11y-lang-highlight { border-color: #2b2 !important; box-shadow: 1px 2px 6px #7f7; z-index: 9996; }
      .A11y-lang-info { position: absolute; transition: all 0.2s ease; opacity: 0; visibility: hidden; border-radius: 4px; min-width: 175px; color: black; background-color: white; z-index: 9997; }
      .A11y-lang-info.visible {  opacity: 1; visibility: visible; }
      .A11y-lang-segment { padding: 2px 4px; font-size: 12px; }
    `;
          document.head.appendChild(style);
        }
        ensureGlobalStyles();
        async function runAll() {
          const container = document.body;
          Object.values(TOOLS).forEach((tool) => tool.remove());
          for (const tool of Object.values(TOOLS)) {
            await setToolState(tool, true);
            await tool.run(container);
          }
        }
        async function removeAll() {
          for (const tool of Object.values(TOOLS)) {
            await setToolState(tool, false);
            tool.remove();
          }
          document.querySelectorAll(".AccessibilityHelper:not(.contrastInspector)").forEach((e) => e.remove());
        }
        async function getSetting(request) {
          return new Promise(async (resolve) => {
            await chrome.runtime.sendMessage({ action: "getSetting", value: request }, resolve);
          });
        }
        async function setSetting(key, value) {
          return new Promise(async (resolve) => {
            await chrome.runtime.sendMessage({ action: "setSetting", key, value }, resolve);
          });
        }
        async function getToolState(tool) {
          return tempToolStates[tool.key];
        }
        async function setToolState(tool, value) {
          tempToolStates[tool.key] = value;
          shouldAutoRun = await setAutoRun();
          if (shouldAutoRun) {
            await setSetting(tool.key, value);
          }
        }
        async function toggleTool(tool, value) {
          await setToolState(tool, value);
          try {
            if (value) {
              await tool.run(document.body);
            } else {
              tool.remove();
            }
          } catch (e) {
          }
        }
        let keyHandlerQueue = Promise.resolve();
        function enqueue(fn) {
          keyHandlerQueue = keyHandlerQueue.then(fn).catch(() => {
          });
        }
        async function keyHandler(e) {
          try {
            if (e.code === "NumpadAdd" || e.keyCode === 107) {
              enqueue(() => runAll());
            } else if (e.code === "NumpadSubtract" || e.keyCode === 109) {
              enqueue(() => removeAll());
            }
          } catch (err) {
          }
        }
        (async () => {
          if (await getSetting("a11yHotkeys")) {
            document.addEventListener("keydown", keyHandler, true);
          }
        })();
        function isActuallyVisible(el) {
          if (!(el instanceof Element)) return false;
          const cs = getComputedStyle(el);
          if (cs.visibility === "hidden") return false;
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return false;
          let current = el;
          while (current) {
            if (current.closest(".AccessibilityHelper")) return false;
            if (current.tagName === "DETAILS" && !current.open) return false;
            const style = getComputedStyle(current);
            if (style.display === "none" || style.visibility === "hidden") return false;
            if (current.className && current.className.toString().toLowerCase().includes("screenreadercontent")) return false;
            if (style.overflow === "auto" || style.overflow === "scroll" || style.overflowX === "auto" || style.overflowY === "auto" || style.overflowX === "scroll" || style.overflowY === "scroll") {
              const parentRect = current.getBoundingClientRect();
              if (rect.bottom < parentRect.top || rect.top > parentRect.bottom || rect.right < parentRect.left || rect.left > parentRect.right) {
                return false;
              }
            }
            current = current.parentElement;
          }
          return true;
        }
        function escapeHtml(str) {
          return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
        }
        const updateFunctions = [];
        function runImageAltOverlay(container) {
          const tool = TOOLS.IMG;
          const toolKey = tool.key;
          let overlayContainer = document.querySelector(`.AccessibilityHelper[data-tool='${toolKey}']`);
          if (!overlayContainer) {
            overlayContainer = document.createElement("div");
            overlayContainer.className = "AccessibilityHelper";
            overlayContainer.dataset.tool = toolKey;
            document.body.appendChild(overlayContainer);
          }
          let scanTimer = null;
          let scanRunning = false;
          let scanPending = false;
          function requestScan() {
            scanPending = true;
            clearTimeout(scanTimer);
            scanTimer = setTimeout(runScan, 100);
          }
          function runScan() {
            if (scanRunning) return;
            scanRunning = true;
            scanPending = false;
            try {
              scanImages();
            } finally {
              scanRunning = false;
              if (scanPending) {
                requestScan();
              }
            }
          }
          function scanImages() {
            const images = container.querySelectorAll("img");
            images.forEach((img) => {
              if (img.closest(".AccessibilityHelper")) return;
              if (img._a11yImgProcessed) return;
              img._a11yImgProcessed = true;
              const roleAttr = (img.getAttribute && (img.getAttribute("role") || "")).toLowerCase();
              const altText = roleAttr === "presentation" ? "[Decorative]" : img.alt?.trim() || "[Missing]";
              const label = document.createElement("div");
              label.className = "A11y-img-label";
              const safeAlt = escapeHtml(altText);
              label.innerHTML = `<span style="color:${altText === "[Missing]" ? "#c00" : "#060"}">Alt Text: ${safeAlt}</span>`;
              overlayContainer.appendChild(label);
              const border = document.createElement("div");
              border.className = "A11y-img-border";
              overlayContainer.appendChild(border);
              function updatePositions() {
                const r = img.getBoundingClientRect();
                const visible = isActuallyVisible(img);
                if (visible) {
                  label.style.display = "block";
                  border.style.display = "block";
                  label.style.top = window.scrollY + r.top - label.offsetHeight - 8 + "px";
                  label.style.left = window.scrollX + r.left + "px";
                  border.style.top = window.scrollY + r.top - 8 + "px";
                  border.style.left = window.scrollX + r.left - 8 + "px";
                  border.style.width = r.width + 16 + "px";
                  border.style.height = r.height + 16 + "px";
                } else {
                  label.style.display = "none";
                  border.style.display = "none";
                }
              }
              function highlight() {
                border.style.borderColor = "#393";
                border.style.boxShadow = "1px 2px 5px #CCC";
                label.style.borderColor = "#393";
                label.style.boxShadow = "1px 2px 5px #CCC";
              }
              function unhighlight() {
                border.style.borderColor = "#CCC";
                border.style.boxShadow = "none";
                label.style.borderColor = "#CCC";
                label.style.boxShadow = "none";
              }
              img.addEventListener("pointerenter", highlight);
              img.addEventListener("pointerleave", unhighlight);
              img._highlightFunction = highlight;
              img._unhighlightFunction = unhighlight;
              label.addEventListener("pointerenter", highlight);
              label.addEventListener("pointerleave", unhighlight);
              updatePositions();
              const imgObserver = new MutationObserver(updatePositions);
              imgObserver.observe(img, { attributes: true, attributeFilter: ["src", "alt", "role", "style", "class", "hidden"] });
              img._a11yImgObserver = imgObserver;
              img._updateFunction = updatePositions;
              document.addEventListener("scroll", img._updateFunction, { capture: true, passive: true });
              window.addEventListener("resize", img._updateFunction, { passive: true });
              updateFunctions.push(img._updateFunction);
            });
          }
          scanImages();
          if (overlayContainer._observer) {
            overlayContainer._observer.disconnect();
          }
          const observer = new MutationObserver(async (mutations) => {
            let shouldScan = false;
            for (const m of mutations) {
              const el = m.target.nodeType === Node.ELEMENT_NODE ? m.target : m.target.parentElement;
              if (!el?.closest(".AccessibilityHelper")) {
                shouldScan = true;
                break;
              }
            }
            if (shouldScan) {
              requestScan();
            }
          });
          observer.observe(container, { childList: true, subtree: true });
          overlayContainer._observer = observer;
        }
        function removeImageAltOverlay() {
          const tool = TOOLS.IMG;
          const toolKey = tool.key;
          const overlayContainer = document.querySelector(`.AccessibilityHelper[data-tool='${toolKey}']`);
          if (overlayContainer) {
            if (overlayContainer._observer) overlayContainer._observer.disconnect();
            overlayContainer.remove();
          }
          document.querySelectorAll("img").forEach((img) => {
            if (img._a11yImgObserver) {
              img._a11yImgObserver.disconnect();
              delete img._a11yImgObserver;
            }
            document.removeEventListener("scroll", img._updateFunction, { capture: true, passive: true });
            window.removeEventListener("resize", img._updateFunction, { passive: true });
            img.removeEventListener("pointerenter", img._highlightFunction);
            img.removeEventListener("pointerleave", img._unhighlightFunction);
            const index = updateFunctions.indexOf(img._updateFunction);
            if (index > -1) updateFunctions.splice(index, 1);
            delete img._updateFunction;
            delete img._highlightFunction;
            delete img._unhighlightFunction;
            delete img._a11yImgProcessed;
          });
        }
        function runIframeLabelOverlay(container) {
          const tool = TOOLS.IFRAME;
          const toolKey = tool.key;
          let overlayContainer = document.querySelector(`.AccessibilityHelper[data-tool='${toolKey}']`);
          if (!overlayContainer) {
            overlayContainer = document.createElement("div");
            overlayContainer.className = "AccessibilityHelper";
            overlayContainer.dataset.tool = toolKey;
            document.body.appendChild(overlayContainer);
          }
          function getLabelText(f) {
            let title = f.title?.trim() || "[Empty]";
            let ariaLabel = f.getAttribute("aria-label");
            let ariaLabelFrom = "";
            if (!ariaLabel && f.hasAttribute("aria-labelledby")) {
              ariaLabel = f.getAttribute("aria-labelledby").split(" ").map((id) => document.getElementById(id)?.textContent?.trim() || "[Missing]").join(", ");
              ariaLabelFrom = " (uses labelledby)";
            }
            if (!ariaLabel) ariaLabel = "[Missing]";
            let ariaDesc = f.getAttribute("aria-description");
            let ariaDescFrom = "";
            if (!ariaDesc && f.hasAttribute("aria-describedby")) {
              ariaDesc = f.getAttribute("aria-describedby").split(" ").map((id) => document.getElementById(id)?.textContent?.trim() || "[Empty]").join(", ");
              ariaDescFrom = " (uses describedby)";
            }
            if (!ariaDesc) ariaDesc = "[Empty]";
            const ariaLabelEmoji = ariaLabel !== "[Missing]" ? "\u{1F50A}" : "\u{1F507}";
            const ariaDescEmoji = ariaDesc !== "[Empty]" ? "\u{1F50A}" : "\u{1F507}";
            const titleEmoji = title !== "[Empty]" && ariaLabel === "[Missing]" && ariaDesc === "[Empty]" ? "\u{1F50A}" : "\u{1F507}";
            const ariaLabelColor = ariaLabel === "[Missing]" || ariaLabel.toLowerCase().includes("video player") ? "#c00" : "#060";
            const ariaDescColor = ariaDesc !== "[Empty]" ? "#c00" : "#060";
            const titleColor = titleEmoji === "\u{1F50A}" ? "#c00" : "#060";
            return `<span style="color:${ariaLabelColor}; font-weight: bold">${ariaLabelEmoji} Aria-label: ${escapeHtml(ariaLabel)}${escapeHtml(ariaLabelFrom)}</span>
<span style="color:${ariaDescColor}">${ariaDescEmoji} Aria-description: ${escapeHtml(ariaDesc)}${escapeHtml(ariaDescFrom)}</span>
<span style="color:${titleColor}">${titleEmoji} Title: ${escapeHtml(title)}</span>`;
          }
          let scanTimer = null;
          let scanRunning = false;
          let scanPending = false;
          function requestScan() {
            scanPending = true;
            clearTimeout(scanTimer);
            scanTimer = setTimeout(runScan, 100);
          }
          function runScan() {
            if (scanRunning) return;
            scanRunning = true;
            scanPending = false;
            try {
              scanIframes();
            } finally {
              scanRunning = false;
              if (scanPending) {
                requestScan();
              }
            }
          }
          function scanIframes() {
            container.querySelectorAll("iframe").forEach((f) => {
              if (f.closest(".AccessibilityHelper")) return;
              if (f._a11yIframeProcessed) return;
              f._a11yIframeProcessed = true;
              const label = document.createElement("div");
              label.className = "A11y-iframe-label";
              label.innerHTML = getLabelText(f);
              overlayContainer.appendChild(label);
              const border = document.createElement("div");
              border.className = "A11y-iframe-border";
              overlayContainer.appendChild(border);
              function updatePositions() {
                const r = f.getBoundingClientRect();
                const visible = isActuallyVisible(f);
                if (visible) {
                  label.style.display = "block";
                  border.style.display = "block";
                  label.style.top = window.scrollY + r.top - label.offsetHeight - 8 + "px";
                  label.style.left = window.scrollX + r.left + "px";
                  border.style.top = window.scrollY + r.top - 8 + "px";
                  border.style.left = window.scrollX + r.left - 8 + "px";
                  border.style.width = r.width + 16 + "px";
                  border.style.height = r.height + 16 + "px";
                } else {
                  label.style.display = "none";
                  border.style.display = "none";
                }
              }
              function highlight() {
                label.style.borderColor = "#393";
                label.style.boxShadow = "1px 2px 5px #CCC";
                border.style.borderColor = "#393";
                border.style.boxShadow = "1px 2px 5px #CCC";
              }
              function unhighlight() {
                label.style.borderColor = "#CCC";
                label.style.boxShadow = "none";
                border.style.borderColor = "#CCC";
                border.style.boxShadow = "none";
              }
              f.addEventListener("pointerenter", highlight);
              f.addEventListener("pointerleave", unhighlight);
              label.addEventListener("pointerenter", highlight);
              label.addEventListener("pointerleave", unhighlight);
              f._highlightFunction = highlight;
              f._unhighlightFunction = unhighlight;
              updatePositions();
              const iframeObserver = new MutationObserver(updatePositions);
              iframeObserver.observe(f, {
                attributes: true,
                attributeFilter: [
                  "title",
                  "aria-label",
                  "aria-labelledby",
                  "aria-description",
                  "aria-describedby",
                  "style",
                  "class",
                  "hidden",
                  "open"
                ]
              });
              f._a11yIframeObserver = iframeObserver;
              f._updateFunction = updatePositions;
              document.addEventListener("scroll", updatePositions, { capture: true, passive: true });
              window.addEventListener("resize", updatePositions, { passive: true });
              updateFunctions.push(updatePositions);
            });
          }
          scanIframes();
          if (overlayContainer._observer) {
            overlayContainer._observer.disconnect();
          }
          const observer = new MutationObserver(async (mutations) => {
            let shouldScan = false;
            for (const m of mutations) {
              const el = m.target.nodeType === Node.ELEMENT_NODE ? m.target : m.target.parentElement;
              if (!el?.closest(".AccessibilityHelper")) {
                shouldScan = true;
                break;
              }
            }
            if (shouldScan) {
              requestScan();
            }
          });
          observer.observe(container, { childList: true, subtree: true });
          overlayContainer._observer = observer;
        }
        function removeIframeLabelOverlay() {
          const tool = TOOLS.IFRAME;
          const toolKey = tool.key;
          const overlayContainer = document.querySelector(`.AccessibilityHelper[data-tool='${toolKey}']`);
          if (overlayContainer) {
            if (overlayContainer._observer) overlayContainer._observer.disconnect();
            overlayContainer.remove();
          }
          document.querySelectorAll("iframe").forEach((f) => {
            if (f._a11yIframeObserver) {
              f._a11yIframeObserver.disconnect();
              delete f._a11yIframeObserver;
            }
            document.removeEventListener("scroll", f._updateFunction, { capture: true, passive: true });
            window.removeEventListener("resize", f._updateFunction, { passive: true });
            f.removeEventListener("pointerenter", f._highlightFunction);
            f.removeEventListener("pointerleave", f._unhighlightFunction);
            const index = updateFunctions.indexOf(f._updateFunction);
            if (index > -1) updateFunctions.splice(index, 1);
            delete f._updateFunction;
            delete f._highlightFunction;
            delete f._unhighlightFunction;
            delete f._a11yIframeProcessed;
          });
        }
        function runHeadingTagOverlay(container) {
          const tool = TOOLS.HEADING;
          const toolKey = tool.key;
          let overlayContainer = document.querySelector(`.AccessibilityHelper[data-tool='${toolKey}']`);
          if (!overlayContainer) {
            overlayContainer = document.createElement("div");
            overlayContainer.className = "AccessibilityHelper";
            overlayContainer.dataset.tool = toolKey;
            document.body.appendChild(overlayContainer);
          }
          let scanTimer = null;
          let scanRunning = false;
          let scanPending = false;
          function requestScan() {
            scanPending = true;
            clearTimeout(scanTimer);
            scanTimer = setTimeout(runScan, 100);
          }
          function runScan() {
            if (scanRunning) return;
            scanRunning = true;
            scanPending = false;
            try {
              scanHeaders();
            } finally {
              scanRunning = false;
              if (scanPending) {
                requestScan();
              }
            }
          }
          function scanHeaders() {
            const headers = container.querySelectorAll("h1, h2, h3, h4, h5, h6");
            headers.forEach((h) => {
              if (h.closest(".AccessibilityHelper")) return;
              if (h._a11yHeaderProcessed) return;
              h._a11yHeaderProcessed = true;
              const label = document.createElement("div");
              label.className = "A11y-header-label";
              label.textContent = h.tagName;
              overlayContainer.appendChild(label);
              const border = document.createElement("div");
              border.className = "A11y-header-border";
              overlayContainer.appendChild(border);
              function updatePositions() {
                const r = h.getBoundingClientRect();
                const visible = isActuallyVisible(h);
                if (visible) {
                  label.style.display = "block";
                  border.style.display = "block";
                  label.style.top = window.scrollY + r.top - label.offsetHeight + 3 + "px";
                  label.style.left = window.scrollX + r.left + "px";
                  border.style.top = window.scrollY + r.top + "px";
                  border.style.left = window.scrollX + r.left + "px";
                  border.style.width = r.width + "px";
                  border.style.height = r.height + "px";
                } else {
                  label.style.display = "none";
                  border.style.display = "none";
                }
              }
              function highlight() {
                border.style.borderColor = "#393";
                border.style.boxShadow = "1px 2px 5px #CCC";
                label.style.borderColor = "#393";
                label.style.boxShadow = "1px 2px 5px #CCC";
              }
              function unhighlight() {
                border.style.borderColor = "#CCC";
                border.style.boxShadow = "none";
                label.style.borderColor = "#CCC";
                label.style.boxShadow = "none";
              }
              h.addEventListener("pointerenter", highlight);
              h.addEventListener("pointerleave", unhighlight);
              h._highlightFunction = highlight;
              h._unhighlightFunction = unhighlight;
              label.addEventListener("pointerenter", highlight);
              label.addEventListener("pointerleave", unhighlight);
              updatePositions();
              const headerObserver = new MutationObserver(updatePositions);
              headerObserver.observe(h, { attributes: true, attributeFilter: ["style", "class", "hidden", "open"] });
              h._a11yHeaderObserver = headerObserver;
              h._updateFunction = updatePositions;
              document.addEventListener("scroll", h._updateFunction, { capture: true, passive: true });
              window.addEventListener("resize", h._updateFunction, { passive: true });
              updateFunctions.push(h._updateFunction);
            });
          }
          scanHeaders();
          if (overlayContainer._observer) {
            overlayContainer._observer.disconnect();
          }
          const observer = new MutationObserver(async (mutations) => {
            let shouldScan = false;
            for (const m of mutations) {
              const el = m.target.nodeType === Node.ELEMENT_NODE ? m.target : m.target.parentElement;
              if (!el?.closest(".AccessibilityHelper")) {
                shouldScan = true;
                break;
              }
            }
            if (shouldScan) {
              requestScan();
            }
          });
          observer.observe(container, { childList: true, subtree: true });
          overlayContainer._observer = observer;
        }
        function removeHeadingTagOverlay() {
          const tool = TOOLS.HEADING;
          const toolKey = tool.key;
          const overlayContainer = document.querySelector(`.AccessibilityHelper[data-tool='${toolKey}']`);
          if (overlayContainer) {
            if (overlayContainer._observer) overlayContainer._observer.disconnect();
            overlayContainer.remove();
          }
          document.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((h) => {
            if (h._a11yHeaderObserver) {
              h._a11yHeaderObserver.disconnect();
              delete h._a11yHeaderObserver;
            }
            document.removeEventListener("scroll", h._updateFunction, { capture: true, passive: true });
            window.removeEventListener("resize", h._updateFunction, { passive: true });
            h.removeEventListener("pointerenter", h._highlightFunction);
            h.removeEventListener("pointerleave", h._unhighlightFunction);
            const index = updateFunctions.indexOf(h._updateFunction);
            if (index > -1) updateFunctions.splice(index, 1);
            delete h._updateFunction;
            delete h._highlightFunction;
            delete h._unhighlightFunction;
            delete h._a11yHeaderProcessed;
          });
        }
        function runIBTagHighlights(container) {
          const tool = TOOLS.IB;
          const toolKey = tool.key;
          let overlayContainer = document.querySelector(`.AccessibilityHelper[data-tool='${toolKey}']`);
          if (!overlayContainer) {
            overlayContainer = document.createElement("div");
            overlayContainer.className = "AccessibilityHelper";
            overlayContainer.dataset.tool = toolKey;
            document.body.appendChild(overlayContainer);
          }
          function hasText(el) {
            return Array.from(el.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent.trim()).join("").length > 0;
          }
          let scanTimer = null;
          let scanRunning = false;
          let scanPending = false;
          function requestScan() {
            scanPending = true;
            clearTimeout(scanTimer);
            scanTimer = setTimeout(runScan, 100);
          }
          function runScan() {
            if (scanRunning) return;
            scanRunning = true;
            scanPending = false;
            try {
              scanIB();
            } finally {
              scanRunning = false;
              if (scanPending) {
                requestScan();
              }
            }
          }
          function scanIB() {
            const nodes = container.querySelectorAll("i, b");
            nodes.forEach((el) => {
              if (el.closest(".AccessibilityHelper")) return;
              if (el._a11yIBProcessed) return;
              if (!hasText(el)) return;
              el._a11yIBProcessed = true;
              const border = document.createElement("div");
              border.className = "A11y-ib-border";
              overlayContainer.appendChild(border);
              function updatePosition() {
                const r = el.getBoundingClientRect();
                const visible = isActuallyVisible(el);
                if (visible) {
                  border.style.display = "block";
                  border.style.top = Math.round(window.scrollY + r.top - 4) + "px";
                  border.style.left = Math.round(window.scrollX + r.left - 4) + "px";
                  border.style.width = Math.round(r.width + 8) + "px";
                  border.style.height = Math.round(r.height + 8) + "px";
                } else {
                  border.style.display = "none";
                }
              }
              function highlight() {
                border.classList.add("A11y-ib-highlight");
              }
              function unhighlight() {
                border.classList.remove("A11y-ib-highlight");
              }
              el.addEventListener("pointerenter", highlight);
              el.addEventListener("pointerleave", unhighlight);
              el._highlightFunction = highlight;
              el._unhighlightFunction = unhighlight;
              el._updateFunction = updatePosition;
              updatePosition();
              const observer2 = new MutationObserver(updatePosition);
              observer2.observe(el, {
                attributes: true,
                attributeFilter: ["style", "class", "hidden"]
              });
              el._a11yIBObserver = observer2;
              document.addEventListener("scroll", updatePosition, { capture: true, passive: true });
              window.addEventListener("resize", updatePosition, { passive: true });
              updateFunctions.push(updatePosition);
            });
          }
          scanIB();
          if (overlayContainer._observer) {
            overlayContainer._observer.disconnect();
          }
          const observer = new MutationObserver(async (mutations) => {
            let shouldScan = false;
            for (const m of mutations) {
              const el = m.target.nodeType === Node.ELEMENT_NODE ? m.target : m.target.parentElement;
              if (!el?.closest(".AccessibilityHelper")) {
                shouldScan = true;
                break;
              }
            }
            if (shouldScan) {
              requestScan();
            }
          });
          observer.observe(container, { childList: true, subtree: true });
          overlayContainer._observer = observer;
        }
        function removeIBTagHighlights() {
          const tool = TOOLS.IB;
          const toolKey = tool.key;
          const overlayContainer = document.querySelector(`.AccessibilityHelper[data-tool='${toolKey}']`);
          if (overlayContainer) {
            if (overlayContainer._observer) overlayContainer._observer.disconnect();
            overlayContainer.remove();
          }
          document.querySelectorAll("i, b").forEach((el) => {
            if (el._a11yIBObserver) {
              el._a11yIBObserver.disconnect();
              delete el._a11yIBObserver;
            }
            document.removeEventListener("scroll", el._updateFunction, { capture: true, passive: true });
            window.removeEventListener("resize", el._updateFunction, { passive: true });
            el.removeEventListener("pointerenter", el._highlightFunction);
            el.removeEventListener("pointerleave", el._unhighlightFunction);
            const idx = updateFunctions.indexOf(el._updateFunction);
            if (idx > -1) updateFunctions.splice(idx, 1);
            delete el._updateFunction;
            delete el._highlightFunction;
            delete el._unhighlightFunction;
            delete el._a11yIBProcessed;
          });
        }
        function runContrastHighlights(container) {
          const tool = TOOLS.CONTRAST;
          const toolKey = tool.key;
          let overlayContainer = document.querySelector(`.AccessibilityHelper[data-tool='${toolKey}']`);
          if (!overlayContainer) {
            overlayContainer = document.createElement("div");
            overlayContainer.className = "AccessibilityHelper";
            overlayContainer.dataset.tool = toolKey;
            document.body.appendChild(overlayContainer);
          }
          if (!overlayContainer._trackedElements) {
            overlayContainer._trackedElements = /* @__PURE__ */ new Set();
          }
          function isFullyTransparent(color) {
            if (!color) return true;
            if (color === "transparent") return true;
            if (color.startsWith("rgba")) {
              const parts = color.match(/[\d.]+/g);
              if (!parts) return false;
              const alpha = parseFloat(parts[3]);
              return alpha === 0;
            }
            if (color.startsWith("hsla")) {
              const parts = color.match(/[\d.]+/g);
              if (!parts) return false;
              const alpha = parseFloat(parts[3]);
              return alpha === 0;
            }
            return false;
          }
          function luminance(r, g, b) {
            const a = [r, g, b].map((v) => {
              v /= 255;
              return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
            });
            return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
          }
          function contrastRatio(rgb1, rgb2) {
            const [r1, g1, b1] = rgb1.match(/\d+/g).map(Number);
            const [r2, g2, b2] = rgb2.match(/\d+/g).map(Number);
            const l1 = luminance(r1, g1, b1);
            const l2 = luminance(r2, g2, b2);
            return l1 > l2 ? (l1 + 0.05) / (l2 + 0.05) : (l2 + 0.05) / (l1 + 0.05);
          }
          function getEffectiveColor(el) {
            let current = el;
            while (current && current !== document.documentElement) {
              const c = getComputedStyle(current).color;
              if (c && c !== "transparent") return c;
              current = current.parentElement;
            }
            return getComputedStyle(document.body).color || "rgb(0,0,0)";
          }
          function getEffectiveBackground(el) {
            let current = el;
            while (current && current !== document.documentElement) {
              const bg = getComputedStyle(current).backgroundColor;
              if (bg && !isFullyTransparent(bg)) {
                return bg;
              }
              current = current.parentElement;
            }
            return getComputedStyle(document.body).backgroundColor || "rgb(255,255,255)";
          }
          function passesContrast(el) {
            const style = getComputedStyle(el);
            const color = getEffectiveColor(el);
            const bg = getEffectiveBackground(el);
            const ratio = contrastRatio(color, bg);
            const fontSize = parseFloat(style.fontSize) || 0;
            const fontWeight = parseInt(style.fontWeight, 10) || 400;
            const isLargeText = fontSize >= 18 || fontSize >= 14 && fontWeight >= 700;
            const threshold = isLargeText ? 3 : 4.5;
            return { passes: ratio >= threshold, ratio, threshold };
          }
          function findClosestColor(el) {
            const style = getComputedStyle(el);
            const textColor = getEffectiveColor(el);
            const backgroundColor = getEffectiveBackground(el);
            const fontSize = parseFloat(style.fontSize) || 0;
            const fontWeight = parseInt(style.fontWeight, 10) || 400;
            const isLargeText = fontSize >= 18 || fontSize >= 14 && fontWeight >= 700;
            const threshold = isLargeText ? 3 : 4.5;
            function parseRgb(rgb) {
              const values = rgb.match(/\d+(?:\.\d+)?/g);
              if (!values || values.length < 3) {
                return null;
              }
              return {
                r: Number(values[0]),
                g: Number(values[1]),
                b: Number(values[2])
              };
            }
            function rgbToHsl(r, g, b) {
              r /= 255;
              g /= 255;
              b /= 255;
              const max = Math.max(r, g, b);
              const min = Math.min(r, g, b);
              const delta = max - min;
              let h = 0;
              let s = 0;
              const l = (max + min) / 2;
              if (delta !== 0) {
                s = delta / (1 - Math.abs(2 * l - 1));
                if (max === r) {
                  h = 60 * ((g - b) / delta % 6);
                } else if (max === g) {
                  h = 60 * ((b - r) / delta + 2);
                } else {
                  h = 60 * ((r - g) / delta + 4);
                }
                if (h < 0) {
                  h += 360;
                }
              }
              return { h, s, l };
            }
            function hslToRgb(h, s, l) {
              const c = (1 - Math.abs(2 * l - 1)) * s;
              const x = c * (1 - Math.abs(h / 60 % 2 - 1));
              const m = l - c / 2;
              let r = 0;
              let g = 0;
              let b = 0;
              if (h < 60) {
                r = c;
                g = x;
              } else if (h < 120) {
                r = x;
                g = c;
              } else if (h < 180) {
                g = c;
                b = x;
              } else if (h < 240) {
                g = x;
                b = c;
              } else if (h < 300) {
                r = x;
                b = c;
              } else {
                r = c;
                b = x;
              }
              return {
                r: Math.round((r + m) * 255),
                g: Math.round((g + m) * 255),
                b: Math.round((b + m) * 255)
              };
            }
            function rgbString(rgb) {
              return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
            }
            function getClosestColor(colorToChange, fixedColor) {
              const hsl = rgbToHsl(
                colorToChange.r,
                colorToChange.g,
                colorToChange.b
              );
              let closest = null;
              for (let i = 0; i <= 1e3; i++) {
                const lightness = i / 1e3;
                const candidate = hslToRgb(
                  hsl.h,
                  hsl.s,
                  lightness
                );
                const ratio = contrastRatio(
                  rgbString(candidate),
                  rgbString(fixedColor)
                );
                if (ratio >= threshold) {
                  const distance = Math.abs(lightness - hsl.l);
                  if (closest === null || distance < closest.distance) {
                    closest = {
                      color: rgbString(candidate),
                      distance
                    };
                  }
                }
              }
              return closest ? closest.color : rgbString(colorToChange);
            }
            const text = parseRgb(textColor);
            const background = parseRgb(backgroundColor);
            if (!text || !background) {
              return {
                text: null,
                background: null
              };
            }
            const closestTextColor = getClosestColor(
              text,
              background
            );
            const closestBackgroundColor = getClosestColor(
              background,
              text
            );
            const possibleChanges = {
              text: null,
              background: null
            };
            if (closestTextColor !== textColor) {
              possibleChanges.text = closestTextColor;
            }
            if (closestBackgroundColor !== backgroundColor) {
              possibleChanges.background = closestBackgroundColor;
            }
            return possibleChanges;
          }
          function rgbToHex(rgb) {
            const values = rgb.match(/\d+/g);
            if (!values || values.length < 3) {
              return null;
            }
            return "#" + values.slice(0, 3).map((value) => Number(value).toString(16).padStart(2, "0")).join("").toUpperCase();
          }
          let scanTimer = null;
          let scanRunning = false;
          let scanPending = false;
          function requestScan() {
            scanPending = true;
            clearTimeout(scanTimer);
            scanTimer = setTimeout(runScan, 100);
          }
          function runScan() {
            if (scanRunning) return;
            scanRunning = true;
            scanPending = false;
            try {
              scanContrast();
            } finally {
              scanRunning = false;
              if (scanPending) {
                requestScan();
              }
            }
          }
          function scanContrast() {
            const walker = document.createTreeWalker(
              container,
              NodeFilter.SHOW_TEXT,
              {
                acceptNode(node) {
                  if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
                  const parent = node.parentElement;
                  if (!parent) return NodeFilter.FILTER_REJECT;
                  if (!isActuallyVisible(parent)) return NodeFilter.FILTER_REJECT;
                  if (parent.closest(".AccessibilityHelper") || parent.closest(".sr-only, .screenreader-only")) {
                    return NodeFilter.FILTER_REJECT;
                  }
                  return NodeFilter.FILTER_ACCEPT;
                }
              }
            );
            const processedParents = /* @__PURE__ */ new Set();
            while (walker.nextNode()) {
              let updatePosition = function() {
                const r = el.getBoundingClientRect();
                if (isActuallyVisible(el)) {
                  if (passesContrast(el).passes) {
                    border.style.display = "none";
                    return;
                  }
                  border.style.display = "block";
                  border.style.top = Math.round(window.scrollY + r.top - 4) + "px";
                  border.style.left = Math.round(window.scrollX + r.left - 4) + "px";
                  border.style.width = Math.round(r.width + 8) + "px";
                  border.style.height = Math.round(r.height + 8) + "px";
                  recommendedColors.style.top = Math.round(window.scrollY + r.top - 4) + "px";
                  recommendedColors.style.left = Math.round(window.scrollX + r.left + 2) + r.width / 2 + "px";
                  recommendedColors.style.transform = "translate(-50%, -100%)";
                } else {
                  border.style.display = "none";
                }
              }, show = function() {
                clearTimeout(hideTimer);
                border.classList.add("A11y-contrast-highlight");
                recommendedColors.classList.add("visible");
              }, scheduleHide = function() {
                clearTimeout(hideTimer);
                hideTimer = setTimeout(() => {
                  if (!sourceHovered && !popupHovered) {
                    border.classList.remove("A11y-contrast-highlight");
                    recommendedColors.classList.remove("visible");
                  }
                }, 150);
              }, highlightBorder = function() {
                sourceHovered = true;
                show();
              }, unhighlightBorder = function() {
                sourceHovered = false;
                scheduleHide();
              }, highlightPopup = function() {
                popupHovered = true;
                show();
              }, unhighlightPopup = function() {
                popupHovered = false;
                scheduleHide();
              }, copyTextColor = function(e) {
                if (!e.shiftKey) return;
                if (e.button === 0 && newColors.text) {
                  navigator.clipboard.writeText(rgbToHex(newColors.text));
                  e.preventDefault();
                  e.stopPropagation();
                }
              }, copyBackgroundColor = function(e) {
                if (!e.shiftKey) return;
                if (newColors.background) {
                  navigator.clipboard.writeText(rgbToHex(newColors.background));
                  e.preventDefault();
                  e.stopPropagation();
                }
              };
              const el = walker.currentNode.parentElement;
              if (!el || processedParents.has(el)) continue;
              processedParents.add(el);
              if (el._a11yContrastProcessed) continue;
              if (!isActuallyVisible(el)) continue;
              const text = Array.from(el.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent.trim()).join("");
              if (!text) continue;
              const passesContrastResult = passesContrast(el);
              if (passesContrastResult.passes) continue;
              el._a11yContrastProcessed = true;
              overlayContainer._trackedElements.add(el);
              const border = document.createElement("div");
              border.className = "A11y-contrast-border";
              overlayContainer.appendChild(border);
              const recommendedColors = document.createElement("div");
              recommendedColors.className = "A11y-contrast-recommended";
              overlayContainer.appendChild(recommendedColors);
              const defaultColor = document.createElement("div");
              defaultColor.className = "A11y-contrast-segment";
              defaultColor.style.backgroundColor = getEffectiveBackground(el);
              defaultColor.style.color = getEffectiveColor(el);
              defaultColor.innerHTML = `This text fails color contrast.<br/>(${passesContrastResult.ratio.toFixed(2)}:1, ${passesContrastResult.threshold.toFixed(2)}:1 required)`;
              recommendedColors.appendChild(defaultColor);
              const newColors = findClosestColor(el);
              if (newColors.text) {
                const newText = document.createElement("div");
                newText.className = "A11y-contrast-segment";
                newText.style.backgroundColor = getEffectiveBackground(el);
                newText.style.color = newColors.text;
                newText.innerHTML = `Change the text to ${rgbToHex(newColors.text)}.<br/>(Shift + click to copy hex code)`;
                recommendedColors.appendChild(newText);
              }
              if (newColors.background) {
                const newBackground = document.createElement("div");
                newBackground.className = "A11y-contrast-segment";
                newBackground.style.backgroundColor = newColors.background;
                newBackground.style.color = getEffectiveColor(el);
                newBackground.innerHTML = `Or change the background to ${rgbToHex(newColors.background)}.<br/>(Shift + right-click to copy hex code)`;
                recommendedColors.appendChild(newBackground);
              }
              let sourceHovered = false;
              let popupHovered = false;
              let hideTimer;
              el._contrastBorder = border;
              el._contrastPopup = recommendedColors;
              el._contrastUpdate = updatePosition;
              el._contrastHighlight = highlightBorder;
              el._contrastUnhighlight = unhighlightBorder;
              el._contrastHighlightPopup = highlightPopup;
              el._contrastUnhighlightPopup = unhighlightPopup;
              el._contrastCopyText = copyTextColor;
              el._contrastCopyBackground = copyBackgroundColor;
              el.addEventListener("pointerenter", highlightBorder);
              el.addEventListener("pointerleave", unhighlightBorder);
              recommendedColors.addEventListener("pointerenter", highlightPopup);
              recommendedColors.addEventListener("pointerleave", unhighlightPopup);
              el.addEventListener("click", copyTextColor);
              el.addEventListener("contextmenu", copyBackgroundColor);
              const attrObserver = new MutationObserver(updatePosition);
              attrObserver.observe(el, {
                attributes: true,
                attributeFilter: ["style", "class", "hidden"]
              });
              el._contrastObserver = attrObserver;
              document.addEventListener("scroll", updatePosition, { capture: true, passive: true });
              window.addEventListener("resize", updatePosition, { passive: true });
              updateFunctions.push(updatePosition);
              updatePosition();
            }
          }
          scanContrast();
          if (overlayContainer._observer) {
            overlayContainer._observer.disconnect();
          }
          if (overlayContainer._container && overlayContainer._linkHandler) {
            overlayContainer._container.removeEventListener("pointerover", overlayContainer._linkHandler);
            overlayContainer._container.removeEventListener("pointerout", overlayContainer._linkHandler);
          }
          const observer = new MutationObserver(async (mutations) => {
            let shouldScan = false;
            for (const m of mutations) {
              const el = m.target.nodeType === Node.ELEMENT_NODE ? m.target : m.target.parentElement;
              if (!el?.closest(".AccessibilityHelper")) {
                shouldScan = true;
                break;
              }
            }
            if (shouldScan) {
              requestScan();
            }
          });
          observer.observe(container, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["style", "class", "open", "hidden"]
          });
          const linkHandler = (event) => {
            const link = event.target.closest?.("a");
            if (!link || !container.contains(link)) return;
            if (link.closest(".AccessibilityHelper")) return;
            requestScan();
          };
          container.addEventListener("pointerover", linkHandler);
          container.addEventListener("pointerout", linkHandler);
          overlayContainer._observer = observer;
          overlayContainer._container = container;
          overlayContainer._linkHandler = linkHandler;
        }
        function removeContrastHighlights() {
          const tool = TOOLS.CONTRAST;
          const toolKey = tool.key;
          const overlayContainer = document.querySelector(`.AccessibilityHelper[data-tool='${toolKey}']`);
          if (overlayContainer) {
            if (overlayContainer._observer) {
              overlayContainer._observer.disconnect();
            }
            if (overlayContainer._container && overlayContainer._linkHandler) {
              overlayContainer._container.removeEventListener("pointerover", overlayContainer._linkHandler);
              overlayContainer._container.removeEventListener("pointerout", overlayContainer._linkHandler);
            }
            const trackedElements = overlayContainer._trackedElements;
            if (trackedElements) {
              trackedElements.forEach((el) => {
                if (el._contrastObserver) {
                  el._contrastObserver.disconnect();
                  delete el._contrastObserver;
                }
                document.removeEventListener("scroll", el._contrastUpdate, { capture: true, passive: true });
                window.removeEventListener("resize", el._contrastUpdate, { passive: true });
                el.removeEventListener("pointerenter", el._contrastHighlight);
                el.removeEventListener("pointerleave", el._contrastUnhighlight);
                el._contrastPopup.removeEventListener("pointerenter", el._contrastHighlightPopup);
                el._contrastPopup.removeEventListener("pointerleave", el._contrastUnhighlightPopup);
                el.removeEventListener("click", el._contrastCopyText);
                el.removeEventListener("contextmenu", el._contrastCopyBackground);
                const idx = updateFunctions.indexOf(el._contrastUpdate);
                if (idx > -1) updateFunctions.splice(idx, 1);
                if (el._contrastBorder) {
                  el._contrastBorder.remove();
                }
                if (el._contrastPopup) {
                  el._contrastPopup.remove();
                }
                delete el._contrastBorder;
                delete el._contrastPopup;
                delete el._contrastUpdate;
                delete el._contrastHighlight;
                delete el._contrastUnhighlight;
                delete el._contrastHighlightPopup;
                delete el._contrastUnhighlightPopup;
                delete el._contrastCopyText;
                delete el._contrastCopyBackground;
                delete el._a11yContrastProcessed;
              });
              trackedElements.clear();
            }
            overlayContainer.remove();
          }
        }
        async function runLangHighlights(container) {
          const tool = TOOLS.LANG;
          const toolKey = tool.key;
          let overlayContainer = document.querySelector(`.AccessibilityHelper[data-tool='${toolKey}']`);
          if (!overlayContainer) {
            overlayContainer = document.createElement("div");
            overlayContainer.className = "AccessibilityHelper";
            overlayContainer.dataset.tool = toolKey;
            document.body.appendChild(overlayContainer);
          }
          if (!overlayContainer._trackedMatches) {
            overlayContainer._trackedMatches = /* @__PURE__ */ new Map();
          }
          async function predictLanguage(text) {
            const cached = languageCache.get(text);
            if (cached) {
              return cached;
            }
            try {
              const response = await chrome.runtime.sendMessage({
                action: "runLanguageModel",
                value: text
              });
              if (response?.success) {
                languageCache.set(text, response);
                return response;
              } else {
                console.error("Language model failed:", response?.error);
                return { language: "unknown", confidence: 0, probabilities: [] };
              }
            } catch (error) {
              console.error("No response from language model:", error);
              return { language: "unknown", confidence: 0, probabilities: [] };
            }
          }
          function getNearestLang(el) {
            while (el && el.nodeType === 1) {
              if (el.hasAttribute("lang")) {
                return el.getAttribute("lang").toLowerCase();
              }
              el = el.parentElement;
            }
            return null;
          }
          function shouldSkip(node) {
            return !!node.closest(".AccessibilityHelper, .sr-only, .screenreader-only");
          }
          function createBorder(declaredLanguage, detectedLanguage, confidence) {
            const el = document.createElement("div");
            el.className = "A11y-lang-border";
            overlayContainer.appendChild(el);
            const langInfo = document.createElement("div");
            langInfo.className = "A11y-lang-info";
            overlayContainer.appendChild(langInfo);
            const declaredLang = document.createElement("div");
            declaredLang.className = "A11y-lang-segment";
            declaredLang.textContent = "Declared Language: " + declaredLanguage;
            langInfo.appendChild(declaredLang);
            const detectedLang = document.createElement("div");
            detectedLang.className = "A11y-lang-segment";
            detectedLang.textContent = "Detected Language: " + detectedLanguage;
            langInfo.appendChild(detectedLang);
            const confidenceLang = document.createElement("div");
            confidenceLang.className = "A11y-lang-segment";
            if (Number.isNaN(Number(confidence))) {
              confidenceLang.textContent = `Confidence: ${confidence}`;
            } else {
              confidenceLang.textContent = "Confidence: " + (confidence * 100).toFixed(2) + "%";
            }
            langInfo.appendChild(confidenceLang);
            let sourceHovered = false;
            let popupHovered = false;
            let hideTimer;
            function show() {
              clearTimeout(hideTimer);
              el.classList.add("A11y-lang-highlight");
              langInfo.classList.add("visible");
            }
            function scheduleHide() {
              clearTimeout(hideTimer);
              hideTimer = setTimeout(() => {
                if (!sourceHovered && !popupHovered) {
                  el.classList.remove("A11y-lang-highlight");
                  langInfo.classList.remove("visible");
                }
              }, 150);
            }
            function highlightBorder() {
              sourceHovered = true;
              show();
            }
            function unhighlightBorder() {
              sourceHovered = false;
              scheduleHide();
            }
            function highlightPopup() {
              popupHovered = true;
              show();
            }
            function unhighlightPopup() {
              popupHovered = false;
              scheduleHide();
            }
            return { border: el, popup: langInfo, highlightBorder, unhighlightBorder, highlightPopup, unhighlightPopup };
          }
          function assureNodeMap(textNode) {
            let nodeMap = overlayContainer._trackedMatches.get(textNode);
            if (!nodeMap) {
              nodeMap = /* @__PURE__ */ new Map();
              overlayContainer._trackedMatches.set(textNode, nodeMap);
            }
            return nodeMap;
          }
          function processDictionary(textNode, nearestLang, declaredLanguage, parent, seenEntries) {
            const wordRegex = /[\p{L}]+/gu;
            let match;
            while ((match = wordRegex.exec(textNode.textContent)) !== null) {
              const word = match[0];
              const start = match.index;
              const cleanWord = word.toLowerCase();
              if (englishWords.has(cleanWord) || nearestLang && nearestLang.split("-")[0].toLowerCase() !== "en") {
                continue;
              }
              let nodeMap = assureNodeMap(textNode);
              let entry = nodeMap.get(start);
              if (!entry) {
                const borderResult = createBorder(declaredLanguage, "non-english", "Unknown");
                const border = borderResult.border;
                const popup = borderResult.popup;
                const highlightBorder = borderResult.highlightBorder;
                const unhighlightBorder = borderResult.unhighlightBorder;
                const highlightPopup = borderResult.highlightPopup;
                const unhighlightPopup = borderResult.unhighlightPopup;
                parent.addEventListener("pointerenter", highlightBorder);
                parent.addEventListener("pointerleave", unhighlightBorder);
                popup.addEventListener("pointerenter", highlightPopup);
                popup.addEventListener("pointerleave", unhighlightPopup);
                entry = {
                  textNode,
                  start,
                  length: word.length,
                  border,
                  popup,
                  parent,
                  highlightBorder,
                  unhighlightBorder,
                  highlightPopup,
                  unhighlightPopup
                };
                nodeMap.set(start, entry);
              }
              seenEntries.add(entry);
              updateEntry(entry);
            }
          }
          let scanTimer = null;
          let scanRunning = false;
          let scanPending = false;
          function requestScan() {
            scanPending = true;
            clearTimeout(scanTimer);
            scanTimer = setTimeout(runScan, 100);
          }
          async function runScan() {
            if (scanRunning) return;
            scanRunning = true;
            scanPending = false;
            try {
              await scanLang();
            } finally {
              scanRunning = false;
              if (scanPending) {
                requestScan();
              }
            }
          }
          async function scanLang() {
            const seenEntries = /* @__PURE__ */ new Set();
            const walker = document.createTreeWalker(
              container,
              NodeFilter.SHOW_TEXT,
              {
                acceptNode(node) {
                  if (!node.textContent.trim()) return NodeFilter.FILTER_REJECT;
                  const parent = node.parentElement;
                  if (!parent) return NodeFilter.FILTER_REJECT;
                  if (!isActuallyVisible(parent)) return NodeFilter.FILTER_REJECT;
                  if (shouldSkip(parent)) return NodeFilter.FILTER_REJECT;
                  return NodeFilter.FILTER_ACCEPT;
                }
              }
            );
            let textNode;
            while (textNode = walker.nextNode()) {
              const parent = textNode.parentElement;
              const nearestLang = getNearestLang(parent);
              const declaredLanguage = nearestLang ? nearestLang.split("-")[0].toLowerCase() : "en";
              const text = textNode.textContent.trim();
              if (!text) continue;
              if (text.length < LANGUAGE_MODEL_CHARACTER_THRESHOLD) {
                processDictionary(textNode, nearestLang, declaredLanguage, parent, seenEntries);
                continue;
              }
              try {
                const result = await predictLanguage(text);
                const detectedLanguage = result.language.toLowerCase();
                const confidence = result.confidence;
                if (detectedLanguage == declaredLanguage && confidence >= LANGUAGE_MODEL_CONFIDENCE_THRESHOLD) {
                  continue;
                }
                if (confidence >= LANGUAGE_MODEL_CONFIDENCE_THRESHOLD) {
                  let nodeMap = assureNodeMap(textNode);
                  const start = 0;
                  let entry = nodeMap.get(start);
                  if (!entry) {
                    const borderResult = createBorder(declaredLanguage, detectedLanguage, confidence);
                    const border = borderResult.border;
                    const popup = borderResult.popup;
                    const highlightBorder = borderResult.highlightBorder;
                    const unhighlightBorder = borderResult.unhighlightBorder;
                    const highlightPopup = borderResult.highlightPopup;
                    const unhighlightPopup = borderResult.unhighlightPopup;
                    parent.addEventListener("pointerenter", highlightBorder);
                    parent.addEventListener("pointerleave", unhighlightBorder);
                    popup.addEventListener("pointerenter", highlightPopup);
                    popup.addEventListener("pointerleave", unhighlightPopup);
                    entry = {
                      textNode,
                      start,
                      length: textNode.textContent.length,
                      border,
                      popup,
                      parent,
                      highlightBorder,
                      unhighlightBorder,
                      highlightPopup,
                      unhighlightPopup
                    };
                    nodeMap.set(start, entry);
                  }
                  seenEntries.add(entry);
                  updateEntry(entry);
                } else {
                  processDictionary(textNode, nearestLang, declaredLanguage, parent, seenEntries);
                  continue;
                }
              } catch (error) {
                console.error("A11y language model error:", error);
                processDictionary(textNode, nearestLang, declaredLanguage, parent, seenEntries);
              }
            }
            for (const [textNode2, nodeMap] of overlayContainer._trackedMatches) {
              for (const [start, entry] of nodeMap) {
                if (!seenEntries.has(entry)) {
                  entry.parent.removeEventListener("pointerenter", entry.highlightBorder);
                  entry.parent.removeEventListener("pointerleave", entry.unhighlightBorder);
                  entry.popup.removeEventListener("pointerenter", entry.highlightPopup);
                  entry.popup.removeEventListener("pointerleave", entry.unhighlightPopup);
                  entry.border.remove();
                  entry.popup.remove();
                  nodeMap.delete(start);
                  if (nodeMap.size === 0) {
                    overlayContainer._trackedMatches.delete(textNode2);
                  }
                }
              }
            }
          }
          function updateEntry(entry) {
            const { textNode, start, length, border, popup } = entry;
            if (!document.contains(textNode)) {
              const nodeMap = overlayContainer._trackedMatches.get(textNode);
              if (nodeMap) {
                nodeMap.delete(start);
                if (nodeMap.size === 0) {
                  overlayContainer._trackedMatches.delete(textNode);
                }
              }
              entry.parent.removeEventListener("pointerenter", entry.highlightBorder);
              entry.parent.removeEventListener("pointerleave", entry.unhighlightBorder);
              entry.popup.removeEventListener("pointerenter", entry.highlightPopup);
              entry.popup.removeEventListener("pointerleave", entry.unhighlightPopup);
              border.remove();
              popup.remove();
              return;
            }
            const parent = textNode.parentElement;
            if (!isActuallyVisible(parent)) {
              border.style.display = "none";
              return;
            }
            const range = document.createRange();
            range.setStart(textNode, start);
            range.setEnd(textNode, start + length);
            const rect = range.getBoundingClientRect();
            range.detach();
            if (rect.width === 0 || rect.height === 0) {
              border.style.display = "none";
              return;
            }
            border.style.display = "block";
            border.style.top = Math.round(window.scrollY + rect.top - 3) + "px";
            border.style.left = Math.round(window.scrollX + rect.left - 3) + "px";
            border.style.width = Math.round(rect.width + 6) + "px";
            border.style.height = Math.round(rect.height + 6) + "px";
            if (popup) {
              popup.style.top = Math.round(window.scrollY + rect.top) + rect.height + 7 + "px";
              popup.style.left = Math.round(window.scrollX + rect.left + 2) + rect.width / 2 + "px";
              popup.style.transform = "translateX(-50%)";
            }
          }
          function updateAll() {
            for (const [, nodeMap] of overlayContainer._trackedMatches) {
              for (const entry of nodeMap.values()) {
                updateEntry(entry);
              }
            }
          }
          const observer = new MutationObserver(async (mutations) => {
            let shouldScan = false;
            for (const m of mutations) {
              const el = m.target.nodeType === Node.ELEMENT_NODE ? m.target : m.target.parentElement;
              if (!el?.closest(".AccessibilityHelper")) {
                shouldScan = true;
                break;
              }
            }
            if (shouldScan) {
              requestScan();
            }
          });
          observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ["style", "class", "hidden", "open"]
          });
          const scrollHandler = () => updateAll();
          const resizeHandler = () => updateAll();
          document.addEventListener("scroll", scrollHandler, { passive: true, capture: true });
          window.addEventListener("resize", resizeHandler, { passive: true });
          overlayContainer._updateFn = updateAll;
          updateFunctions.push(overlayContainer._updateFn);
          overlayContainer._cleanup = {
            observer,
            scrollHandler,
            resizeHandler
          };
          await scanLang();
        }
        function removeLangHighlights() {
          const tool = TOOLS.LANG;
          const toolKey = tool.key;
          const overlayContainer = document.querySelector(`.AccessibilityHelper[data-tool='${toolKey}']`);
          if (!overlayContainer) return;
          const cleanup = overlayContainer._cleanup;
          if (cleanup) {
            cleanup.observer.disconnect();
            document.removeEventListener("scroll", cleanup.scrollHandler, true);
            window.removeEventListener("resize", cleanup.resizeHandler, { passive: true });
          }
          const matches = overlayContainer._trackedMatches;
          if (matches) {
            for (const nodeMap of matches.values()) {
              for (const entry of nodeMap.values()) {
                entry.parent.removeEventListener("pointerenter", entry.highlightBorder);
                entry.parent.removeEventListener("pointerleave", entry.unhighlightBorder);
                entry.popup.removeEventListener("pointerenter", entry.highlightPopup);
                entry.popup.removeEventListener("pointerleave", entry.unhighlightPopup);
                entry.border.remove();
                entry.popup.remove();
              }
              nodeMap.clear();
            }
            matches.clear?.();
          }
          if (overlayContainer._updateFn) {
            const idx = updateFunctions.indexOf(overlayContainer._updateFn);
            if (idx > -1) updateFunctions.splice(idx, 1);
          }
          overlayContainer.remove();
        }
        function runTableOverlay(container) {
          const tool = TOOLS.TABLE;
          const toolKey = tool.key;
          let overlayContainer = document.querySelector(`.AccessibilityHelper[data-tool='${toolKey}']`);
          if (!overlayContainer) {
            overlayContainer = document.createElement("div");
            overlayContainer.className = "AccessibilityHelper";
            overlayContainer.dataset.tool = toolKey;
            document.body.appendChild(overlayContainer);
          }
          function analyzeTableForA11yIssues(table) {
            const issues = [];
            const rows = Array.from(table.rows);
            const hasAnyTH = table.querySelector("th") !== null;
            if (!hasAnyTH) {
              issues.push("Table does not contain any &lt;th&gt; header cells");
            }
            rows.forEach((row, rowIndex) => {
              const cells = Array.from(row.cells);
              cells.forEach((cell, colIndex) => {
                const rspan = parseInt(cell.getAttribute("rowspan") || "1", 10);
                const cspan = parseInt(cell.getAttribute("colspan") || "1", 10);
                if (rspan > 1) {
                  issues.push(`Column ${colIndex + 1} has a cell spanning ${rspan} rows`);
                }
                if (cspan > 1) {
                  issues.push(`Row ${rowIndex + 1} has a cell spanning ${cspan} columns`);
                }
                if (cell.tagName.toLowerCase() === "th") {
                  const scope = cell.getAttribute("scope");
                  if (!scope) {
                    issues.push(`Header cell in row ${rowIndex + 1} is missing a scope attribute`);
                  }
                }
              });
            });
            return issues;
          }
          let scanTimer = null;
          let scanRunning = false;
          let scanPending = false;
          function requestScan() {
            scanPending = true;
            clearTimeout(scanTimer);
            scanTimer = setTimeout(runScan, 100);
          }
          function runScan() {
            if (scanRunning) return;
            scanRunning = true;
            scanPending = false;
            try {
              scanTables();
            } finally {
              scanRunning = false;
              if (scanPending) {
                requestScan();
              }
            }
          }
          function scanTables() {
            const tables = container.querySelectorAll("table");
            tables.forEach((table) => {
              if (table.closest(".AccessibilityHelper")) return;
              if (table._a11yTableProcessed) return;
              (async () => {
                if (await getSetting("tableHeaders")) {
                  const headers = table.querySelectorAll("th");
                  headers.forEach((th) => {
                    th.style.outline = "2px solid rgba(255, 128, 0, 0.6)";
                    th.style.outlineOffset = "-2px";
                  });
                }
              })();
              table._a11yTableProcessed = true;
              const issues = analyzeTableForA11yIssues(table);
              if (issues.length === 0) return;
              const label = document.createElement("div");
              label.className = "A11y-table-label";
              label.innerHTML = "<span style='color: #c00;'>" + issues.join("\n") + "</span>";
              overlayContainer.appendChild(label);
              const border = document.createElement("div");
              border.className = "A11y-table-border";
              overlayContainer.appendChild(border);
              function updatePositions() {
                const r = table.getBoundingClientRect();
                const visible = isActuallyVisible(table);
                if (visible) {
                  label.style.display = "block";
                  border.style.display = "block";
                  label.style.top = window.scrollY + r.top - label.offsetHeight - 8 + "px";
                  label.style.left = window.scrollX + r.left + "px";
                  border.style.top = window.scrollY + r.top - 8 + "px";
                  border.style.left = window.scrollX + r.left - 8 + "px";
                  border.style.width = r.width + 16 + "px";
                  border.style.height = r.height + 16 + "px";
                } else {
                  label.style.display = "none";
                  border.style.display = "none";
                }
              }
              function highlight() {
                border.style.borderColor = "#393";
                border.style.boxShadow = "1px 2px 5px #CCC";
                label.style.borderColor = "#393";
                label.style.boxShadow = "1px 2px 5px #CCC";
              }
              function unhighlight() {
                border.style.borderColor = "#CCC";
                border.style.boxShadow = "none";
                label.style.borderColor = "#CCC";
                label.style.boxShadow = "none";
              }
              table.addEventListener("pointerenter", highlight);
              table.addEventListener("pointerleave", unhighlight);
              label.addEventListener("pointerenter", highlight);
              label.addEventListener("pointerleave", unhighlight);
              table._highlightFunction = highlight;
              table._unhighlightFunction = unhighlight;
              updatePositions();
              const tableObserver = new MutationObserver(updatePositions);
              tableObserver.observe(table, {
                attributes: true,
                attributeFilter: ["style", "class", "hidden", "open"]
              });
              table._a11yTableObserver = tableObserver;
              table._updateFunction = updatePositions;
              document.addEventListener("scroll", updatePositions, { capture: true, passive: true });
              window.addEventListener("resize", updatePositions, { passive: true });
              updateFunctions.push(updatePositions);
            });
          }
          scanTables();
          if (overlayContainer._observer) {
            overlayContainer._observer.disconnect();
          }
          const observer = new MutationObserver(async (mutations) => {
            let shouldScan = false;
            for (const m of mutations) {
              const el = m.target.nodeType === Node.ELEMENT_NODE ? m.target : m.target.parentElement;
              if (!el?.closest(".AccessibilityHelper")) {
                shouldScan = true;
                break;
              }
            }
            if (shouldScan) {
              requestScan();
            }
          });
          observer.observe(container, { childList: true, subtree: true });
          overlayContainer._observer = observer;
        }
        function removeTableOverlay() {
          const tool = TOOLS.TABLE;
          const toolKey = tool.key;
          const overlayContainer = document.querySelector(`.AccessibilityHelper[data-tool='${toolKey}']`);
          if (overlayContainer) {
            if (overlayContainer._observer) overlayContainer._observer.disconnect();
            overlayContainer.remove();
          }
          document.querySelectorAll("table").forEach((table) => {
            if (table._a11yTableObserver) {
              table._a11yTableObserver.disconnect();
              delete table._a11yTableObserver;
            }
            document.removeEventListener("scroll", table._updateFunction, { capture: true, passive: true });
            window.removeEventListener("resize", table._updateFunction, { passive: true });
            table.removeEventListener("pointerenter", table._highlightFunction);
            table.removeEventListener("pointerleave", table._unhighlightFunction);
            const index = updateFunctions.indexOf(table._updateFunction);
            if (index > -1) updateFunctions.splice(index, 1);
            const headers = table.querySelectorAll("th");
            headers.forEach((th) => {
              th.style.outline = "";
              th.style.outlineOffset = "";
            });
            delete table._updateFunction;
            delete table._highlightFunction;
            delete table._unhighlightFunction;
            delete table._a11yTableProcessed;
          });
        }
        function runWhenPageLoaded() {
          let timeout = null;
          const observer = new MutationObserver(() => {
            clearTimeout(timeout);
            timeout = setTimeout(async () => {
              observer.disconnect();
              document.getElementById("a11y-init-trigger")?.remove();
              const container = document.body;
              for (const tool of Object.values(TOOLS)) {
                const enabled = await getToolState(tool);
                if (enabled) {
                  await tool.run(container);
                }
              }
            }, 250);
          });
          observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true
          });
          const trigger = document.createElement("div");
          trigger.id = "a11y-init-trigger";
          trigger.hidden = true;
          document.body.append(trigger);
        }
        let resizeTimeout;
        const ro = new ResizeObserver(() => {
          clearTimeout(resizeTimeout);
          resizeTimeout = setTimeout(() => {
            updateFunctions.forEach((fn) => fn());
          }, 150);
        });
        ro.observe(document.body);
        setInterval(() => {
          updateFunctions.forEach((fn) => fn());
        }, 2e3);
        runWhenPageLoaded();
        chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
          switch (msg.action) {
            case "activateAll":
              (async () => {
                await runAll();
                sendResponse(true);
              })();
              return true;
            case "deactivateAll":
              (async () => {
                await removeAll();
                sendResponse(true);
              })();
              return true;
            case "toggleTool":
              (async () => {
                const tool = Object.values(TOOLS).find((t) => t.key === msg.key);
                await toggleTool(tool, msg.value);
                sendResponse(true);
              })();
              return true;
            case "getA11ySetting":
              (async () => {
                const tool = Object.values(TOOLS).find((t) => t.key === msg.value);
                sendResponse(await getToolState(tool));
              })();
              return true;
          }
        });
      })();
    }
  });
  require_autoA11yTools();
})();
