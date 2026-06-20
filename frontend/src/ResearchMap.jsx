import { useEffect, useState, useRef } from "react";

function ResearchMap({ onSelectPaper, selectedPaperId, searchQuery, selectedCategories }) {
  const [nodes, setNodes] = useState([]);
  const [hoverNode, setHoverNode] = useState(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const [clusterLabels, setClusterLabels] = useState({});
  const [centroids, setCentroids] = useState([]);
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [limits, setLimits] = useState({ minX: 0, maxX: 1, minY: 0, maxY: 1 });

  // Fetch map nodes
  useEffect(() => {
    fetch("http://127.0.0.1:8000/map")
      .then((res) => res.json())
      .then((data) => {
        setNodes(data.nodes);
        if (data.nodes.length > 0) {
          const xs = data.nodes.map((n) => n.x);
          const ys = data.nodes.map((n) => n.y);
          setLimits({
            minX: Math.min(...xs),
            maxX: Math.max(...xs),
            minY: Math.min(...ys),
            maxY: Math.max(...ys),
          });
        }
      })
      .catch((err) => console.error("Error loading map:", err));
  }, []);

  // Fetch cluster labels
  useEffect(() => {
    fetch("http://127.0.0.1:8000/clusters")
      .then((res) => res.json())
      .then((data) => setClusterLabels(data))
      .catch((err) => console.error("Error loading clusters:", err));
  }, []);

  // Calculate centroids for text badges
  useEffect(() => {
    if (nodes.length === 0) return;
    const groups = {};
    nodes.forEach((node) => {
      if (node.cluster < 0) return; // skip noise
      if (!groups[node.cluster]) {
        groups[node.cluster] = { sumX: 0, sumY: 0, count: 0 };
      }
      groups[node.cluster].sumX += node.x;
      groups[node.cluster].sumY += node.y;
      groups[node.cluster].count += 1;
    });

    const computed = Object.entries(groups).map(([c_id, data]) => ({
      cluster: parseInt(c_id),
      x: data.sumX / data.count,
      y: data.sumY / data.count,
    }));
    setCentroids(computed);
  }, [nodes]);

  // Handle container resizing
  useEffect(() => {
    if (!containerRef.current) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height || 600,
        });
      }
    });
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || nodes.length === 0) return;

    const ctx = canvas.getContext("2d");
    const { width, height } = dimensions;
    const { minX, maxX, minY, maxY } = limits;
    const { x, y, k } = transform;

    ctx.clearRect(0, 0, width, height);

    // Draw all points
    nodes.forEach((node) => {
      const normX = (node.x - minX) / (maxX - minX || 1);
      const normY = (node.y - minY) / (maxY - minY || 1);

      const padding = 60;
      const sx = normX * (width - padding * 2) + padding;
      const sy = normY * (height - padding * 2) + padding;

      const rx = sx * k + x;
      const ry = sy * k + y;

      if (rx < -10 || rx > width + 10 || ry < -10 || ry > height + 10) return;

      const isSelected = selectedPaperId === node.id;
      const isHovered = hoverNode && hoverNode.id === node.id;
      const isSearchMatch = searchQuery && node.title.toLowerCase().includes(searchQuery.toLowerCase());
      
      // Category match check
      const isCategoryMatch = selectedCategories.length === 0 || 
        (node.categories && node.categories.some(cat => selectedCategories.includes(cat)));

      let radius = 2.5;
      if (isSelected) radius = 8;
      else if (isHovered) radius = 6;
      else if (isSearchMatch) radius = 5;

      let fillStyle = `hsl(${node.cluster * 32}, 85%, 65%)`;
      let opacity = 0.7;

      if (!isCategoryMatch) {
        opacity = 0.02; // Heavily dim non-category matches
      } else if (selectedPaperId !== null) {
        if (isSelected) {
          fillStyle = "#fbbf24";
          opacity = 1.0;
        } else {
          opacity = 0.06;
        }
      } else if (searchQuery) {
        if (isSearchMatch) {
          fillStyle = "#38bdf8";
          opacity = 1.0;
        } else {
          opacity = 0.12;
        }
      } else if (isHovered) {
        opacity = 1.0;
      }

      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.fillStyle = fillStyle;
      
      if (isCategoryMatch && (isSelected || isHovered || isSearchMatch)) {
        ctx.shadowColor = fillStyle;
        ctx.shadowBlur = isSelected ? 12 : 6;
      }

      ctx.beginPath();
      ctx.arc(rx, ry, radius, 0, 2 * Math.PI);
      ctx.fill();

      if (isCategoryMatch && (isSelected || isHovered)) {
        ctx.strokeStyle = isSelected ? "#ffffff" : "rgba(255,255,255,0.8)";
        ctx.lineWidth = isSelected ? 2 : 1;
        ctx.stroke();
      }

      ctx.restore();
    });

    // Draw cluster keywords at centroids when zoomed in
    if (k > 1.2 && centroids.length > 0) {
      centroids.forEach((c) => {
        const label = clusterLabels[c.cluster];
        if (!label) return;

        const normX = (c.x - minX) / (maxX - minX || 1);
        const normY = (c.y - minY) / (maxY - minY || 1);
        const padding = 60;
        const sx = normX * (width - padding * 2) + padding;
        const sy = normY * (height - padding * 2) + padding;

        const rx = sx * k + x;
        const ry = sy * k + y;

        if (rx < 20 || rx > width - 20 || ry < 20 || ry > height - 20) return;

        ctx.save();
        ctx.font = "bold 9px sans-serif";
        const textWidth = ctx.measureText(label).width;
        const textHeight = 12;
        const rectWidth = textWidth + 12;
        const rectHeight = textHeight + 6;

        // Draw rounded container badge
        ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
        ctx.strokeStyle = `hsl(${c.cluster * 32}, 85%, 65%)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(rx - rectWidth / 2, ry - rectHeight / 2, rectWidth, rectHeight, 6);
        } else {
          ctx.rect(rx - rectWidth / 2, ry - rectHeight / 2, rectWidth, rectHeight);
        }
        ctx.fill();
        ctx.stroke();

        // Keywords text
        ctx.fillStyle = "#f8fafc";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, rx, ry);
        ctx.restore();
      });
    }
  }, [nodes, transform, dimensions, limits, selectedPaperId, hoverNode, searchQuery, selectedCategories, clusterLabels, centroids]);

  // Translate screen coordinates to node references
  const findNodeAtPosition = (screenX, screenY) => {
    const { width, height } = dimensions;
    const { minX, maxX, minY, maxY } = limits;
    const { x, y, k } = transform;
    const padding = 60;

    let closestNode = null;
    let minDistance = 15;

    nodes.forEach((node) => {
      const isCategoryMatch = selectedCategories.length === 0 || 
        (node.categories && node.categories.some(cat => selectedCategories.includes(cat)));
        
      if (!isCategoryMatch) return; // Skip inactive nodes

      const normX = (node.x - minX) / (maxX - minX || 1);
      const normY = (node.y - minY) / (maxY - minY || 1);

      const sx = normX * (width - padding * 2) + padding;
      const sy = normY * (height - padding * 2) + padding;

      const rx = sx * k + x;
      const ry = sy * k + y;

      const dist = Math.hypot(screenX - rx, screenY - ry);
      if (dist < minDistance) {
        minDistance = dist;
        closestNode = node;
      }
    });

    return closestNode;
  };

  const handleMouseDown = (e) => {
    isDraggingRef.current = true;
    dragStartRef.current = {
      x: e.clientX - transform.x,
      y: e.clientY - transform.y,
    };
  };

  const handleMouseMove = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    if (isDraggingRef.current) {
      setTransform((prev) => ({
        ...prev,
        x: e.clientX - dragStartRef.current.x,
        y: e.clientY - dragStartRef.current.y,
      }));
    } else {
      const hovered = findNodeAtPosition(screenX, screenY);
      setHoverNode(hovered);
    }
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleMouseLeave = () => {
    isDraggingRef.current = false;
    setHoverNode(null);
  };

  const handleClick = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    const clickedNode = findNodeAtPosition(screenX, screenY);
    if (clickedNode) {
      onSelectPaper(clickedNode.id);
    } else {
      onSelectPaper(null);
    }
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    const nextK = Math.max(0.5, Math.min(25, transform.k * zoomFactor));

    const nextX = mouseX - (mouseX - transform.x) * (nextK / transform.k);
    const nextY = mouseY - (mouseY - transform.y) * (nextK / transform.k);

    setTransform({ x: nextX, y: nextY, k: nextK });
  };

  const handleReset = () => {
    setTransform({ x: 0, y: 0, k: 1 });
  };

  const uniqueClusters = Array.from(new Set(nodes.map((n) => n.cluster))).sort((a, b) => a - b);

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: "550px",
        background: "radial-gradient(circle at center, #0B132B, #020617)",
        borderRadius: "16px",
        overflow: "hidden",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        boxShadow: "inset 0 0 20px rgba(0,0,0,0.8)",
      }}
    >
      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        onWheel={handleWheel}
        style={{
          display: "block",
          cursor: isDraggingRef.current ? "grabbing" : hoverNode ? "pointer" : "grab",
        }}
      />

      {/* CLUSTERING LEGEND PANEL */}
      {nodes.length > 0 && (
        <div
          style={{
            position: "absolute",
            bottom: "16px",
            left: "16px",
            background: "rgba(15, 23, 42, 0.9)",
            backdropFilter: "blur(12px)",
            padding: "10px 14px",
            borderRadius: "12px",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            maxWidth: "350px",
            maxHeight: "220px",
            overflowY: "auto",
            zIndex: 5,
          }}
        >
          <div style={{ fontSize: "11px", color: "#64748b", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Topic Legend
          </div>
          {uniqueClusters.slice(0, 15).map((c, i) => {
            const keywords = clusterLabels[c];
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11.5px", color: "#94a3b8" }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: `hsl(${c * 32}, 85%, 65%)`, flexShrink: 0 }} />
                <span style={{ textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                  {keywords ? `${keywords}` : `Cluster ${c}`}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* TOOLBAR CONTROLS */}
      <div
        style={{
          position: "absolute",
          top: "16px",
          left: "16px",
          display: "flex",
          gap: "8px",
          zIndex: 5,
        }}
      >
        <button
          onClick={handleReset}
          style={{
            padding: "6px 12px",
            background: "rgba(30, 41, 59, 0.85)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            borderRadius: "8px",
            color: "#e2e8f0",
            fontSize: "12px",
            cursor: "pointer",
            fontWeight: "500",
            transition: "all 0.2s",
            boxShadow: "0 4px 6px rgba(0,0,0,0.15)",
          }}
        >
          🔍 Reset View
        </button>
        <div
          style={{
            padding: "6px 12px",
            background: "rgba(15, 23, 42, 0.85)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            borderRadius: "8px",
            color: "#64748b",
            fontSize: "11px",
            display: "flex",
            alignItems: "center",
            boxShadow: "0 4px 6px rgba(0,0,0,0.15)",
          }}
        >
          ℹ Drag to pan • Scroll to zoom (Zoom in to see overlays)
        </div>
      </div>

      {/* FLOATING HOVER CARD */}
      {hoverNode && (
        <div
          style={{
            position: "absolute",
            bottom: "16px",
            right: "16px",
            width: "280px",
            background: "rgba(15, 23, 42, 0.95)",
            backdropFilter: "blur(16px)",
            padding: "14px",
            borderRadius: "14px",
            border: "1px solid rgba(255,255,255,0.12)",
            boxShadow: "0 8px 30px rgba(0,0,0,0.6)",
            pointerEvents: "none",
            zIndex: 10,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" }}>
            <span style={{ fontSize: "11px", color: `hsl(${hoverNode.cluster * 32}, 85%, 65%)`, fontWeight: "bold" }}>
              {clusterLabels[hoverNode.cluster] ? clusterLabels[hoverNode.cluster].split(',')[0] : `Cluster ${hoverNode.cluster}`}
            </span>
            <span style={{ fontSize: "10px", background: "rgba(59, 130, 246, 0.2)", color: "#60a5fa", padding: "2px 6px", borderRadius: "999px" }}>
              {hoverNode.year}
            </span>
          </div>
          <div style={{ fontSize: "13px", fontWeight: "600", color: "#f8fafc", lineHeight: "1.4" }}>
            {hoverNode.title}
          </div>
          {hoverNode.categories && hoverNode.categories.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "8px" }}>
              {hoverNode.categories.slice(0, 3).map((cat, idx) => (
                <span key={idx} style={{ fontSize: "9px", background: "rgba(255,255,255,0.06)", color: "#94a3b8", padding: "1px 4px", borderRadius: "4px" }}>
                  {cat}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ResearchMap;