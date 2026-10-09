import React, { useRef, useState, useEffect, useCallback } from 'react';
import { PenTool, Eraser, Trash2, Download, Palette } from 'lucide-react';
import { socketService } from '../../services/socketService';

export function WhiteboardPanel({ onSaveWhiteboard }) {
  const canvasRef = useRef(null);
  const hasInitializedCanvas = useRef(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#536a37');
  const [brushSize, setBrushSize] = useState(3);
  const [mode, setMode] = useState('pen');
  const prevPos = useRef({ x: 0, y: 0 });

  const colors = ['#536a37', '#4f7185', '#a2835b', '#b94f43', '#30322c'];

  const drawSegment = useCallback((x0, y0, x1, y1, strokeColor, strokeSize, strokeMode) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.strokeStyle = strokeMode === 'eraser' ? '#ffffff' : strokeColor;
    ctx.lineWidth = strokeMode === 'eraser' ? strokeSize * 4 : strokeSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resizeCanvas = () => {
      const bounds = canvas.getBoundingClientRect();
      const clientWidth = Math.round(bounds.width);
      const clientHeight = Math.round(bounds.height);
      if (!clientWidth || !clientHeight || (canvas.width === clientWidth && canvas.height === clientHeight)) return;

      const previousCanvas = document.createElement('canvas');
      const previousContext = previousCanvas.getContext('2d');
      previousCanvas.width = canvas.width;
      previousCanvas.height = canvas.height;
      previousContext.drawImage(canvas, 0, 0);

      canvas.width = clientWidth;
      canvas.height = clientHeight;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (hasInitializedCanvas.current) {
        ctx.drawImage(previousCanvas, 0, 0, previousCanvas.width, previousCanvas.height, 0, 0, canvas.width, canvas.height);
      }
      hasInitializedCanvas.current = true;
    };

    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(canvas.parentElement);
    resizeCanvas();

    const handleRemoteDraw = (stroke) => {
      drawSegment(stroke.x0, stroke.y0, stroke.x1, stroke.y1, stroke.color, stroke.brushSize, stroke.mode);
    };

    const handleRemoteClear = () => {
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    };

    socketService.on('whiteboard-draw', handleRemoteDraw);
    socketService.on('whiteboard-clear', handleRemoteClear);

    return () => {
      resizeObserver.disconnect();
      socketService.off('whiteboard-draw', handleRemoteDraw);
      socketService.off('whiteboard-clear', handleRemoteClear);
    };
  }, [drawSegment]);

  const getCanvasPosition = (event, canvas) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const startDrawing = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    prevPos.current = getCanvasPosition(e, canvas);
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { x, y } = getCanvasPosition(e, canvas);

    const x0 = prevPos.current.x;
    const y0 = prevPos.current.y;
    const x1 = x;
    const y1 = y;

    drawSegment(x0, y0, x1, y1, color, brushSize, mode);

    // Broadcast stroke to room peers in real-time
    socketService.sendWhiteboardDraw({
      x0,
      y0,
      x1,
      y1,
      color,
      brushSize,
      mode,
    });

    prevPos.current = { x, y };
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    socketService.sendWhiteboardClear();
  };

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `Meeting-Whiteboard-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#f8f8f5] text-[#30322c] dark:bg-[#12151e] dark:text-[#f3f4f6]">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[#e8e9e5] bg-[#fbfbf8] px-3 py-2.5 dark:border-[#202636] dark:bg-[#151923]">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#f1f4e9] text-[#718b4f] dark:bg-[#1f2e1a] dark:text-[#9bbc6d]">
            <Palette className="h-3.5 w-3.5" />
          </span>
          <span className="truncate text-[11px] font-semibold text-[#3b3d36] dark:text-[#f3f4f6]">Meeting canvas</span>
        </div>

        <div className="flex shrink-0 items-center gap-1 rounded-xl border border-[#e8e9e3] bg-[#f3f4ef] p-1 dark:border-[#242b3b] dark:bg-[#1a1f2c]">
          <button
            type="button"
            onClick={() => setMode('pen')}
            aria-label="Pen tool"
            aria-pressed={mode === 'pen'}
            className={`flex h-7 w-7 items-center justify-center rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9bbc6d]/50 ${
              mode === 'pen' ? 'bg-white text-[#536a37] shadow-sm dark:bg-[#252c3d] dark:text-[#9bbc6d]' : 'text-[#777a72] hover:bg-white/70 hover:text-[#34362f] dark:text-[#a0a6b5] dark:hover:bg-[#202737] dark:hover:text-[#f3f4f6]'
            }`}
            title="Pen tool"
          >
            <PenTool className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setMode('eraser')}
            aria-label="Eraser tool"
            aria-pressed={mode === 'eraser'}
            className={`flex h-7 w-7 items-center justify-center rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9bbc6d]/50 ${
              mode === 'eraser' ? 'bg-white text-[#536a37] shadow-sm dark:bg-[#252c3d] dark:text-[#9bbc6d]' : 'text-[#777a72] hover:bg-white/70 hover:text-[#34362f] dark:text-[#a0a6b5] dark:hover:bg-[#202737] dark:hover:text-[#f3f4f6]'
            }`}
            title="Eraser tool"
          >
            <Eraser className="h-3.5 w-3.5" />
          </button>
        </div>

        <div role="group" aria-label="Pen color" className="flex shrink-0 items-center gap-1.5 rounded-xl border border-[#e8e9e3] bg-white px-2 py-1.5 dark:border-[#242b3b] dark:bg-[#1a1f2c]">
          {colors.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => { setColor(c); setMode('pen'); }}
              aria-label={`Use ${c} pen color`}
              aria-pressed={color === c && mode === 'pen'}
              className={`h-3.5 w-3.5 rounded-full border border-black/10 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9bbc6d]/60 focus-visible:ring-offset-1 ${
                color === c && mode === 'pen' ? 'scale-110 ring-2 ring-[#879b69] ring-offset-1' : 'hover:scale-110'
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear canvas"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#85877f] transition-colors hover:bg-[#fff2ee] hover:text-[#b94f43] dark:text-[#8d93a3] dark:hover:bg-[#341d1a] dark:hover:text-[#f87171] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d97868]/40"
            title="Clear canvas"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={handleDownload}
            aria-label="Export canvas as PNG"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#e5e7df] bg-white text-[#718b4f] transition-colors hover:bg-[#f1f4e9] dark:border-[#242b3b] dark:bg-[#1a1f2c] dark:text-[#9bbc6d] dark:hover:bg-[#22293a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9bbc6d]/50"
            title="Export PNG snapshot"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 cursor-crosshair overflow-hidden bg-[#eef0ed] p-3 dark:bg-[#0c0e14]">
        <canvas
          ref={canvasRef}
          onPointerDown={startDrawing}
          onPointerMove={draw}
          onPointerUp={stopDrawing}
          onPointerCancel={stopDrawing}
          className="h-full w-full touch-none rounded-xl border border-[#e1e3dc] bg-white shadow-[0_4px_14px_rgba(37,43,34,0.06)] dark:border-[#202636]"
        />
      </div>
    </div>
  );
}
