
(function () {
    const frame = document.getElementById("contentframe");
    const nav = document.getElementById("navbar");
    if (!frame || !nav) return;

    function isOnHomeScreen() {
        try {
            return frame.src.includes("/pages/home.html");
        } catch {
            return false;
        }
    }

    function getIconPayload(li) {
        const icon = li.querySelector("i");
        const span = li.querySelector("span");
        return {
            target: li.dataset.target || null,
            iconClass: icon ? icon.className : "far fa-star",
            label: span ? span.textContent.trim() : "",
        };
    }

    function isOverFrame(x, y) {
        const rect = frame.getBoundingClientRect();
        return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    }

    function toFrameCoords(x, y) {
        const rect = frame.getBoundingClientRect();
        return { x: x - rect.left, y: y - rect.top };
    }

    function createGhost(payload, x, y) {
        const el = document.createElement("div");
        el.id = "singularity-dnd-ghost";
        el.innerHTML = `<i class="${payload.iconClass}"></i>`;
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        document.body.appendChild(el);
        return el;
    }

    let dragging = false;
    let ghost = null;
    let dragPayload = null;
    let startX = 0;
    let startY = 0;
    const DRAG_THRESHOLD = 6; 

    nav.querySelectorAll("ul li[data-target]").forEach((li) => {
        li.addEventListener("pointerdown", (e) => {
            if (!isOnHomeScreen()) return; 
            li.setPointerCapture(e.pointerId);

            startX = e.clientX;
            startY = e.clientY;
            dragPayload = getIconPayload(li);
            dragging = false;

            const onMove = (moveEvent) => {
                if (!dragging) {
                    const dx = moveEvent.clientX - startX;
                    const dy = moveEvent.clientY - startY;
                    if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
                    dragging = true;
                    ghost = createGhost(dragPayload, moveEvent.clientX, moveEvent.clientY);
                    document.body.style.cursor = "grabbing";
                }

                ghost.style.left = `${moveEvent.clientX}px`;
                ghost.style.top = `${moveEvent.clientY}px`;

                if (isOverFrame(moveEvent.clientX, moveEvent.clientY)) {
                    const coords = toFrameCoords(moveEvent.clientX, moveEvent.clientY);
                    frame.contentWindow?.postMessage(
                        { type: "singularity-dnd-move", x: coords.x, y: coords.y, payload: dragPayload },
                        window.location.origin
                    );
                }
            };

            const onUp = (upEvent) => {
                li.releasePointerCapture(e.pointerId);
                li.removeEventListener("pointermove", onMove);
                li.removeEventListener("pointerup", onUp);
                document.body.style.cursor = "";

                if (dragging) {
                    if (isOverFrame(upEvent.clientX, upEvent.clientY)) {
                        const coords = toFrameCoords(upEvent.clientX, upEvent.clientY);
                        frame.contentWindow?.postMessage(
                            { type: "singularity-dnd-drop", x: coords.x, y: coords.y, payload: dragPayload },
                            window.location.origin
                        );
                    } else {
                        frame.contentWindow?.postMessage({ type: "singularity-dnd-cancel" }, window.location.origin);
                    }
                    li.dataset.justDragged = "1";
                }

                if (ghost) {
                    ghost.remove();
                    ghost = null;
                }
                dragging = false;
            };

            li.addEventListener("pointermove", onMove);
            li.addEventListener("pointerup", onUp);
        });
        li.addEventListener(
            "click",
            (e) => {
                if (li.dataset.justDragged === "1") {
                    delete li.dataset.justDragged;
                    e.stopImmediatePropagation();
                    e.preventDefault();
                }
            },
            true
        );
    });
})();
