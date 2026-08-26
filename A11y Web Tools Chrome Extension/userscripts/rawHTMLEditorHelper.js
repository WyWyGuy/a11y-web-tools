(async function () {
    "use strict";

    async function getSetting(request) {
        return new Promise(async resolve => {
            await chrome.runtime.sendMessage({ action: 'getSetting', value: request }, resolve);
        });
    }

    // Load settings
    const EDITOR_HIGHLIGHTS = await getSetting("editorHighlights");
    const EXPAND_EDITOR = await getSetting("expandEditBoxes");
    let autoSwitch = await getSetting("defaultEditor");

    // Only run on edit pages and question bank pages
    const path = location.pathname;
    const isEditPage = path.endsWith('/edit');
    const isQuestionBank = path.includes('/question_banks/');
    if (!isEditPage && !isQuestionBank) {
        return;
    }

    const SEARCH_PATTERNS = [
        { regex: /aria-label=&quot;(?:[^&]|&(?:quot|amp|#39);)*?&quot;/gi, style: "background: rgba(0, 255, 90, 0.35);" },
        { regex: /title=&quot;(?:[^&]|&(?:quot|amp|#39);)*?&quot;/gi, style: "background: rgba(255,0,0,0.30);" },
        { regex: /aria-description=&quot;(?:[^&]|&(?:quot|amp|#39);)*?&quot;/gi, style: "background: rgba(255,0,0,0.30);" },
        { regex: /alt=&quot;(?:[^&]|&(?:quot|amp|#39);)*?&quot;/gi, style: "background: rgba(0,255,220,0.4);" },
        { regex: /&lt;table\b(?:[^&]|&(?:quot|amp|#39);)*?&gt;/gi, style: "background: rgba(255,164,0,0.45);" },
        { regex: /&lt;h1\b[\s\S]*?&gt;[\s\S]*?&lt;\/h1&gt;/gi, style: "background: rgba(128,0,128,0.55);" },
        { regex: /&lt;h2\b[\s\S]*?&gt;[\s\S]*?&lt;\/h2&gt;/gi, style: "background: rgba(128,0,128,0.43);" },
        { regex: /&lt;h3\b[\s\S]*?&gt;[\s\S]*?&lt;\/h3&gt;/gi, style: "background: rgba(128,0,128,0.35);" },
        { regex: /&lt;h4\b[\s\S]*?&gt;[\s\S]*?&lt;\/h4&gt;/gi, style: "background: rgba(128,0,128,0.28);" },
        { regex: /&lt;h5\b[\s\S]*?&gt;[\s\S]*?&lt;\/h5&gt;/gi, style: "background: rgba(128,0,128,0.2);" },
        { regex: /&lt;h6\b[\s\S]*?&gt;[\s\S]*?&lt;\/h6&gt;/gi, style: "background: rgba(128,0,128,0.15);" },
        { regex: /lang=&quot;(?:[^&]|&(?:quot|amp|#39);)*?&quot;/gi, style: "background: rgba(0,80,0,0.35);" },
        { regex: /&lt;a\b(?:[^&]|&(?:quot|amp|#39);)*?&gt;(?:\s|&nbsp;)*&lt;\/a&gt;/gi, style: "background: rgba(255,219,0,0.45);" }
        // Blue: background: rgba(0, 125, 255, 0.35);
    ];

    const style = document.createElement("style");
    style.textContent = `
    .helper-canvas-style-button {
        border-radius: 3px;
        background-color: #002e5d;
        color: #fff;
        border: 1px solid #002850;
        cursor: pointer;
    }`;
    document.head.appendChild(style);

    const clicked = new WeakSet();

    function clickIfEligible(el) {
        if (!el || clicked.has(el)) return;
        clicked.add(el);
        setTimeout(() => el.click(), 250);
    }

    function scanForButtons(root = document) {
        const rawMatches = [...root.querySelectorAll("button")].filter(el => el.textContent.includes("Switch to raw HTML Editor"));
        rawMatches.forEach(clickIfEligible);

        if (autoSwitch) {
            const htmlButtons = [...root.querySelectorAll("button")].filter(el => {
                if (clicked.has(el)) return false;

                const title = el.getAttribute?.("title") || "";
                const text = el.textContent || "";

                return (
                    title.includes("Switch to the rich text editor") ||
                    title.includes("Click or shift-click for the html editor") ||
                    text.includes("Switch to the rich text editor") ||
                    text.includes("Switch to the html editor")
                );
            });

            htmlButtons.forEach(el => {
                const title = el.getAttribute?.("title") || "";
                const text = el.textContent || "";
                if (title.includes("Click or shift-click for the html editor") || text.includes("Switch to the html editor")) {
                    clickIfEligible(el);
                }
            });
        }
    }

    scanForButtons();

    const rawButtonObserver = new MutationObserver(mutations => {
        for (const m of mutations) {
            if (m.addedNodes) {
                for (const node of m.addedNodes) {
                    if (node.nodeType === 1) {
                        scanForButtons(node);
                    }
                }
            }
        }
    });

    rawButtonObserver.observe(document.documentElement, {
        childList: true,
        subtree: true
    });

    setInterval(scanForButtons, 500);

    // Helper functions
    function escapeHtml(str) {
        return str.replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function decodeHtml(str) {
        const textarea = document.createElement("textarea");
        textarea.innerHTML = str;
        return textarea.value;
    }

    function escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    function customPrompt(options = {}, src = null, placeholder = "") {
        return new Promise((resolve) => {
            const overlay = document.createElement("div");
            overlay.style.position = "fixed";
            overlay.style.top = 0;
            overlay.style.left = 0;
            overlay.style.width = "100vw";
            overlay.style.height = "100vh";
            overlay.style.backgroundColor = "rgba(0,0,0,0.6)";
            overlay.style.display = "flex";
            overlay.style.alignItems = "center";
            overlay.style.justifyContent = "center";
            overlay.style.zIndex = 9999;

            const modal = document.createElement("div");
            modal.style.backgroundColor = "#fff";
            modal.style.padding = "20px";
            modal.style.borderRadius = "12px";
            modal.style.boxShadow = "0 4px 20px rgba(0,0,0,0.3)";
            modal.style.maxWidth = "400px";
            modal.style.width = "90%";
            modal.style.textAlign = "center";

            const titleDiv = document.createElement("div");
            titleDiv.innerHTML = "<b>Current iframe attributes:</b><br><br>";
            titleDiv.style.marginBottom = "12px";
            modal.appendChild(titleDiv);

            const optionNames = ["aria-label", "aria-description", "title"];
            optionNames.forEach(name => {
                const value = options[name] ?? "[Empty]";
                const optionDiv = document.createElement("div");
                optionDiv.style.marginBottom = "6px";
                optionDiv.style.display = "flex";
                optionDiv.style.alignItems = "center";
                optionDiv.style.justifyContent = "space-between";
                optionDiv.style.textAlign = "left";

                const labelSpan = document.createElement("span");
                const nameSpan = document.createElement("span");
                nameSpan.textContent = `${name}: `;
                const valueSpan = document.createElement("span");
                valueSpan.textContent = value;
                if (value && value !== "[Empty]") {
                    valueSpan.style.fontWeight = "bold";
                } else {
                    valueSpan.style.fontStyle = "italic";
                    valueSpan.style.opacity = "0.7";
                }
                labelSpan.appendChild(nameSpan);
                labelSpan.appendChild(valueSpan);
                optionDiv.appendChild(labelSpan);

                const useBtn = document.createElement("button");
                useBtn.textContent = "✅";
                useBtn.disabled = !value || value === "[Empty]";
                useBtn.onclick = () => input.value = value;
                optionDiv.appendChild(useBtn);

                modal.appendChild(optionDiv);
            });

            const iframe = document.createElement("iframe");
            iframe.src = decodeHtml(src);
            iframe.style.maxHeight = "200px";
            modal.appendChild(iframe);

            const inputLabel = document.createElement("div");
            inputLabel.innerHTML = "<br>Type accessible aria-label:";
            inputLabel.style.margin = "12px 0 6px";
            modal.appendChild(inputLabel);

            const input = document.createElement("input");
            input.type = "text";
            input.style.width = "80%";
            input.style.padding = "6px 8px";
            input.style.fontSize = "14px";
            input.value = placeholder;
            modal.appendChild(input);

            const confirmBtn = document.createElement("button");
            confirmBtn.textContent = "Confirm";
            confirmBtn.style.marginTop = "12px";
            confirmBtn.style.padding = "6px 12px";
            confirmBtn.style.fontSize = "14px";
            confirmBtn.onclick = () => {
                cleanup();
                resolve(input.value);
            };
            modal.appendChild(confirmBtn);

            input.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    confirmBtn.click();
                }
            });

            overlay.appendChild(modal);
            document.body.appendChild(overlay);

            input.focus();

            overlay.addEventListener("click", (e) => {
                if (e.target === overlay) e.stopPropagation();
            });

            function cleanup() { document.body.removeChild(overlay); }
        });
    }

    function popUp(message) {
        const toast = document.createElement("div");
        toast.textContent = message;

        Object.assign(toast.style, {
            position: "fixed",
            top: "20px",
            right: "20px",
            background: "rgba(117, 220, 238, 0.85)",
            color: "#000",
            padding: "10px 16px",
            borderRadius: "8px",
            fontSize: "14px",
            fontFamily: "sans-serif",
            zIndex: "9999",
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

    async function ariaLabelUpdate(textarea) {
        const before = textarea.value;
        if (!before) return;
        if (getComputedStyle(textarea).display === 'none') {
            popUp("Please switch to the raw HTML editor to use this feature");
            return;
        }

        const iframeRegex = /<iframe\b([^>]*)>/gi;
        let match;
        let newHTML = before;
        const matches = [];

        while ((match = iframeRegex.exec(before)) !== null) {
            matches.push({ fullMatch: match[0], attrs: match[1], index: match.index });
        }

        for (const item of matches) {
            const { fullMatch, attrs } = item;

            const titleMatch = attrs.match(/\btitle="([^"]*)"/i);
            const descMatch = attrs.match(/\bdescription="([^"]*)"/i);
            const ariaMatch = attrs.match(/\baria-label="([^"]*)"/i);

            const title = titleMatch ? decodeHtml(titleMatch[1]) : null;
            const description = descMatch ? decodeHtml(descMatch[1]) : null;
            const aria = ariaMatch ? decodeHtml(ariaMatch[1]) : null;

            let newLabel = "";
            const existing = [title, description, aria].filter(v => v && v.trim() !== "");

            /*
            // If only one option exists or all options are identical, and the only option doesn't say "video player", use that
            if (
                existing.length > 0 &&
                existing.every(v => v === existing[0]) &&
                !existing[0].toLowerCase().includes("video player")
            ) {
                newLabel = existing[0];
            } else {
                // Else, prompt the user to choose from the available options or write their own
                const previewMatch = attrs.match(/\bsrc="([^"]*)"/i);
                const preview = previewMatch ? previewMatch[1] : null;

                newLabel = await customPrompt({
                    "aria-label": aria,
                    "aria-description": description,
                    "title": title
                }, preview);
            }
            */

            const previewMatch = attrs.match(/\bsrc="([^"]*)"/i);
            const preview = previewMatch ? previewMatch[1] : null;

            let suggestion = "";
            if (
                existing.length > 0 &&
                existing.every(v => v === existing[0]) &&
                !existing[0].toLowerCase().includes("video player")
            ) {
                suggestion = existing[0];
            }

            newLabel = await customPrompt({
                "aria-label": aria,
                "aria-description": description,
                "title": title
            }, preview, suggestion);

            let newAttrs = attrs
            .replace(/\btitle="[^"]*"/i, "")
            .replace(/\bdescription="[^"]*"/i, "")
            .replace(/\baria-label="[^"]*"/i, "")
            .trim();

            if (newLabel) newAttrs += ` aria-label="${escapeHtml(newLabel)}"`;

            if (newLabel && newLabel.trim() !== "") {
                newHTML = newHTML.replace(fullMatch, `<iframe ${newAttrs}>`);
            }
        }

        textarea.value = newHTML;
        textarea.dispatchEvent(new Event("input", { bubbles: true }));

        popUp(`Processed ${matches.length} iframe${matches.length === 1 ? "" : "s"}`);
    }

    function findRealSaveButton(textarea) {

        function getTextareaType(textarea) {
            let current = textarea.parentElement;
            while (current) {
                if (current.classList.contains("select_answer") && current.classList.contains("answer_type")) {
                    return "answer";
                }
                if (current.id && current.id.includes("question_text")) {
                    return "question";
                }
                current = current.parentElement;
            }
            return "page";
        }

        function findNextButton(el, labels) {
            let current = el.parentElement;
            while (current) {
                const candidates = Array.from(current.querySelectorAll('button, a.btn'))
                .filter(btn => {
                    const id = btn.id || "";
                    const classes = btn.className || "";
                    return !classes.includes("helper-save-btn") &&
                        !id.includes("move_quiz_item_submit_btn") &&
                        !classes.includes("create_group");
                });
                for (const btn of candidates) {
                    if (labels.includes(btn.textContent.trim().toLowerCase())) {
                        return btn;
                    }
                }
                current = current.parentElement;
            }
            return null;
        }

        const type = getTextareaType(textarea);

        if (type === "answer") {
            return findNextButton(textarea, ["done"]);
        } else if (type === "question") {
            return findNextButton(textarea, ["update question"]);
        } else {
            return findNextButton(textarea, ["save"]);
        }
    }

    // Primary function (runs per textarea)
    function enhanceTextarea(textarea) {
        // Expand the raw editor
        if (EXPAND_EDITOR) {
            textarea.style.width = "100%";
            if ((textarea.value.split("\n").length > 15) || (textarea.value.length > 2000)) {
                textarea.style.height = "800px";
            }
        }

        // Early return if processed
        if (textarea.dataset.overlayHighlight) return;
        textarea.dataset.overlayHighlight = "true";

        // Scroll to the top once loaded
        const checkLoaded = setInterval(() => {
            if (textarea.scrollHeight && textarea.scrollHeight > 0) {
                textarea.scrollTop = 0;
                overlaysScrollSync();
                clearInterval(checkLoaded);
            }
        }, 250);

        // Create additional buttons above textarea
        const style = getComputedStyle(textarea);

        const wrapper = document.createElement("div");
        wrapper.classList.add("RawHtmlOverlayWrapper");
        wrapper.style.position = "relative";
        wrapper.style.display = "block";
        wrapper.style.width = "100%";
        wrapper.style.boxSizing = "border-box";

        textarea.style.position = "relative";
        textarea.style.zIndex = "100";
        textarea.style.background = "transparent";

        textarea.parentNode.insertBefore(wrapper, textarea);
        wrapper.appendChild(textarea);

        const searchState = { term: "", ranges: [], index: -1 };
        const searchBar = document.createElement("div");
        searchBar.style.position = "absolute";
        searchBar.style.top = "-65px";
        searchBar.style.right = "0";
        searchBar.style.display = "flex";
        searchBar.style.flexDirection = "column";
        searchBar.style.alignItems = "flex-end";
        searchBar.style.gap = "4px";
        searchBar.style.fontSize = "12px";
        searchBar.style.zIndex = "200";

        const searchInput = document.createElement("input");
        searchInput.type = "text";
        searchInput.placeholder = "Find…";
        searchInput.style.width = "140px";
        searchInput.style.padding = "2px 4px";
        searchInput.style.margin = "0";
        searchInput.addEventListener("keydown", e => {
            if (e.key === "Enter") {
                e.preventDefault();
            }
        });

        const prevBtn = document.createElement("button");
        prevBtn.textContent = "▲";
        prevBtn.type = "button";
        prevBtn.classList.add("helper-canvas-style-button");


        const nextBtn = document.createElement("button");
        nextBtn.textContent = "▼";
        nextBtn.type = "button";
        nextBtn.classList.add("helper-canvas-style-button");

        const counter = document.createElement("span");
        counter.textContent = "0 / 0";

        const ariaFixer = document.createElement("button");
        ariaFixer.textContent = "Fix Aria-labels";
        ariaFixer.type = "button";
        ariaFixer.classList.add("helper-canvas-style-button");
        ariaFixer.onclick = () => ariaLabelUpdate(textarea);

        const saveBtn = document.createElement("button");
        saveBtn.type = "button";
        saveBtn.classList.add("helper-save-btn", "helper-canvas-style-button");
        saveBtn.textContent = "Save";
        saveBtn.addEventListener("click", () => {
            const realBtn = findRealSaveButton(textarea);
            if (realBtn) {
                realBtn.click();
            } else {
                popUp("No save button found.");
            }
        });

        const buttonLine = document.createElement("div");
        buttonLine.style.display = "flex";
        buttonLine.style.alignItems = "center";
        buttonLine.style.gap = "4px";
        buttonLine.append(ariaFixer, saveBtn);

        const searchLine = document.createElement("div");
        searchLine.style.display = "flex";
        searchLine.style.alignItems = "center";
        searchLine.style.gap = "4px";
        searchLine.append(searchInput, prevBtn, nextBtn, counter);

        searchBar.append(buttonLine, searchLine);
        (async () => {
            if (await getSetting("extraEditorHelps")) {
                wrapper.appendChild(searchBar);
            }
        })();

        const mirror = document.createElement("div");
        mirror.style.position = "absolute";
        mirror.style.visibility = "hidden";
        mirror.style.whiteSpace = "pre-wrap";
        mirror.style.wordWrap = "break-word";
        mirror.style.overflowWrap = "break-word";
        mirror.style.boxSizing = "border-box";

        mirror.style.fontFamily = style.fontFamily;
        mirror.style.fontSize = style.fontSize;
        mirror.style.fontWeight = style.fontWeight;
        mirror.style.fontStyle = style.fontStyle;
        mirror.style.letterSpacing = style.letterSpacing;
        mirror.style.lineHeight = style.lineHeight;
        mirror.style.padding = `${style.paddingTop} ${style.paddingRight} ${style.paddingBottom} ${style.paddingLeft}`;

        wrapper.appendChild(mirror);

        // Create highlight overlays
        function createOverlay(zIndex) {
            const ov = document.createElement("div");
            ov.style.position = "absolute";
            ov.style.top = "0";
            ov.style.left = "0";
            ov.style.right = "0";
            ov.style.bottom = "0";
            ov.style.pointerEvents = "none";
            ov.style.overflow = "hidden";
            ov.style.zIndex = zIndex;
            ov.style.color = "transparent";
            ov.style.whiteSpace = "pre-wrap";
            ov.style.wordWrap = "break-word";

            const content = document.createElement("div");
            ov.appendChild(content);

            content.style.fontFamily = style.fontFamily;
            content.style.fontSize = style.fontSize;
            content.style.fontWeight = style.fontWeight;
            content.style.fontStyle = style.fontStyle;
            content.style.letterSpacing = style.letterSpacing;
            content.style.textAlign = style.textAlign;
            content.style.textIndent = style.textIndent;
            content.style.tabSize = style.tabSize;
            content.style.lineHeight = style.lineHeight === "normal"
                ? (parseFloat(style.fontSize) * 1.2) + "px"
            : style.lineHeight;
            content.style.paddingTop = style.paddingTop;
            content.style.paddingRight = style.paddingRight;
            content.style.paddingBottom = style.paddingBottom;
            content.style.paddingLeft = style.paddingLeft;
            content.style.boxSizing = style.boxSizing;
            content.style.overflowWrap = "break-word";
            content.style.wordBreak = "normal";

            return { container: ov, content };
        }

        const findOverlay = createOverlay(50);
        wrapper.appendChild(findOverlay.container);

        let patternOverlays;
        if (EDITOR_HIGHLIGHTS) {
            patternOverlays = SEARCH_PATTERNS.map(() => createOverlay(0));
            patternOverlays.forEach(ov => wrapper.appendChild(ov.container));
        }

        // Overlay helper functions
        function syncAllOverlayWidths() {
            const innerWidth = textarea.getBoundingClientRect().width - (textarea.offsetWidth - textarea.clientWidth);
            findOverlay.content.style.width = innerWidth + "px";
            if (EDITOR_HIGHLIGHTS) {
                patternOverlays.forEach(ov => {
                    ov.content.style.width = innerWidth + "px";
                });
            }
        }

        function mapRawIndexToEscaped(raw, escaped, rawIndex) {
            let r = 0, e = 0;
            while (r < rawIndex && r < raw.length) {
                const ch = raw[r];
                if (ch === "&") e += 5;
                else if (ch === "<" || ch === ">") e += 4;
                else if (ch === '"') e += 6;
                else if (ch === "'") e += 5;
                else e += 1;
                r++;
            }
            return e;
        }

        function injectHighlights(html, ranges, activeIndex = -1, color = "rgba(0,128,255,0.35)", activeColor = "rgba(0,128,255,0.75)") {
            if (!ranges.length) return html;
            let out = "", last = 0;
            ranges.forEach((r, i) => {
                out += html.slice(last, r.start);
                const style = i === activeIndex
                ? `background: ${activeColor};`
                : `background: ${color};`;
                out += `<span style="${style}">${html.slice(r.start, r.end)}</span>`;
                last = r.end;
            });
            out += html.slice(last);
            return out;
        }

        function focusSearchBox() {
            searchInput.focus();
            searchInput.select();
            searchLine.style.boxShadow = "0 0 0 2px rgba(0,128,255,0.6)";
            setTimeout(() => searchLine.style.boxShadow = "", 300);

            searchState.term = searchInput.value;
            searchState.index = searchState.term ? 0 : -1;
            syncOverlays();
        }

        wrapper._focusSearchBox = focusSearchBox;

        function syncOverlays() {
            if (getComputedStyle(textarea).display === 'none') return;

            syncAllOverlayWidths();

            const raw = textarea.value;
            const rawEscaped = escapeHtml(raw);

            searchState.ranges = [];
            if (searchState.term) {
                const re = new RegExp(escapeRegex(searchState.term), "gi");
                let m;
                while ((m = re.exec(raw)) !== null) {
                    searchState.ranges.push({ start: m.index, end: m.index + m[0].length });
                }
            }
            const mappedFind = searchState.ranges.map(r => ({
                start: mapRawIndexToEscaped(raw, rawEscaped, r.start),
                end: mapRawIndexToEscaped(raw, rawEscaped, r.end)
            }));
            findOverlay.content.innerHTML = injectHighlights(rawEscaped, mappedFind, searchState.index);

            if (EDITOR_HIGHLIGHTS) {
                SEARCH_PATTERNS.forEach((p, i) => {
                    patternOverlays[i].content.innerHTML = rawEscaped.replace(p.regex, match => {
                        return `<span style="${p.style}">${match}</span>`;
                    });
                });
            }

            overlaysScrollSync();
            counter.textContent = searchState.ranges.length
                ? `${searchState.index + 1} / ${searchState.ranges.length}`
            : "0 / 0";
        }

        function overlaysScrollSync() {
            const scrollTop = textarea.scrollTop;
            const scrollLeft = textarea.scrollLeft;
            findOverlay.container.scrollTop = scrollTop;
            findOverlay.container.scrollLeft = scrollLeft;
            if (EDITOR_HIGHLIGHTS) {
                patternOverlays.forEach(ov => {
                    ov.container.scrollTop = scrollTop;
                    ov.container.scrollLeft = scrollLeft;
                });
            }
        }

        function scrollToMatch(index, focus) {
            if (!searchState.ranges.length) return;

            const r = searchState.ranges[index];

            textarea.setSelectionRange(r.start, r.end);
            if (focus) {textarea.focus();}

            mirror.style.width = textarea.clientWidth + "px";

            mirror.textContent = textarea.value.slice(0, r.start);

            const caretY = mirror.scrollHeight;

            textarea.scrollTop = Math.max(0, caretY - textarea.clientHeight / 3);

            overlaysScrollSync();
        }

        function jumpToMatch(dir) {
            if (!searchState.ranges.length) return;
            searchState.index = (searchState.index + dir + searchState.ranges.length) % searchState.ranges.length;
            syncOverlays();
            scrollToMatch(searchState.index, true);
        }

        // Overlay update listeners
        textarea.addEventListener("input", syncOverlays);
        textarea.addEventListener("scroll", overlaysScrollSync);
        textarea.addEventListener("focus", syncOverlays);
        textarea.addEventListener("mouseenter", syncOverlays);

        textarea.addEventListener("mouseenter", syncAllOverlayWidths);
        textarea.addEventListener("focus", syncAllOverlayWidths);

        searchInput.addEventListener("input", () => {
            searchState.term = searchInput.value;
            searchState.index = searchState.term ? 0 : -1;
            syncOverlays();
            if (searchState.index !== -1) scrollToMatch(searchState.index, false);
        });
        prevBtn.addEventListener("click", () => jumpToMatch(-1));
        nextBtn.addEventListener("click", () => jumpToMatch(1));

        new ResizeObserver(() => syncOverlays()).observe(textarea);

        function globalCtrlFHandler(e) {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
                if (!wrapper.isConnected) return;

                e.preventDefault();
                focusSearchBox();
            }
        }

        // Initial sync
        syncOverlays();
    }

    function scan() {
        document.querySelectorAll('textarea[data-rich_text="true"]').forEach(enhanceTextarea);
    }

    // Helper for rich content editors
    const resizedEditors = new WeakSet();
    function resizeRichEditor(root = document) {
        if (!EXPAND_EDITOR) return;
        const editors = root.querySelectorAll('.tox.tox-tinymce');
        editors.forEach(el => {
            if (resizedEditors.has(el)) return;
            const iframe = el.querySelector('iframe');
            if (!iframe) return;
            let body;
            try {
                body = iframe.contentDocument?.body;
            } catch {
                return;
            }
            if (!body) return;
            const text = body.innerText || "";
            const html = body.innerHTML || "";
            if (text.split("\n").length > 15 || html.length > 2000) {
                el.style.height = "800px";
                resizedEditors.add(el);
            }
        });
    }

    // Key capture
    if (await getSetting("extraEditorHelps")) {
        document.addEventListener("keydown", e => {
            if (!(e.ctrlKey || e.metaKey)) return;
            if (e.key.toLowerCase() !== "f" && e.key.toLowerCase() !== "s") return;

            if (e.key.toLowerCase() === "f") {

                const active = document.activeElement;

                // Case 1: Cursor is inside textarea
                if (active && active.tagName === "TEXTAREA") {
                    const wrapper = active.closest(".RawHtmlOverlayWrapper");
                    if (wrapper?._focusSearchBox) {
                        e.preventDefault();
                        wrapper._focusSearchBox();
                        return;
                    }
                }

                // Case 2: Cursor is inside search input
                if (active && active.tagName === "INPUT") {
                    const wrapper = active.closest(".RawHtmlOverlayWrapper");
                    if (wrapper?._focusSearchBox) {
                        e.preventDefault();
                        wrapper._focusSearchBox();
                        return;
                    }
                }

                // Case 3: Cursor somewhere inside wrapper UI
                if (active) {
                    const wrapper = active.closest(".RawHtmlOverlayWrapper");
                    if (wrapper?._focusSearchBox) {
                        e.preventDefault();
                        wrapper._focusSearchBox();
                    }
                }

                // Case 4 (default): No relevant focus -> open first editor search box
                const firstWrapper = document.querySelector(".RawHtmlOverlayWrapper");
                if (firstWrapper?._focusSearchBox) {
                    e.preventDefault();
                    firstWrapper._focusSearchBox();
                }

            } else if (e.key.toLowerCase() === "s") {

                e.preventDefault();
                const textarea = document.activeElement;
                if (!textarea || textarea.tagName !== "TEXTAREA") return;
                const realBtn = findRealSaveButton(textarea);
                if (realBtn) {
                    realBtn.click();
                } else {
                    popUp("No save button found.");
                }

            }
        });
    }

    // Initial scan
    scan();

    // Find newly created textareas
    new MutationObserver(mutations => {
        for (const m of mutations) {
            if (m.addedNodes.length) {
                scan();
                for (const node of m.addedNodes) {
                    if (node.nodeType === 1 && node.parentElement != null) {
                        resizeRichEditor(node.parentElement);
                    }
                }
                break;
            }
        }
    }).observe(document.body, { childList: true, subtree: true });

    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg.action === 'toggleDefaultEditor') {
            autoSwitch = msg.value;
        }
    });

})();
