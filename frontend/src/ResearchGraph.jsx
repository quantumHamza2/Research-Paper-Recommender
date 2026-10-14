import { useState, useEffect, useRef } from "react";
import ForceGraph2D from "react-force-graph-2d";

function ResearchGraph({ query, onSelectPaper, selectedPaperId }) {
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [hoverNode, setHoverNode] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });
  const fgRef = useRef();
  const containerRef = useRef(null);

  // Resize listener
  useEffect(() => {
    if (!containerRef.current) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height || 500,
        });
      }
    });
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Fetch graph data
  useEffect(() => {
    if (!query) return;

    setLoading(true);
    fetch(`http://localhost:8000/graph?query=${encodeURIComponent(query)}`)
      .then((res) => res.json())
      .then((data) => {
        setGraphData({
          nodes: data.nodes,
          links: data.edges,
        });
      })
      .catch((err) => console.error("Error loading graph:", err))
      .finally(() => setLoading(false));
  }, [query]);

  // Handle selected node highlighting and zoom
  useEffect(() => {
    if (!fgRef.current || !graphData.nodes.length) return;

    if (selectedPaperId !== null) {
      const node = graphData.nodes.find((n) => n.id === selectedPaperId);
      if (node) {
        // Zoom and center on the selected node
        fgRef.current.centerAt(node.x, node.y, 800);
        fgRef.current.zoom(2.5, 800);

        // Find neighbors
        const neighbors = new Set();
        graphData.links.forEach((link) => {
          const s = typeof link.source === "object" ? link.source.id : link.source;
          const t = typeof link.target === "object" ? link.target.id : link.target;
          if (s === node.id) neighbors.add(t);
          if (t === node.id) neighbors.add(s);
        });
        node.neighbors = neighbors;
      }
    }
  }, [selectedPaperId, graphData]);

  // Compute node neighbors on click
  const handleNodeClick = (node) => {
    onSelectPaper(node.id);
  };

  // Adjust D3 forces to slow down movement and settle nodes quickly
  useEffect(() => {
    if (!fgRef.current) return;
    // Soften repulsion strength (default is -30)
    fgRef.current.d3Force("charge").strength(-15);
    // Increase distance to prevent overlapping
    if (fgRef.current.d3Force("link")) {
      fgRef.current.d3Force("link").distance(45);
    }
  }, [graphData]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: "550px",
        background: "radial-gradient(circle at center, #181818, #0a0a0a)",
        borderRadius: "16px",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        overflow: "hidden",
      }}
    >
      {/* LOADING SPINNER */}
      {loading && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(10, 10, 10, 0.75)",
            backdropFilter: "blur(4px)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 10,
          }}
        >
          <div className="spinner" style={{ marginBottom: "12px" }} />
          <div style={{ color: "#d2d2d2", fontSize: "15px", fontWeight: "600", letterSpacing: "0.5px" }}>
            Querying FAISS database...
          </div>
          <div style={{ color: "#d2d2d2", fontSize: "12px", marginTop: "4px" }}>
            Running semantic search & MMR diversification
          </div>
        </div>
      )}

      {/* GRAPH CANVAS */}
      {graphData.nodes.length > 0 ? (
        <ForceGraph2D
          ref={fgRef}
          graphData={graphData}
          width={dimensions.width}
          height={dimensions.height}
          nodeLabel="title"

          // Hover actions
          onNodeHover={(node) => setHoverNode(node || null)}
          onNodeClick={handleNodeClick}

          // Custom node drawing
          nodeCanvasObject={(node, ctx, globalScale) => {
            const label = node.title;
            const fontSize = 14 / globalScale;
            ctx.font = `${fontSize}px sans-serif`;

            const isSelected = selectedPaperId === node.id;
            const isNeighbor = selectedPaperId !== null && graphData.nodes.find(n => n.id === selectedPaperId)?.neighbors?.has(node.id);

            // Determine coloring
            let fillStyle = `hsl(0, 0%, ${55 + (Math.abs(node.cluster) % 5) * 9}%)`;
            let radius = isSelected ? 9 : 5.5;

            if (selectedPaperId !== null) {
              if (isSelected) {
                fillStyle = "#d2d2d2"; // Selected node
              } else if (isNeighbor) {
                fillStyle = "#d2d2d2"; // Connected nodes
                radius = 5.5;
              } else {
                fillStyle = "rgba(180, 180, 180, 0.38)"; // Dim others
              }
            }

            // Draw circle
            ctx.save();
            ctx.beginPath();
            ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
            ctx.fillStyle = fillStyle;
            if (isSelected || isNeighbor) {
              ctx.shadowColor = fillStyle;
              ctx.shadowBlur = isSelected ? 14 : 7;
            }
            ctx.fill();

            // White border ring for highlights
            if (isSelected || isNeighbor) {
              ctx.strokeStyle = "#ffffff";
              ctx.lineWidth = 1.5 / globalScale;
              ctx.stroke();
            }
            ctx.restore();

            // Keep the selected paper readable without a wall of overlapping labels.
            const isHovered = hoverNode?.id === node.id;
            const showLabel = isSelected || isHovered ||
              (selectedPaperId === null && globalScale > 2.8);
            if (showLabel) {
              const displayLabel = label.length > 44 ? label.slice(0, 44) + "…" : label;
              const padding = 6 / globalScale;
              const textWidth = ctx.measureText(displayLabel).width;
              const boxWidth = textWidth + padding * 2;
              const boxHeight = fontSize + padding * 2;
              const top = node.y - radius - boxHeight - 5 / globalScale;
              ctx.save();
              ctx.fillStyle = "rgba(20, 20, 20, 0.96)";
              ctx.strokeStyle = "rgba(255, 255, 255, 0.28)";
              ctx.lineWidth = 1 / globalScale;
              ctx.beginPath();
              ctx.roundRect(node.x - boxWidth / 2, top, boxWidth, boxHeight, 4 / globalScale);
              ctx.fill();
              ctx.stroke();
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillStyle = "#ffffff";
              ctx.fillText(displayLabel, node.x, top + boxHeight / 2);
              ctx.restore();
            }
          }}

          // Custom link drawing
          linkWidth={(link) => {
            const s = typeof link.source === "object" ? link.source.id : link.source;
            const t = typeof link.target === "object" ? link.target.id : link.target;
            if (selectedPaperId === null) return 0.8;
            return s === selectedPaperId || t === selectedPaperId ? 2.5 : 0.2;
          }}
          linkColor={(link) => {
            const s = typeof link.source === "object" ? link.source.id : link.source;
            const t = typeof link.target === "object" ? link.target.id : link.target;
            if (selectedPaperId === null) return "rgba(220, 220, 220, 0.4)";
            return s === selectedPaperId || t === selectedPaperId ? "#d2d2d2" : "rgba(43, 43, 43, 0.1)";
          }}
          d3VelocityDecay={0.65}
        />
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            height: "100%",
            color: "#d2d2d2",
            fontSize: "15px",
            padding: "20px",
            textAlign: "center",
          }}
        >

          <div style={{ color: "#d2d2d2", fontWeight: "600", fontSize: "16px" }}>
            Graph Visualization Workspace
          </div>
          <div style={{ fontSize: "13px", marginTop: "6px", maxWidth: "400px" }}>
            Enter a research topic in the search bar above to fetch semantic nodes and generate a force-directed similarity graph.
          </div>
        </div>
      )}

      {/* FLOATING HOVER CARD */}
      {hoverNode && (
        <div
          style={{
            position: "absolute",
            bottom: "16px",
            left: "16px",
            width: "280px",
            background: "rgba(27, 27, 27, 0.95)",
            backdropFilter: "blur(16px)",
            padding: "14px",
            borderRadius: "14px",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            boxShadow: "0 8px 30px rgba(0, 0, 0, 0.6)",
            pointerEvents: "none",
          }}
        >
          <div style={{ fontSize: "11px", color: `hsl(0, 0%, ${55 + (Math.abs(hoverNode.cluster) % 5) * 9}%)`, fontWeight: "bold", marginBottom: "4px" }}>
            Cluster {hoverNode.cluster}
          </div>
          <div style={{ fontSize: "13px", fontWeight: "600", color: "#fafafa", lineHeight: "1.4" }}>
            {hoverNode.title}
          </div>
        </div>
      )}
    </div>
  );
}

export default ResearchGraph;
