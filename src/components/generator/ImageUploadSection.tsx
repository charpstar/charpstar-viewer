'use client'

import { useCallback } from 'react'
import { Upload, Star, X, Box, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { UploadedImages, UploadedImage } from './GeneratorPage'

interface ImageUploadSectionProps {
  uploadedImages: UploadedImages
  setUploadedImages: (images: UploadedImages) => void
  gradioUrl: string
  connectionStatus: {
    message: string
    type: 'success' | 'error' | 'info'
  } | null
  isGenerating: boolean
  setIsGenerating: (generating: boolean) => void
  setGenerationProgress: (progress: number) => void
  setGeneratedModel: (model: string | null) => void
}

type ViewType = 'front' | 'back' | 'left' | 'right'

interface ViewConfig {
  type: ViewType
  label: string
  required: boolean
  icon?: React.ReactNode
}

const viewConfigs: ViewConfig[] = [
  { 
    type: 'front', 
    label: 'Front (Required)', 
    required: true, 
    icon: <Star className="h-3 w-3 text-orange-500" />
  },
  { type: 'back', label: 'Back', required: false },
  { type: 'left', label: 'Left', required: false },
  { type: 'right', label: 'Right', required: false }
]

export function ImageUploadSection({
  uploadedImages,
  setUploadedImages,
  gradioUrl,
  connectionStatus,
  isGenerating,
  setIsGenerating,
  setGenerationProgress,
  setGeneratedModel
}: ImageUploadSectionProps) {

  // Function to get proper headers for ngrok bypassing
  function getNgrokHeaders() {
    return {
      'ngrok-skip-browser-warning': 'true',
      'User-Agent': 'CharpstAR-3D-Generator/1.0'
    }
  }

  const handleFileSelect = useCallback((file: File, viewType: ViewType) => {
    if (!file.type.startsWith('image/')) {
      alert('Please select a valid image file.')
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      const preview = e.target?.result as string
      const uploadedImage: UploadedImage = { file, preview }
      
      setUploadedImages({
        ...uploadedImages,
        [viewType]: uploadedImage
      })
    }
    reader.readAsDataURL(file)
  }, [uploadedImages, setUploadedImages])

  const handleFileRemove = useCallback((viewType: ViewType) => {
    setUploadedImages({
      ...uploadedImages,
      [viewType]: null
    })
  }, [uploadedImages, setUploadedImages])

  const handleDrop = useCallback((e: React.DragEvent, viewType: ViewType) => {
    e.preventDefault()
    const files = e.dataTransfer.files
    if (files.length > 0) {
      handleFileSelect(files[0], viewType)
    }
  }, [handleFileSelect])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  // Helper function to upload a file to Gradio and return FileData object
  async function uploadFileToGradio(file: File, serverUrl: string) {
    if (!file) return null

    const formData = new FormData()
    formData.append('files', file)

    try {
      const uploadResponse = await fetch(`${serverUrl}/upload`, {
        method: 'POST',
        body: formData,
        headers: {
          ...getNgrokHeaders()
        }
      })

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text()
        throw new Error(`Failed to upload file: ${uploadResponse.status} - ${errorText}`)
      }

      const uploadResult = await uploadResponse.json()
      
      if (!uploadResult || uploadResult.length === 0) {
        throw new Error('No file path returned from upload')
      }

      const filePath = uploadResult[0]
      
      // Return proper FileData object
      const fileData = {
        "path": filePath,
        "url": null,
        "orig_name": file.name,
        "size": file.size,
        "mime_type": file.type,
        "is_stream": false,
        "meta": {"_type": "gradio.FileData"}
      }
      
      return fileData
      
    } catch (error: any) {
      console.error('Upload error:', error)
      throw error
    }
  }

  async function generateModel(withTexture = false) {
    // Check if we have at least the front view (required)
    if (!uploadedImages.front) {
      alert('Please upload at least the front view image.')
      return
    }

    const serverUrl = gradioUrl.trim()
    if (!serverUrl) {
      alert('Please configure the server URL first')
      return
    }

    try {
      setIsGenerating(true)
      setGenerationProgress(0)

      // Count images to provide better feedback
      const imageCount = [uploadedImages.front, uploadedImages.back, uploadedImages.left, uploadedImages.right]
        .filter(Boolean).length
      
      console.log(`Starting generation with ${imageCount} view(s)`)

      // Upload all images and create FileData objects
      console.log('Uploading images to server...')
      const frontImageData = uploadedImages.front ? await uploadFileToGradio(uploadedImages.front.file, serverUrl) : null
      setGenerationProgress(25)
      
      const backImageData = uploadedImages.back ? await uploadFileToGradio(uploadedImages.back.file, serverUrl) : null
      setGenerationProgress(30)
      
      const leftImageData = uploadedImages.left ? await uploadFileToGradio(uploadedImages.left.file, serverUrl) : null
      setGenerationProgress(32)
      
      const rightImageData = uploadedImages.right ? await uploadFileToGradio(uploadedImages.right.file, serverUrl) : null
      setGenerationProgress(35)

      console.log('Starting 3D model generation...')
      setGenerationProgress(40)

      // Use the correct Gradio API format
      const apiName = withTexture ? 'generation_all' : 'shape_generation'
      const endpoint = `${serverUrl}/call/${apiName}`
      
      const requestBody = {
        data: [
          null, // caption
          null, // image (NOT USED in MV_MODE)
          frontImageData, // mv_image_front (mandatory)
          backImageData, // mv_image_back (optional)
          leftImageData, // mv_image_left (optional)
          rightImageData, // mv_image_right (optional)
          5, // steps
          5.0, // guidance_scale
          Math.floor(Math.random() * 10000), // seed
          256, // octree_resolution
          true, // check_box_rembg
          8000, // num_chunks
          true // randomize_seed
        ]
      }

      setGenerationProgress(45)

      // Submit the request and get event ID
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getNgrokHeaders()
        },
        body: JSON.stringify(requestBody)
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`API failed: ${response.status} - ${errorText}`)
      }

      const eventResult = await response.text()
      
      // Extract event ID from response
      let eventId
      try {
        const parsed = JSON.parse(eventResult)
        eventId = parsed.event_id
      } catch (e) {
        eventId = eventResult.match(/"event_id"\s*:\s*"([^"]+)"/)?.[1]
      }
      
      if (!eventId) {
        throw new Error('No event ID received from server')
      }

      setGenerationProgress(50)

      // Try SSE first, but implement polling fallback for ngrok
      const resultEndpoint = `${serverUrl}/call/${apiName}/${eventId}`
      
      let progressIncrement = 0
      let hasReceivedData = false
      let pollInterval: NodeJS.Timeout | null = null

      // Start polling immediately as primary method for ngrok
      const startPolling = () => {
        console.log('Starting polling for results...')
        pollInterval = setInterval(async () => {
          try {
            progressIncrement += 1
            setGenerationProgress(Math.min(50 + progressIncrement, 90))

            const pollResponse = await fetch(resultEndpoint, {
              method: 'GET',
              headers: getNgrokHeaders()
            })
            
            if (pollResponse.ok) {
              const pollText = await pollResponse.text()
              
              if (pollText && pollText !== 'null' && pollText !== 'undefined') {
                try {
                  // Handle SSE format response (event: complete\ndata: [...])
                  let jsonData = pollText.trim()
                  
                                     // Check if it's SSE format
                   if (pollText.includes('event: complete')) {
                     const dataMatch = pollText.match(/data: (\[.*\])/)
                     if (dataMatch) {
                       jsonData = dataMatch[1]
                     }
                   }
                  
                  const data = JSON.parse(jsonData)
                  if (Array.isArray(data) && data.length > 0) {
                    if (pollInterval) clearInterval(pollInterval)
                    processGenerationResult(data, withTexture, serverUrl)
                    return
                  }
                                 } catch (e) {
                   console.log('Polling response not yet ready:', (e as Error).message)
                   // Continue polling
                 }
              }
            }
          } catch (e) {
            console.log('Polling error:', e)
            // Continue polling unless it's a critical error
          }
        }, 2000) // Poll every 2 seconds as described

                 // Stop polling after 10 minutes
         setTimeout(() => {
           if (pollInterval) {
             clearInterval(pollInterval)
             console.log('Request timed out after 10 minutes')
             setIsGenerating(false)
           }
         }, 600000)
      }

      // Try SSE first with immediate fallback to polling
      try {
        const eventSource = new EventSource(resultEndpoint)
        
        // Set a quick timeout for SSE - if it doesn't work in 5 seconds, switch to polling
        const sseTimeout = setTimeout(() => {
          if (!hasReceivedData) {
            console.log('SSE timeout, switching to polling fallback')
            eventSource.close()
            startPolling()
          }
        }, 5000)

        eventSource.onmessage = function(event) {
          try {
            hasReceivedData = true
            clearTimeout(sseTimeout)
            
            progressIncrement += 2
            setGenerationProgress(Math.min(50 + progressIncrement, 90))

            if (event.data === 'null' || event.data === 'undefined') {
              return
            }

            const data = JSON.parse(event.data)
            if (Array.isArray(data) && data.length > 0) {
              eventSource.close()
              processGenerationResult(data, withTexture, serverUrl)
            }
          } catch (parseError) {
            console.error('Error parsing SSE data:', parseError)
          }
        }

        eventSource.onerror = function(error) {
          console.log('SSE failed, switching to polling fallback')
          clearTimeout(sseTimeout)
          eventSource.close()
          if (!hasReceivedData) {
            startPolling()
          }
        }

        eventSource.addEventListener('complete', function(event) {
          hasReceivedData = true
          clearTimeout(sseTimeout)
          eventSource.close()
          
          try {
            const data = JSON.parse(event.data)
            processGenerationResult(data, withTexture, serverUrl)
          } catch (parseError) {
            console.error('Error parsing complete event:', parseError)
            alert(`Failed to parse result: ${(parseError as Error).message}`)
            setIsGenerating(false)
          }
        })

      } catch (sseError) {
        console.log('SSE initialization failed, using polling fallback')
        startPolling()
      }

    } catch (error: any) {
      console.error('Generation failed:', error)
      
      // Provide more specific error messages based on error type
      let errorMessage = 'Generation failed'
      if (error.message.includes('upload')) {
        errorMessage = 'Failed to upload images to server. Please check your connection and try again.'
      } else if (error.message.includes('Failed to fetch')) {
        errorMessage = 'Cannot connect to the Gradio server. Please check the server URL and ensure it\'s running.'
      } else if (error.message.includes('event_id')) {
        errorMessage = 'Server failed to start processing. Please try again.'
      } else {
        errorMessage = `Generation failed: ${error.message}`
      }
      
      alert(errorMessage)
      setIsGenerating(false)
      setGenerationProgress(0)
    }
  }

  // Helper function to process generation results
  function processGenerationResult(data: any, withTexture: boolean, serverUrl: string) {
    try {
      setGenerationProgress(100)

      if (Array.isArray(data) && data.length > 0) {
        let fileInfo

        if (withTexture && data.length > 1) {
          fileInfo = data[1] // Second file for textured version
        } else {
          fileInfo = data[0] // First file for shape only
        }
        
        let actualFileInfo = fileInfo
        if (fileInfo && fileInfo.value) {
          actualFileInfo = fileInfo.value
        }
        
        let fileUrl = null
        
        if (actualFileInfo) {
          if (actualFileInfo.url) {
            fileUrl = actualFileInfo.url
            
            // Fix various incorrect URL formats
            if (fileUrl.includes('/call/shape/file=')) {
              fileUrl = fileUrl.replace('/call/shape/file=', '/file=')
            } else if (fileUrl.includes('/call/gen/file=')) {
              fileUrl = fileUrl.replace('/call/gen/file=', '/file=')
            } else if (fileUrl.includes('/call/generation_all/file=')) {
              fileUrl = fileUrl.replace('/call/generation_all/file=', '/file=')
            }
          } else if (actualFileInfo.path) {
            fileUrl = `${serverUrl}/file=${actualFileInfo.path}`
          }
          
          if (fileUrl) {
            downloadAndDisplayModel(fileUrl)
          } else {
            throw new Error('No valid file URL found in result')
          }
        } else {
          throw new Error('No file data in result')
        }
      } else {
        throw new Error('Invalid result data format')
      }

      setIsGenerating(false)
      
    } catch (parseError) {
      console.error('Error processing result:', parseError)
      alert(`Failed to process result: ${(parseError as Error).message}`)
      setIsGenerating(false)
    }
  }

  async function downloadAndDisplayModel(fileUrl: string) {
    try {
      const fileResponse = await fetch(fileUrl, {
        headers: getNgrokHeaders()
      })
      if (!fileResponse.ok) {
        throw new Error(`Failed to download model: ${fileResponse.status}`)
      }
      
      const arrayBuffer = await fileResponse.arrayBuffer()
      const blob = new Blob([arrayBuffer], { type: 'model/gltf-binary' })
      const modelUrl = URL.createObjectURL(blob)
      
      setGeneratedModel(modelUrl)
    } catch (error: any) {
      console.error('Failed to download/display model:', error)
      alert(`Failed to load model: ${error.message}`)
    }
  }

  const canGenerate = uploadedImages.front !== null

  return (
    <div className="space-y-6">
      {/* Upload Images */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <Upload className="h-4 w-4" />
          Upload Images
        </div>
        <p className="text-xs text-gray-500">
          Front view required, others optional for better quality
        </p>

        {/* Multi-view Upload Grid */}
        <div className="grid grid-cols-2 gap-3">
          {viewConfigs.map((config) => {
            const uploadedImage = uploadedImages[config.type]
            return (
              <div key={config.type} className="space-y-2">
                <div className="flex items-center gap-1 text-xs font-medium text-gray-600">
                  {config.icon}
                  {config.label}
                </div>
                
                {!uploadedImage ? (
                  <div
                    className="border-2 border-dashed border-gray-300 rounded-md p-4 text-center cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-colors min-h-[80px] flex flex-col items-center justify-center"
                    onDrop={(e) => handleDrop(e, config.type)}
                    onDragOver={handleDragOver}
                    onClick={() => {
                      const input = document.createElement('input')
                      input.type = 'file'
                      input.accept = 'image/*'
                      input.onchange = (e) => {
                        const file = (e.target as HTMLInputElement).files?.[0]
                        if (file) handleFileSelect(file, config.type)
                      }
                      input.click()
                    }}
                  >
                    <Upload className="h-4 w-4 text-gray-400 mb-1" />
                    <p className="text-xs text-gray-500">Click or drop</p>
                  </div>
                ) : (
                  <div className="relative">
                    <img
                      src={uploadedImage.preview}
                      alt={`${config.type} view`}
                      className="w-full h-[80px] object-cover rounded-md"
                    />
                    <Button
                      variant="destructive"
                      size="sm"
                      className="absolute top-1 right-1 h-5 w-5 p-0"
                      onClick={() => handleFileRemove(config.type)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Progress indicator */}
      {isGenerating && (
        <div className="text-center">
          <p className="text-xs text-gray-500">Generating model...</p>
        </div>
      )}

      {/* Generate Buttons */}
      <div className="space-y-2">
        <Button
          variant="outline"
          disabled={!canGenerate || isGenerating}
          onClick={() => generateModel(false)}
          className="w-full text-sm"
          size="sm"
        >
          <Box className="h-4 w-4 mr-2" />
          Shape Only
        </Button>
        <Button
          disabled={!canGenerate || isGenerating}
          onClick={() => generateModel(true)}
          className="w-full text-sm"
          size="sm"
        >
          <Sparkles className="h-4 w-4 mr-2" />
          With Texture
        </Button>
      </div>
    </div>
  )
} 