(async function () {
    'use strict';

    // Prevent multiple instances of the script running
    const instanceKey = "__colorCheckerInitialized";
    if (window[instanceKey]) return;
    window[instanceKey] = true;

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

    function hideTooltip() {
        lastTarget = null;
        tooltip.style.display = 'none';
    }

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
            return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
    }

    function contrastRatio(color1, color2) {
        const rgb1 = parseComputedRgb(color1);
        const rgb2 = parseComputedRgb(color2);

        if (!rgb1 || !rgb2 || rgb1.a !== 1 || rgb2.a !== 1) {
            console.warn(`Unable to compute contrast ratio for ${color1} and ${color2}.`);
            return null;
        }

        const l1 = luminance(rgb1.r, rgb1.g, rgb1.b);
        const l2 = luminance(rgb2.r, rgb2.g, rgb2.b);

        return l1 > l2
            ? (l1 + 0.05) / (l2 + 0.05)
        : (l2 + 0.05) / (l1 + 0.05);
    }

    function parseComputedRgb(value) {
        if (!value) return null;

        const text = value.trim().toLowerCase();

        const srgbMatch = text.match(/^color\(\s*srgb\s+(.+)\)$/);
        if (srgbMatch) {
            const pieces = srgbMatch[1].split("/");
            if (pieces.length > 2) return null;

            const channels = pieces[0].trim().split(/\s+/);
            if (channels.length !== 3) return null;

            function parseSrgbChannel(channel) {
                const value = parseFloat(channel);
                if (!Number.isFinite(value)) return null;

                const normalized = channel.endsWith("%") ? value / 100 : value;
                if (normalized < 0 || normalized > 1) return null;

                return normalized * 255;
            }

            const [r, g, b] = channels.map(parseSrgbChannel);

            const alphaText = pieces[1]?.trim();
            const alphaValue = alphaText === undefined
                ? 1
                : parseFloat(alphaText) / (alphaText.endsWith("%") ? 100 : 1);

            if (
                r === null || g === null || b === null ||
                !Number.isFinite(alphaValue)
            ) {
                return null;
            }

            return { r, g, b, a: Math.min(1, Math.max(0, alphaValue)) };
        }

        if (text === "transparent") {
            return { r: 0, g: 0, b: 0, a: 0 };
        }

        const match = text.match(/^rgba?\((.*)\)$/);
        if (!match) return null;

        const [channelsText, slashAlpha] = match[1].split("/");
        let parts = channelsText.includes(",")
            ? channelsText.split(",").map(part => part.trim())
            : channelsText.trim().split(/\s+/);

        let alphaText = slashAlpha?.trim();

        if (parts.length === 4 && alphaText === undefined) {
            alphaText = parts.pop();
        }

        if (parts.length !== 3) return null;

        function parseChannel(channel) {
            const number = parseFloat(channel);
            if (!Number.isFinite(number)) return null;

            return channel.endsWith("%")
                ? Math.min(255, Math.max(0, number * 2.55))
                : Math.min(255, Math.max(0, number));
        }

        function parseAlpha(alpha) {
            if (alpha === undefined) return 1;

            const number = parseFloat(alpha);
            if (!Number.isFinite(number)) return null;

            return Math.min(1, Math.max(0, alpha.endsWith("%") ? number / 100 : number));
        }

        const [r, g, b] = parts.map(parseChannel);
        const a = parseAlpha(alphaText);

        if (r === null || g === null || b === null || a === null) return null;

        return { r, g, b, a };
    }

    function compositeOver(source, backdrop) {
        const a = source.a;
        return {
            r: source.r * a + backdrop.r * (1 - a),
            g: source.g * a + backdrop.g * (1 - a),
            b: source.b * a + backdrop.b * (1 - a),
            a: 1
        };
    }

    function formatRgb(color) {
        const formatChannel = value => Number(value.toFixed(3));
        return `rgb(${formatChannel(color.r)}, ${formatChannel(color.g)}, ${formatChannel(color.b)})`;
    }

    function getEffectiveColor(el, bg) {
        const text = getComputedStyle(el).color;
        const color = parseComputedRgb(text);
        const bg_color = parseComputedRgb(bg);

        if (!color) {
            console.warn(`Unable to parse RGB for ${text}.`);
            return null;
        }
        if (!bg_color) {
            console.warn(`Unable to parse RGB for ${bg}`);
            return null;
        }

        return formatRgb(compositeOver(color, bg_color));
    }

    function getEffectiveBackground(el) {
        const layers = [];

        for (let current = el; current; current = current.parentElement) {
            const cssColor = getComputedStyle(current).backgroundColor;
            const color = parseComputedRgb(cssColor);
            if (!color) {
                console.warn(`Unable to parse RGB for ${cssColor}.`);
                return null;
            }
            if (color.a > 0) {
                layers.push(color);
                if (color.a === 1) break;
            }
            if (current === document.documentElement) break;
        }

        let result = { r: 255, g: 255, b: 255, a: 1 };

        for (let i = layers.length - 1; i >= 0; i--) {
            result = compositeOver(layers[i], result);
        }

        return formatRgb(result);
    }

    function getContrastThreshold(style) {
        const fontSize = parseFloat(style.fontSize) || 0;
        const fontWeight = parseInt(style.fontWeight, 10) || 400;
        const isLargeText =
            fontSize >= 24 ||
            (fontSize >= 18.67 && fontWeight >= 700);

        return isLargeText ? 3.0 : 4.5;
    }

    function passesContrast(el) {
        const style = getComputedStyle(el);
        const bg = getEffectiveBackground(el);
        if (!bg) return null;
        const color = getEffectiveColor(el, bg);
        if (!color) return null;

        const ratio = contrastRatio(color, bg);
        if (ratio === null) return null;

        const threshold = getContrastThreshold(style);

        return { passes: ratio >= threshold, ratio, threshold, color, bg };
    }

    function rgbToHex(color) {
        const rgb = parseComputedRgb(color);

        if (!rgb || rgb.a !== 1) return null;

        return "#" + [rgb.r, rgb.g, rgb.b]
            .map(channel => Math.round(channel)
                .toString(16)
                .padStart(2, "0"))
            .join("")
            .toUpperCase();
    }

    document.addEventListener('pointermove', e => {
        if (!inspectorEnabled) return;

        const el = e.target;
        if (!(el instanceof Element)) return;
        if (el instanceof HTMLIFrameElement) {
            hideTooltip();
            return;
        }
        if (el.closest('.AccessibilityHelper')) {
            hideTooltip();
            return;
        }

        if (el === lastTarget) {
            tooltip.style.left = e.pageX + 12 + 'px';
            tooltip.style.top = e.pageY + 12 + 'px';
            return;
        }

        lastTarget = el;

        const contrast = passesContrast(el);
        if (!contrast) {
            color_global = '';
            bg_global = '';
            tooltip.style.display = 'none';
            return;
        }

        const colorHex = rgbToHex(contrast.color);
        const bgHex = rgbToHex(contrast.bg);
        if (!colorHex || !bgHex) {
            color_global = '';
            bg_global = '';
            tooltip.style.display = 'none';
            return;
        }

        const ratioRounded = contrast.ratio.toFixed(2);
        const wcagPass = contrast.passes ? '✅ Pass' : '❌ Fail';
        const sizeNote = contrast.threshold === 3.0 ? ' (large text)' : '';

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
        hideTooltip();
    });

    document.addEventListener('pointerout', e => {
        if (e.relatedTarget === null || e.relatedTarget instanceof HTMLIFrameElement) {
            hideTooltip();
        }
    }, true);

    document.addEventListener('click', e => {
        if (!inspectorEnabled) return;
        if (!color_global) return;
        if (e.button === 0) {
            window.top.postMessage({
                channel: "colorChecker",
                action: "copyColor",
                color: color_global
            }, "*");
            e.preventDefault();
            e.stopPropagation();
        }
    }, true);

    document.addEventListener('contextmenu', e => {
        if (!inspectorEnabled) return;
        if (!bg_global) return;
        window.top.postMessage({
            channel: "colorChecker",
            action: "copyColor",
            color: bg_global
        }, "*");
        e.preventDefault();
        e.stopPropagation();
    }, true);

    if (window === window.top) {
        window.addEventListener("message", e => {
            const message = e.data;
            if (message?.channel !== "colorChecker") return;
            if (message.action !== "copyColor") return;
            if (!/^#[0-9a-f]{6}$/i.test(message.color)) return;
            navigator.clipboard.writeText(message.color).catch(error => {
                console.warn("Unable to copy color:", error);
            });
        })
    }

    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg.action === 'toggleContrastInspector') {
            inspectorEnabled = msg.value;
        }
    });

})();
