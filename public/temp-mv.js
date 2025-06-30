	setPlaneGrid(size1 = .2, size2 = .2, distance = 15) {
			// Remove any existing grid
			if (this.gridHelper) {
			  if (this.gridHelper.parent) {
				this.gridHelper.parent.remove(this.gridHelper);
			  }
			  this.gridHelper.dispose();
			  this.gridHelper = null;
			}
			
			// Create a new grid with the specified parameters
			const gridHelper = new InfiniteGridHelper(size1, size2, new Color('grey'), distance);
		  //this[$scene].shadow.remove(this[$scene].shadow.floor);
			// Add to scene model
			this[$scene].model.parent.add(gridHelper);
		  
			
			// Store reference
			this.gridHelper = gridHelper;
			
			// Set up render loop
			if (!this._gridRenderInterval) {
			  this._gridRenderInterval = setInterval(() => {
				if (this.gridHelper && typeof this.requestRender === 'function') {
				  this.requestRender();
				} else if (!this.gridHelper) {
				  clearInterval(this._gridRenderInterval);
				  this._gridRenderInterval = null;
				}
			  }, 100);
			}
			
		  
			// Return the grid helper for inspection
			return gridHelper;
		  }
		  applyTexture(objectUuid, textureType, textureUrl) {
			const object = this.getObjectByUuid(objectUuid);
			if (!object || !object.material) {
			  console.error('Object or material not found for UUID:', objectUuid);
			  return false;
			}
			
			// Create a texture loader
			const textureLoader = new TextureLoader();
			
			return new Promise((resolve) => {
			  textureLoader.load(
				textureUrl,
				(texture) => {
				  // Apply texture based on type
				  if (textureType === 'map') {
					// For base color map, set the color space correctly
					texture.colorSpace = SRGBColorSpace;
				  } else if (textureType === 'normalMap') {
					// Normal maps need to be in linear space
					texture.colorSpace = NoColorSpace;
				  }
				  
				  // Keep texture name in sync with material if possible
				  texture.name = `${object.material.name}_${textureType}`;
				  
				  // Apply the texture to the material
				  object.material[textureType] = texture;
				  object.material.needsUpdate = true;
				  
				  // Request a render update
				  this.requestRender();
				  
				  resolve(true);
				},
				undefined, // onProgress callback
				(error) => {
				  console.error('Error loading texture:', error);
				  resolve(false);
				}
			  );
			});
		  }
		  
		  async handleTextureUpload(file, textureType, materialName) {
			try {
			  const modelViewer = this;
			  
			  // Find the material by name in the scene
			  const scene = modelViewer.getScene()?._model;
			  if (!scene) {
				console.error('Could not get scene to update texture');
				return false;
			  }
			  
			  let materialObject = null;
			  scene.traverse((object) => {
				if (object.material && object.material.name === materialName) {
				  materialObject = object.material;
				}
			  });
			  
			  if (!materialObject) {
				console.error(`Could not find material "${materialName}" in scene`);
				return false;
			  }
			  
			  // Get the current texture
			  const currentTexture = materialObject[textureType];
			  let textureName = "";
			  
			  // Try to get texture name
			  if (currentTexture) {
				if (currentTexture.name) {
				  textureName = currentTexture.name;
				}
				else if (currentTexture.userData && currentTexture.userData.name) {
				  textureName = currentTexture.userData.name;
				}
			  }
			  
			  // If we couldn't find a texture name, use the material name as fallback
			  if (!textureName) {
				textureName = `tex_${materialName}_${textureType}`;
			  }
			  
			  // Convert from texture name to image name by replacing "tex_" with "img_"
			  let imageFilename = textureName;
			  if (imageFilename.startsWith('tex_')) {
				imageFilename = 'img_' + imageFilename.substring(4);
			  } else {
				// If it doesn't follow the naming convention, prepend "img_" to make it clear it's an image
				imageFilename = 'img_' + imageFilename;
			  }
			  
			  // Ensure the filename has an extension
			  if (!imageFilename.match(/\.(jpg|jpeg|png|webp)$/i)) {
				imageFilename += '.jpg';
			  }
			  
			  console.log(`Converting texture name "${textureName}" to image filename "${imageFilename}"`);
			  
			  // Determine the base URL and images directory for the model
			  const modelUrl = modelViewer.src;
			  if (!modelUrl) {
				console.error('Model URL not available');
				return false;
			  }
			  
			  const urlParts = modelUrl.split('/');
			  urlParts.pop(); // Remove filename
			  const baseUrl = urlParts.join('/') + '/';
			  const imagesUrl = baseUrl + 'images/'; // Path to images subdirectory
			  
			  // Create a FormData object to send the file
			  const formData = new FormData();
			  formData.append('file', file);
			  formData.append('filename', imageFilename);
			  formData.append('targetDirectory', 'images'); // Specify target directory
			  formData.append('skipJsonUpdate', 'true'); // Tell the API not to update JSON files
			  
			  // Upload the image file
			  console.log(`Uploading texture image as: images/${imageFilename}`);
			  const uploadResponse = await fetch('/api/upload-image', {
				method: 'POST',
				body: formData
			  });
			  
			  if (!uploadResponse.ok) {
				const errorData = await uploadResponse.json();
				throw new Error(`Failed to upload texture image: ${errorData.error || uploadResponse.statusText}`);
			  }
			  
			  const uploadResult = await uploadResponse.json();
			  console.log('Texture image uploaded successfully:', uploadResult);
			  
			  // Store properties of the current texture we'll want to preserve
			  const properties = {};
			  if (currentTexture) {
				properties.wrapS = currentTexture.wrapS;
				properties.wrapT = currentTexture.wrapT;
				properties.repeat = currentTexture.repeat ? currentTexture.repeat.clone() : null;
				properties.offset = currentTexture.offset ? currentTexture.offset.clone() : null;
				properties.rotation = currentTexture.rotation || 0;
				properties.normalScale = materialObject.normalScale ? materialObject.normalScale.clone() : null;
			  }
			  
			  // Dispose the current texture if it exists to force a reload
			  if (currentTexture) {
				currentTexture.dispose();
				materialObject[textureType] = null;
			  }
			  
			  // Force a render update
			  if (typeof modelViewer.requestRender === 'function') {
				modelViewer.requestRender();
			  }
			  
			  // Use a timestamp URL for the initial load to bypass cache
			  const textureURL = `${imagesUrl}${imageFilename}?t=${Date.now()}`;
			  const persistentURL = `${imagesUrl}${imageFilename}`;  // Clean URL for future reference
			  
			  console.log(`Loading new texture from: ${textureURL}`);
			  
			  // Load the new texture
			  const textureLoader = new TextureLoader();
			  
			  return new Promise((resolve) => {
				textureLoader.load(
				  textureURL,  // Use timestamped URL for immediate display
				  (texture) => {
					// Set the name to match the original texture
					texture.name = textureName;
					
					// Store the clean URL for future reference
					texture.userData = texture.userData || {};
					texture.userData.url = persistentURL;
					
					// Apply the texture to the material
					materialObject[textureType] = texture;
					
					// Restore texture properties if we had a previous texture
					if (Object.keys(properties).length > 0) {
					  texture.wrapS = properties.wrapS;
					  texture.wrapT = properties.wrapT;
					  if (properties.repeat) texture.repeat.copy(properties.repeat);
					  if (properties.offset) texture.offset.copy(properties.offset);
					  texture.rotation = properties.rotation || 0;
					  
					  // For normal maps, restore the intensity
					  if (textureType === 'normalMap' && properties.normalScale) {
						materialObject.normalScale.copy(properties.normalScale);
					  }
					}
					
					// Special handling for different texture types
					if (textureType === 'map') {
					  texture.colorSpace = SRGBColorSpace;
					} else if (textureType === 'normalMap') {
					  texture.colorSpace = NoColorSpace;
					}
					
					// Make sure material updates
					materialObject.needsUpdate = true;
					
					// Force renderer update immediately
					if (typeof modelViewer.requestRender === 'function') {
					  modelViewer.requestRender();
					}
					
					console.log(`Texture ${textureType} updated for material "${materialName}"`);
					resolve(true);
				  },
				  undefined, // onProgress callback not needed
				  (error) => {
					console.error('Error loading texture:', error);
					resolve(false);
				  }
				);
			  });
			} catch (error) {
			  console.error('Error handling texture upload:', error);
			  return false;
			}
		  }
		  setMaterialColor(uuid, colorHex) {
					const object = this.getObjectByUuid(uuid);
					
					if (!object || !object.material) {
					  console.error("Cannot find object or object has no material");
					  return;
					}
					
					try {
					  const threeColor = new Color(colorHex);
					  
					  // Assign it to the material
					  object.material.color = threeColor;
					  
					  // Mark the material as needing update
					  object.material.needsUpdate = true;
					  
					  // Request a render update
					  if (this.requestRender) {
						this.requestRender();
					  }
					  
					  console.log(`Set material color to ${colorHex}`);
					} catch (error) {
					  console.error('Error setting material color:', error);
					}
				  }
		  async downloadMaterialsJson() {
			const modelViewer = this;
			try {
			  // Store current variant to restore later
			  const currentVariantName = modelViewer.variantName;
			  console.log('Current variant:', currentVariantName);
			  
			  // Get all available variants
			  const availableVariants = modelViewer.availableVariants || [];
		  
			  
			  // Check if we have stored the original materials
			  if (!modelViewer._originalMaterialsStructure || 
				  !Array.isArray(modelViewer._originalMaterialsStructure) || 
				  modelViewer._originalMaterialsStructure.length === 0) {
		  
				
				// Prioritize external materials.json file
				const src = modelViewer.src;
				if (src) {
				  try {
					const urlParts = src.split('/');
					urlParts.pop(); // Remove filename
					const baseUrl = urlParts.join('/') + '/';
					const materialsUrl = baseUrl + 'resources/materials.json';
		  
					
					const response = await fetch(materialsUrl);
					if (response.ok) {
					  const materialsData = await response.json();
					  if (Array.isArray(materialsData)) {
						modelViewer._originalMaterialsStructure = JSON.parse(JSON.stringify(materialsData));
		  
					  }
					}
				  } catch (err) {
					console.warn('Failed to load materials from external file:', err);
				  }
				}
				
				// If all approaches failed, return an error
				if (!modelViewer._originalMaterialsStructure || 
					!Array.isArray(modelViewer._originalMaterialsStructure) || 
					modelViewer._originalMaterialsStructure.length === 0) {
		  
				  return null;
				}
			  }
			  
			  // Create a deep copy of the original structure to modify
			  const materialsCopy = JSON.parse(JSON.stringify(modelViewer._originalMaterialsStructure));
		  
			  // Process each variant to update only what has changed
			  for (const variantName of availableVariants) {
		  
				// Switch to this variant
				modelViewer.variantName = variantName;
				
				// Wait for the variant to be applied
				await new Promise(resolve => setTimeout(resolve, 10));
				
				// Get the scene
				const scene = modelViewer.getScene()?._model;
				if (!scene) {
			   //   console.warn(`Could not get scene for variant ${variantName}`);
				  continue;
				}
				
				// Find all materials that are applied for this variant
				const variantMaterials = [];
				let materialCount = 0;
		  
				scene.traverse((object) => {
				  if (object.material) {
					materialCount++;
					
					// Store the material with its mesh for reference
					variantMaterials.push({
					  meshName: object.name,
					  material: object.material,
					  materialName: object.material.name
					});
					
			 //       console.log(`Found material "${object.material.name}" on mesh "${object.name}" for variant "${variantName}"`);
				  }
				});
		  
			//    console.log(`Found ${materialCount} total materials for variant ${variantName}`);
				
				if (variantMaterials.length === 0) {
			  //    console.warn(`No materials found for variant ${variantName}`);
				  continue;
				}
				
				// Now process each material we found in the scene
				for (const { meshName, material, materialName } of variantMaterials) {
				  // Find the corresponding material in our copy
				  const materialToUpdate = materialsCopy.find(m => m.name === materialName);
				  
				  if (!materialToUpdate) {
			 //       console.warn(`Material "${materialName}" for mesh "${meshName}" not found in original structure`);
					continue;
				  }
				  
				//  console.log(`Updating material "${materialName}" for mesh "${meshName}" in variant "${variantName}"`);
				  
				  // Initialize pbrMetallicRoughness if it doesn't exist
				  if (!materialToUpdate.pbrMetallicRoughness) {
					materialToUpdate.pbrMetallicRoughness = {};
				  }
				  
				  // Ensure extensions object exists if needed
				  if (!materialToUpdate.extensions && 
					  (material.sheen > 0 || 
					   material.sheenColor || 
					   material.sheenRoughness !== undefined || 
					   material.sheenColorMap)) {
					materialToUpdate.extensions = {};
				  }
				  
				  // Ensure KHR_materials_sheen exists if needed
				  if (materialToUpdate.extensions && 
					  !materialToUpdate.extensions.KHR_materials_sheen && 
					  (material.sheen > 0 || 
					   material.sheenColor || 
					   material.sheenRoughness !== undefined || 
					   material.sheenColorMap)) {
					materialToUpdate.extensions.KHR_materials_sheen = {};
				  }
				  
				  // Update base properties
				  
				  // Update roughness if defined in the material
				  if (material.roughness !== undefined) {
					materialToUpdate.pbrMetallicRoughness.roughnessFactor = Number(material.roughness.toFixed(9));
			   //     console.log(`Updated roughness for "${materialName}" to ${materialToUpdate.pbrMetallicRoughness.roughnessFactor}`);
				  }
		  
				  // Update metalness if defined in the material
				  if (material.metalness !== undefined) {
					materialToUpdate.pbrMetallicRoughness.metallicFactor = Number(material.metalness.toFixed(9));
			   //     console.log(`Updated metalness for "${materialName}" to ${materialToUpdate.pbrMetallicRoughness.metallicFactor}`);
				  }
				  
				  // Update color - Always add baseColorFactor if color is not default white
				  if (material.color) {
					// Always update the color factor, whether it's white or not
					materialToUpdate.pbrMetallicRoughness.baseColorFactor = [
					  material.color.r,
					  material.color.g,
					  material.color.b,
					  material.opacity !== undefined ? material.opacity : 1.0
					];
				 //   console.log(`Updated baseColorFactor for "${materialName}" to:`, materialToUpdate.pbrMetallicRoughness.baseColorFactor);
				  }
				  
				  // Update double sided if defined
				  if (material.side !== undefined) {
					// Three.js uses side 0 for front, 1 for back, 2 for double
					// GLTF uses doubleSided: true/false
					materialToUpdate.doubleSided = material.side === 2;
				  }
				  
				  // Update occlusionTexture strength if AO map exists
				  if (material.aoMap && material.aoMapIntensity !== undefined) {
					if (materialToUpdate.occlusionTexture) {
					  materialToUpdate.occlusionTexture.strength = material.aoMapIntensity;
				  //    console.log(`Updated AO map strength for "${materialName}" to ${material.aoMapIntensity}`);
					}
				  }
				  
				  // Update normal map intensity with more precise logging
				  if (material.normalMap && material.normalScale) {
					if (materialToUpdate.normalTexture) {
					  const oldScale = materialToUpdate.normalTexture.scale;
					  materialToUpdate.normalTexture.scale = material.normalScale.x;
				  //    console.log(`Updated normal map scale for "${materialName}" from ${oldScale} to ${materialToUpdate.normalTexture.scale}`);
					} else {
				 //     console.warn(`Material has normalMap but no normalTexture in original structure for "${materialName}"`);
					}
				  }
				  
				  // Update normal map transforms if they exist
				  if (material.normalMap && 
					  materialToUpdate.normalTexture && 
					  materialToUpdate.normalTexture.extensions && 
					  materialToUpdate.normalTexture.extensions.KHR_texture_transform) {
						
					const transform = materialToUpdate.normalTexture.extensions.KHR_texture_transform;
					
					// Initialize offset array if it doesn't exist
					if (!transform.offset && material.normalMap.offset) {
					  transform.offset = [0, 0];
					}
					
					// Now update the offset if it exists
					if (transform.offset && material.normalMap.offset) {
					  transform.offset[0] = material.normalMap.offset.x;
					  transform.offset[1] = material.normalMap.offset.y;
					}
					
					// Initialize scale array if it doesn't exist
					if (!transform.scale && material.normalMap.repeat) {
					  transform.scale = [1, 1];
					}
					
					// Update the scale if it exists
					if (transform.scale && material.normalMap.repeat) {
					  transform.scale[0] = material.normalMap.repeat.x;
					  transform.scale[1] = material.normalMap.repeat.y;
					}
					
					// Update rotation if it exists in both
					if (transform.rotation !== undefined && material.normalMap.rotation !== undefined) {
					  transform.rotation = material.normalMap.rotation;
					}
				  }
				  
				  // Update base color texture transforms if map exists
				  if (material.map && 
					  materialToUpdate.pbrMetallicRoughness?.baseColorTexture?.extensions?.KHR_texture_transform) {
					  
					const transform = materialToUpdate.pbrMetallicRoughness.baseColorTexture.extensions.KHR_texture_transform;
					
					// Initialize offset array if it doesn't exist
					if (!transform.offset && material.map.offset) {
					  transform.offset = [0, 0];
					}
					
					// Now update the offset if it exists
					if (transform.offset && material.map.offset) {
					  transform.offset[0] = material.map.offset.x;
					  transform.offset[1] = material.map.offset.y;
					}
					
					// Initialize scale array if it doesn't exist
					if (!transform.scale && material.map.repeat) {
					  transform.scale = [1, 1];
					}
					
					// Update the scale if it exists
					if (transform.scale && material.map.repeat) {
					  transform.scale[0] = material.map.repeat.x;
					  transform.scale[1] = material.map.repeat.y;
					}
					
					// Update rotation if it exists in both
					if (transform.rotation !== undefined && material.map.rotation !== undefined) {
					  transform.rotation = material.map.rotation;
					}
				  }
				  
				  // ======== SHEEN PROPERTIES ========
				  
				  // Update sheen properties if they exist in the material
				  if ((material.sheen > 0 || 
					   material.sheenColor || 
					   material.sheenRoughness !== undefined || 
					   material.sheenColorMap) && 
					  materialToUpdate.extensions?.KHR_materials_sheen) {
					  
					const sheenExtension = materialToUpdate.extensions.KHR_materials_sheen;
					
					// Update sheen color
					if (material.sheenColor) {
					  if (!sheenExtension.sheenColorFactor) {
						sheenExtension.sheenColorFactor = [0, 0, 0];
					  }
					  
					  sheenExtension.sheenColorFactor[0] = material.sheenColor.r;
					  sheenExtension.sheenColorFactor[1] = material.sheenColor.g;
					  sheenExtension.sheenColorFactor[2] = material.sheenColor.b;
					  
					//  console.log(`Updated sheen color for "${materialName}" to`, sheenExtension.sheenColorFactor);
					}
					
					// Update sheen roughness
					if (material.sheenRoughness !== undefined) {
					  sheenExtension.sheenRoughnessFactor = Number(material.sheenRoughness.toFixed(9));
				  //    console.log(`Updated sheen roughness for "${materialName}" to ${sheenExtension.sheenRoughnessFactor}`);
					}
					
					// Update sheen color map transforms if map exists
					if (material.sheenColorMap && 
						sheenExtension.sheenColorTexture?.extensions?.KHR_texture_transform) {
						
					  const transform = sheenExtension.sheenColorTexture.extensions.KHR_texture_transform;
					  
					  // Initialize offset array if it doesn't exist
					  if (!transform.offset && material.sheenColorMap.offset) {
						transform.offset = [0, 0];
					  }
					  
					  // Now update the offset if it exists
					  if (transform.offset && material.sheenColorMap.offset) {
						transform.offset[0] = material.sheenColorMap.offset.x;
						transform.offset[1] = material.sheenColorMap.offset.y;
					  }
					  
					  // Initialize scale array if it doesn't exist
					  if (!transform.scale && material.sheenColorMap.repeat) {
						transform.scale = [1, 1];
					  }
					  
					  // Update the scale if it exists
					  if (transform.scale && material.sheenColorMap.repeat) {
						transform.scale[0] = material.sheenColorMap.repeat.x;
						transform.scale[1] = material.sheenColorMap.repeat.y;
					  }
					  
					  // Update rotation if it exists in both
					  if (transform.rotation !== undefined && material.sheenColorMap.rotation !== undefined) {
						transform.rotation = material.sheenColorMap.rotation;
					  }
					  
					  // Update UV channel if it exists
					  if (material.sheenColorMap.channel !== undefined) {
						sheenExtension.sheenColorTexture.texCoord = material.sheenColorMap.channel;
					  }
					}
				  }
				}
			  }
			  
			  // Restore the original variant
			   if (currentVariantName) {
					console.log ('Last edited variant:',currentVariantName)
				  modelViewer.variantName = currentVariantName;
				}
			  
			  return materialsCopy;
			} catch (error) {
			  console.error('Error extracting materials:', error);
			  
			  // Try to restore the original variant
			  try {
				if (currentVariantName) {
					console.log ('Last edited variant:',currentVariantName)
				  modelViewer.variantName = currentVariantName;
				}
			  } catch (e) {
				console.error('Error restoring original variant:', e);
			  }
			  
			  return null;
			}
		  }
			  async saveGLTF() {
				try {
				  const modelViewer = this;
				  const src = modelViewer.src;
				  const baseUrl = src.substring(0, src.lastIndexOf('/') + 1);
				  const resourcesUrl = baseUrl + 'resources/';
				  
				  // Get updated materials
				  const updatedMaterials = await this.downloadMaterialsJson();
				  if (!updatedMaterials) {
					throw new Error('Failed to get updated materials');
				  }
				  
				  // Load original GLTF file
				  const gltfResponse = await fetch(src);
				  if (!gltfResponse.ok) {
					throw new Error(`Failed to fetch GLTF: ${gltfResponse.status} ${gltfResponse.statusText}`);
				  }
				  const gltfJson = await gltfResponse.json();
				  
				  // Load and merge textures.json
				  const texturesResponse = await fetch(resourcesUrl + 'textures.json');
				  if (!texturesResponse.ok) {
					throw new Error(`Failed to load textures.json: ${texturesResponse.status}`);
				  }
				  const texturesData = await texturesResponse.json();
				  gltfJson.textures = texturesData;
				  
				  // Load and merge images.json
				  const imagesResponse = await fetch(resourcesUrl + 'images.json');
				  if (!imagesResponse.ok) {
					throw new Error(`Failed to load images.json: ${imagesResponse.status}`);
				  }
				  const imagesData = await imagesResponse.json();
				  
				  // Merge images - keep existing embedded images, add external ones
				  const existingImages = Array.isArray(gltfJson.images) ? gltfJson.images : [];
				  gltfJson.images = [...existingImages, ...imagesData];
				  
				  // Apply updated materials and remove external references
				  gltfJson.materials = updatedMaterials;
				  if (gltfJson.externalImagesUri) {
					delete gltfJson.externalImagesUri;
				  }
				  
				  return {
					materials: updatedMaterials,
					gltf: JSON.stringify(gltfJson, null, 2)
				  };
				} catch (error) {
				  console.error('Error in saveGLTF:', error);
				  throw error;
				}
			  }

			  async saveGLTFMeow() {
				try {
				  // Get the original GLTF file from CDN
				  const modelViewer = this;
				  const src = modelViewer.src;
				  const baseUrl = src.substring(0, src.lastIndexOf('/') + 1);
				  
				  console.log('Fetching original GLTF from:', src);
				  const gltfResponse = await fetch(src);
				  if (!gltfResponse.ok) {
					throw new Error(`Failed to fetch GLTF: ${gltfResponse.status} ${gltfResponse.statusText}`);
				  }
				  
				  const gltfJson = await gltfResponse.json();
				  console.log('Original GLTF loaded:', gltfJson);
				  
				  // Convert from custom format back to standard GLTF
				  await this.convertToStandardGltf(gltfJson, baseUrl);
				  
				  // Create and download the complete GLTF file
				  const completeGltfString = JSON.stringify(gltfJson, null, 2);
				  const file = new File([completeGltfString], "export.gltf", { type: "application/json" });
				  const link = document.createElement("a");
				  link.download = file.name;
				  link.href = URL.createObjectURL(file);
				  link.click();
	
				} catch (error) {
				  console.error('Error in saveGLTFMeow:', error);
				  throw error;
				}
			  }
			  
			  async convertToStandardGltf(gltfJson, baseUrl) {
				try {
				  // 1. Load and merge materials if they're externalized
				  if (typeof gltfJson.materials === 'string' && gltfJson.materials === 'materials.json') {
					try {
					  const materialsUrl = baseUrl + 'resources/materials.json';
					  const materialsResponse = await fetch(materialsUrl);
					  if (materialsResponse.ok) {
						const materialsData = await materialsResponse.json();
						if (Array.isArray(materialsData)) {
						  gltfJson.materials = materialsData;
						  console.log('Merged materials.json into GLTF:', materialsData.length, 'materials');
						}
					  }
					} catch (error) {
					  console.warn('Could not load materials.json for export:', error);
					  // Fallback to empty array if we can't load materials
					  gltfJson.materials = [];
					}
				  }
				  
				  // 2. Load and merge textures if they're externalized  
				  if (typeof gltfJson.textures === 'string' && gltfJson.textures === 'textures.json') {
					try {
					  const texturesUrl = baseUrl + 'resources/textures.json';
					  const texturesResponse = await fetch(texturesUrl);
					  if (texturesResponse.ok) {
						const texturesData = await texturesResponse.json();
						if (Array.isArray(texturesData)) {
						  gltfJson.textures = texturesData;
						  console.log('Merged textures.json into GLTF:', texturesData.length, 'textures');
						}
					  }
					} catch (error) {
					  console.warn('Could not load textures.json for export:', error);
					  // Fallback to empty array if we can't load textures
					  gltfJson.textures = [];
					}
				  }
				  
				  // 3. Load and merge external images if they exist
				  if (gltfJson.externalImagesUri) {
					try {
					  const imagesUrl = baseUrl + 'resources/' + gltfJson.externalImagesUri;
					  const imagesResponse = await fetch(imagesUrl);
					  if (imagesResponse.ok) {
						const imagesData = await imagesResponse.json();
						if (Array.isArray(imagesData)) {
						  // Merge with existing images (keep the first one that was embedded)
						  const existingImages = Array.isArray(gltfJson.images) ? gltfJson.images : [];
						  gltfJson.images = [...existingImages, ...imagesData];
						  console.log('Merged external images into GLTF:', imagesData.length, 'external images');
						}
					  }
					  // Remove the external reference since we've merged the data
					  delete gltfJson.externalImagesUri;
					} catch (error) {
					  console.warn('Could not load external images for export:', error);
					  // Remove the external reference even if we failed to load
					  delete gltfJson.externalImagesUri;
					}
				  }
				  
				  // 4. Ensure we have valid empty arrays if nothing was loaded
				  if (!gltfJson.materials) gltfJson.materials = [];
				  if (!gltfJson.textures) gltfJson.textures = [];  
				  if (!gltfJson.images) gltfJson.images = [];
				  
				  console.log('GLTF conversion complete:', {
					materials: gltfJson.materials.length,
					textures: gltfJson.textures.length,
					images: gltfJson.images.length
				  });
				  
				} catch (error) {
				  console.error('Error converting GLTF to standard format:', error);
				  throw error;
				}
			  }
		  
			  async setupExternalResources() {
				var modelViewer = this;
				
				try {
				  // Get the model URL
				  const modelUrl = modelViewer.src;
				  if (!modelUrl) {
					console.error('Model URL not available');
					return false;
				  }
				  
				  // Generate base URL for external resources
				  const urlParts = modelUrl.split('/');
				  const lastPart = urlParts.pop(); // Remove the filename
				  const baseUrl = urlParts.join('/') + '/';
				  
				  // Initialize success trackers
				  let materialsSuccess = false;
				  let texturesSuccess = false;
				  let imagesSuccess = false;
				  
				  // 1. Load materials.json if needed
				  if (modelViewer.parser?.json?.materials === "materials.json") {
					const materialsUrl = baseUrl + 'resources/materials.json';
					console.log('Loading external materials from:', materialsUrl);
					
					try {
					  const materialsResponse = await fetch(materialsUrl);
					  if (materialsResponse.ok) {
						const materialsData = await materialsResponse.json();
						// Validate materials data
						if (!Array.isArray(materialsData)) {
						  console.error('External materials file does not contain a valid array');
						} else {
						  this.initOriginalMaterialsStructure(materialsData);
						  materialsSuccess = true;
						}
					  } else {
						console.warn(`Could not load materials.json: ${materialsResponse.status} ${materialsResponse.statusText}`);
					  }
					} catch (materialError) {
					  console.error('Error loading materials.json:', materialError);
					}
				  }
		  
				  
				  // Return overall success status
				  return {
					materialsLoaded: materialsSuccess,
					texturesLoaded: texturesSuccess,
					imagesLoaded: imagesSuccess
				  };
				} catch (error) {
				  console.error('Error setting up external resources:', error);
				  return false;
				}
			  }
		  
			  initOriginalMaterialsStructure(json) {
				if (Array.isArray(json)) {
				  // Store a deep copy to prevent reference issues
				  this._originalMaterialsStructure = JSON.parse(JSON.stringify(json));
				  
				  // Create mapping for easier reference
				  this._materialNameToIndexMap = new Map();
				  
				  json.forEach((material, index) => {
					if (material.name) {
					  this._materialNameToIndexMap.set(material.name, index);
					}
				  });
				  
				  console.log('Original materials structure initialized with', json.length, 'materials');
				  return true;
				} else {
				  console.error('Invalid materials data provided:', json);
				  return false;
				}
			  }
		  
			  // Initialize textures structure
			  initTexturesStructure(json) {
				if (Array.isArray(json)) {
				  // Store a deep copy to prevent reference issues
				  this._originalTexturesStructure = JSON.parse(JSON.stringify(json));
				  
				  // Create mapping for easier reference
				  this._textureNameToIndexMap = new Map();
				  
				  json.forEach((texture, index) => {
					if (texture.name) {
					  this._textureNameToIndexMap.set(texture.name, index);
					}
				  });
				  
				  console.log('Original textures structure initialized with', json.length, 'textures');
				  return true;
				} else {
				  console.error('Invalid textures data provided:', json);
				  return false;
				}
			  }
		  
			  // Initialize images structure
			  initImagesStructure(json) {
				if (Array.isArray(json)) {
				  // Store a deep copy to prevent reference issues
				  this._originalImagesStructure = JSON.parse(JSON.stringify(json));
				  
				  // Create mapping for easier reference
				  this._imageNameToIndexMap = new Map();
				  this._imageUriToIndexMap = new Map();
				  
				  json.forEach((image, index) => {
					if (image.name) {
					  this._imageNameToIndexMap.set(image.name, index);
					}
					if (image.uri) {
					  this._imageUriToIndexMap.set(image.uri, index);
					}
				  });
				  
				  console.log('Original images structure initialized with', json.length, 'images');
				  return true;
				} else {
				  console.error('Invalid images data provided:', json);
				  return false;
				}
			  }
		  
				  totalMeshCount() {
					if (!this[$scene] || !this[$scene].model) {
					  console.warn('Cannot count meshes: Scene or model not available');
					  return 0;
					}
					
					let count = 0;
					this[$scene].model.traverse((object) => {
					  if (object.isMesh) {
						count++;
					  }
					});
					
					return count;
				  }
		  
			  totalMaterialCount() {
				if (!this[$scene] || !this[$scene].model) {
				  console.warn('Cannot count materials: Scene or model not available');
				  return 0;
				}
				
				// Use a Set to avoid counting duplicate materials
				const materials = new Set();
				
				this[$scene].model.traverse((object) => {
				  if (object.material) {
					// Handle both single materials and material arrays
					if (Array.isArray(object.material)) {
					  object.material.forEach(mat => {
						if (mat) materials.add(mat);
					  });
					} else {
					  materials.add(object.material);
					}
				  }
				});
				
				return materials.size;
			  }
		  
				  getPolyStats() {
					if (!this[$scene] || !this[$scene].model) {
					  console.warn('Cannot get polygon stats: Scene or model not available');
					  return { vertices: 0, triangles: 0 };
					}
					
					let vertexCount = 0;
					let triangleCount = 0;
					
					this[$scene].model.traverse((object) => {
					  if (object.isMesh && object.geometry) {
						const geometry = object.geometry;
						
						// Count vertices
						if (geometry.attributes && geometry.attributes.position) {
						  vertexCount += geometry.attributes.position.count;
						}
						
						// Count triangles/faces
						if (geometry.index) {
						  // Indexed geometry
						  triangleCount += geometry.index.count / 3;
						} else if (geometry.attributes && geometry.attributes.position) {
						  // Non-indexed geometry
						  triangleCount += geometry.attributes.position.count / 3;
						}
					  }
					});
					
					return {
					  vertices: Math.round(vertexCount),
					  triangles: Math.round(triangleCount)
					};
				  }
		  
				  checkForDoubleSided() {
					if (!this[$scene] || !this[$scene].model) {
					  console.warn('Cannot check for double-sided materials: Scene or model not available');
					  return { count: 0, materials: [] };
					}
					
					const doubleSidedMaterials = new Set();
					
					this[$scene].model.traverse((object) => {
					  if (object.material) {
						// Handle both single materials and material arrays
						if (Array.isArray(object.material)) {
						  object.material.forEach(mat => {
							if (mat && mat.side === DoubleSide) {
							  doubleSidedMaterials.add(mat);
							}
						  });
						} else if (object.material.side === DoubleSide) {
						  doubleSidedMaterials.add(object.material);
						}
					  }
					});
					
					// Create array of material names
					const materialNames = Array.from(doubleSidedMaterials).map(mat => mat.name || 'Unnamed Material');
					
					return {
					  count: doubleSidedMaterials.size,
					  materials: materialNames
					};
				  }
		  
				  getModelStats() {
					const polyStats = this.getPolyStats();
					const doubleSidedInfo = this.checkForDoubleSided();
					
					return {
					  meshCount: this.totalMeshCount(),
					  materialCount: this.totalMaterialCount(),
					  vertices: polyStats.vertices,
					  triangles: polyStats.triangles,
					  doubleSidedCount: doubleSidedInfo.count,
					  doubleSidedMaterials: doubleSidedInfo.materials
					};
				  }
		  
				  async exportGLB() {
					try {
					  // Use the existing exportScene method which returns a Blob
					  const glTF = await this.exportScene({ binary: true });
					  
					  // Get the filename from the global variable, or use a default
					  const baseName = window.currentFileName || 'model';
					  const filename = `${baseName}.glb`;
					  
					  console.log('Exporting GLB as:', filename);
					  
					  // Create a download link
					  const link = document.createElement("a");
					  link.download = filename;
					  link.href = URL.createObjectURL(glTF);
					  link.click();
					  
					  // Clean up
					  setTimeout(() => URL.revokeObjectURL(link.href), 100);
					} catch (error) {
					  console.error('Error exporting GLB:', error);
					}
				  }
		  
				  /**
				   * Export the current model as GLTF file (JSON format)
				   */
				  async exportGLTF() {
					try {
					  // Use the existing exportScene method with binary: false to get JSON
					  const glTF = await this.exportScene({ binary: false });
					  
					  // Get the filename from the global variable, or use a default
					  const baseName = window.currentFileName || 'model';
					  const filename = `${baseName}.gltf`;
					  
					  console.log('Exporting GLTF as:', filename);
					  
					  // Create a download link
					  const link = document.createElement("a");
					  link.download = filename;
					  link.href = URL.createObjectURL(glTF);
					  link.click();
					  
					  // Clean up
					  setTimeout(() => URL.revokeObjectURL(link.href), 100);
					} catch (error) {
					  console.error('Error exporting GLTF:', error);
					}
				  }
		  
		  
				  async exportUSDZ() {
					if (!this[$scene]) {
					  console.error("No model loaded");
					  return;
					}
		  
					try {
					  const exporter = new USDZExporter();
					  
					  // Use the currentFileName property or default to 'model'
					  const baseName = window.currentFileName || 'model';
					  const filename = `${baseName}.usdz`;
					  
					  console.log("Exporting with filename:", filename);
					  
					  // Generate the USDZ data
					  const arraybuffer = await exporter.parseAsync(this[$scene]._model);
					  
					  // Create blob directly from the arraybuffer
					  const blob = new Blob([arraybuffer], {
						type: 'model/vnd.usdz+zip'
					  });
					  
					  // Create download link
					  const link = document.createElement("a");
					  link.download = filename;
					  link.href = URL.createObjectURL(blob);
					  link.click();
					  
					  // Clean up the object URL after download is triggered
					  setTimeout(() => URL.revokeObjectURL(link.href), 100);
					} catch (error) {
					  console.error('Error exporting USDZ:', error);
					}
				  }
		  
				  getObjectByUuid(uuid) {
					if (this[$scene]) {
					  return this.findObjectByUuidInObject(this[$scene], uuid);
					}
					return null;
				  }
		  
				  findObjectByUuidInObject(object, uuid) {
					if (object.uuid === uuid) {
					  return object;
					}
		  
					if (object.children) {
					  for (let i = 0; i < object.children.length; i++) {
						const found = this.findObjectByUuidInObject(object.children[i], uuid);
						if (found) {
						  return found;
						}
					  }
					}
					
					return null;
				  }
		  