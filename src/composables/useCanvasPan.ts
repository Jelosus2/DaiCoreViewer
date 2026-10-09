import { onMounted, onUnmounted, ref, watch, type Ref } from "vue";

interface CanvasPanOptions {
    host: Readonly<Ref<HTMLDivElement | null>>;
    canPan: () => boolean;
    move: (deltaX: number, deltaY: number) => void;
}

export function useCanvasPan(options: CanvasPanOptions) {
    const panMode = ref(false);
    const panning = ref(false);
    let pointer: { id: number; x: number; y: number; buttons: number } | undefined;

    function stopPan() {
        const current = pointer;
        pointer = undefined;
        panning.value = false;

        const element = options.host.value;
        if (current && element?.hasPointerCapture(current.id))
            element.releasePointerCapture(current.id);
    }

    function disablePanMode() {
        stopPan();
        panMode.value = false;
    }

    function togglePanMode() {
        const next = !panMode.value && options.canPan();
        stopPan();
        panMode.value = next;
    }

    function consume(event: Event) {
        event.preventDefault();
        event.stopImmediatePropagation();
    }

    function onPanPointerDown(event: PointerEvent) {
        const element = options.host.value;
        const onCanvas = event.target instanceof HTMLCanvasElement && event.target.parentElement === element;
        const middleMouse = event.pointerType === "mouse" && event.button === 1;

        if (!middleMouse && !(panMode.value && onCanvas))
            return;

        consume(event);

        const buttons = middleMouse ? 4 : 1;

        if (
            pointer || !element || !onCanvas || !options.canPan() ||
            !event.isPrimary || event.buttons !== buttons ||
            (!middleMouse && event.button !== 0)
        )
        {
            return;
        }

        element.setPointerCapture(event.pointerId);

        pointer = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            buttons
        };
        panning.value = true;
    }

    function onPanPointerMove(event: PointerEvent) {
        const current = pointer;
        if (!current || event.pointerId !== current.id)
            return;

        consume(event);

        const element = options.host.value;

        if (!options.canPan() || event.buttons !== current.buttons || !element)
        {
            stopPan();
            return;
        }

        const bounds = element.getBoundingClientRect();

        if (bounds.width > 0 && bounds.height > 0)
        {
            options.move(
                (event.clientX - current.x) * element.clientWidth / bounds.width,
                (event.clientY - current.y) * element.clientHeight / bounds.height
            );
        }

        current.x = event.clientX;
        current.y = event.clientY;
    }

    function onPanPointerEnd(event: PointerEvent) {
        if (!pointer || event.pointerId !== pointer.id)
            return;

        consume(event);
        stopPan();
    }

    function onPanLostPointerCapture(event: PointerEvent) {
        if (event.target === options.host.value && event.pointerId === pointer?.id)
            stopPan();
    }

    function onPanAuxClick(event: MouseEvent) {
        if (event.button === 1)
            consume(event);
    }

    watch(options.canPan, (allowed) => {
        if (!allowed)
            disablePanMode();
    }, { flush: "sync" });

    onMounted(() => {
        window.addEventListener("pointermove", onPanPointerMove, true);
        window.addEventListener("pointerup", onPanPointerEnd, true);
        window.addEventListener("pointercancel", onPanPointerEnd, true);
        window.addEventListener("blur", stopPan);
    });

    onUnmounted(() => {
        stopPan();
        window.removeEventListener("pointermove", onPanPointerMove, true);
        window.removeEventListener("pointerup", onPanPointerEnd, true);
        window.removeEventListener("pointercancel", onPanPointerEnd, true);
        window.removeEventListener("blur", stopPan);
    });

    return {
        panMode,
        panning,
        togglePanMode,
        stopPan,
        onPanPointerDown,
        onPanLostPointerCapture,
        onPanAuxClick
    };
}
