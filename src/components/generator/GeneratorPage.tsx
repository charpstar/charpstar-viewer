'use client'

import { useState } from 'react'
import Header from '@/components/layout/Header'
import { GradioConfigSection } from './GradioConfigSection'
import { ImageUploadSection } from './ImageUploadSection'
import { ModelViewerSection } from './ModelViewerSection'

export interface UploadedImage {
  file: File
  preview: string
}

export interface UploadedImages {
  front: UploadedImage | null
  back: UploadedImage | null
  left: UploadedImage | null
  right: UploadedImage | null
}

export function GeneratorPage() {
  const [gradioUrl, setGradioUrl] = useState('')
  const [connectionStatus, setConnectionStatus] = useState<{
    message: string
    type: 'success' | 'error' | 'info'
  } | null>(null)
  const [uploadedImages, setUploadedImages] = useState<UploadedImages>({
    front: null,
    back: null,
    left: null,
    right: null
  })
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationProgress, setGenerationProgress] = useState(0)
  const [generatedModel, setGeneratedModel] = useState<string | null>(null)

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <Header title="3D Generator" />

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Controls */}
        <div className="w-80 bg-white shadow-md border-r border-gray-200 flex flex-col">
          {/* Configuration */}
          <div className="p-4 border-b border-gray-200">
            <GradioConfigSection
              gradioUrl={gradioUrl}
              setGradioUrl={setGradioUrl}
              connectionStatus={connectionStatus}
              setConnectionStatus={setConnectionStatus}
            />
          </div>

          {/* Upload Section */}
          <div className="flex-1 p-4 overflow-auto">
            <ImageUploadSection
              uploadedImages={uploadedImages}
              setUploadedImages={setUploadedImages}
              gradioUrl={gradioUrl}
              connectionStatus={connectionStatus}
              isGenerating={isGenerating}
              setIsGenerating={setIsGenerating}
              setGenerationProgress={setGenerationProgress}
              setGeneratedModel={setGeneratedModel}
            />
          </div>
        </div>

        {/* Right Panel - 3D Viewer */}
        <div className="flex-1 bg-white">
          <ModelViewerSection
            generatedModel={generatedModel}
            isGenerating={isGenerating}
            generationProgress={generationProgress}
          />
        </div>
      </div>
    </div>
  )
} 