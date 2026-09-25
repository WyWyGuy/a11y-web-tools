(function () {
    'use strict';

    // Only run on file pages
    const fullPath = location.pathname + location.search;
    const isFilePage = /^\/courses\/\d+\/files(?:[/?].*)?$/i.test(fullPath);
    if (!isFilePage) {
        return;
    }

    const API_BASE = "/api/v1";
    const MAX_FOLDER_DEPTH = 20;
    const folderCache = new Map();
    const fileCache = new Map();

    // Helpers
    async function apiFetch(url) {
        const res = await fetch(url, {
            credentials: "same-origin"
        });
        if (!res.ok) {
            throw new Error(`Canvas API request failed: ${res.status} ${res.statusText}`);
        }
        return await res.json();
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
            return await folderCache.get(folderId);
        }

        const promise = apiFetch(`${API_BASE}/folders/${folderId}`);
        folderCache.set(folderId, promise);

        try {
            return await promise;
        } catch (error) {
            folderCache.delete(folderId);
            throw error;
        }
    }

    async function getFileInfo(fileId) {
        if (fileCache.has(fileId)) {
            return await fileCache.get(fileId);
        }

        const promise = apiFetch(`${API_BASE}/files/${fileId}`);

        fileCache.set(fileId, promise);

        try {
            return await promise;
        } catch (error) {
            fileCache.delete(fileId);
            throw error;
        }
    }

    async function getFolderPath(folderId) {
        const segments = [];
        const visited = new Set();
        let current = folderId;
        let depth = 0;

        while (current) {
            if (visited.has(current)) {
                throw new Error(`Circular folder hierarchy detected at folder ${current}.`);
            }
            if (depth++ >= MAX_FOLDER_DEPTH) {
                throw new Error(`Folder hierarchy exceeded maximum depth of ${MAX_FOLDER_DEPTH}.`);
            }

            visited.add(current);
            const folder = await getFolder(current);
            if (!folder || typeof folder.name !== "string") {
                throw new Error(`Canvas returned invalid folder data for folder ${current}.`);
            }

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
        if (!courseId) return null;
        const pathUrl = segments.map(encodeURIComponent).join("/");
        return `/courses/${courseId}/files/folder/${pathUrl}`;
    }

    function createFolderLink(folderUrl) {
        if (!folderUrl) return null;

        const folderLink = document.createElement("a");
        folderLink.href = folderUrl;
        folderLink.textContent = "📁 Open Folder";
        folderLink.style.fontSize = "0.8em";
        folderLink.style.marginLeft = "0.5em";
        folderLink.target = "_blank";
        folderLink.rel = "noopener noreferrer";
        folderLink.style.whiteSpace = "nowrap";
        folderLink.classList.add("canvas-folder-link");
        folderLink.style.position = "absolute";
        folderLink.style.left = "55px";
        folderLink.style.top = "82%";
        folderLink.style.transform = "translateY(-50%)";
        folderLink.style.textDecoration = "none";
        folderLink.addEventListener("pointerenter", () => {
            folderLink.style.textDecoration = "underline";
        });

        folderLink.addEventListener("pointerleave", () => {
            folderLink.style.textDecoration = "none";
        });

        return folderLink;
    }

    // Hover handler
    async function handleHover(e) {
        try {
            if (!(e.target instanceof Element)) return;
            
            const link = e.target.closest("a[href*='/files']");
            if (!link) return;

            const fileId = extractFileId(link);
            if (!fileId) return;

            const file = await getFileInfo(fileId);
            if (!file || !file.folder_id) return;

            const courseId = getCourseId();
            if (!courseId) {
                console.warn("Canvas File Path Tool: Unable to determine course ID.");
                return;
            }

            const segments = await getFolderPath(file.folder_id);
            const folderPath = segments.join(" / ");
            const fullPath = folderPath ? `${folderPath} / ${file.display_name}` : file.display_name;

            link.title = fullPath;

            const cell = link.closest("td");
            if (!cell) return;

            if (cell.querySelector(".canvas-folder-link")) return;

            cell.style.position = "relative";

            const folderUrl = buildFolderUrlFromSegments(segments, courseId);
            const folderLink = createFolderLink(folderUrl);
            if (!folderLink) return;

            cell.appendChild(folderLink);
        } catch (error) {
            console.warn("Canvas File Path Tool failed:", error);
        }
    }

    // Start
    document.addEventListener("pointerenter", handleHover, true);

})();
