'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { saveNote as saveNoteAction } from '@/api/notes';
import type { Note } from '@/lib/types';
import { extractTags } from '@/lib/utils';

export type SaveStatus = 'new' | 'saved' | 'saving' | 'unsaved';

interface UseAutoSaveOptions {
  /** 既存ノートのID（新規作成時はnull） */
  noteId: string | null;
  /** 新規作成モードかどうか */
  isNewMode: boolean;
  /** ノート状態 */
  note: Note | null;
  /** ノート更新コールバック */
  onNoteUpdate: (note: Note) => void;
  /** 新規作成時のID設定コールバック */
  onNoteCreated?: (id: string) => void;
  /** 保存間隔（ミリ秒） */
  debounceMs?: number;
}

export function useAutoSave({
  noteId,
  isNewMode,
  note,
  onNoteUpdate,
  onNoteCreated,
  debounceMs = 1000,
}: UseAutoSaveOptions) {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(isNewMode ? 'new' : 'saved');
  const [createdNoteId, setCreatedNoteId] = useState<string | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 現在のノートID（新規作成後は createdNoteId を使用）
  const currentNoteId = createdNoteId || noteId;

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  /**
   * 保存処理
   */
  const performSave = useCallback(
    async (title: string, content: string) => {
      // 新規作成モードで空のコンテンツの場合は保存しない
      if (isNewMode && !content.trim() && !createdNoteId) {
        return;
      }

      // 編集モードでノートがまだ読み込まれていない場合はスキップ
      if (!isNewMode && !note) return;

      setSaveStatus('saving');
      try {
        const tags = extractTags(content);
        
        const saved = await saveNoteAction(currentNoteId, {
          title,
          content,
          tags,
        });
        
        // 新規作成の初回保存時
        if (isNewMode && !createdNoteId) {
          setCreatedNoteId(saved.id);
          onNoteUpdate(saved);
          onNoteCreated?.(saved.id);
        } else {
          onNoteUpdate(saved);
        }
        
        setSaveStatus('saved');
      } catch (err) {
        console.error('Failed to save note:', err);
        setSaveStatus('unsaved');
      }
    },
    [isNewMode, note, currentNoteId, createdNoteId, onNoteUpdate, onNoteCreated]
  );

  /**
   * 遅延保存をスケジュール
   */
  const scheduleSave = useCallback(
    (title: string, content: string) => {
      // 保存が必要かどうかを判定
      const needsSave = !isNewMode || createdNoteId || content.trim();
      if (needsSave) {
        setSaveStatus('unsaved');
      }

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      
      saveTimeoutRef.current = setTimeout(() => {
        performSave(title, content);
      }, debounceMs);
    },
    [isNewMode, createdNoteId, debounceMs, performSave]
  );

  /**
   * 即座に保存
   */
  const saveNow = useCallback(
    async (title: string, content: string) => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      await performSave(title, content);
    },
    [performSave]
  );

  return {
    saveStatus,
    createdNoteId,
    currentNoteId,
    scheduleSave,
    saveNow,
  };
}
