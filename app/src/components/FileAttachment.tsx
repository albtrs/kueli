import { FileText, FileImage, FileVideo, FileAudio, FileArchive, File as FileIcon } from 'lucide-react';

export interface AttachmentInfo {
  filename: string;
  url: string;
  size: number;
  type: string;
  category: 'image' | 'video' | 'audio' | 'file';
  originalName: string;
}

export function getFileIcon(category: string, size: number = 24) {
  const iconProps = { size, className: 'text-muted-foreground' };
  
  switch (category) {
    case 'image':
      return <FileImage {...iconProps} />;
    case 'video':
      return <FileVideo {...iconProps} />;
    case 'audio':
      return <FileAudio {...iconProps} />;
    case 'file':
      // PDFやOfficeファイルなど
      return <FileText {...iconProps} />;
    default:
      return <FileIcon {...iconProps} />;
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}
