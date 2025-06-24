'use client'

import { useState, useEffect } from 'react'
import { Settings, CheckCircle, XCircle, Loader2, ToggleLeft, ToggleRight } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface GradioConfigSectionProps {
  gradioUrl: string
  setGradioUrl: (url: string) => void
  connectionStatus: {
    message: string
    type: 'success' | 'error' | 'info'
  } | null
  setConnectionStatus: (status: {
    message: string
    type: 'success' | 'error' | 'info'
  } | null) => void
  isSingleImageMode: boolean
  setIsSingleImageMode: (mode: boolean) => void
}

export function GradioConfigSection({
  gradioUrl,
  setGradioUrl,
  connectionStatus,
  setConnectionStatus,
  isSingleImageMode,
  setIsSingleImageMode
}: GradioConfigSectionProps) {
  const [isTesting, setIsTesting] = useState(false)

  // Function to get proper headers for ngrok bypassing
  function getNgrokHeaders() {
    return {
      'ngrok-skip-browser-warning': 'true',
      'User-Agent': 'CharpstAR-3D-Generator/1.0'
    }
  }

  async function testConnection() {
    const url = gradioUrl.trim()
    if (!url) {
      setConnectionStatus({
        message: 'Please enter a Gradio server URL',
        type: 'error'
      })
      return
    }

    setIsTesting(true)

    try {
      setConnectionStatus({
        message: 'Testing connection...',
        type: 'info'
      })
      
      const response = await fetch(`${url}/`, {
        method: 'GET',
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          ...getNgrokHeaders()
        }
      })

      if (response.ok) {
        setConnectionStatus({
          message: 'Connected successfully',
          type: 'success'
        })
        
        setTimeout(() => {
          setConnectionStatus(null)
        }, 3000)
      } else {
        throw new Error(`Server responded with status: ${response.status}`)
      }
    } catch (error: any) {
      console.error('Connection test failed:', error)
      setConnectionStatus({
        message: `Connection failed: ${error.message}`,
        type: 'error'
      })
    } finally {
      setIsTesting(false)
    }
  }

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

  const getStatusIcon = () => {
    if (isTesting) return <Loader2 className="h-4 w-4 animate-spin" />
    if (!connectionStatus) return null
    
    switch (connectionStatus.type) {
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />
      case 'info':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
      default:
        return null
    }
  }

  const getStatusStyles = () => {
    if (!connectionStatus) return ''
    
    switch (connectionStatus.type) {
      case 'success':
        return 'text-green-700 bg-green-50 border-green-200'
      case 'error':
        return 'text-red-700 bg-red-50 border-red-200'
      case 'info':
        return 'text-blue-700 bg-blue-50 border-blue-200'
      default:
        return ''
    }
  }

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
      
      <div className="space-y-2">
        <Input
          type="text"
          value={gradioUrl}
          onChange={(e) => setGradioUrl(e.target.value)}
          placeholder="Server URL (e.g., http://localhost:8080)"
          className="text-sm"
        />
        
        <Button 
          onClick={testConnection}
          disabled={isTesting}
          variant="outline"
          size="sm"
          className="w-full"
        >
          {isTesting ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            'Test Connection'
          )}
        </Button>
        
        {connectionStatus && (
          <div className={`p-2 rounded-md border flex items-center gap-2 text-xs ${getStatusStyles()}`}>
            {getStatusIcon()}
            {connectionStatus.message}
          </div>
        )}
      </div>
    </div>
  )
} 