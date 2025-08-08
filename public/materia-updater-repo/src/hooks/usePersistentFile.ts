// src/hooks/usePersistentFile.ts

import { useState, useEffect } from 'react';

interface PersistentFileState {
  file: File | null;
  fileName: string | null;
  filePath: string | null;
  isStored: boolean;
}

export function usePersistentFile(key: string): [PersistentFileState, (file: File, path: string) => void, () => void] {
  const [state, setState] = useState<PersistentFileState>({ file: null, fileName: null, filePath: null, isStored: false });

  useEffect(() => {
    const storedFileName = localStorage.getItem(`${key}FileName`);
    const storedFilePath = localStorage.getItem(`${key}FilePath`);
    if (storedFileName && storedFilePath) {
      setState({ file: null, fileName: storedFileName, filePath: storedFilePath, isStored: true });
    }
  }, [key]);

  const setFile = (file: File, path: string) => {
    setState({ file, fileName: file.name, filePath: path, isStored: true });
    localStorage.setItem(`${key}FileName`, file.name);
    localStorage.setItem(`${key}FilePath`, path);
  };

  const clearFile = () => {
    setState({ file: null, fileName: null, filePath: null, isStored: false });
    localStorage.removeItem(`${key}FileName`);
    localStorage.removeItem(`${key}FilePath`);
  };

  return [state, setFile, clearFile];
}