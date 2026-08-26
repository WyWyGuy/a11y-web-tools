(async function() {
    'use strict';

    async function getSetting(request) {
        return new Promise(async resolve => {
            await chrome.runtime.sendMessage({ action: 'getSetting', value: request }, resolve);
        });
    }

    let autoExpandEnabled = await getSetting('defaultDropdownMenus');

    const excludedPaths = [
        /^https:\/\/byu\.instructure\.com\/courses\/1026\/pages\/error-finding-checklist(?:.*)?$/,
        /^https:\/\/byu\.instructure\.com\/courses\/1026\/pages\/textbook-slash-resource-review-instructions(?:.*)?$/,
        /^https:\/\/byu\.instructure\.com\/courses\/1026\/pages\/run-a11ypanel-instructions(?:.*)?$/,
        /^https:\/\/byu\.instructure\.com\/courses\/1026\/pages\/verify-task-instructions(?:.*)?$/,
        /^https:\/\/byu\.instructure\.com\/courses\/1026\/pages\/psia-instructions(?:.*)?$/,
        /^https:\/\/byu\.instructure\.com\/courses\/1026\/pages\/wrap-up-instructions(?:.*)?$/,
        /^https:\/\/byu\.instructure\.com\/courses\/1026\/pages\/finance-task-instructions(?:.*)?$/,
        /^https:\/\/byu\.instructure\.com\/courses\/1026\/pages\/the-prototype-review(?:.*)?$/,
        /^https:\/\/byu\.instructure\.com\/courses\/1026\/pages\/the-50-percent-review(?:.*)?$/,
        /^https:\/\/byu\.instructure\.com\/courses\/1026\/pages\/the-post-supplier-inspection-accessibility-psia-3(?:.*)?$/,
        /^https:\/\/byu\.instructure\.com\/courses\/1026\/pages\/the-peer-review-2(?:.*)?$/,
    ];

    function expandAll() {
        document.querySelectorAll('details').forEach(d => {
            d.open = true;
        });

        document.querySelectorAll('[class*="panel-content"], [class*="panel_content"]').forEach(panel => {
            panel.style.setProperty('display', 'block');
        });
    }

    function collapseAll() {
        document.querySelectorAll('details').forEach(d => {
            d.open = false;
        });

        document.querySelectorAll('[class*="panel-content"], [class*="panel_content"]').forEach(panel => {
            panel.style.setProperty('display', 'none');
        });
    }

    function runWhenPageLoaded() {
        if (!autoExpandEnabled) return;
        if (excludedPaths.some(regex => regex.test(window.location.href))) return;

        let timeout = null;
        const observer = new MutationObserver(() => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                timeout = setTimeout(() => {
                    expandAll();
                }, 250);
                observer.disconnect();
            }, 1000);
        });
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    (async () => {
        if (await getSetting("dropdownHotkeys")) {
            document.addEventListener('keydown', function(e) {
                if (e.altKey && e.key === 'ArrowDown') {
                    e.preventDefault();
                    expandAll();
                }
                if (e.altKey && e.key === 'ArrowUp') {
                    e.preventDefault();
                    collapseAll();
                }
            });
        }
    })();

    runWhenPageLoaded();

})();
