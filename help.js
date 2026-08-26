const params = new URLSearchParams(location.search);
const isMac = params.get('mac') === "true";

const modifierKey = isMac ? 'Cmd' : 'Ctrl';
const altKey = isMac ? 'Opt' : 'Alt';

document.querySelectorAll('.modifierKey').forEach(el => {
    el.textContent = modifierKey;
});
document.querySelectorAll('.altKey').forEach(el => {
    el.textContent = altKey;
});
