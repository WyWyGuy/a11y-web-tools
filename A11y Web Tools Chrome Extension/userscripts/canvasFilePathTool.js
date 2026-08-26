(function () {
    'use strict';

    // Only run on file pages
    const fullPath = location.pathname + location.search;
    const isFilePage = /^\/courses\/\d+\/files(?:[/?].*)?$/i.test(fullPath);
    if (!isFilePage) {
        return;
    }

    const folderCache = new Map();
    const fileCache = new Map();

    const API_BASE = "/api/v1";

    // Helpers
    async function apiFetch(url) {
        const res = await fetch(url, {
            credentials: "same-origin"
        });
        return res.json();
    }

    function extractFileId(link) {
        if (!link.href) return null;
        const match = link.href.match(/[?&]preview=(\d+)/);
        return match ? match[1] : null;
    }

    function getCourseId() {
        const match = location.pathname.match(/\/courses\/(\d+)/);
        return match ? match[1] : null;
    }

    // Folder path logic
    async function getFolder(folderId) {
        if (folderCache.has(folderId)) {
            return folderCache.get(folderId);
        }

        const data = await apiFetch(`${API_BASE}/folders/${folderId}`);
        folderCache.set(folderId, data);
        return data;
    }

    async function resolveFolderPath(folderId) {
        const parts = [];

        let current = folderId;

        while (current) {
            const folder = await getFolder(current);

            parts.unshift(folder.name);
            current = folder.parent_folder_id;

            // safety break
            if (parts.length > 20) break;
        }

        return parts.join(" / ");
    }

    async function getFolderPath(folderId) {
        const segments = [];
        let current = folderId;

        while (current) {
            const folder = await getFolder(current);
            segments.unshift(folder.name);
            current = folder.parent_folder_id;
        }

        // Remove default Canvas root folder
        if (segments.length && segments[0].toLowerCase() === "course files") {
            segments.shift();
        }

        return segments;
    }

    function buildFolderUrlFromSegments(segments, courseId) {
        const pathUrl = segments.map(encodeURIComponent).join("/");
        return `/courses/${courseId}/files/folder/${pathUrl}`;
    }

    // File info helper
    async function getFileInfo(fileId) {
        if (fileCache.has(fileId)) {
            return fileCache.get(fileId);
        }

        const file = await apiFetch(`${API_BASE}/files/${fileId}`);
        fileCache.set(fileId, file);
        return file;
    }

    // Hover handler
    async function handleHover(e) {
        const link = e.target.closest("a[href*='/files']");
        if (!link) return;

        const fileId = extractFileId(link);
        if (!fileId) return;

        try {
            const file = await getFileInfo(fileId);
            const folderPath = await resolveFolderPath(file.folder_id);

            const fullPath = `${folderPath} / ${file.display_name}`;

            link.title = fullPath;

            link.style.position = "relative";

            if (file.folder_id) {
                const courseId = getCourseId();
                const segments = await getFolderPath(file.folder_id);
                const folderUrl = buildFolderUrlFromSegments(segments, courseId);

                let folderLink = document.createElement("a");
                folderLink.href = folderUrl;
                folderLink.textContent = "📁 Open Folder";
                folderLink.style.fontSize = "0.8em";
                folderLink.style.marginLeft = "0.5em";
                folderLink.target = "_blank";

                const cell = link.closest("td");
                if (!cell) return;

                if (cell.querySelector(".canvas-folder-link")) return;

                cell.style.position = "relative";

                folderLink.classList.add("canvas-folder-link");
                folderLink.style.position = "absolute";
                folderLink.style.left = "55px";
                folderLink.style.top = "82%";
                folderLink.style.transform = "translateY(-50%)";
                folderLink.style.fontSize = "0.8em";
                folderLink.style.textDecoration = "none";
                folderLink.style.whiteSpace = "nowrap";

                folderLink.addEventListener("mouseenter", () => {
                    folderLink.style.textDecoration = "underline";
                });

                folderLink.addEventListener("mouseleave", () => {
                    folderLink.style.textDecoration = "none";
                });

                cell.appendChild(folderLink);
            }

        } catch (err) {
            console.warn("Canvas File Path Tool failed:", err);
        }
    }

    // Start
    document.addEventListener("mouseover", handleHover, true);

})();
