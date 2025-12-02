'use client';

import { useState, useCallback } from 'react';
import { saveNote as saveNoteAction } from '@/actions/note';
import { Note } from '@/lib/types';

interface UploadResult {
  url: string | null;
  error?: string;
}

interface UseFileUploadOptions {
  note: Note | null;
  onNoteUpdate: (note: Note) => void;
}

export function useFileUpload({ note, onNoteUpdate }: UseFileUploadOptions) {
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  /**
   * 単一ファイルをアップロード
   */
  const uploadFile = useCallback(async (file: File): Promise<UploadResult> => {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        return { 
          url: null, 
          error: errorData.error || 'アップロードに失敗しました' 
        };
      }

      const data = await response.json();
      
      // 既存ノートの場合はimagesを更新
      if (note) {
        const updatedImages = [...(note.images || []), data.filename];
        const updated = await saveNoteAction(note.id, {
          ...note,
          images: updatedImages,
        });
        onNoteUpdate(updated);
      }

      return { url: data.url };
    } catch (err) {
      console.error('Failed to upload file:', err);
      return { 
        url: null, 
        error: err instanceof Error ? err.message : 'アップロードに失敗しました' 
      };
    }
  }, [note, onNoteUpdate]);

  /**
   * 複数ファイルをアップロードしてMarkdown形式で返す
   */
  const uploadFiles = useCallback(async (files: File[]): Promise<string> => {
    if (files.length === 0) return '';
    
    setIsUploading(true);
    
    try {
      const uploadPromises = files.map(file => uploadFile(file));
      const results = await Promise.all(uploadPromises);
      
      const errors: string[] = [];
      let insertText = '';
      
      files.forEach((file, index) => {
        const result = results[index];
        if (result.url) {
          if (insertText) insertText += ' ';
          insertText += `![${file.name}](${result.url})`;
        } else if (result.error) {
          errors.push(`${file.name}: ${result.error}`);
        }
      });
      
      if (errors.length > 0) {
        alert('以下のファイルのアップロードに失敗しました:\n\n' + errors.join('\n'));
      }
      
      return insertText;
    } finally {
      setIsUploading(false);
    }
  }, [uploadFile]);

  /**
   * ドラッグオーバーハンドラ
   */
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  /**
   * ドラッグリーブハンドラ
   */
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  /**
   * ドロップハンドラを作成
   */
  const createDropHandler = useCallback((onInsert: (text: string) => void) => {
    return async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      const files = Array.from(e.dataTransfer.files);
      const insertText = await uploadFiles(files);
      if (insertText) {
        onInsert(insertText);
      }
    };
  }, [uploadFiles]);

  return {
    isUploading,
    isDragOver,
    uploadFiles,
    handleDragOver,
    handleDragLeave,
    createDropHandler,
  };
}
