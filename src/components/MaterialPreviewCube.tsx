'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface Material {
  name: string;
  baseColor: [number, number, number, number];
  metallicFactor: number;
  roughnessFactor: number;
  emissiveFactor: [number, number, number];
  normalScale: number;
  occlusionStrength: number;
  baseColorTexture?: string;
  metallicRoughnessTexture?: string;
  normalTexture?: string;
  occlusionTexture?: string;
  emissiveTexture?: string;
}

interface MaterialPreviewCubeProps {
  material: Material | null;
  clientName: string;
  onLoaded?: () => void;
  onError?: () => void;
}

const MaterialPreviewCube: React.FC<MaterialPreviewCubeProps> = ({
  material,
  clientName,
  onLoaded,
  onError
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    cube: THREE.Mesh;
    material: THREE.MeshStandardMaterial;
    render: () => void;
    textureLoader: THREE.TextureLoader;
  } | null>(null);

  const textureCache = useRef<Map<string, THREE.Texture>>(new Map());

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8f9fa);

    // Camera setup
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.set(3, 3, 3);
    camera.lookAt(0, 0, 0);

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;

    // Lighting setup - neutral environment for material preview
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 5, 5);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    scene.add(directionalLight);

    // Add a subtle fill light
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
    fillLight.position.set(-5, 3, -5);
    scene.add(fillLight);

    // Create cube geometry with proper normals and UVs
    const geometry = new THREE.BoxGeometry(2, 2, 2);
    
    // Create material (will be updated when material prop changes)
    const threeMaterial = new THREE.MeshStandardMaterial({
      color: 0x808080,
      metalness: 0,
      roughness: 0.5,
    });

    // Create texture loader
    const textureLoader = new THREE.TextureLoader();

    // Create cube mesh
    const cube = new THREE.Mesh(geometry, threeMaterial);
    cube.castShadow = true;
    cube.receiveShadow = true;
    scene.add(cube);

    // No plane - just the cube

    container.appendChild(renderer.domElement);

    // Store scene references
    sceneRef.current = {
      scene,
      camera,
      renderer,
      cube,
      material: threeMaterial,
      textureLoader,
      render: () => {} // Will be set below
    };

    // Static render - no animation
    const render = () => {
      if (!sceneRef.current) return;
      sceneRef.current.renderer.render(sceneRef.current.scene, sceneRef.current.camera);
    };

    // Position the cube at a nice angle and render once
    cube.rotation.x = 0.3;
    cube.rotation.y = 0.4;
    render();

    // Handle window resize
    const handleResize = () => {
      if (!sceneRef.current || !containerRef.current) return;
      
      const newWidth = containerRef.current.clientWidth;
      const newHeight = containerRef.current.clientHeight;
      
      sceneRef.current.camera.aspect = newWidth / newHeight;
      sceneRef.current.camera.updateProjectionMatrix();
      sceneRef.current.renderer.setSize(newWidth, newHeight);
      sceneRef.current.render();
    };

    window.addEventListener('resize', handleResize);

    // Initial load callback
    setTimeout(() => {
      onLoaded?.();
    }, 100);

    // Store render function for material updates
    sceneRef.current.render = render;

    // Cleanup function
    return () => {
      window.removeEventListener('resize', handleResize);
      
      if (sceneRef.current) {
        sceneRef.current.renderer.dispose();
        sceneRef.current.scene.clear();
        
        if (container.contains(sceneRef.current.renderer.domElement)) {
          container.removeChild(sceneRef.current.renderer.domElement);
        }
      }
      
      sceneRef.current = null;
    };
  }, [onLoaded]);

  // Helper function to load texture
  const loadTexture = async (textureUrl: string): Promise<THREE.Texture | null> => {
    if (!textureUrl || !sceneRef.current) return null;

    // Check cache first
    if (textureCache.current.has(textureUrl)) {
      return textureCache.current.get(textureUrl)!;
    }

    try {
      // Construct full URL for BunnyCDN images
      let fullUrl: string;
      if (textureUrl.startsWith('http')) {
        fullUrl = textureUrl;
      } else {
        // Try different possible paths for textures
        const possiblePaths = [
          `https://cdn.charpstar.net/Client-Editor/${clientName}/images/${textureUrl}`,
          `https://cdn.charpstar.net/Client-Editor/${clientName}/${textureUrl}`,
          `https://cdn.charpstar.net/${textureUrl}`
        ];
        fullUrl = possiblePaths[0]; // Start with the most likely path
      }

      console.log('Loading texture:', fullUrl);

      const texture = await new Promise<THREE.Texture>((resolve, reject) => {
        sceneRef.current!.textureLoader.load(
          fullUrl,
          (loadedTexture) => {
            loadedTexture.wrapS = THREE.RepeatWrapping;
            loadedTexture.wrapT = THREE.RepeatWrapping;
            loadedTexture.flipY = false; // GLTF standard
            resolve(loadedTexture);
          },
          undefined,
          (error) => {
            console.warn('Failed to load texture:', fullUrl, error);
            reject(error);
          }
        );
      });

      // Cache the texture
      textureCache.current.set(textureUrl, texture);
      return texture;
    } catch (error) {
      console.warn('Texture loading failed:', textureUrl, error);
      return null;
    }
  };

  // Update material when material prop changes
  useEffect(() => {
    if (!material || !sceneRef.current) return;

    const updateMaterialAsync = async () => {
      const threeMaterial = sceneRef.current!.material;

      try {
        // Update base color
        threeMaterial.color.setRGB(
          material.baseColor[0],
          material.baseColor[1],
          material.baseColor[2]
        );

        // Update metalness and roughness
        threeMaterial.metalness = material.metallicFactor;
        threeMaterial.roughness = material.roughnessFactor;

        // Update emissive
        threeMaterial.emissive.setRGB(
          material.emissiveFactor[0],
          material.emissiveFactor[1],
          material.emissiveFactor[2]
        );

        // Update opacity
        threeMaterial.opacity = material.baseColor[3];
        threeMaterial.transparent = material.baseColor[3] < 1;

        // Load and apply textures (minimal logs for performance)

        // Base color texture (diffuse/albedo)
        if (material.baseColorTexture) {
          const baseColorTex = await loadTexture(material.baseColorTexture);
          if (baseColorTex) {
            threeMaterial.map = baseColorTex;
          }
        } else {
          threeMaterial.map = null;
        }

        // Metallic/Roughness texture (combined)
        if (material.metallicRoughnessTexture) {
          const metallicRoughnessTex = await loadTexture(material.metallicRoughnessTexture);
          if (metallicRoughnessTex) {
            threeMaterial.metalnessMap = metallicRoughnessTex;
            threeMaterial.roughnessMap = metallicRoughnessTex;
            // applied
          }
        } else {
          threeMaterial.metalnessMap = null;
          threeMaterial.roughnessMap = null;
        }

        // Normal texture (surface details)
        if (material.normalTexture) {
          const normalTex = await loadTexture(material.normalTexture);
          if (normalTex) {
            threeMaterial.normalMap = normalTex;
            threeMaterial.normalScale.set(material.normalScale, material.normalScale);
            // applied
          }
        } else {
          threeMaterial.normalMap = null;
        }

        // Ambient occlusion texture
        if (material.occlusionTexture) {
          const aoTex = await loadTexture(material.occlusionTexture);
          if (aoTex) {
            threeMaterial.aoMap = aoTex;
            threeMaterial.aoMapIntensity = material.occlusionStrength;
            // applied
          }
        } else {
          threeMaterial.aoMap = null;
        }

        // Emissive texture
        if (material.emissiveTexture) {
          const emissiveTex = await loadTexture(material.emissiveTexture);
          if (emissiveTex) {
            threeMaterial.emissiveMap = emissiveTex;
            // applied
          }
        } else {
          threeMaterial.emissiveMap = null;
        }

        // Mark material as needing update
        threeMaterial.needsUpdate = true;

        // Re-render the scene with updated material
        sceneRef.current!.render();

        // minimal diagnostics only
      } catch (error) {
        console.error('Error updating Three.js material:', error);
        onError?.();
      }
    };

    updateMaterialAsync();
  }, [material, onError]);

  return (
    <div 
      ref={containerRef} 
      className="w-full h-full rounded-lg overflow-hidden"
      style={{ minHeight: '400px' }}
    />
  );
};

export default MaterialPreviewCube;