export interface Note {
  id: string;
  title: string;
  content: string;
  isPinned: boolean;
  isArchived: boolean;
  tags: string[]; // Parsed from JSON string in DB
  images: string[]; // Parsed from JSON string in DB
  createdAt: Date;
  updatedAt: Date;
}

export interface NoteCreateData {
  title: string;
  content?: string;
  isPinned?: boolean;
  tags?: string[];
  images?: string[];
}

export interface NoteUpdateData {
  title?: string;
  content?: string;
  isPinned?: boolean;
  isArchived?: boolean;
  tags?: string[];
  images?: string[];
}
