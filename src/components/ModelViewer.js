// components/ModelViewer.js
// @ts-nocheck
"use client";

import { useState, useEffect, useRef } from "react";

const ModelViewer = ({ 
  onModelLoaded, 
  hotspots = [], 
  isAddingHotspot = false, 
  onHotspotCreate = null,
  selectedHotspotId = null,
  onHotspotSelect = null
}) => {
  const [modelSrc, setModelSrc] = useState(null);
  const [isClient, setIsClient] = useState(false);
  const fileNameRef = useRef("model");

  useEffect(() => {
    setIsClient(true); // Set to true only on the client side
  }, []);

  // Effect to handle model load event and hotspot interactions
  useEffect(() => {
    if (!isClient || !modelSrc) return;

    const modelViewer = document.getElementById("model-viewer");
    if (modelViewer) {
      const handleLoad = () => {
        console.log("Model loaded");

        // Set the custom property directly on the DOM element
        window.modelViewerElement = modelViewer;
        window.currentFileName = fileNameRef.current;

        console.log("Stored filename in global variable:", fileNameRef.current);

        if (onModelLoaded) {
          // Give a small delay to ensure the model is fully processed
          setTimeout(onModelLoaded, 100);
        }
      };

      const handleDoubleClick = (event) => {
        if (!isAddingHotspot || !onHotspotCreate) return;

        // Prevent camera movement when adding hotspots
        event.preventDefault();
        event.stopPropagation();

        // Get the hit position on the 3D model
        const hit = modelViewer.positionAndNormalFromPoint(event.clientX, event.clientY);
        
        if (hit) {
          // Convert to our coordinate system (model coordinates)
          const position = {
            x: hit.position.x,
            y: hit.position.y,
            z: hit.position.z
          };

          onHotspotCreate(position);
        }
      };

      modelViewer.addEventListener("load", handleLoad);
      modelViewer.addEventListener("dblclick", handleDoubleClick);

      return () => {
        modelViewer.removeEventListener("load", handleLoad);
        modelViewer.removeEventListener("dblclick", handleDoubleClick);
      };
    }
  }, [isClient, modelSrc, onModelLoaded, isAddingHotspot, onHotspotCreate]);

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (
      file &&
      (file.type === "model/gltf-binary" ||
        file.name.endsWith(".glb") ||
        file.name.endsWith(".gltf"))
    ) {
      // Store the original filename without extension
      const originalFileName = file.name.replace(/\.[^/.]+$/, "");
      fileNameRef.current = originalFileName;

      console.log("File dropped - storing filename:", originalFileName);

      const url = URL.createObjectURL(file);
      setModelSrc(url);
    } else {
      alert("Please drag and drop a valid .glb or .gltf file.");
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    // Add subtle visual feedback during drag
    e.currentTarget.classList.add("bg-[#EFEFEF]");
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    // Remove the visual feedback
    e.currentTarget.classList.remove("bg-[#EFEFEF]");
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className="w-full h-full flex items-center justify-center transition-colors duration-200"
    >
      <div className="w-full h-full flex items-center justify-center">
        {/* Render <model-viewer> only if a model is loaded */}
        {isClient && modelSrc && (
          <div className="relative w-full h-full">
            <model-viewer
              src={modelSrc}
              alt="A 3D model"
              id="model-viewer"
              shadow-intensity="0.5"
              environment-image="https://cdn.charpstar.net/Demos/HDR_Furniture.hdr"
              exposure="1.2"
              tone-mapping="aces"
              shadow-softness="1"
              min-field-of-view="5deg"
              max-field-of-view="35deg"
              style={{ width: "100%", height: "100%" }}
              camera-controls={!isAddingHotspot}
            >
              {/* 3D Hotspot Markers - these move with the model */}
              {hotspots.map((hotspot) => (
                hotspot.visible && (
                  <div
                    key={hotspot.id}
                    slot={`hotspot-${hotspot.id}`}
                    data-position={`${hotspot.position.x} ${hotspot.position.y} ${hotspot.position.z}`}
                    data-normal="0 1 0"
                    className={`hotspot-annotation ${
                      selectedHotspotId === hotspot.id ? 'selected' : ''
                    }`}
                    style={{
                      '--hotspot-color': selectedHotspotId === hotspot.id ? '#2563eb' : '#3b82f6',
                    }}
                  >
                    <div 
                      className={`hotspot-marker ${
                        selectedHotspotId === hotspot.id ? 'selected' : ''
                      }`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onHotspotSelect) {
                          onHotspotSelect(selectedHotspotId === hotspot.id ? null : hotspot.id);
                        }
                      }}
                    >
                      <div className="hotspot-dot"></div>
                      <div className="hotspot-pulse"></div>
                    </div>
                    
                    {/* Comment label - always visible when comment exists */}
                    {hotspot.comment && (
                      <div className="hotspot-comment">
                        <div 
                          className="comment-bubble"
                          onClick={(e) => {
                            e.stopPropagation();
                            // Select this hotspot when clicking on comment
                            if (onHotspotSelect) {
                              onHotspotSelect(hotspot.id);
                            }
                          }}
                        >
                          {hotspot.comment}
                        </div>
                      </div>
                    )}
                  </div>
                )
              ))}
            </model-viewer>
            
            {/* Adding hotspot indicator */}
            {isAddingHotspot && (
              <div className="absolute top-4 left-4 bg-blue-500 text-white text-xs px-3 py-1 rounded-full z-20">
                Double-click to add hotspot (camera disabled)
              </div>
            )}
            
            {/* Hotspot Styles */}
            <style jsx>{`
              .hotspot-annotation {
                display: block;
                width: 20px;
                height: 20px;
                border-radius: 50%;
                position: relative;
              }
              
              .hotspot-marker {
                width: 16px;
                height: 16px;
                position: relative;
                cursor: pointer;
                transition: transform 0.2s ease;
              }
              
              .hotspot-marker:hover {
                transform: scale(1.2);
              }
              
              .hotspot-marker.selected {
                transform: scale(1.3);
              }
              
              .hotspot-dot {
                width: 16px;
                height: 16px;
                background: var(--hotspot-color, #3b82f6);
                border: 3px solid white;
                border-radius: 50%;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
                position: absolute;
                top: 0;
                left: 0;
              }
              
              .hotspot-pulse {
                width: 16px;
                height: 16px;
                border: 2px solid var(--hotspot-color, #3b82f6);
                border-radius: 50%;
                position: absolute;
                top: 0;
                left: 0;
                animation: pulse 2s infinite;
                opacity: 0.6;
              }
              
              .hotspot-marker.selected .hotspot-pulse {
                animation: pulse 1s infinite;
              }
              
              .hotspot-comment {
                position: absolute;
                top: -10px;
                left: 25px;
                z-index: 20;
                pointer-events: none;
                transition: transform 0.2s ease;
              }
              
              .comment-bubble {
                background: rgba(0, 0, 0, 0.85);
                color: white;
                padding: 8px 12px;
                border-radius: 8px;
                font-size: 12px;
                line-height: 1.3;
                max-width: 200px;
                word-wrap: break-word;
                white-space: normal;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
                border: 1px solid rgba(255, 255, 255, 0.2);
                backdrop-filter: blur(4px);
              }
              
              .comment-bubble::before {
                content: '';
                position: absolute;
                left: -6px;
                top: 12px;
                width: 0;
                height: 0;
                border: 6px solid transparent;
                border-right-color: rgba(0, 0, 0, 0.85);
              }
              
              /* Make comment interactive when hotspot is selected */
              .hotspot-annotation.selected .hotspot-comment {
                pointer-events: auto;
                transform: scale(1.05);
              }
              
              .hotspot-annotation.selected .comment-bubble {
                cursor: pointer;
              }
              
              .hotspot-annotation.selected .comment-bubble {
                background: rgba(37, 99, 235, 0.9);
                border-color: rgba(255, 255, 255, 0.3);
              }
              
              .hotspot-annotation.selected .comment-bubble::before {
                border-right-color: rgba(37, 99, 235, 0.9);
              }
              
              @keyframes pulse {
                0% {
                  transform: scale(1);
                  opacity: 0.6;
                }
                50% {
                  transform: scale(1.5);
                  opacity: 0.2;
                }
                100% {
                  transform: scale(2);
                  opacity: 0;
                }
              }
            `}</style>
          </div>
        )}

        {/* Show a message if no model is loaded */}
        {!modelSrc && (
          <div className="text-center">
            <p className="text-gray-600 text-sm mb-2">
              Drag and drop a <strong>.glb</strong> or <strong>.gltf</strong>{" "}
              file here to view it.
            </p>
            <p className="text-gray-500 text-xs">
              The model structure will be displayed in the left panel once
              loaded.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ModelViewer;
