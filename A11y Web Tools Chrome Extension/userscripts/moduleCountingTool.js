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
                z-index:10001;
                color:black;
                transition:all 0.2s ease;
                display:none;
            }
            .AccessibilityModule-border {
                position:absolute;
                border:3px solid #CCC;
                border-radius:4px;
                z-index:9999;
                pointer-events:none;
                transition:all 0.2s ease;
                display:none;
            }
            .AccessibilityModule-highlight {
                border-color:#393!important;
                box-shadow:1px 2px 5px #CCC;
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
    const modules = [...document.querySelectorAll('div.context_module.editable_context_module')];

    modules.forEach((mod, i) => {
        const label = document.createElement('div');
        label.className = 'AccessibilityModule AccessibilityModule-label';
        label.innerHTML = `Module ${i + 1} (<u class="open-all-links" style="cursor:pointer;color:#0066cc;">Open all pages</u>)`;

        const openAllBtn = label.querySelector('.open-all-links');

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

                // Safety checks
                if (!href) return;
                if (href.startsWith('javascript:')) return;

                window.open(href, '_blank', 'noopener');
            });
        });


        const border = document.createElement('div');
        border.className = 'AccessibilityModule AccessibilityModule-border';

        document.body.appendChild(label);
        document.body.appendChild(border);

        function update() {
            const r = mod.getBoundingClientRect();
            if (isVisible(mod)) {
                label.style.display = 'block';
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

        function hi() {
            label.classList.add('AccessibilityModule-highlight');
            border.classList.add('AccessibilityModule-highlight');
        }
        function un() {
            label.classList.remove('AccessibilityModule-highlight');
            border.classList.remove('AccessibilityModule-highlight');
        }

        label.addEventListener('mouseover', hi);
        label.addEventListener('mouseout', un);
        mod.addEventListener('mouseover', hi);
        mod.addEventListener('mouseout', un);

        update();
        window.addEventListener('scroll', update);
        window.addEventListener('resize', update);
        new MutationObserver(update).observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['style','class','hidden','open']
        });
    });
})();
