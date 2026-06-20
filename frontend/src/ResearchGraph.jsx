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
        background: "radial-gradient(circle at center, #0B132B, #020617)",
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
            background: "rgba(2, 6, 23, 0.75)",
            backdropFilter: "blur(4px)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 10,
          }}
        >
          <div className="spinner" style={{ marginBottom: "12px" }} />
          <div style={{ color: "#38bdf8", fontSize: "15px", fontWeight: "600", letterSpacing: "0.5px" }}>
            Querying FAISS database...
          </div>
          <div style={{ color: "#64748b", fontSize: "12px", marginTop: "4px" }}>
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
            const fontSize = 11 / globalScale;
            ctx.font = `${fontSize}px sans-serif`;

            const isSelected = selectedPaperId === node.id;
            const isNeighbor = selectedPaperId !== null && graphData.nodes.find(n => n.id === selectedPaperId)?.neighbors?.has(node.id);

            // Determine coloring
            let fillStyle = `hsl(${node.cluster * 32}, 85%, 65%)`;
            let radius = isSelected ? 8 : 4.5;

            if (selectedPaperId !== null) {
              if (isSelected) {
                fillStyle = "#facc15"; // Selected gold
              } else if (isNeighbor) {
                fillStyle = "#22c55e"; // Neighbors green
                radius = 5.5;
              } else {
                fillStyle = "rgba(30, 41, 59, 0.15)"; // Dim others
              }
            }

            // Draw circle
            ctx.save();
            ctx.beginPath();
            ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
            ctx.fillStyle = fillStyle;
            if (isSelected || isNeighbor) {
              ctx.shadowColor = fillStyle;
              ctx.shadowBlur = isSelected ? 12 : 6;
            }
            ctx.fill();
            
            // White border ring for highlights
            if (isSelected || isNeighbor) {
              ctx.strokeStyle = "#ffffff";
              ctx.lineWidth = 1.5 / globalScale;
              ctx.stroke();
            }
            ctx.restore();

            // Draw text labels if zoomed in
            if (globalScale > 1.4) {
              const textWidth = ctx.measureText(label).width;
              const bckgDimensions = [textWidth, fontSize].map(n => n + fontSize * 0.2); // padding

              ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
              ctx.fillRect(node.x - bckgDimensions[0] / 2, node.y - radius - bckgDimensions[1] - 2, bckgDimensions[0], bckgDimensions[1]);

              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillStyle = isSelected ? "#facc15" : "#f8fafc";
              ctx.fillText(label.slice(0, 30) + (label.length > 30 ? "..." : ""), node.x, node.y - radius - bckgDimensions[1] / 2 - 2);
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
            if (selectedPaperId === null) return "rgba(100, 116, 139, 0.4)";
            return s === selectedPaperId || t === selectedPaperId ? "#22c55e" : "rgba(30, 41, 59, 0.1)";
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
            color: "#64748b",
            fontSize: "15px",
            padding: "20px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "40px", marginBottom: "16px", filter: "grayscale(1)" }}>🗺️</div>
          <div style={{ color: "#94a3b8", fontWeight: "600", fontSize: "16px" }}>
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
            background: "rgba(15, 23, 42, 0.95)",
            backdropFilter: "blur(16px)",
            padding: "14px",
            borderRadius: "14px",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            boxShadow: "0 8px 30px rgba(0, 0, 0, 0.6)",
            pointerEvents: "none",
          }}
        >
          <div style={{ fontSize: "11px", color: `hsl(${hoverNode.cluster * 32}, 85%, 65%)`, fontWeight: "bold", marginBottom: "4px" }}>
            Cluster {hoverNode.cluster}
          </div>
          <div style={{ fontSize: "13px", fontWeight: "600", color: "#f8fafc", lineHeight: "1.4" }}>
            {hoverNode.title}
          </div>
        </div>
      )}
    </div>
  );
}

export default ResearchGraph;