"use client";

interface ReferencePanelProps {
  images: string[];
}

export default function ReferencePanel({ images }: ReferencePanelProps) {
  if (images.length === 0) {
    return (
      <p className="text-gray-500 text-xs p-4">
        No reference images loaded.
        <code className="block mt-2 text-gray-400 break-all">
          window.qaSetReferences([url1, ...])
        </code>
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-2 overflow-y-auto h-full">
      {images.map((src, i) => (
        <div key={i} className="border rounded overflow-hidden flex-shrink-0">
          <img
            src={src}
            alt={`Reference ${i + 1}`}
            className="w-full object-contain bg-gray-100"
          />
          <p className="text-xs text-gray-500 px-2 py-0.5">Ref {i + 1}</p>
        </div>
      ))}
    </div>
  );
}
