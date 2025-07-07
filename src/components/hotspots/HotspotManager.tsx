'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MessageSquare, Plus, Trash2, Eye, EyeOff } from 'lucide-react';
import { Hotspot } from '@/types/hotspots';

interface HotspotManagerProps {
  hotspots: Hotspot[];
  selectedHotspotId: string | null;
  onHotspotSelect: (hotspotId: string | null) => void;
  onHotspotUpdate: (hotspotId: string, comment: string) => void;
  onHotspotDelete: (hotspotId: string) => void;
  onHotspotToggleVisibility: (hotspotId: string) => void;
  isAddingHotspot: boolean;
  onToggleAddMode: () => void;
}

const HotspotManager: React.FC<HotspotManagerProps> = ({
  hotspots,
  selectedHotspotId,
  onHotspotSelect,
  onHotspotUpdate,
  onHotspotDelete,
  onHotspotToggleVisibility,
  isAddingHotspot,
  onToggleAddMode,
}) => {
  const [editingHotspotId, setEditingHotspotId] = useState<string | null>(null);
  const [editingComment, setEditingComment] = useState('');

  const handleEditStart = (hotspot: Hotspot) => {
    setEditingHotspotId(hotspot.id);
    setEditingComment(hotspot.comment);
  };

  const handleEditSave = () => {
    if (editingHotspotId) {
      onHotspotUpdate(editingHotspotId, editingComment);
      setEditingHotspotId(null);
      setEditingComment('');
    }
  };

  const handleEditCancel = () => {
    setEditingHotspotId(null);
    setEditingComment('');
  };

  const formatTimestamp = (timestamp: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(timestamp);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 p-4 pb-2">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium flex items-center">
            <MessageSquare size={16} className="mr-2" />
            Comments ({hotspots.length})
          </h3>
          <Button
            variant={isAddingHotspot ? "default" : "outline"}
            size="sm"
            onClick={onToggleAddMode}
            className="text-xs h-7"
          >
            <Plus size={14} className="mr-1" />
            {isAddingHotspot ? "Cancel" : "Add"}
          </Button>
        </div>
        
        {isAddingHotspot && (
          <div className="text-xs text-blue-600 bg-blue-50 p-2 rounded border">
            Double-click on the model to add a hotspot with comment
          </div>
        )}
      </div>

      {/* Hotspots List */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {hotspots.length === 0 ? (
          <div className="text-gray-600 text-xs text-center py-8">
            <MessageSquare size={24} className="mx-auto mb-2 opacity-40" />
            <p>No comments yet</p>
            <p className="text-xs opacity-60 mt-1">
              Click "Add" and double-click on the model to create your first comment
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {hotspots.map((hotspot) => (
              <div
                key={hotspot.id}
                className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                  selectedHotspotId === hotspot.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => onHotspotSelect(selectedHotspotId === hotspot.id ? null : hotspot.id)}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center">
                    <div className="w-2 h-2 bg-blue-500 rounded-full mr-2 flex-shrink-0"></div>
                    <span className="text-xs text-gray-500">
                      {formatTimestamp(hotspot.timestamp)}
                    </span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onHotspotToggleVisibility(hotspot.id);
                      }}
                      className="h-6 w-6 p-0"
                      title={hotspot.visible ? "Hide hotspot" : "Show hotspot"}
                    >
                      {hotspot.visible ? (
                        <Eye size={12} />
                      ) : (
                        <EyeOff size={12} className="text-gray-400" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onHotspotDelete(hotspot.id);
                      }}
                      className="h-6 w-6 p-0 text-red-500 hover:text-red-600"
                      title="Delete hotspot"
                    >
                      <Trash2 size={12} />
                    </Button>
                  </div>
                </div>

                {editingHotspotId === hotspot.id ? (
                  <div className="space-y-2">
                    <Input
                      value={editingComment}
                      onChange={(e) => setEditingComment(e.target.value)}
                      placeholder="Enter your comment..."
                      className="text-xs"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleEditSave();
                        } else if (e.key === 'Escape') {
                          handleEditCancel();
                        }
                      }}
                    />
                    <div className="flex space-x-2">
                      <Button
                        variant="default"
                        size="sm"
                        onClick={handleEditSave}
                        className="text-xs h-6"
                      >
                        Save
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleEditCancel}
                        className="text-xs h-6"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div
                    className="text-sm text-gray-800 cursor-text"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEditStart(hotspot);
                    }}
                  >
                    {hotspot.comment || (
                      <span className="text-gray-400 italic">
                        Click to add comment...
                      </span>
                    )}
                  </div>
                )}

                {/* Position Info (for debugging) */}
                <div className="text-xs text-gray-400 mt-2 font-mono">
                  3D Position: ({hotspot.position.x.toFixed(2)}, {hotspot.position.y.toFixed(2)}, {hotspot.position.z.toFixed(2)})
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default HotspotManager; 