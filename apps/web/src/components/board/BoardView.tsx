"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { Tool, Shape, Point, EditPos } from "./types";
import { uid, CURSOR_MAP, TOOLS, STICKY_COLORS, MIN_ZOOM, MAX_ZOOM } from "./boardConstants";
import { normalizeRect, ptInShape } from "./boardUtils";
import { BoardTopBar } from "./BoardTopBar";
import { BoardCanvas } from "./BoardCanvas";
import { ToolPalette } from "./ToolPalette";
import { PropertiesPanel } from "./PropertiesPanel";

export default function BoardView() {
    const canvasRef = useRef<SVGSVGElement>(null);

    const [tool, setTool] = useState<Tool>("select");
    const [shapes, setShapes] = useState<Shape[]>([]);
    const [selected, setSelected] = useState<string[]>([]);
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
    const [showGrid, setShowGrid] = useState(true);
    const [darkCanvas, setDarkCanvas] = useState(false);

    const [fill, setFill] = useState("#FFFFFF");
    const [stroke, setStroke] = useState("#1A1915");
    const [strokeWidth, setStrokeWidth] = useState(2);
    const [opacity, setOpacity] = useState(1);
    const [fontSize, setFontSize] = useState(18);
    const [stickyColor, setStickyColor] = useState(STICKY_COLORS[0]);

    const drawing = useRef(false);
    const dragging = useRef(false);
    const panning = useRef(false);
    const startPt = useRef<Point>({ x: 0, y: 0 });
    const lastPan = useRef<Point>({ x: 0, y: 0 });
    const draftId = useRef<string | null>(null);
    const editingId = useRef<string | null>(null);

    const [editText, setEditText] = useState("");
    const [editPos, setEditPos] = useState<EditPos | null>(null);
    const [showProps, setShowProps] = useState(false);
    const [historyStack, setHistoryStack] = useState<Shape[][]>([[]]);
    const [histIdx, setHistIdx] = useState(0);

    const pushHistory = useCallback((s: Shape[]) => {
        setHistoryStack(h => [...h.slice(0, histIdx + 1), s]);
        setHistIdx(i => i + 1);
    }, [histIdx]);

    const undo = useCallback(() => {
        if (histIdx <= 0) return;
        setHistIdx(i => i - 1);
        setShapes(historyStack[histIdx - 1] ?? []);
        setSelected([]);
    }, [histIdx, historyStack]);

    const redo = useCallback(() => {
        if (histIdx >= historyStack.length - 1) return;
        setHistIdx(i => i + 1);
        setShapes(historyStack[histIdx + 1] ?? []);
    }, [histIdx, historyStack]);

    const toCanvas = useCallback((ex: number, ey: number): Point => {
        const r = canvasRef.current!.getBoundingClientRect();
        return { x: (ex - r.left - pan.x) / zoom, y: (ey - r.top - pan.y) / zoom };
    }, [pan, zoom]);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            const tag = (e.target as HTMLElement).tagName;
            if (tag === "INPUT" || tag === "TEXTAREA") return;
            if ((e.metaKey || e.ctrlKey) && e.key === "z") { e.preventDefault(); undo(); return; }
            if ((e.metaKey || e.ctrlKey) && e.key === "y") { e.preventDefault(); redo(); return; }
            if (e.key === "Delete" || e.key === "Backspace") {
                if (selected.length) {
                    const next = shapes.filter(s => !selected.includes(s.id));
                    setShapes(next); pushHistory(next); setSelected([]);
                }
                return;
            }
            if ((e.metaKey || e.ctrlKey) && e.key === "d") {
                e.preventDefault();
                if (selected.length) {
                    const clones = shapes
                        .filter(s => selected.includes(s.id))
                        .map(s => ({ ...s, id: uid(), x: s.x + 20, y: s.y + 20 }));
                    const next = [...shapes, ...clones];
                    setShapes(next); pushHistory(next); setSelected(clones.map(c => c.id));
                }
                return;
            }
            TOOLS.forEach(t => { if (e.key === t.key) setTool(t.id); });
            if (e.key === "Escape") setSelected([]);
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [selected, shapes, undo, redo, pushHistory]);

    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) {
            const delta = -e.deltaY * 0.002;
            setZoom(z => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z + delta * z)));
        } else {
            setPan(p => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
        }
    }, []);

    const getShapeDefaults = useCallback((kind: Shape["kind"]): Partial<Shape> => {
        if (kind === "sticky") return { fill: stickyColor, stroke: "transparent", strokeWidth: 0 };
        if (kind === "frame") return { fill: "transparent", stroke: "#3B82F6", strokeWidth: 1.5 };
        if (kind === "text") return { fill: stroke, stroke: "transparent", strokeWidth: 0 };
        return { fill, stroke, strokeWidth };
    }, [fill, stroke, strokeWidth, stickyColor]);

    const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
        if (e.button !== 0) return;
        const pt = toCanvas(e.clientX, e.clientY);

        if (tool === "hand") {
            panning.current = true;
            lastPan.current = { x: e.clientX, y: e.clientY };
            return;
        }

        if (tool === "eraser") {
            const hit = [...shapes].reverse().find(s => ptInShape(s, pt.x, pt.y));
            if (hit) {
                const next = shapes.filter(s => s.id !== hit.id);
                setShapes(next); pushHistory(next);
            }
            return;
        }

        if (tool === "select") {
            const hit = [...shapes].reverse().find(s => ptInShape(s, pt.x, pt.y));
            if (hit) {
                setSelected(prev =>
                    e.shiftKey
                        ? prev.includes(hit.id) ? prev.filter(i => i !== hit.id) : [...prev, hit.id]
                        : prev.includes(hit.id) ? prev : [hit.id]
                );
                dragging.current = true;
                startPt.current = pt;
                setShowProps(true);
            } else {
                setSelected([]);
                setShowProps(false);
                panning.current = true;
                lastPan.current = { x: e.clientX, y: e.clientY };
            }
            return;
        }

        drawing.current = true;
        startPt.current = pt;
        const id = uid();
        draftId.current = id;
        const kind: Shape["kind"] = tool === "pen" ? "freehand" : tool as Shape["kind"];
        const defaults = getShapeDefaults(kind);

        setShapes(prev => [...prev, {
            id, kind,
            x: pt.x, y: pt.y, w: 0, h: 0,
            fill: defaults.fill ?? fill,
            stroke: defaults.stroke ?? stroke,
            strokeWidth: defaults.strokeWidth ?? strokeWidth,
            opacity, fontSize,
            text: tool === "sticky" ? "Note" : tool === "frame" ? "Frame" : "",
            points: tool === "pen" ? [pt] : undefined,
        }]);
        setSelected([id]);
    }, [tool, shapes, fill, stroke, strokeWidth, opacity, fontSize, toCanvas, getShapeDefaults, pushHistory]);

    const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
        if (panning.current) {
            const dx = e.clientX - lastPan.current.x;
            const dy = e.clientY - lastPan.current.y;
            lastPan.current = { x: e.clientX, y: e.clientY };
            setPan(p => ({ x: p.x + dx, y: p.y + dy }));
            return;
        }
        if (dragging.current && selected.length) {
            const pt = toCanvas(e.clientX, e.clientY);
            const dx = pt.x - startPt.current.x;
            const dy = pt.y - startPt.current.y;
            startPt.current = pt;
            setShapes(prev => prev.map(s => selected.includes(s.id) ? { ...s, x: s.x + dx, y: s.y + dy } : s));
            return;
        }
        if (!drawing.current || !draftId.current) return;
        const pt = toCanvas(e.clientX, e.clientY);
        setShapes(prev => prev.map(s => {
            if (s.id !== draftId.current) return s;
            if (s.kind === "freehand") return { ...s, points: [...(s.points ?? []), pt] };
            if (s.kind === "line" || s.kind === "arrow") return { ...s, w: pt.x - startPt.current.x, h: pt.y - startPt.current.y };
            return { ...s, ...normalizeRect(startPt.current.x, startPt.current.y, pt.x, pt.y) };
        }));
    }, [selected, toCanvas]);

    const handleMouseUp = useCallback(() => {
        if (panning.current) { panning.current = false; return; }
        if (dragging.current) { dragging.current = false; pushHistory(shapes); return; }
        if (drawing.current) {
            drawing.current = false;
            const draft = shapes.find(s => s.id === draftId.current);
            if (draft && draft.w < 3 && draft.h < 3 && !draft.points?.length) {
                setShapes(prev => prev.map(s =>
                    s.id === draftId.current ? { ...s, w: tool === "text" ? 0 : 120, h: tool === "text" ? 0 : 80 } : s
                ));
            }
            pushHistory(shapes);
            draftId.current = null;
            if (tool !== "select" && tool !== "hand") setTool("select");
            setShowProps(true);
        }
    }, [shapes, tool, pushHistory]);

    const handleShapeMouseDown = useCallback((e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (tool === "eraser") {
            const next = shapes.filter(s => s.id !== id);
            setShapes(next); pushHistory(next);
            return;
        }
        if (tool === "select") {
            setSelected(prev =>
                e.shiftKey
                    ? prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
                    : prev.includes(id) ? prev : [id]
            );
            dragging.current = true;
            startPt.current = toCanvas(e.clientX, e.clientY);
            setShowProps(true);
        }
    }, [tool, shapes, toCanvas, pushHistory]);

    const handleDblClick = useCallback((e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        const s = shapes.find(sh => sh.id === id);
        if (!s || (s.kind !== "text" && s.kind !== "sticky")) return;
        editingId.current = id;
        setEditText(s.text ?? "");
        const r = canvasRef.current!.getBoundingClientRect();
        setEditPos({
            x: s.x * zoom + pan.x + r.left,
            y: s.y * zoom + pan.y + r.top,
            w: Math.max(100, s.w) * zoom,
            h: Math.max(40, s.h) * zoom,
        });
    }, [shapes, zoom, pan]);

    const commitEdit = useCallback(() => {
        if (!editingId.current) return;
        const id = editingId.current;
        setShapes(prev => prev.map(s => s.id === id ? { ...s, text: editText } : s));
        editingId.current = null;
        setEditPos(null);
    }, [editText]);

    const applyStyle = useCallback((patch: Partial<Shape>) => {
        if (!selected.length) return;
        setShapes(prev => prev.map(s => selected.includes(s.id) ? { ...s, ...patch } : s));
    }, [selected]);

    const handleClear = useCallback(() => {
        const next: Shape[] = [];
        setShapes(next); pushHistory(next); setSelected([]);
    }, [pushHistory]);

    const handleDelete = useCallback(() => {
        setShapes(p => p.filter(s => !selected.includes(s.id)));
        setSelected([]);
        setShowProps(false);
    }, [selected]);

    const handleDuplicate = useCallback((clone: Shape) => {
        const next = [...shapes, clone];
        setShapes(next); pushHistory(next); setSelected([clone.id]);
    }, [shapes, pushHistory]);

    const selShape = selected.length === 1 ? shapes.find(s => s.id === selected[0]) : null;

    return (
        <div className="flex flex-col h-full w-full overflow-hidden" style={{ backgroundColor: "var(--bg-surface)" }}>
            <BoardTopBar
                zoom={zoom}
                showGrid={showGrid}
                darkCanvas={darkCanvas}
                shapeCount={shapes.length}
                selectedCount={selected.length}
                canUndo={histIdx > 0}
                canRedo={histIdx < historyStack.length - 1}
                activeTool={tool}
                onZoom={setZoom}
                onToggleGrid={() => setShowGrid(g => !g)}
                onToggleDark={() => setDarkCanvas(d => !d)}
                onUndo={undo}
                onRedo={redo}
                onClear={handleClear}
            />

            <div className="flex flex-1 overflow-hidden relative">
                <ToolPalette
                    tool={tool}
                    stickyColor={stickyColor}
                    onSelectTool={setTool}
                    onSelectSticky={setStickyColor}
                />

                <BoardCanvas
                    ref={canvasRef}
                    shapes={shapes}
                    selected={selected}
                    zoom={zoom}
                    pan={pan}
                    tool={tool}
                    showGrid={showGrid}
                    darkCanvas={darkCanvas}
                    cursor={CURSOR_MAP[tool]}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onWheel={handleWheel}
                    onShapeMouseDown={handleShapeMouseDown}
                    onShapeDblClick={handleDblClick}
                />

                {showProps && selShape && (
                    <PropertiesPanel
                        selShape={selShape}
                        shapes={shapes}
                        selected={selected}
                        onApply={applyStyle}
                        onDelete={handleDelete}
                        onDuplicate={handleDuplicate}
                    />
                )}

                <div
                    className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-1.5 rounded-full shadow-md text-[11px] font-medium pointer-events-none"
                    style={{ backgroundColor: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-muted)" }}
                >
                    <span style={{ color: "var(--text-secondary)" }}>
                        {TOOLS.find(t => t.id === tool)?.label}
                    </span>
                    <span>·</span>
                    <span>{selected.length ? `${selected.length} selected` : "Nothing selected"}</span>
                    <span>·</span>
                    <span>Scroll to pan · Ctrl+scroll to zoom</span>
                </div>
            </div>

            {editPos && (
                <textarea
                    autoFocus
                    value={editText}
                    onChange={e => setEditText(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={e => { if (e.key === "Escape") commitEdit(); }}
                    style={{
                        position: "fixed",
                        left: editPos.x, top: editPos.y,
                        width: editPos.w, minHeight: editPos.h,
                        zIndex: 99999,
                        backgroundColor: "rgba(255,255,220,0.95)",
                        border: "2px solid #3B82F6",
                        borderRadius: 8,
                        padding: "8px 10px",
                        fontSize: 13,
                        resize: "both",
                        outline: "none",
                        color: "#1A1915",
                        lineHeight: 1.5,
                    }}
                />
            )}
        </div>
    );
}
