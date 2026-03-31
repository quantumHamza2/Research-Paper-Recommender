import { useEffect, useState } from "react";

function ResearchMap() {
  const [nodes, setNodes] = useState([]);
  const [hoverNode, setHoverNode] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    fetch("http://127.0.0.1:8000/map")
      .then(res => res.json())
      .then(data => {
        setNodes(data.nodes);
      });
  }, []);

  if (nodes.length === 0) return null;

  // NORMALIZATION
  const xs = nodes.map(n => n.x);
  const ys = nodes.map(n => n.y);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  // FIXED CANVAS SIZE (IMPORTANT)
  const width = 1200;
  const height = 800;
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  console.log(selectedNode);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        minHeight: "600px",
        position: "relative",
        overflow: "hidden",
        borderRadius: "16px",
        border: "1px solid rgba(255,255,255,0.05)",
        background: "radial-gradient(circle at center, #020617, #000)"
      }}
    >

      {/* MAP */}
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${width} ${height}`}
        onMouseMove={(e) =>
          setMousePos({ x: e.clientX, y: e.clientY })
        }
      >
        {nodes.map((node, i) => {
          const normX = (node.x - minX) / (maxX - minX);
          const normY = (node.y - minY) / (maxY - minY);

          const isRelated =
          selectedNode && selectedNode.related.includes(node.id);

          return (
<circle
  key={i}
  cx={normX * (width - 100) + 50}
  cy={normY * (height - 100) + 50}
  r={
    isRelated
    ? 3.8
    : selectedNode && node.cluster === selectedNode.cluster
      ? 2.5
      : 1.8
  }
  fill={`hsl(${node.cluster * 30}, 70%, 60%)`}
  opacity={
    selectedNode
    ? isRelated
      ? 1
      : node.cluster === selectedNode.cluster
        ? 0.4
        : 0.05
    : 0.75
  }
  onMouseEnter={() => setHoverNode(node)}
  onMouseLeave={() => setHoverNode(null)}
  onClick={() => setSelectedNode(node)}
  style={{
    cursor: "pointer",
    filter:
      selectedNode && node.cluster === selectedNode.cluster
        ? "drop-shadow(0px 0px 3px rgba(255,255,255,0.9))"
        : "none"
  }}
/>
          );
        })}
      </svg>

      {/* HOVER TOOLTIP */}
      {hoverNode && (
        <div
          style={{
            
            position: "absolute",
            left: mousePos.x + 12,
            top: mousePos.y + 12,
            width: "260px",
            background: "rgba(15, 23, 42, 0.95)",
            padding: "10px",
            borderRadius: "10px",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "0px 5px 15px rgba(0,0,0,0.5)",
            pointerEvents: "none",
            zIndex: 20
          }}
        >
          <div style={{ fontSize: "13px", fontWeight: "bold", color: "#e2e8f0" }}>
            {hoverNode.title}
          </div>
          <div style={{ fontSize: "12px", color: "#94a3b8" }}>
            {hoverNode.abstract
              ? hoverNode.abstract.slice(0, 120) + "..."
              : "No abstract"}
          </div>
        </div>
      )}

      {/* RIGHT PANEL */}
      {selectedNode && (
        <div
          style={{
            position: "absolute",
            right: "20px",
            top: "60px",
            width: "360px",
            maxHeight: "75vh",
            overflowY: "auto",
            background: "linear-gradient(135deg, #1e293b, #0f172a)",
            borderRadius: "16px",
            padding: "20px",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "0 10px 40px rgba(0,0,0,0.6)",
            zIndex: 10
          }}
        >

          {/* TITLE */}
          <div style={{
            fontSize: "16px",
            fontWeight: "600",
            color: "#e2e8f0",
            marginBottom: "10px"
          }}>
            {selectedNode.title}
          </div>

          {/* YEAR */}
          <div style={{
            display: "inline-block",
            background: "#3b82f6",
            color: "white",
            padding: "4px 10px",
            borderRadius: "999px",
            fontSize: "12px",
            marginBottom: "12px"
          }}>
            {selectedNode.year}
          </div>

          {/* ABSTRACT */}
          <div style={{
            fontSize: "13px",
            color: "#94a3b8",
            marginBottom: "15px",
            lineHeight: "1.5"
          }}>
            {selectedNode.abstract?.slice(0, 300)}...
          </div>

          {/* OPEN */}
          <button
  onClick={() => {
    console.log("PDF:", selectedNode?.pdf_url);

    if (selectedNode?.pdf_url) {
      window.open(selectedNode.pdf_url, "_blank");
    } else {
      alert("No PDF available");
    }
  }}
  style={{
    width: "100%",
    padding: "10px",
    borderRadius: "8px",
    background: "#22c55e",
    border: "none",
    color: "white",
    cursor: "pointer",
    marginTop: "10px"
  }}
          >
            📄 Open Paper
          </button>

          {/* CLOSE */}
          <button
            onClick={() => setSelectedNode(null)}
            style={{
              width: "100%",
              padding: "10px",
              borderRadius: "10px",
              background: "#1e293b",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "#cbd5e1",
              cursor: "pointer",
              marginTop: "10px"
            }}
          >
            ✖ Close
          </button>

          {/* DIVIDER */}
          <div style={{
            height: "1px",
            background: "rgba(255,255,255,0.08)",
            margin: "10px 0"
          }} />

          {/* RELATED */}
          <div style={{
            fontSize: "13px",
            color: "#94a3b8",
            marginBottom: "10px"
          }}>
            Related Papers
          </div>

          {selectedNode.related && selectedNode.related.length > 0 ? (
  <div style={{ marginTop: "15px" }}>
    <h4 style={{
      fontSize: "13px",
      marginBottom: "8px",
      color: "#94a3b8"
    }}>
      Related Papers
    </h4>

    {selectedNode.related.map((id, i) => {
      const paper = nodeMap.get(id);

      if (!paper) return null;

      return (
        <div
          key={i}
          onClick={() => setSelectedNode(paper)}
          style={{
            fontSize: "12px",
            marginBottom: "6px",
            cursor: "pointer",
            color: "#60a5fa"
          }}
        >
          • {paper.title.slice(0, 60)}...
        </div>
      );
    })}
  </div>
) : (
  <div style={{
    fontSize: "12px",
    color: "#64748b",
    marginTop: "10px"
  }}>
    No related papers
  </div>
)}
  
          </div>
        )}
      </div>
    );
  } 

export default ResearchMap;