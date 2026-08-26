(function() {
    'use strict';

    // --- Styles ---
    if (!document.getElementById('counter-helper-style')) {
        const s = document.createElement('style');
        s.id = 'counter-helper-style';
        s.textContent = `
            .CounterHelper-label {
                background:#FFF;
                border:3px solid #CCC;
                border-radius:4px;
                padding:2px 4px;
                position:absolute;
                white-space:nowrap;
                font-size:12px;
                z-index:10001;
                color:black;
                transition:all 0.2s ease;
                display:none;
            }
            .CounterHelper-border {
                position:absolute;
                border:3px solid #CCC;
                border-radius:4px;
                z-index:9999;
                pointer-events:none;
                transition:all 0.2s ease;
                display:none;
            }
            .CounterHelper-highlight {
                border-color:#393!important;
                box-shadow:1px 2px 5px #CCC;
            }
        `;
        document.head.appendChild(s);
    }

    // --- Utility ---
    function isActuallyVisible(el) {
        if (!(el instanceof Element)) return false;

        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden') return false;

        const rect = el.getBoundingClientRect();

        if (rect.width === 0 || rect.height === 0) return false;

        let current = el;
        while (current) {
            if (current.closest('.AccessibilityHelper')) return false;
            if (current.closest('.CounterHelper')) return false;

            if (current.tagName === 'DETAILS' && !current.open) return false;

            const style = getComputedStyle(current);

            if (style.display === 'none' || style.visibility === 'hidden') return false;

            if (current.className && current.className.toString().toLowerCase().includes('screenreadercontent')) return false;

            if (style.overflow === 'auto' || style.overflow === 'scroll' || style.overflowX === 'auto' || style.overflowY === 'auto' || style.overflowX === 'scroll' || style.overflowY === 'scroll') {
                const parentRect = current.getBoundingClientRect();
                if (
                    rect.bottom < parentRect.top ||
                    rect.top > parentRect.bottom ||
                    rect.right < parentRect.left ||
                    rect.left > parentRect.right
                ) {
                    return false;
                }
            }

            current = current.parentElement;
        }

        return true;
    }

    const updateFunctions = [];

    // --- Core highlight function ---
    function runElementHighlightOverlay(container, selector, labelPrefix, typeKey) {
        let overlayContainer = document.querySelector(`.CounterHelper[data-tool='${typeKey}']`);

        if (!overlayContainer) {
            overlayContainer = document.createElement('div');
            overlayContainer.className = 'CounterHelper';
            overlayContainer.dataset.tool = typeKey;
            document.body.appendChild(overlayContainer);
        }

        overlayContainer.innerHTML = '';

        function scanElements() {
            let elements = [...container.querySelectorAll(selector)];

            // Custom filter example
            elements = elements.filter(el => el.id !== 'instructure_ajax_error_result');

            elements.forEach((el, i) => {
                if (el.closest('.CounterHelper')) return;
                if (el._a11yProcessed) return;
                el._a11yProcessed = true;

                const label = document.createElement('div');
                label.className = 'CounterHelper-label';
                label.textContent = `${labelPrefix} ${i + 1}`;
                overlayContainer.appendChild(label);

                const border = document.createElement('div');
                border.className = 'CounterHelper-border';
                overlayContainer.appendChild(border);

                function update() {
                    const r = el.getBoundingClientRect();
                    const visible = isActuallyVisible(el);

                    if (visible) {
                        label.style.display = 'block';
                        border.style.display = 'block';

                        const top = window.scrollY + r.top;
                        const left = window.scrollX + r.left;

                        border.style.top = top + 'px';
                        border.style.left = left + 'px';
                        border.style.width = r.width + 'px';
                        border.style.height = r.height + 'px';

                        label.style.top = top + 'px';
                        label.style.left = (left + r.width - label.offsetWidth) + 'px';
                    } else {
                        label.style.display = 'none';
                        border.style.display = 'none';
                    }
                }

                function highlight() {
                    label.classList.add('CounterHelper-highlight');
                    border.classList.add('CounterHelper-highlight');
                }

                function unhighlight() {
                    label.classList.remove('CounterHelper-highlight');
                    border.classList.remove('CounterHelper-highlight');
                }

                // Store handlers for cleanup
                el._highlightFunction = highlight;
                el._unhighlightFunction = unhighlight;

                el.addEventListener('mouseover', highlight);
                el.addEventListener('mouseout', unhighlight);
                label.addEventListener('mouseover', highlight);
                label.addEventListener('mouseout', unhighlight);

                update();

                const elementObserver = new MutationObserver(update);
                elementObserver.observe(el, {
                    attributes: true,
                    attributeFilter: ['style', 'class', 'hidden', 'open']
                });

                el._a11yObserver = elementObserver;
                el._updateFunction = update;

                document.addEventListener('scroll', update, { capture: true, passive: true });
                window.addEventListener('resize', update, { passive: true });
                updateFunctions.push(update);
            });
        }

        scanElements();

        if (overlayContainer._observer) {
            overlayContainer._observer.disconnect();
        }

        const observer = new MutationObserver(scanElements);
        observer.observe(container, { childList: true, subtree: true });

        overlayContainer._observer = observer;
    }

    function removeElementHighlightOverlay(selector, typeKey) {
        const overlayContainer = document.querySelector(`.CounterHelper[data-tool='${typeKey}']`);

        if (overlayContainer) {
            if (overlayContainer._observer) {
                overlayContainer._observer.disconnect();
            }
            overlayContainer.remove();
        }

        document.querySelectorAll(selector).forEach(el => {
            if (el._a11yObserver) {
                el._a11yObserver.disconnect();
                delete el._a11yObserver;
            }

            document.removeEventListener('scroll', el._updateFunction, { capture: true });
            window.removeEventListener('resize', el._updateFunction);

            el.removeEventListener('mouseover', el._highlightFunction);
            el.removeEventListener('mouseout', el._unhighlightFunction);

            const index = updateFunctions.indexOf(el._updateFunction);
            if (index > -1) updateFunctions.splice(index, 1);

            delete el._updateFunction;
            delete el._highlightFunction;
            delete el._unhighlightFunction;
            delete el._a11yProcessed;
        });
    }

    // --- Menu labels ---
    const elementLabels = {
        "table": "Table",
        "iframe" : "iFrame",
        "p" : "Paragraph"
    };

    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg.action === 'toggleCounting') {
            const existing = document.querySelector(
                `.CounterHelper[data-tool='${msg.key}']`
            );
            if (msg.value) {
                runElementHighlightOverlay(
                    document.body,
                    msg.key,
                    elementLabels[msg.key],
                    msg.key
                );
            } else {
                removeElementHighlightOverlay(msg.key, msg.key);
            }
        }
    });

    // Rebounced scanner for any page changes (like dropdowns) to force update
    let resizeTimeout;
    const ro = new ResizeObserver(() => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            updateFunctions.forEach(fn => fn());
        }, 150);
    });
    ro.observe(document.body);

    // Timer to ensure everything updates on a regular basis
    setInterval(() => {
        updateFunctions.forEach(fn => fn());
    }, 2000);

})();
