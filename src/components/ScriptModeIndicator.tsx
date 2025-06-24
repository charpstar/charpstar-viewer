import React, { useEffect, useState } from "react";

interface ScriptModeIndicatorProps {
  className?: string;
}

export const ScriptModeIndicator: React.FC<ScriptModeIndicatorProps> = ({
  className = "",
}) => {
  const [scriptMode, setScriptMode] = useState<string>("standard");
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    // Get current script mode from window global
    const currentMode = (window as any).__CHARPSTAR_SCRIPT_MODE__ || "standard";
    setScriptMode(currentMode);
  }, []);

  const getModeDisplayName = (mode: string) => {
    switch (mode) {
      case "standard":
      default:
        return "Standard (Model Viewer)";
    }
  };

  const getModeColor = (mode: string) => {
    switch (mode) {
      case "standard":
      default:
        return "bg-blue-100 text-blue-800 border-blue-200";
    }
  };

  return (
    <div className={`relative ${className}`}>
      <div
        className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border cursor-pointer ${getModeColor(
          scriptMode
        )}`}
        onClick={() => setShowHelp(!showHelp)}
        title="Click for URL switching help"
      >
        <div className="w-2 h-2 rounded-full bg-current mr-2 opacity-60"></div>
        {getModeDisplayName(scriptMode)}
        <svg className="w-3 h-3 ml-1" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z"
            clipRule="evenodd"
          />
        </svg>
      </div>

      {showHelp && (
        <div className="absolute top-full left-0 mt-2 w-80 bg-white border border-gray-200 rounded-lg shadow-lg p-4 z-50">
          <h3 className="font-semibold text-sm mb-2">Script Mode Switching</h3>
          <div className="text-xs text-gray-600 space-y-2">
            <p>Use these URLs to switch between different script modes:</p>
            <div className="bg-gray-50 p-2 rounded">
              <div className="font-mono text-xs">
                <div className="mb-1">
                  <strong>Standard Mode:</strong>
                  <br />
                  <code>{window.location.origin}</code>
                </div>
              </div>
            </div>
            <p className="text-xs">
              <strong>Why?</strong> Browser security prevents dynamic switching
              between different model-viewer implementations.
            </p>
          </div>
          <button
            className="mt-2 text-xs text-blue-600 hover:text-blue-800"
            onClick={() => setShowHelp(false)}
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
};
