'use client'

import { useEffect, useRef, useState } from 'react'
import { Home, Play, Pause } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ModelViewerProps {
  modelUrl: string
  className?: string
}

export function ModelViewer({ modelUrl, className = '' }: ModelViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [bgColor, setBgColor] = useState('')

  useEffect(() => {
    // Dynamically load the model-viewer script once on component mount
    const script = document.createElement('script')
    script.src = 'https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js'
    script.type = 'module'
    document.head.appendChild(script)

    return () => {
      // Remove the script when component unmounts
      document.head.removeChild(script)
    }
  }, [])

  useEffect(() => {
    if (!modelUrl || !containerRef.current) return

    // Clear any existing model-viewer elements
    containerRef.current.innerHTML = ''

    // Create a new model-viewer element with auto settings for field-of-view
    const modelViewer = document.createElement('model-viewer')
    modelViewer.setAttribute('src', modelUrl)
    modelViewer.setAttribute('alt', 'Generated 3D model')
    modelViewer.setAttribute('auto-rotate', '')
    modelViewer.setAttribute('camera-controls', '')
    // Slow down the auto-rotate speed
    modelViewer.setAttribute('rotation-per-second', '15deg')
    // Remove any custom camera orbit or field-of-view settings to use defaults
    // Add specific visual settings
    modelViewer.setAttribute('environment-image', 'https://cdn.charpstar.net/Demos/HDR_Furniture.hdr')
    modelViewer.setAttribute('exposure', '1.2')
    modelViewer.setAttribute('tone-mapping', 'aces')
    modelViewer.setAttribute('shadow-intensity', '0.5')
    modelViewer.setAttribute('shadow-softness', '1')
    modelViewer.style.width = '100%'
    modelViewer.style.height = '100%'
    if (bgColor) {
      modelViewer.style.backgroundColor = bgColor
    }

    // Append the model-viewer to the container
    containerRef.current.appendChild(modelViewer)

    return () => {
      // Cleanup: remove the model-viewer element when component unmounts or modelUrl changes
      if (containerRef.current) {
        containerRef.current.innerHTML = ''
      }
    }
  }, [modelUrl, bgColor])

  const handleBgColorChange = (color: string) => {
    setBgColor(color)
  }

  if (!modelUrl) {
    return (
      <div className="w-full h-full flex items-center justify-center overflow-hidden">
        <p className="text-gray-500 text-center">Model will be displayed here</p>
      </div>
    )
  }

  return (
    <div className="relative w-full h-full overflow-hidden">
      <div 
        ref={containerRef} 
        className="w-full h-full overflow-hidden"
      />
      {/* Background Color Control Panel */}
      <div className="absolute top-4 right-4 flex flex-col gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleBgColorChange('')}
          className="bg-white/90 backdrop-blur-sm"
          title="Default Background"
        >
          Default BG
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleBgColorChange('#1a1a1a')}
          className="bg-white/90 backdrop-blur-sm"
          title="Dark Background"
        >
          Dark BG
        </Button>
      </div>
    </div>
  )
} 