// src/utils/fileHandling.ts

export async function saveFileWithFallback(fileName: string, content: ArrayBuffer, directoryHandle: FileSystemDirectoryHandle | null) {
    try {
      if (directoryHandle) {
        const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(content);
        await writable.close();
      } else {
        // Fallback to direct download
        const blob = new Blob([content], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Error saving file:', error);
      throw error;
    }
  }
  
  export async function saveMultipleFilesWithFallback(files: { fileName: string; content: ArrayBuffer }[], directoryHandle: FileSystemDirectoryHandle | null) {
    if (directoryHandle) {
      // If we have directory access, save files one by one
      for (const file of files) {
        await saveFileWithFallback(file.fileName, file.content, directoryHandle);
      }
    } else {
      // If we don't have directory access, create a zip file and download it
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
  
      for (const file of files) {
        zip.file(file.fileName, file.content);
      }
  
      const zipContent = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipContent);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'exported_files.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }