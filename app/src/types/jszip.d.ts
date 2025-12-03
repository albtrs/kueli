declare module 'jszip' {
  interface JSZipObject {
    name: string;
    dir: boolean;
    date: Date | null;
    comment: string;
    unixPermissions: number | string | null;
    dosPermissions: number | null;
    async<T extends 'string' | 'text' | 'base64' | 'binarystring' | 'uint8array' | 'arraybuffer' | 'blob' | 'nodebuffer'>(
      type: T,
      onUpdate?: (metadata: { percent: number; currentFile: string | null }) => void
    ): Promise<T extends 'string' | 'text' | 'base64' | 'binarystring' ? string : T extends 'uint8array' ? Uint8Array : T extends 'arraybuffer' ? ArrayBuffer : T extends 'nodebuffer' ? Buffer : Blob>;
  }

  interface JSZipGeneratorOptions {
    type?: 'base64' | 'binarystring' | 'uint8array' | 'arraybuffer' | 'blob' | 'nodebuffer';
    compression?: 'STORE' | 'DEFLATE';
    compressionOptions?: { level: number };
    comment?: string;
    platform?: 'DOS' | 'UNIX';
    encodeFileName?: (name: string) => string;
    streamFiles?: boolean;
    mimeType?: string;
  }

  interface JSZip {
    files: { [key: string]: JSZipObject };
    file(name: string): JSZipObject | null;
    file(name: string, data: string | ArrayBuffer | Uint8Array | Buffer | Blob | Promise<string | ArrayBuffer | Uint8Array | Buffer | Blob>, options?: { base64?: boolean; binary?: boolean; date?: Date; compression?: string; compressionOptions?: { level: number }; comment?: string; dir?: boolean }): JSZip;
    folder(name: string): JSZip | null;
    forEach(callback: (relativePath: string, file: JSZipObject) => void): void;
    filter(predicate: (relativePath: string, file: JSZipObject) => boolean): JSZipObject[];
    remove(name: string): JSZip;
    generateAsync(options: JSZipGeneratorOptions & { type: 'nodebuffer' }): Promise<Buffer>;
    generateAsync(options: JSZipGeneratorOptions & { type: 'uint8array' }): Promise<Uint8Array>;
    generateAsync(options: JSZipGeneratorOptions & { type: 'arraybuffer' }): Promise<ArrayBuffer>;
    generateAsync(options: JSZipGeneratorOptions & { type: 'base64' | 'binarystring' | 'string' }): Promise<string>;
    generateAsync(options: JSZipGeneratorOptions & { type: 'blob' }): Promise<Blob>;
    generateAsync(options?: JSZipGeneratorOptions): Promise<Buffer>;
  }

  interface JSZipConstructor {
    new(): JSZip;
    loadAsync(data: string | ArrayBuffer | Uint8Array | Buffer | Blob, options?: { base64?: boolean; checkCRC32?: boolean; optimizedBinaryString?: boolean; createFolders?: boolean; decodeFileName?: (bytes: string | ArrayBuffer | Uint8Array) => string }): Promise<JSZip>;
  }

  const JSZip: JSZipConstructor;
  export default JSZip;
}
