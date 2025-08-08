interface FileSystemHandle {
    requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
  }
  
  interface FileSystemHandlePermissionDescriptor {
    mode?: 'read' | 'readwrite';
  }
  
  interface FileSystemDirectoryHandle extends FileSystemHandle {
    // Add other methods if needed
  }