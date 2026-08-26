# A11y Web Tools Extension Documentation

## Root Directory

### `README.md`

The file you are reading, containing documentation about the file structure.

### `manifest.json`

The file containing information for the browser to understand the extension.

### `popup.html`

The HTML file that contains the entry point into interaction with the extension. It is the page that appears when the extension is clicked on.

### `popup.js`

The JavaScript code for the `popup.html` file.

### `background.js`

The background JavaScript code that runs once per browser instance.

### `offscreen.html`

An offscreen page used to persistently host the AI language prediction model.

### `offscreen.js`

The code that spawns the AI language prediction model and receives requests for it.

### `content.js`

The content JavaScript code that helps for temporary local settings.

### `help.html`

The help page loaded when requested from the `popup.html` page.

### `help.js`

The JavaScript that runs on the `help.html` page.

### `language_model.onnx` or `language_model_compact.onnx`

A custom AI model used to predict the language of given text.

### `ATTRIBUTIONS.md`

A file containing sources used in the creation of this project.

### `package.json` and `package-lock.json`

Build files used when compiling. These are not included in the final export.

## `userscripts` Directory

### `autoA11yTools.js`

The script that runs the main 6 A11y tools. It contains the source code for `autoA11yTools.bundle.js`.

### `autoA11yTools.bundle.js`

A bundled version of `autoA11yTools.js` that contains additional code, previously used for interacting with ONNX models. This is the actual file that loads in the extension.

### `rawHTMLEditorHelper.js`

The script that helps add functionality to the raw HTML editor in Canvas.

### `canvasFilePathTool.js`

The script that adds file paths to Canvas's file menu.

### `colorChecker.js`

The script that adds a color contrast inspection tool.

### `dropdownControlTool.js`

The script that adds automatic dropdown opening functionality.

### `elementCountingTool.js`

The script that adds the ability to count elements on a page.

### `moduleCountingTool.js`

The script that adds the ability to count modules in Canvas.

### `h5pLanguageSelector.js`

The script that adds the ability to apply language tags to H5P activities quicker.

### `downloadSLASpreadsheets.js`

The script that automates the download of SLA spreadsheets from Teamwork.

## `images` Directory

Contains icons used in the extension as well as screenshots showing how it works.

## `ort` Directory

Contains files required for the extension to properly interact with ONNX models.

## `node_modules` Directory

Contains files required for building bundle files that use NodeJS. These are development-only files and are not included in the final export.