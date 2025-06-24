'use client'

import { Suspense, useRef, useState, useCallback } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, useGLTF, Center, Environment } from '@react-three/drei'
import { Loader2, Home, Play, Pause } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ModelProps {
  url: string
  autoRotate: boolean
}

function Model({ url, autoRotate }: ModelProps) {
  const modelRef = useRef<any>(null)
  const { scene } = useGLTF(url)
  
  // Auto-rotate the model
  useFrame((state, delta) => {
    if (modelRef.current && autoRotate) {
      modelRef.current.rotation.y += delta * 0.3
    }
  })

  return (
    <Center>
      <primitive 
        ref={modelRef}
        object={scene.clone()} 
        scale={3}
      />
    </Center>
  )
}

function LoadingFallback() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center gap-2">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
        <p className="text-sm text-muted-foreground">Loading model...</p>
      </div>
    </div>
  )
}

interface Simple3DViewerProps {
  modelUrl: string
  className?: string
}

export function Simple3DViewer({ modelUrl, className = '' }: Simple3DViewerProps) {
  const [error, setError] = useState<string | null>(null)
  const [autoRotate, setAutoRotate] = useState(true)
  const orbitControlsRef = useRef<any>(null)

  const handleError = useCallback((error: any) => {
    console.error('3D Model loading error:', error)
    setError('Failed to load 3D model')
  }, [])

  const resetCamera = useCallback(() => {
    if (orbitControlsRef.current) {
      orbitControlsRef.current.reset()
    }
  }, [])

  const toggleAutoRotate = useCallback(() => {
    setAutoRotate(prev => !prev)
    if (orbitControlsRef.current) {
      orbitControlsRef.current.autoRotate = !autoRotate
    }
  }, [autoRotate])

  if (error) {
    return (
      <div className={`flex items-center justify-center h-96 bg-gray-100 rounded-lg ${className}`}>
        <div className="text-center">
          <p className="text-red-500 font-medium">Error loading model</p>
          <p className="text-sm text-gray-500 mt-1">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`relative h-full bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg overflow-hidden ${className}`}>
      {/* 3D Canvas */}
      <Canvas
        camera={{ 
          position: [0, 1, 3], 
          fov: 60,
          near: 0.1,
          far: 1000
        }}
        gl={{ 
          antialias: true,
          alpha: true,
          preserveDrawingBuffer: true
        }}
        onError={handleError}
      >
        {/* Simple lighting */}
        <ambientLight intensity={0.5} />
        <directionalLight 
          position={[10, 10, 5]} 
          intensity={1} 
        />
        <pointLight position={[-10, 0, -20]} intensity={0.3} />
        
        {/* Environment for reflections */}
        <Environment preset="apartment" />
        
        {/* Model */}
        <Suspense fallback={null}>
          <Model url={modelUrl} autoRotate={autoRotate} />
        </Suspense>
        
        {/* Camera Controls */}
        <OrbitControls 
          ref={orbitControlsRef}
          enablePan={true}
          enableZoom={true}
          enableRotate={true}
          minDistance={1}
          maxDistance={8}
          autoRotate={autoRotate}
          autoRotateSpeed={0.5}
        />
      </Canvas>
      
      {/* Control Panel */}
      <div className="absolute top-4 right-4 flex flex-col gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={toggleAutoRotate}
          className="bg-white/90 backdrop-blur-sm"
          title={autoRotate ? 'Pause rotation' : 'Start rotation'}
        >
          {autoRotate ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        
        <Button
          variant="outline"
          size="sm"
          onClick={resetCamera}
          className="bg-white/90 backdrop-blur-sm"
          title="Reset camera"
        >
          <Home className="h-4 w-4" />
        </Button>
      </div>

      {/* Loading Fallback */}
      <Suspense fallback={<LoadingFallback />}>
        <div />
      </Suspense>

      {/* Instructions */}
      <div className="absolute bottom-4 left-4 bg-black/50 text-white text-xs px-3 py-2 rounded-lg backdrop-blur-sm">
        <p>Drag to rotate • Scroll to zoom • Right-click to pan</p>
      </div>
    </div>
  )
} 