(async function () {
    'use strict';

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

    let inspectorEnabled = await getSetting('contrastInspector') === true;
    let color_global = "";
    let bg_global = "";
    let lastTarget = null;

    const tooltip = document.createElement('div');
    tooltip.classList.add('AccessibilityHelper', 'contrastInspector');
    tooltip.style.position = 'absolute';
    tooltip.style.zIndex = '9999';
    tooltip.style.padding = '10px 14px';
    tooltip.style.background = '#222';
    tooltip.style.color = '#fff';
    tooltip.style.borderRadius = '6px';
    tooltip.style.fontSize = '15px';
    tooltip.style.fontFamily = 'monospace';
    tooltip.style.pointerEvents = 'none';
    tooltip.style.display = 'none';
    document.body.appendChild(tooltip);

    function rgbToHex(rgb) {
        const result = rgb.match(/\d+/g);
        if (!result || result.length < 3) return rgb;
        return (
            '#' +
            result
            .slice(0, 3)
            .map(x => ('0' + parseInt(x).toString(16)).slice(-2))
            .join('')
        );
    }

    function luminance(r, g, b) {
        const a = [r, g, b].map(v => {
            v /= 255;
            return v <= 0.03928
                ? v / 12.92
            : Math.pow((v + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
    }

    function contrastRatio(rgb1, rgb2) {
        const values1 = rgb1.match(/\d+/g);
        const values2 = rgb2.match(/\d+/g);
        if (!values1 || values1.length < 3 || !values2 || values2.length < 3) {
            return null;
        }
        const [r1, g1, b1] = values1.slice(0, 3).map(Number);
        const [r2, g2, b2] = values2.slice(0, 3).map(Number);
        const lum1 = luminance(r1, g1, b1);
        const lum2 = luminance(r2, g2, b2);
        const ratio =
              lum1 > lum2
        ? (lum1 + 0.05) / (lum2 + 0.05)
        : (lum2 + 0.05) / (lum1 + 0.05);
        return ratio;
    }

    function getEffectiveBackground(el) {
        let current = el;
        while (current && current !== document.documentElement) {
            const bg = window.getComputedStyle(current).backgroundColor;
            if (bg && !bg.startsWith('rgba(0, 0, 0, 0)') && bg !== 'transparent') {
                return bg;
            }
            current = current.parentElement;
        }
        return window.getComputedStyle(document.body).backgroundColor || 'rgb(255,255,255)';
    }

    function isLargeText(style) {
        const fontSize = parseFloat(style.fontSize);
        const fontWeight = parseInt(style.fontWeight, 10);
        const isBold = fontWeight >= 700;
        return fontSize >= 18 || (fontSize >= 14 && isBold);
    }

    document.addEventListener('pointermove', e => {
        if (!inspectorEnabled) return;

        const el = e.target;
        if (!(el instanceof Element)) return;
        if (el.closest('.AccessibilityHelper')) {
            lastTarget = null;
            tooltip.style.display = 'none';
            return;
        }

        if (el === lastTarget) {
            tooltip.style.left = e.pageX + 12 + 'px';
            tooltip.style.top = e.pageY + 12 + 'px';
            return;
        }

        lastTarget = el;

        const style = window.getComputedStyle(el);
        const color = style.color;
        const bg = getEffectiveBackground(el);
        const colorHex = rgbToHex(color);
        const bgHex = rgbToHex(bg);
        const ratio = contrastRatio(color, bg);
        if (ratio === null) {
            tooltip.style.display = 'none';
            return;
        }
        const ratioRounded = ratio.toFixed(2);

        const largeText = isLargeText(style);
        const threshold = largeText ? 3.0 : 4.5;
        const wcagPass = ratio >= threshold ? '✅ Pass' : '❌ Fail';
        const sizeNote = largeText ? ' (large text)' : '';

        color_global = colorHex;
        bg_global = bgHex;

        tooltip.replaceChildren();
        const textColorLine = document.createElement('div');
        textColorLine.append(document.createTextNode(`Text: ${colorHex} `));
        const textColorSwatch = document.createElement('span');
        Object.assign(textColorSwatch.style, {
            display: 'inline-block',
            width: '16px',
            height: '16px',
            background: colorHex,
            border: '1px solid #fff',
            marginLeft: '6px',
            verticalAlign: 'middle'
        });
        const textColorNote = document.createElement('small');
        textColorNote.textContent = 'Click to copy';
        Object.assign(textColorNote.style, {
            verticalAlign: 'middle',
            fontSize: '0.75em',
            marginTop: '4px',
            marginLeft: '6px',
            color: '#aaa'
        });
        textColorLine.append(textColorSwatch, textColorNote);
        const backgroundLine = document.createElement('div');
        backgroundLine.append(document.createTextNode(`Background: ${bgHex} `));
        const backgroundSwatch = document.createElement('span');
        Object.assign(backgroundSwatch.style, {
            display: 'inline-block',
            width: '16px',
            height: '16px',
            background: bgHex,
            border: '1px solid #fff',
            marginLeft: '6px',
            verticalAlign: 'middle'
        });
        const backgroundNote = document.createElement('small');
        backgroundNote.textContent = 'Right Click to copy';
        Object.assign(backgroundNote.style, {
            verticalAlign: 'middle',
            fontSize: '0.75em',
            marginTop: '4px',
            marginLeft: '6px',
            color: '#aaa'
        });
        backgroundLine.append(backgroundSwatch, backgroundNote);
        const contrastLine = document.createElement('div');
        contrastLine.textContent = `Contrast Ratio: ${ratioRounded}${sizeNote} (${wcagPass})`;
        tooltip.append(textColorLine, backgroundLine, contrastLine);

        tooltip.style.display = 'block';
        tooltip.style.left = e.pageX + 12 + 'px';
        tooltip.style.top = e.pageY + 12 + 'px';
    }, true);

    window.addEventListener('blur', () => {
        lastTarget = null;
        tooltip.style.display = 'none';
    });

    document.addEventListener('click', e => {
        if (!inspectorEnabled) return;
        if (!color_global) return;
        if (e.button === 0) {
            navigator.clipboard.writeText(color_global).catch(error => {
                console.warn("Unable to copy text color:", error);
            });
            e.preventDefault();
            e.stopPropagation();
        }
    }, true);

    document.addEventListener('contextmenu', e => {
        if (!inspectorEnabled) return;
        if (!bg_global) return;
        navigator.clipboard.writeText(bg_global).catch(error => {
            console.warn("Unable to copy text color:", error);
        });
        e.preventDefault();
        e.stopPropagation();
    }, true);

    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg.action === 'toggleContrastInspector') {
            inspectorEnabled = msg.value;
        }
    });

})();
