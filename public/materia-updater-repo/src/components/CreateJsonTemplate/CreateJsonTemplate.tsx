// src/components/CreateJsonTemplate/CreateJsonTemplate.tsx

import React from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { FileJson, Download, Plus } from 'lucide-react';
import { MaterialData } from '@/gltf/gltfTypes';

interface CreateJsonTemplateProps {
  onCreateTemplate: (data: MaterialData) => void;
  className?: string;
}

const CreateJsonTemplate: React.FC<CreateJsonTemplateProps> = ({ 
  onCreateTemplate, 
  className 
}) => {
  const createEmptyTemplate = (): MaterialData => {
    return {
      materials: [],
      meshAssignments: {},
      meshGroups: {},
      models: {
        "Regular": ["Standard"],
        "Blavalen": ["Special"]
      },
      sortSettings: {
        tagStates: [
          {
            name: "Untagged",
            enabled: true,
            order: 0
          }
        ],
        timestamp: Date.now(),
        autoSortEnabled: false
      }
    };
  };

  const handleCreateEmpty = () => {
    const emptyData = createEmptyTemplate();
    onCreateTemplate(emptyData);
  };

  const handleDownloadTemplate = () => {
    const emptyData = createEmptyTemplate();
    const blob = new Blob([JSON.stringify(emptyData, null, 2)], { 
      type: 'application/json' 
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'materials_template.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCreateWithExamples = () => {
    const exampleData: MaterialData = {
      materials: [
        {
          name: "Wood_Oak",
          tags: ["Wood", "Natural"]
        },
        {
          name: "Metal_Steel",
          tags: ["Metal", "Industrial"]
        },
        {
          name: "Fabric_Cotton",
          tags: ["Fabric", "Soft"]
        }
      ],
      meshAssignments: {
        "Chair_Seat": {
          defaultMaterial: "Fabric_Cotton",
          variants: [
            { name: "Wood_Oak", material: "Wood_Oak" },
            { name: "Metal_Steel", material: "Metal_Steel" }
          ]
        },
        "Chair_Frame": {
          defaultMaterial: "Wood_Oak",
          variants: [
            { name: "Wood_Oak", material: "Wood_Oak" },
            { name: "Metal_Steel", material: "Metal_Steel" }
          ]
        }
      },
      meshGroups: {
        "group_1": {
          id: "group_1",
          name: "Office Chairs",
          filenames: ["office_chair_01.gltf", "office_chair_02.gltf"],
          meshes: {
            "Cushion": {
              defaultMaterial: "Fabric_Cotton",
              variants: [
                { name: "Fabric_Cotton", material: "Fabric_Cotton" }
              ]
            }
          },
          isExpanded: false
        }
      },
      models: {
        "Regular": ["Standard", "Premium"],
        "Blavalen": ["Special", "Custom"]
      },
      sortSettings: {
        tagStates: [
          { name: "Wood", enabled: true, order: 0 },
          { name: "Metal", enabled: true, order: 1 },
          { name: "Fabric", enabled: true, order: 2 },
          { name: "Natural", enabled: true, order: 3 },
          { name: "Industrial", enabled: true, order: 4 },
          { name: "Soft", enabled: true, order: 5 },
          { name: "Untagged", enabled: true, order: 6 }
        ],
        timestamp: Date.now(),
        autoSortEnabled: false
      }
    };
    
    onCreateTemplate(exampleData);
  };

  return (
    <Card className={`shadow-sm ${className}`}>
      <CardHeader className="py-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-full bg-blue-50 dark:bg-blue-900/20">
            <FileJson className="h-6 w-6 text-blue-500" />
          </div>
          <div>
            <CardTitle className="text-lg">Create Materials Configuration</CardTitle>
            <CardDescription>
              Start with a new materials.json file or download a template
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Create Empty Template */}
          <div className="p-4 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-blue-400 dark:hover:border-blue-500 transition-colors">
            <div className="text-center space-y-3">
              <div className="p-3 mx-auto w-fit rounded-full bg-gray-100 dark:bg-gray-800">
                <Plus className="h-6 w-6 text-gray-600 dark:text-gray-400" />
              </div>
              <div>
                <h3 className="font-medium text-gray-900 dark:text-gray-100">
                  Start Empty
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  Create a blank configuration file
                </p>
              </div>
              <Button 
                onClick={handleCreateEmpty}
                variant="outline"
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Empty
              </Button>
            </div>
          </div>

          {/* Create with Examples */}
          <div className="p-4 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-blue-400 dark:hover:border-blue-500 transition-colors">
            <div className="text-center space-y-3">
              <div className="p-3 mx-auto w-fit rounded-full bg-blue-100 dark:bg-blue-900/30">
                <FileJson className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h3 className="font-medium text-gray-900 dark:text-gray-100">
                  Start with Examples
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  Pre-filled with sample materials and meshes
                </p>
              </div>
              <Button 
                onClick={handleCreateWithExamples}
                variant="default"
                className="w-full"
              >
                <FileJson className="h-4 w-4 mr-2" />
                Create with Examples
              </Button>
            </div>
          </div>
        </div>

        {/* Download Template Option */}
        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                Download Template
              </h4>
              <p className="text-xs text-gray-500 mt-1">
                Save an empty template file to your computer
              </p>
            </div>
            <Button 
              onClick={handleDownloadTemplate}
              variant="ghost"
              size="sm"
            >
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
          </div>
        </div>

        {/* Template Structure Info */}
        <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Template Structure:
          </h4>
          <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
            <li>• <strong>materials:</strong> Array of material definitions with names and tags</li>
            <li>• <strong>meshAssignments:</strong> Direct mesh-to-material mappings</li>
            <li>• <strong>meshGroups:</strong> Grouped meshes with filename associations</li>
            <li>• <strong>models:</strong> Model type configurations</li>
            <li>• <strong>sortSettings:</strong> Tag sorting preferences</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};

export default CreateJsonTemplate;