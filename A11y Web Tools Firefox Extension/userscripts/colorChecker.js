(async function () {
    'use strict';

    async function getSetting(request) {
        return new Promise(async resolve => {
            await chrome.runtime.sendMessage({ action: 'getSetting', value: request }, resolve);
        });
    }

    let inspectorEnabled = await getSetting('contrastInspector');
    let color_global = "";
    let bg_global = "";

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
        const [r1, g1, b1] = rgb1.match(/\d+/g).map(Number);
        const [r2, g2, b2] = rgb2.match(/\d+/g).map(Number);
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

    document.addEventListener('mouseover', e => {
        if (!inspectorEnabled) return;

        const el = e.target;
        const style = window.getComputedStyle(el);
        const color = style.color;
        const bg = getEffectiveBackground(el);
        const colorHex = rgbToHex(color);
        const bgHex = rgbToHex(bg);
        const ratio = contrastRatio(color, bg);
        const ratioRounded = ratio.toFixed(2);

        const largeText = isLargeText(style);
        const threshold = largeText ? 3.0 : 4.5;
        const wcagPass = ratio >= threshold ? '✅ Pass' : '❌ Fail';
        const sizeNote = largeText ? ' (large text)' : '';

        color_global = colorHex;
        bg_global = bgHex;

        tooltip.innerHTML = `
          Text: ${colorHex} <span style="display:inline-block;width:16px;height:16px;background:${colorHex};border:1px solid #fff;margin-left:6px;vertical-align: middle;"></span> <small style="vertical-align: middle;font-size: 0.75em;margin-top:4px;color:#aaa;">Click to copy</small><br>
          Background: ${bgHex} <span style="display:inline-block;width:16px;height:16px;background:${bgHex};border:1px solid #fff;margin-left:6px;vertical-align: middle;"></span> <small style="vertical-align: middle;font-size: 0.75em;margin-top:4px;color:#aaa;">Right Click to copy</small><br>
          Contrast Ratio: ${ratioRounded}${sizeNote} (${wcagPass})
        `;
        tooltip.style.display = 'block';
    });

    document.addEventListener('mousemove', e => {
        if (!inspectorEnabled) return;
        tooltip.style.left = e.pageX + 12 + 'px';
        tooltip.style.top = e.pageY + 12 + 'px';
    });

    document.addEventListener('mouseout', () => {
        tooltip.style.display = 'none';
    });

    document.addEventListener('click', e => {
        if (!inspectorEnabled) return;
        if (e.button === 0) {
            navigator.clipboard.writeText(color_global);
            e.preventDefault();
            e.stopPropagation();
        }
    });

    document.addEventListener('contextmenu', e => {
        if (!inspectorEnabled) return;
        navigator.clipboard.writeText(bg_global);
        e.preventDefault();
        e.stopPropagation();
    });

    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg.action === 'toggleContrastInspector') {
            inspectorEnabled = msg.value;
        }
    });

})();
