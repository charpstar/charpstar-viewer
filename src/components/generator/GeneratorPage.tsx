'use client'

import { useState, useEffect } from 'react'
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
  const [uploadedImages, setUploadedImages] = useState<UploadedImages>({
    front: null,
    back: null,
    left: null,
    right: null
  })
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationProgress, setGenerationProgress] = useState(0)
  const [generatedModel, setGeneratedModel] = useState<string | null>(null)
  const [isSingleImageMode, setIsSingleImageMode] = useState(false)

  // Clear images when switching modes
  useEffect(() => {
    setUploadedImages({
      front: null,
      back: null,
      left: null,
      right: null
    })
    setGeneratedModel(null)
  }, [isSingleImageMode])

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <Header />

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Controls */}
        <div className="w-80 bg-gray-50 shadow-md border-r border-gray-200 flex flex-col">
          {/* Page Title Section */}
          <div className="p-4 border-b border-gray-200">
            <h1 className="text-xl font-bold text-gray-900">3D Model Generator</h1>
          </div>
          
          {/* Configuration */}
          <div className="p-4 bg-white mx-3 mt-3 rounded-lg shadow-sm border border-gray-100">
            <GradioConfigSection
              gradioUrl={gradioUrl}
              setGradioUrl={setGradioUrl}
              isSingleImageMode={isSingleImageMode}
              setIsSingleImageMode={setIsSingleImageMode}
            />
          </div>

          {/* Upload Section */}
          <div className="flex-1 p-3 overflow-auto">
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 h-full">
            <ImageUploadSection
              uploadedImages={uploadedImages}
              setUploadedImages={setUploadedImages}
              gradioUrl={gradioUrl}
              isGenerating={isGenerating}
              setIsGenerating={setIsGenerating}
              setGenerationProgress={setGenerationProgress}
              setGeneratedModel={setGeneratedModel}
              isSingleImageMode={isSingleImageMode}
            />
            </div>
          </div>
        </div>

        {/* Right Panel - 3D Viewer */}
        <div className="flex-1 bg-gradient-to-br from-gray-50 to-white">
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