CREATE TABLE IF NOT EXISTS User (
  id INTEGER NOT NULL PRIMARY KEY,
  username TEXT NOT NULL,
  passwordHash TEXT NOT NULL,
  isAdmin BOOLEAN NOT NULL DEFAULT false,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS User_username_key ON User(username);

CREATE TABLE IF NOT EXISTS Note (
  id TEXT NOT NULL PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  images TEXT NOT NULL DEFAULT '[]',
  isPinned BOOLEAN NOT NULL DEFAULT false,
  isArchived BOOLEAN NOT NULL DEFAULT false,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS NoteVersion (
  id TEXT NOT NULL PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  noteId TEXT NOT NULL,
  FOREIGN KEY (noteId) REFERENCES Note(id) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS NoteVersion_noteId_createdAt_idx ON NoteVersion(noteId, createdAt);

CREATE TABLE IF NOT EXISTS LinkMetadata (
  id TEXT NOT NULL PRIMARY KEY,
  url TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT,
  description TEXT,
  image TEXT,
  siteName TEXT,
  tweetData TEXT,
  searchText TEXT NOT NULL DEFAULT '',
  fetchedAt DATETIME,
  errorAt DATETIME,
  errorReason TEXT,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS LinkMetadata_url_key ON LinkMetadata(url);

CREATE TABLE IF NOT EXISTS NoteLinkMetadata (
  noteId TEXT NOT NULL,
  linkMetadataId TEXT NOT NULL,
  PRIMARY KEY (noteId, linkMetadataId),
  FOREIGN KEY (noteId) REFERENCES Note(id) ON UPDATE CASCADE ON DELETE CASCADE,
  FOREIGN KEY (linkMetadataId) REFERENCES LinkMetadata(id) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS NoteLinkMetadata_noteId_idx ON NoteLinkMetadata(noteId);
CREATE INDEX IF NOT EXISTS NoteLinkMetadata_linkMetadataId_idx ON NoteLinkMetadata(linkMetadataId);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME,
  replaced_by TEXT,
  created_at DATETIME NOT NULL,
  FOREIGN KEY (user_id) REFERENCES User(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS refresh_tokens_user_id_idx ON refresh_tokens(user_id);
