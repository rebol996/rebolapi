"use client";

import { useState, useRef, useCallback } from "react";

interface FileUploadProps {
  onFilesUploaded: (files: UploadedFile[]) => void;
  maxFiles?: number;
  maxSizeBytes?: number;
  acceptedTypes?: string[];
}

export interface UploadedFile {
  name: string;
  content: string;
  size: number;
  type: string;
  language: string;
}

const LANGUAGE_MAP: Record<string, string> = {
  js: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  py: "python",
  rb: "ruby",
  java: "java",
  go: "go",
  rs: "rust",
  cpp: "cpp",
  c: "c",
  h: "c",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  swift: "swift",
  kt: "kotlin",
  scala: "scala",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  sql: "sql",
  html: "html",
  css: "css",
  scss: "scss",
  less: "less",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  xml: "xml",
  md: "markdown",
  txt: "plaintext",
  dockerfile: "dockerfile",
  makefile: "makefile",
};

export function FileUpload({
  onFilesUploaded,
  maxFiles = 10,
  maxSizeBytes = 1024 * 1024,
  acceptedTypes,
}: FileUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const getLanguage = (filename: string): string => {
    const ext = filename.split(".").pop()?.toLowerCase() || "";
    return LANGUAGE_MAP[ext] || "plaintext";
  };

  const processFiles = useCallback(
    async (files: FileList | File[]) => {
      setError(null);
      setUploading(true);

      const fileArray = Array.from(files);

      if (uploadedFiles.length + fileArray.length > maxFiles) {
        setError(`最多允许上传 ${maxFiles} 个文件`);
        setUploading(false);
        return;
      }

      const processed: UploadedFile[] = [];

      for (const file of fileArray) {
        if (file.size > maxSizeBytes) {
          setError(`文件“${file.name}”超过最大限制 ${Math.round(maxSizeBytes / 1024)}KB`);
          continue;
        }

        try {
          const content = await file.text();
          processed.push({
            name: file.name,
            content,
            size: file.size,
            type: file.type || "text/plain",
            language: getLanguage(file.name),
          });
        } catch {
          setError(`读取文件“${file.name}”失败`);
        }
      }

      const newFiles = [...uploadedFiles, ...processed];
      setUploadedFiles(newFiles);
      onFilesUploaded(newFiles);
      setUploading(false);
    },
    [uploadedFiles, maxFiles, maxSizeBytes, onFilesUploaded]
  );

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
  };

  const removeFile = (index: number) => {
    const newFiles = uploadedFiles.filter((_, i) => i !== index);
    setUploadedFiles(newFiles);
    onFilesUploaded(newFiles);
  };

  const clearAll = () => {
    setUploadedFiles([]);
    onFilesUploaded([]);
    setError(null);
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  return (
    <div className="space-y-3">
      <div
        className={`relative border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
          dragActive
            ? "border-blue-500 bg-blue-500/10"
            : "border-gray-700 hover:border-gray-600"
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          ref={fileRef}
          type="file"
          multiple
          accept={acceptedTypes?.join(",")}
          onChange={handleChange}
          className="hidden"
        />
        <div className="space-y-2">
          <svg className="mx-auto h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <p className="text-sm text-gray-400">
            将文件拖到这里，或{" "}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="text-blue-400 hover:text-blue-300"
            >
              浏览
            </button>
          </p>
          <p className="text-xs text-gray-500">
            最多 {maxFiles} 个文件，每个不超过 {Math.round(maxSizeBytes / 1024)}KB
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-800 rounded p-2 text-xs text-red-300">
          {error}
        </div>
      )}

      {uploading && (
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <div className="animate-spin h-4 w-4 border-2 border-gray-400 border-t-transparent rounded-full" />
          正在处理文件...
        </div>
      )}

      {uploadedFiles.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">已上传 {uploadedFiles.length} 个文件</span>
            <button onClick={clearAll} className="text-xs text-red-400 hover:text-red-300">
              全部清空
            </button>
          </div>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {uploadedFiles.map((file, index) => (
              <div key={index} className="flex items-center justify-between bg-gray-800 rounded px-3 py-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs text-gray-500">{file.language}</span>
                  <span className="text-sm text-white truncate">{file.name}</span>
                  <span className="text-xs text-gray-500">{formatSize(file.size)}</span>
                </div>
                <button
                  onClick={() => removeFile(index)}
                  className="text-xs text-gray-500 hover:text-red-400 ml-2"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
