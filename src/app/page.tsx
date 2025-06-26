// src/app/page.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { Model } from "flexlayout-react";
import FlexLayout from "@/components/layout/FlexLayout";
import Header from "@/components/layout/Header";
import "flexlayout-react/style/dark.css";
import "@/styles/flexlayout-custom.css";

export default function Home() {
  // Use state for isSynsam to avoid hydration mismatch
  const [isSynsam, setIsSynsam] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsSynsam(
        new URLSearchParams(window.location.search).get("script") === "synsam"
      );
    }
  }, []);

  const [modelStructure, setModelStructure] = useState<any>(null);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [activeEnvironment, setActiveEnvironment] = useState<
    "v5" | "v6" | "synsam" | null
  >(null); // Set after mount
  const [layoutModel, setLayoutModel] = useState<Model | null>(null);
  const [visiblePanels, setVisiblePanels] = useState({
    scene: true,
    materials: true,
    variants: true,
  });
  const [exposure, setExposure] = useState(1.2);
  const [toneMapping, setToneMapping] = useState("aces");
  const modelViewerRef = useRef<any>(null);

  // Set activeEnvironment on mount based on isSynsam
  useEffect(() => {
    if (isSynsam) {
      setActiveEnvironment("synsam");
    } else {
      setActiveEnvironment("v6");
      // Set V6 defaults when initially loading
      setExposure(1.2);
      setToneMapping("aces");
    }
  }, [isSynsam]);

  // Dynamically load the correct model-viewer script based on mode
  useEffect(() => {
    if (isSynsam) {
      // Check if model-viewer is already defined
      if (customElements.get("model-viewer")) {
        console.log(
          "model-viewer already defined, skipping space-opera.js load"
        );
        return;
      }

      // Check if space-opera.js is already loaded
      if (document.querySelector('script[src="/space-opera.js"]')) {
        console.log("space-opera.js already loaded");
        return;
      }

      // Polyfill process for browser if not present
      if (typeof window !== "undefined" && !(window as any).process) {
        (window as any).process = { env: { NODE_ENV: "production" } };
      }
      console.log("Loading space-opera.js for Synsam mode");
      const script = document.createElement("script");
      script.src = "/space-opera.js";
      script.async = true;
      document.body.appendChild(script);
      return () => {
        console.log("Removing space-opera.js script");
        document.body.removeChild(script);
      };
    } else {
      // Check if model-viewer is already defined
      if (customElements.get("model-viewer")) {
        console.log(
          "model-viewer already defined, skipping model-viewer.js load"
        );
        return;
      }

      // Check if model-viewer.js is already loaded
      if (document.querySelector('script[src="/model-viewer.js"]')) {
        console.log("model-viewer.js already loaded");
        return;
      }

      // Only load the default model-viewer.js if NOT in Synsam mode
      console.log("Loading model-viewer.js for standard mode");
      const script = document.createElement("script");
      script.type = "module";
      script.src = "/model-viewer.js";
      script.async = true;
      document.body.appendChild(script);
      return () => {
        console.log("Removing model-viewer.js script");
        document.body.removeChild(script);
      };
    }
  }, [isSynsam]);

  // Set Synsam HDR in shadow DOM if in Synsam mode
  // useEffect(() => {
  //   ... (removed - now handled in setupModelViewer)
  // }, [isSynsam]);

  // Handler for node selection
  const handleNodeSelect = (node: any) => {
    console.log("Home component received selected node:", node.name, node.type);
    setSelectedNode(node);
  };

  // Improved panel visibility toggle
  const handleTogglePanel = (panel: "scene" | "materials" | "variants") => {
    console.log(
      `Toggling panel visibility: ${panel} → ${!visiblePanels[panel]}`
    );
    setVisiblePanels((prev) => ({
      ...prev,
      [panel]: !prev[panel],
    }));
  };

  // Handle layout model updates
  const handleLayoutModelUpdate = (model: Model) => {
    setLayoutModel(model);
  };

  // Export functions
  const handleExportGLB = () => {
    if (
      modelViewerRef.current &&
      typeof modelViewerRef.current.exportGLB === "function"
    ) {
      console.log("Exporting GLB...");
      modelViewerRef.current.exportGLB();
    } else {
      console.error("exportGLB method not available on model viewer");
    }
  };

  const handleExportGLTF = () => {
    if (
      modelViewerRef.current &&
      typeof modelViewerRef.current.exportGLTF === "function"
    ) {
      console.log("Exporting GLTF...");
      modelViewerRef.current.exportGLTF();
    } else {
      console.error("exportGLTF method not available on model viewer");
    }
  };

  const handleExportUSDZ = () => {
    if (
      modelViewerRef.current &&
      typeof modelViewerRef.current.exportUSDZ === "function"
    ) {
      console.log("Exporting USDZ...");
      modelViewerRef.current.exportUSDZ();
    } else {
      console.error("exportUSDZ method not available on model viewer");
    }
  };

  // Environment tester functions
  const handleEnvironmentChange = (env: "v5" | "v6" | "synsam") => {
    if (env === "synsam") {
      // Reload page with synsam script parameter
      window.location.search = "?script=synsam";
      return;
    }

    if (isSynsam) {
      // If currently in Synsam mode and switching to V5/V6, reload without script param
      window.location.search = ""; // Remove synsam param to go back to standard
      return;
    }

    // Set the active environment state (this will trigger the useEffect to apply settings)
    setActiveEnvironment(env);

    // Update exposure and tone mapping to environment defaults
    if (env === "v5") {
      setExposure(1.3);
      setToneMapping("commerce");
    } else if (env === "v6") {
      setExposure(1.2);
      setToneMapping("aces");
    }

    // Try to apply settings immediately if model-viewer exists
    const modelViewer = document.getElementById("model-viewer");
    if (modelViewer) {
      if (env === "v5") {
        modelViewer.setAttribute(
          "environment-image",
          "https://cdn.charpstar.net/Demos/warm.hdr"
        );
        modelViewer.setAttribute("exposure", "1.3");
        modelViewer.setAttribute("tone-mapping", "commerce");
      } else {
        modelViewer.setAttribute(
          "environment-image",
          "https://cdn.charpstar.net/Demos/HDR_Furniture.hdr"
        );
        modelViewer.setAttribute("exposure", "1.2");
        modelViewer.setAttribute("tone-mapping", "aces");
      }
      if (typeof (modelViewer as any).requestRender === "function") {
        (modelViewer as any).requestRender();
      }
    }
    // If model-viewer doesn't exist yet, the settings will be applied when it's created (via useEffect)
  };

  const handleExposureChange = (value: number) => {
    setExposure(value);

    // Apply to model-viewer immediately if it exists
    const modelViewer = document.getElementById("model-viewer");
    if (modelViewer) {
      modelViewer.setAttribute("exposure", value.toString());
      if (typeof (modelViewer as any).requestRender === "function") {
        (modelViewer as any).requestRender();
      }
    }
  };

  const handleToneMappingChange = (value: string) => {
    setToneMapping(value);

    // Apply to model-viewer immediately if it exists
    const modelViewer = document.getElementById("model-viewer");
    if (modelViewer) {
      modelViewer.setAttribute("tone-mapping", value);
      if (typeof (modelViewer as any).requestRender === "function") {
        (modelViewer as any).requestRender();
      }
    }
  };

  // Function to fetch the model structure
  const fetchModelStructure = () => {
    if (
      modelViewerRef.current &&
      typeof modelViewerRef.current.getModelStructure === "function"
    ) {
      try {
        const structure = modelViewerRef.current.getModelStructure();
        console.log("Model structure loaded:", structure);
        setModelStructure(structure);
      } catch (error) {
        console.error("Error fetching model structure:", error);
      }
    } else {
      console.warn("modelViewer or getModelStructure method not available");
    }
  };

  // Set up a MutationObserver to detect when model-viewer element is loaded
  useEffect(() => {
    const setupModelViewer = () => {
      const modelViewer = document.querySelector("model-viewer");
      if (modelViewer) {
        modelViewerRef.current = modelViewer;

        if (modelViewer.getAttribute("src")) {
          fetchModelStructure();
        }

        modelViewer.addEventListener("load", fetchModelStructure);

        // Add camera change listener for dimension management
        const handleCameraChange = () => {
          // Small delay to ensure the camera position is updated
          setTimeout(() => {
            manageDimensionVisibility();
          }, 50);
        };

        modelViewer.addEventListener("camera-change", handleCameraChange);

        // Apply current environment settings if we have an active environment and not in Synsam mode
        if (
          !isSynsam &&
          activeEnvironment &&
          (activeEnvironment === "v5" || activeEnvironment === "v6")
        ) {
          if (activeEnvironment === "v5") {
            modelViewer.setAttribute(
              "environment-image",
              "https://cdn.charpstar.net/Demos/warm.hdr"
            );
            // Apply current state values instead of hardcoded defaults
            modelViewer.setAttribute("exposure", exposure.toString());
            modelViewer.setAttribute("tone-mapping", toneMapping);
          } else if (activeEnvironment === "v6") {
            modelViewer.setAttribute(
              "environment-image",
              "https://cdn.charpstar.net/Demos/HDR_Furniture.hdr"
            );
            // Apply current state values instead of hardcoded defaults
            modelViewer.setAttribute("exposure", exposure.toString());
            modelViewer.setAttribute("tone-mapping", toneMapping);
          }
        }

        // Apply Synsam settings if in Synsam mode
        if (isSynsam) {
          console.log("Model-viewer found in Synsam mode, applying Synsam HDR");
          modelViewer.setAttribute(
            "environment-image",
            "https://charpstar.se/3DTester/SynsamNewHDRI.jpg"
          );
          modelViewer.removeAttribute("tone-mapping");
          console.log("Synsam HDR applied to model-viewer");
        }
      }
    };

    // Function to manage dimension visibility based on camera angle
    const manageDimensionVisibility = () => {
      const modelViewer = modelViewerRef.current;
      if (!modelViewer) return;

      try {
        // Get all dimension elements (including hotspot annotations)
        const dimensions = document.querySelectorAll(
          '.cmv-dim, [class*="cmv-dim"], hotspot-annotation[data-surface], [data-hotspot]'
        );

        dimensions.forEach((dim: any) => {
          // Simple approach: hide dimensions on surfaces marked as "back"
          if (dim.dataset && dim.dataset.surface === "back") {
            dim.classList.remove("cmv-show");
            dim.classList.add("cmv-hide");
            return;
          }

          // Try to get camera orbit for more sophisticated detection
          try {
            const camera = (modelViewer as any).getCameraOrbit();
            if (camera) {
              const cameraTheta = camera.theta;
              const normalizedTheta =
                ((cameraTheta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

              // For sunglasses model: front is roughly 0 to π, back is π to 2π
              // Adjust these values based on your specific model orientation
              const isFrontFacing = normalizedTheta < Math.PI;

              // Additional check for specific annotation positions
              const annotation = dim.textContent || "";

              // Hide dimensions that are on the back/side that shouldn't be visible
              if (annotation.includes("15 cm") && !isFrontFacing) {
                // This dimension should only show from the front
                dim.classList.remove("cmv-show");
                dim.classList.add("cmv-hide");
              } else if (annotation.includes("6 cm") && !isFrontFacing) {
                // This dimension should only show from the front
                dim.classList.remove("cmv-show");
                dim.classList.add("cmv-hide");
              } else if (isFrontFacing) {
                dim.classList.remove("cmv-hide");
                dim.classList.add("cmv-show");
              }
            }
          } catch (cameraError) {
            // Fallback: simple visibility logic
            const annotation = dim.textContent || "";
            if (annotation.includes("cm")) {
              // Show by default, but this is just a fallback
              dim.classList.remove("cmv-hide");
              dim.classList.add("cmv-show");
            }
          }
        });
      } catch (error) {
        console.warn("Error managing dimension visibility:", error);
      }
    };

    setupModelViewer();

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.addedNodes.length) {
          const modelViewer = document.querySelector("model-viewer");
          if (modelViewer && !modelViewerRef.current) {
            setupModelViewer();
          }
        }
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Add window resize event for responsive layout
    const handleResize = () => {
      if (
        modelViewerRef.current &&
        typeof modelViewerRef.current.requestRender === "function"
      ) {
        modelViewerRef.current.requestRender();
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", handleResize);
      if (modelViewerRef.current) {
        modelViewerRef.current.removeEventListener("load", fetchModelStructure);
      }
    };
  }, [activeEnvironment, isSynsam, exposure, toneMapping]); // Include all dependencies for React compliance

  // Separate effect to apply user control changes to model-viewer
  useEffect(() => {
    const modelViewer = document.getElementById("model-viewer");
    if (
      modelViewer &&
      !isSynsam &&
      (activeEnvironment === "v5" || activeEnvironment === "v6")
    ) {
      // Apply current exposure and toneMapping values
      modelViewer.setAttribute("exposure", exposure.toString());
      modelViewer.setAttribute("tone-mapping", toneMapping);

      if (typeof (modelViewer as any).requestRender === "function") {
        (modelViewer as any).requestRender();
      }
    }
  }, [exposure, toneMapping, isSynsam, activeEnvironment]);

  // Handler for variant change
  const handleVariantChange = () => {
    console.log("Variant changed, updating material view");
    // This will trigger a re-render of material properties
  };

  if (typeof window !== "undefined" && !window.process) {
    (window as any).process = { env: { NODE_ENV: "production" } };
  }

  return (
    <div className="layout-container">
      {/* Header - with explicit z-index to ensure it's above the layout */}
      <div className="header-container">
        <Header
          modelViewerRef={modelViewerRef}
          layoutModel={layoutModel}
          onExportGLB={handleExportGLB}
          onExportGLTF={handleExportGLTF}
          onExportUSDZ={handleExportUSDZ}
          onEnvironmentChange={handleEnvironmentChange}
          activeEnvironment={activeEnvironment}
        />
      </div>

      {/* Main Area with FlexLayout */}
      <div className="main-container">
        <FlexLayout
          modelStructure={modelStructure}
          selectedNode={selectedNode}
          modelViewerRef={modelViewerRef}
          onNodeSelect={handleNodeSelect}
          onModelLoaded={fetchModelStructure}
          onVariantChange={handleVariantChange}
          activeEnvironment={activeEnvironment}
          exposure={exposure}
          onExposureChange={handleExposureChange}
          toneMapping={toneMapping}
          onToneMappingChange={handleToneMappingChange}
        />
      </div>
    </div>
  );
}
