'use client'

import { useEffect } from 'react'
import { Settings } from 'lucide-react'

interface GradioConfigSectionProps {
  gradioUrl: string
  setGradioUrl: (url: string) => void
  isSingleImageMode: boolean
  setIsSingleImageMode: (mode: boolean) => void
}

export function GradioConfigSection({
  gradioUrl,
  setGradioUrl,
  isSingleImageMode,
  setIsSingleImageMode
}: GradioConfigSectionProps) {

  // Set the default Gradio URL on mount
  useEffect(() => {
    if (!gradioUrl) {
      setGradioUrl('https://charpstar-multi.eu.ngrok.io')
    }
  }, [gradioUrl, setGradioUrl])

  // Update URL when mode changes
  useEffect(() => {
    const newUrl = isSingleImageMode 
      ? 'https://charpstar-single.eu.ngrok.io'
      : 'https://charpstar-multi.eu.ngrok.io'
    setGradioUrl(newUrl)
  }, [isSingleImageMode, setGradioUrl])

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
        <Settings className="h-4 w-4" />
        Server Configuration
      </div>
      
        {/* Mode Selection */}
        <div className="space-y-2">
          <span className="text-xs font-medium text-gray-600">Generation Mode</span>
          <div className="flex bg-gray-100 rounded-md p-1">
            <button
              onClick={() => setIsSingleImageMode(false)}
              className={`flex-1 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                !isSingleImageMode 
                  ? 'bg-white text-gray-900 shadow-sm' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Multi View
            </button>
            <button
              onClick={() => setIsSingleImageMode(true)}
              className={`flex-1 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                isSingleImageMode 
                  ? 'bg-white text-gray-900 shadow-sm' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Single Image
            </button>
          </div>
          <p className="text-xs text-gray-500">
            {isSingleImageMode 
              ? 'Generate 3D model from a single image' 
              : 'Generate 3D model from multiple view angles'
            }
          </p>
        </div>
    </div>
  )
} 