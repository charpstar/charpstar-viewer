"use client";

import type { QAAnnotation } from "./types";

const SEVERITY_STYLE: Record<string, string> = {
  low: "bg-yellow-100 text-yellow-800",
  medium: "bg-orange-100 text-orange-800",
  high: "bg-red-100 text-red-800",
};

interface Props {
  annotations: QAAnnotation[];
  onClear: () => void;
}

export default function QAAnnotationPanel({ annotations, onClear }: Props) {
  if (annotations.length === 0) {
    return (
      <p className="text-gray-500 text-xs p-4">
        No annotations yet.
        <code className="block mt-2 text-gray-400 break-all">
          window.qaAddAnnotation(pos, norm, &quot;text&quot;, &quot;high&quot;)
        </code>
      </p>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
        {annotations.map((a, i) => (
          <div key={a.id} className="border rounded p-2 text-xs bg-white">
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium text-gray-700">Issue #{i + 1}</span>
              <span
                className={`px-1.5 py-0.5 rounded font-medium ${SEVERITY_STYLE[a.severity]}`}
              >
                {a.severity}
              </span>
            </div>
            <p className="text-gray-600">{a.text}</p>
          </div>
        ))}
      </div>
      <div className="p-2 border-t flex-shrink-0">
        <button
          onClick={onClear}
          className="w-full text-xs py-1.5 rounded border border-gray-300 hover:bg-gray-50 transition-colors"
        >
          Clear All
        </button>
      </div>
    </div>
  );
}
