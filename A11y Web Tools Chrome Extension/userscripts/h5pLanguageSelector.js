(async function() {
    'use strict';

    const DEFAULT_LANGUAGE = 'english';
    const DROPDOWN_WAIT_TIMEOUT = 3000;

    let TARGET_TEXT = DEFAULT_LANGUAGE;

    // Documents that have already been initialized.
    const initializedDocuments = new WeakSet();

    // Iframes that already have a load listener attached.
    const initializedIframes = new WeakSet();

    // Panels that have already been handled while visible.
    const visiblePanels = new WeakSet();

    async function getSetting(request) {
        try {
            return await chrome.runtime.sendMessage({
                action: 'getSetting',
                value: request
            });
        } catch (error) {
            console.warn(`Unable to get setting "${request}":`, error);
            return null;
        }
    }

    // Recursively query inside shadow roots.
    function deepQueryAll(root, selector) {
        const results = Array.from(
            (root.querySelectorAll && root.querySelectorAll(selector)) || []
        );

        const elements = root.querySelectorAll
            ? Array.from(root.querySelectorAll('*'))
            : [];

        for (const el of elements) {
            if (el.shadowRoot) {
                results.push(...deepQueryAll(el.shadowRoot, selector));
            }
        }

        return results;
    }

    function isPanelVisible(panel) {
        if (!panel || !panel.classList) {
            return false;
        }

        try {
            if (
                panel.classList.contains('ck-on') ||
                panel.classList.contains('ck-dropdown__panel-visible')
            ) {
                return true;
            }

            const style = getComputedStyle(panel);

            return (
                style.display !== 'none' &&
                panel.offsetParent !== null
            );
        } catch (error) {
            console.warn('Unable to determine panel visibility:', error);
            return false;
        }
    }

    // Find the visible panel element.
    function findVisiblePanel(doc) {
        const candidates = deepQueryAll(
            doc,
            '.ck-dropdown__panel, .ck-dropdown__panel-visible, .ck-dropdown__panel.ck-on'
        );

        return candidates.find(isPanelVisible) || null;
    }

    async function scrollDropdownPanel(panel) {
        if (!panel) {
            return false;
        }

        const hotkeysEnabled = await getSetting("h5pHotkeys");

        if (hotkeysEnabled !== true) {
            return false;
        }

        const language = await getSetting("h5pLanguage");

        if (typeof language === "string" && language) {
            TARGET_TEXT = language;
        } else {
            TARGET_TEXT = DEFAULT_LANGUAGE;
        }

        const listItems = deepQueryAll(panel, '.ck-list__item');

        const targetItem = listItems.find(item =>
            (item.textContent || '')
                .toLowerCase()
                .includes(TARGET_TEXT.toLowerCase())
        );

        const scrollable =
            panel.querySelector('.ck-list__items') || panel;

        if (!targetItem) {
            scrollable.scrollTop = scrollable.scrollHeight;
            return false;
        }

        const btn =
            targetItem.querySelector('button') ||
            targetItem.querySelector('.ck-button') ||
            targetItem;

        if (!btn) {
            return false;
        }

        try {
            const btnRect = btn.getBoundingClientRect();
            const containerRect = scrollable.getBoundingClientRect();

            const desired =
                scrollable.scrollTop +
                (btnRect.top - containerRect.top) -
                (containerRect.height / 2) +
                (btnRect.height / 2);

            scrollable.scrollTop = Math.max(
                0,
                Math.round(desired)
            );
        } catch (error) {
            console.warn(
                "Unable to calculate dropdown scroll position:",
                error
            );

            try {
                scrollable.scrollTop = btn.offsetTop;
            } catch (fallbackError) {
                console.warn(
                    "Unable to use fallback dropdown scroll position:",
                    fallbackError
                );
                return false;
            }
        }

        return true;
    }

    // Focus and click an element.
    function clickElement(el) {
        if (!el) {
            return false;
        }

        try {
            el.focus();
            el.click();
            return true;
        } catch (error) {
            console.warn("Could not click element:", el, error);
            return false;
        }
    }

    // Return the actual clickable element for the target language.
    function findLanguageButton(panel) {
        if (!panel) {
            return null;
        }

        const items = deepQueryAll(panel, '.ck-list__item');

        const targetItem = items.find(item =>
            (item.textContent || '')
                .toLowerCase()
                .includes(TARGET_TEXT.toLowerCase())
        );

        if (!targetItem) {
            return null;
        }

        return (
            targetItem.querySelector('button') ||
            targetItem.querySelector('[role="option"]') ||
            targetItem.querySelector('.ck-button') ||
            targetItem
        );
    }

    async function selectLanguage(panel) {
        if (!panel) {
            return false;
        }

        const btn = findLanguageButton(panel);

        if (!btn) {
            return false;
        }

        await scrollDropdownPanel(panel);

        await new Promise(resolve => setTimeout(resolve, 10));

        if (!clickElement(btn)) {
            return false;
        }

        return true;
    }

    function getLanguageButton(doc) {
        const possibleButtons = deepQueryAll(
            doc,
            '.ck-dropdown__button, button[aria-label], button'
        );

        return possibleButtons.find(button => {
            try {
                const aria = button.getAttribute('aria-label');
                const text = (button.textContent || '').toLowerCase();

                return (
                    (aria && aria.toLowerCase().includes('language')) ||
                    text.includes('language')
                );
            } catch (error) {
                console.warn(
                    "Unable to inspect potential language button:",
                    error
                );
                return false;
            }
        }) || null;
    }

    // Wait for a visible panel containing list items.
    function waitForLanguagePanel(doc) {
        return new Promise(resolve => {
            const findPanelWithItems = () => {
                const panel = findVisiblePanel(doc);

                if (!panel) {
                    return null;
                }

                const items = deepQueryAll(
                    panel,
                    '.ck-list__item'
                );

                return items.length > 0 ? panel : null;
            };

            const immediatePanel = findPanelWithItems();

            if (immediatePanel) {
                resolve(immediatePanel);
                return;
            }

            const observer = new MutationObserver(() => {
                const panel = findPanelWithItems();

                if (panel) {
                    observer.disconnect();
                    clearTimeout(timeout);
                    resolve(panel);
                }
            });

            observer.observe(doc, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: [
                    'class',
                    'style',
                    'hidden',
                    'open'
                ]
            });

            const timeout = setTimeout(() => {
                observer.disconnect();
                resolve(null);
            }, DROPDOWN_WAIT_TIMEOUT);
        });
    }

    function initDropdownObserver(doc) {
        if (!doc || initializedDocuments.has(doc)) {
            return;
        }

        const targetWin = doc.defaultView;

        if (!targetWin) {
            console.warn("Unable to initialize H5P document: no window.");
            return;
        }

        let updateScheduled = false;

        function scheduleUpdate() {
            if (updateScheduled) {
                return;
            }

            updateScheduled = true;

            targetWin.requestAnimationFrame(() => {
                updateScheduled = false;

                const panels = deepQueryAll(
                    doc,
                    '.ck-dropdown__panel, .ck-dropdown__panel-visible, .ck-dropdown__panel.ck-on'
                );

                for (const panel of panels) {
                    const isVisible = isPanelVisible(panel);

                    if (isVisible && !visiblePanels.has(panel)) {
                        visiblePanels.add(panel);

                        scrollDropdownPanel(panel).catch(error => {
                            console.warn(
                                "Unable to scroll H5P language dropdown:",
                                error
                            );
                        });
                    } else if (
                        !isVisible &&
                        visiblePanels.has(panel)
                    ) {
                        visiblePanels.delete(panel);
                    }
                }
            });
        }

        const observer = new MutationObserver(() => {
            scheduleUpdate();
        });

        try {
            observer.observe(doc, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: [
                    'class',
                    'style',
                    'hidden',
                    'open'
                ]
            });
        } catch (error) {
            console.warn(
                "Unable to observe H5P document:",
                error
            );
            return;
        }

        initializedDocuments.add(doc);

        // Initial scan.
        scheduleUpdate();

        // One keyboard listener per document/window.
        targetWin.addEventListener('keydown', async e => {
            try {
                if (
                    e.repeat ||
                    !e.ctrlKey ||
                    e.shiftKey ||
                    e.altKey ||
                    e.code !== 'KeyQ'
                ) {
                    return;
                }

                const hotkeysEnabled = await getSetting(
                    'h5pHotkeys'
                );

                if (hotkeysEnabled !== true) {
                    return;
                }

                e.preventDefault();

                const language = await getSetting(
                    'h5pLanguage'
                );

                TARGET_TEXT =
                    typeof language === 'string' && language
                        ? language
                        : DEFAULT_LANGUAGE;

                const existingPanel = findVisiblePanel(doc);

                if (existingPanel) {
                    await selectLanguage(existingPanel);
                    return;
                }

                const langButton = getLanguageButton(doc);

                if (!langButton) {
                    return;
                }

                if (!clickElement(langButton)) {
                    return;
                }

                const visiblePanel =
                    await waitForLanguagePanel(doc);

                if (!visiblePanel) {
                    console.warn(
                        "Language dropdown did not open within the expected time."
                    );
                    return;
                }

                await selectLanguage(visiblePanel);
            } catch (error) {
                console.warn(
                    "Error handling H5P language hotkey:",
                    error
                );
            }
        }, true);
    }

    function attachToIframe(iframe) {
        if (!(iframe instanceof HTMLIFrameElement)) {
            return;
        }

        if (!initializedIframes.has(iframe)) {
            initializedIframes.add(iframe);

            iframe.addEventListener('load', () => {
                attachToIframe(iframe);
            });
        }

        try {
            const doc =
                iframe.contentDocument ||
                iframe.contentWindow?.document;

            if (!doc) {
                return;
            }

            initDropdownObserver(doc);
        } catch (error) {
            console.debug(
                "Unable to access iframe document:",
                error
            );
        }
    }

    // Attach to existing iframes.
    document.querySelectorAll('iframe').forEach(attachToIframe);

    // Watch for new iframes.
    const iframeObserver = new MutationObserver(mutations => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (!(node instanceof Element)) {
                    continue;
                }

                if (node instanceof HTMLIFrameElement) {
                    attachToIframe(node);
                }

                node.querySelectorAll?.('iframe')
                    .forEach(attachToIframe);
            }
        }
    });

    try {
        iframeObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
    } catch (error) {
        console.warn(
            "Unable to observe document for new H5P iframes:",
            error
        );
    }

    // Run for H5Ps not in iframes
    initDropdownObserver(document);
})();
