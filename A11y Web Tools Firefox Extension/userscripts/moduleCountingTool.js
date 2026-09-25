(function() {
    'use strict';

    // Only run on home and modules pages
    const url = window.location.href;
    const isModulesPage = /\/courses\/\d+\/modules\/?$/.test(url);
    const isHomePage = /\/courses\/\d+\/?$/.test(url) && !isModulesPage;
    if (!isModulesPage && !isHomePage) {
        return;
    }

    // Remove any old module elements
    document.querySelectorAll('.AccessibilityModule-label,.AccessibilityModule-border').forEach(e => e.remove());

    // Inject styles once
    if (!document.getElementById('accessibility-module-style')) {
        const s = document.createElement('style');
        s.id = 'accessibility-module-style';
        s.textContent = `
            .AccessibilityModule-label {
                background:#FFF;
                border:3px solid #CCC;
                border-radius:4px;
                padding:2px 4px;
                position:absolute;
                white-space:nowrap;
                font-size:12px;
                z-index:9994;
                color:black;
                transition:all 0.2s ease;
                display:none;
                align-items: center;
            }
            .AccessibilityModule-border {
                position:absolute;
                border:3px solid #CCC;
                border-radius:4px;
                z-index:9996;
                pointer-events:none;
                transition:all 0.2s ease;
                display:none;
            }
            .AccessibilityModule-highlight {
                border-color:#393!important;
                box-shadow:1px 2px 5px #CCC;
            }
            .open-all-links {
                background: none;
                border: none;
                cursor: pointer;
                padding: 0;
                font-size: 12px;
                margin-left: 8px;
                color: #0073e6;
                text-decoration: underline;
                display: flex;
                align-items: center;
            }
        `;
        document.head.appendChild(s);
    }

    function isVisible(el) {
        if (!(el instanceof Element)) return false;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') return false;
        const r = el.getBoundingClientRect();
        return !!(el.offsetParent || r.width > 0 || r.height > 0);
    }

    // Select all target divs
    const modules = [...document.querySelectorAll('div.context_module')];

    const moduleElements = [];

    modules.forEach((mod, i) => {
        const label = document.createElement('div');
        label.className = 'AccessibilityModule AccessibilityModule-label';
        label.textContent = `Module ${i + 1}`;

        const openAllBtn = document.createElement('button');
        openAllBtn.type = 'button';
        openAllBtn.className = 'open-all-links';
        openAllBtn.textContent = 'Open all pages';
        label.appendChild(openAllBtn);

        openAllBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();

            // Find the module content area
            const content = mod.querySelector('.context_module_items');
            if (!content) return;

            // Select ONLY real content links (module item titles)
            const links = content.querySelectorAll(
                '.module-item-title a.title, .module-item-title a.ig-title'
            );

            links.forEach(link => {
                const href = link.href;
                if (!href) return;
                let url;
                try {
                    url = new URL(href);
                } catch (error) {
                    console.warn('Invalid module link:', href, error);
                    return;
                }
                if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

                const newWindow = window.open(href, '_blank', 'noopener');
                if (!newWindow) {
                    console.warn('Popup blocked for link:', href);
                }
            });
        });


        const border = document.createElement('div');
        border.className = 'AccessibilityModule AccessibilityModule-border';

        document.body.appendChild(label);
        document.body.appendChild(border);

        function hi() {
            label.classList.add('AccessibilityModule-highlight');
            border.classList.add('AccessibilityModule-highlight');
        }
        function un() {
            label.classList.remove('AccessibilityModule-highlight');
            border.classList.remove('AccessibilityModule-highlight');
        }

        label.addEventListener('pointerenter', hi);
        label.addEventListener('pointerleave', un);
        mod.addEventListener('pointerenter', hi);
        mod.addEventListener('pointerleave', un);

        moduleElements.push({mod, label, border});
    });

    function updateAll() {
        for (const { mod, label, border } of moduleElements) {
            const r = mod.getBoundingClientRect();
            if (isVisible(mod)) {
                label.style.display = 'flex';
                border.style.display = 'block';
                const top = window.scrollY + r.top;
                const left = window.scrollX + r.left;
                label.style.top = top + 'px';
                label.style.left = left + 'px';
                border.style.top = top + 'px';
                border.style.left = left + 'px';
                border.style.width = r.width + 'px';
                border.style.height = r.height + 'px';
            } else {
                label.style.display = 'none';
                border.style.display = 'none';
            }
        }
    }

    let updateScheduled = false;
    function scheduleUpdate() {
        if (updateScheduled) return;
        updateScheduled = true;

        requestAnimationFrame(() => {
            updateScheduled = false;
            updateAll();
        });
    }

    updateAll();

    window.addEventListener('scroll', scheduleUpdate);
    window.addEventListener('resize', scheduleUpdate);

    new MutationObserver(scheduleUpdate).observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style','class','hidden','open']
    });

})();
