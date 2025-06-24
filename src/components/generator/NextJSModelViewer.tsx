'use client'

import { Suspense, useRef, useState } from 'react'
import { Canvas, useFrame, useLoader } from '@react-three/fiber'
import { OrbitControls, useGLTF, Center, Environment } from '@react-three/drei'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import * as THREE from 'three'
import { Loader2 } from 'lucide-react'

interface ModelProps {
  url: string
}

function Model({ url }: ModelProps) {
  const modelRef = useRef<THREE.Group>(null)
  const { scene } = useGLTF(url)
  
  // Auto-rotate the model
  useFrame((state, delta) => {
    if (modelRef.current) {
      modelRef.current.rotation.y += delta * 0.5
    }
  })

  return (
    <Center>
      <primitive 
        ref={modelRef}
        object={scene.clone()} 
        scale={1}
      />
    </Center>
  )
}

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="flex flex-col items-center gap-2">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
        <p className="text-sm text-muted-foreground">Loading 3D model...</p>
      </div>
    </div>
  )
}

interface NextJSModelViewerProps {
  modelUrl: string
  className?: string
}

export function NextJSModelViewer({ modelUrl, className = '' }: NextJSModelViewerProps) {
  const [error, setError] = useState<string | null>(null)

  const handleError = (error: any) => {
    console.error('3D Model loading error:', error)
    setError('Failed to load 3D model')
  }

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
    <div className={`h-96 bg-gray-100 rounded-lg overflow-hidden ${className}`}>
      <Canvas
        camera={{ 
          position: [0, 0, 5], 
          fov: 45,
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
        {/* Lighting */}
        <ambientLight intensity={0.4} />
        <directionalLight 
          position={[10, 10, 5]} 
          intensity={1} 
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
        />
        <pointLight position={[-10, -10, -10]} intensity={0.5} />
        
        {/* Environment for reflections */}
        <Environment preset="apartment" />
        
        {/* Model */}
        <Suspense fallback={null}>
          <Model url={modelUrl} />
        </Suspense>
        
        {/* Controls */}
        <OrbitControls 
          enablePan={true}
          enableZoom={true}
          enableRotate={true}
          minDistance={1}
          maxDistance={10}
          autoRotate={false}
          autoRotateSpeed={0.5}
        />
      </Canvas>
      
      {/* Loading overlay */}
      <Suspense fallback={<LoadingFallback />}>
        <div />
      </Suspense>
    </div>
  )
}

// Preload the GLTFLoader to avoid loading delays
useGLTF.preload = (url: string) => {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader()
    loader.load(url, resolve, undefined, reject)
  })
} 