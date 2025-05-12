// src/components/demo/CameraControlsPanel.tsx
import React, { useState, useRef, useEffect } from 'react';
import { 
  Compass, // Default view 
  Square, // Front view
  BookOpen, // Back view 
  PanelRight, // Side view
  ArrowDown, // Top view (arrow pointing down = viewing from top)
  Table // Table view
} from 'lucide-react';

interface CameraControlsPanelProps {
  modelViewerRef: React.RefObject<any>;
}

const CameraControlsPanel: React.FC<CameraControlsPanelProps> = ({ modelViewerRef }) => {
  // State to track the generated poster image URL
  const [posterImage, setPosterImage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentView, setCurrentView] = useState('');
  const controlsPanelRef = useRef<HTMLDivElement>(null);

  // Camera angle presets with verified Lucide icons
  const cameraPresets = [
    { name: 'Default', orbit: '-25deg 80deg 80%', icon: <Compass size={16} /> },
    { name: 'Front', orbit: '0deg 88deg 80%', icon: <Square size={16} /> },
    { name: 'Back', orbit: '180deg 90deg 80%', icon: <BookOpen size={16} /> },
    { name: 'Side', orbit: '90deg 91deg 80%', icon: <PanelRight size={16} /> },
    { name: 'Top', orbit: '0deg -200deg 80%', icon: <ArrowDown size={16} /> },
    { name: 'Table', orbit: '-35deg 71deg 80%', icon: <Table size={16} /> }
  ];


  // Function to toggle grid visibility
  const toggleGridVisibility = (visible: boolean) => {
    if (!modelViewerRef.current) return;
    
    try {
      // Check if gridHelper exists
      if (modelViewerRef.current.gridHelper) {
        // Set visibility
        modelViewerRef.current.gridHelper.visible = visible;
        
        // Force a render update
        if (typeof modelViewerRef.current.requestRender === 'function') {
          modelViewerRef.current.requestRender();
        }
      }
    } catch (error) {
      console.error('Error toggling grid visibility:', error);
    }
  };

  // Function to change camera view and generate poster
  const setCameraView = async (orbit: string, name: string) => {
    if (!modelViewerRef.current) return;
    
    try {
      setIsGenerating(true);
      setCurrentView(name);
      
      // Hide the grid before generating the poster
      toggleGridVisibility(false);
      
      // Call the createSweefPoster function with the orbit value
      if (typeof modelViewerRef.current.createSweefPosterX === 'function') {
        const imageUrl = await modelViewerRef.current.createSweefPosterX(orbit);
        console.log('Generated poster image:', imageUrl.substring(0, 50) + '...');
        setPosterImage(imageUrl);
      } else if (typeof modelViewerRef.current.createSweefPoster === 'function') {
        // Try the regular function if X version doesn't exist
        await modelViewerRef.current.createSweefPoster(orbit);
        console.log('Changed camera view but poster generation not available');
      } else {
        // Fallback to directly setting cameraOrbit if function doesn't exist
        modelViewerRef.current.cameraOrbit = orbit;
        console.log('Set camera orbit directly to:', orbit);
      }
    } catch (error) {
      console.error('Error changing camera view:', error);
    } finally {
      // Re-show the grid after generating the poster
      toggleGridVisibility(true);
      setIsGenerating(false);
    }
  };

  // Close the poster preview
  const closePoster = () => {
    setPosterImage(null);
  };

  // Download the poster image
  const downloadPoster = () => {
    if (!posterImage) return;
    
    // Create a temporary link element
    const link = document.createElement('a');
    link.href = posterImage;
    link.download = `${currentView.toLowerCase()}-view.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div ref={controlsPanelRef} className="absolute bottom-4 left-4 z-10">
      {/* Poster Preview Panel */}
      {posterImage && (
        <div className="mb-2 bg-white rounded-md shadow-lg border border-gray-200 overflow-hidden" 
          style={{ width: '300px', maxWidth: '100%' }}>
          <div className="flex justify-between items-center px-3 py-1.5 bg-gray-100 border-b border-gray-200">
            <h3 className="text-xs font-medium text-gray-800">
              {currentView} View Poster
            </h3>
            <div className="flex space-x-2">
              <button 
                onClick={downloadPoster} 
                className="text-gray-600 hover:text-gray-900"
                title="Download poster"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
              </button>
              <button 
                onClick={closePoster} 
                className="text-gray-600 hover:text-gray-900"
                title="Close preview"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          </div>
          <div className="p-2">
            <img 
              src={posterImage} 
              alt={`${currentView} view`} 
              className="w-full h-auto rounded" 
            />
          </div>
        </div>
      )}

      {/* Camera Controls Panel */}
      <div className="bg-white/95 rounded-md shadow-md border border-gray-200 overflow-hidden">
        <div className="flex justify-between items-center px-3 py-1.5 bg-gray-100 border-b border-gray-200">
          <h3 className="text-xs font-medium text-gray-800">
            Camera Views
          </h3>
        </div>
        
        <div className="p-2 grid grid-cols-6 gap-1">
          {cameraPresets.map((preset) => (
            <button
              key={preset.name}
              onClick={() => setCameraView(preset.orbit, preset.name)}
              className={`flex flex-col items-center justify-center p-2 rounded hover:bg-gray-100 transition-colors
                ${isGenerating && currentView === preset.name ? 'bg-blue-50 text-blue-600' : ''}
              `}
              title={preset.name}
              disabled={isGenerating}
            >
              <div className="text-gray-700">
                {preset.icon}
              </div>
              <span className="text-xs mt-1 text-gray-600">
                {preset.name}
                {isGenerating && currentView === preset.name && '...'}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};


export default CameraControlsPanel;