"use client";

import { useState, useRef, useCallback } from "react";
import useSWR from "swr";
import { fetchApi } from "@/lib/api";
import {
  Folder,
  File,
  FileText,
  FileCode,
  FileImage,
  FileArchive,
  Upload,
  FilePlus,
  FolderPlus,
  Pencil,
  Trash2,
  ChevronRight,
  X,
  Save,
  Loader2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface FileEntry {
  name: string;
  type: "file" | "directory";
  size: number;
  modified: string;
}

interface FileContent {
  content: string;
  path: string;
}

function formatBytes(bytes: number) {
  if (bytes === 0) return "–";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(entry: FileEntry) {
  if (entry.type === "directory") return Folder;
  const ext = entry.name.split(".").pop()?.toLowerCase();
  if (["txt", "log", "md"].includes(ext || "")) return FileText;
  if (["js", "ts", "jsx", "tsx", "json", "yml", "yaml", "toml", "cfg", "conf", "ini", "sh", "env", "css", "html"].includes(ext || "")) return FileCode;
  if (["png", "jpg", "jpeg", "gif", "svg", "ico", "webp"].includes(ext || "")) return FileImage;
  if (["zip", "tar", "gz", "rar", "7z"].includes(ext || "")) return FileArchive;
  return File;
}

export default function FilesPage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = params;
  const [path, setPath] = useState("");
  const [showNewFile, setShowNewFile] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingFile, setEditingFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data, error, isLoading, mutate } = useSWR<{ files: FileEntry[] }>(
    `/api/v1/servers/${id}/files/list?path=${encodeURIComponent(path)}`,
    (url: string) => fetchApi<{ files: FileEntry[] }>(url)
  );
  const files = data?.files;

  const pathParts = path ? path.split("/").filter(Boolean) : [];

  function navigateTo(index: number) {
    setPath(pathParts.slice(0, index + 1).join("/"));
  }

  function handleClick(entry: FileEntry) {
    if (entry.type === "directory") {
      setPath(path ? `${path}/${entry.name}` : entry.name);
    } else {
      openEditor(entry.name);
    }
  }

  function fullPath(name: string) {
    return path ? `${path}/${name}` : name;
  }

  async function openEditor(name: string) {
    const filePath = fullPath(name);
    setLoadingFile(true);
    setEditingFile(filePath);
    try {
      const data = await fetchApi<FileContent>(
        `/api/v1/servers/${id}/files/${filePath}`
      );
      setFileContent(data.content || "");
    } catch {
      setFileContent("# Error loading file");
    } finally {
      setLoadingFile(false);
    }
  }

  async function saveFile() {
    if (!editingFile) return;
    setSaving(true);
    try {
      await fetchApi(`/api/v1/servers/${id}/files/${editingFile}`, {
        method: "PUT",
        body: JSON.stringify({ content: fileContent }),
      });
      setEditingFile(null);
      mutate();
    } catch {
      alert("Failed to save file");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(name: string) {
    if (!confirm(`Delete "${name}"?`)) return;
    try {
      await fetchApi(`/api/v1/servers/${id}/files/${fullPath(name)}`, {
        method: "DELETE",
      });
      mutate();
    } catch {}
  }

  async function handleCreateFile() {
    if (!newName.trim()) return;
    try {
      await fetchApi(`/api/v1/servers/${id}/files/create`, {
        method: "POST",
        body: JSON.stringify({ name: newName, type: "file", path: path || undefined }),
      });
      setNewName("");
      setShowNewFile(false);
      mutate();
    } catch {}
  }

  async function handleCreateFolder() {
    if (!newName.trim()) return;
    try {
      await fetchApi(`/api/v1/servers/${id}/files/create`, {
        method: "POST",
        body: JSON.stringify({ name: newName, type: "directory", path: path || undefined }),
      });
      setNewName("");
      setShowNewFolder(false);
      mutate();
    } catch {}
  }

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const formData = new FormData();
    for (let i = 0; i < fileList.length; i++) {
      formData.append("files", fileList[i]);
    }
    if (path) formData.append("path", path);

    try {
      await fetchApi(`/api/v1/servers/${id}/files/upload`, {
        method: "POST",
        body: formData as any,
      });
      mutate();
    } catch {
      alert("Upload failed");
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [id, path, mutate]);

  // File editor modal
  if (editingFile) {
    return (
      <div className="flex flex-col h-[70vh] md:h-full">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleUpload}
        />
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <FileCode className="h-5 w-5 text-muted-foreground flex-shrink-0" />
            <h1 className="text-2xl font-bold truncate">{editingFile}</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditingFile(null)}>
              <X className="h-4 w-4 mr-1.5" />
              Close
            </Button>
            <Button size="sm" onClick={saveFile} disabled={saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-1.5" />
              )}
              Save
            </Button>
          </div>
        </div>
        <Card className="flex-1 flex flex-col overflow-hidden min-h-0">
          {loadingFile ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              Loading...
            </div>
          ) : (
            <textarea
              ref={textareaRef}
              value={fileContent}
              onChange={(e) => setFileContent(e.target.value)}
              className="flex-1 w-full bg-[#0a0a0a] text-[#d4d4d4] p-4 font-mono text-sm resize-none focus:outline-none min-h-0"
              spellCheck={false}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "s") {
                  e.preventDefault();
                  saveFile();
                }
              }}
            />
          )}
        </Card>
        <p className="text-xs text-muted-foreground mt-2">
          Press Ctrl+S to save
        </p>
      </div>
    );
  }

  // File listing
  return (
    <div className="space-y-6">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleUpload}
      />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Folder className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-2xl font-bold">Files</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowNewFile(true)}>
            <FilePlus className="h-4 w-4 mr-1.5" />
            New File
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowNewFolder(true)}>
            <FolderPlus className="h-4 w-4 mr-1.5" />
            New Folder
          </Button>
          <Button size="sm" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4 mr-1.5" />
            Upload
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-1 text-sm">
        <button
          onClick={() => setPath("")}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          /
        </button>
        {pathParts.map((part, i) => (
          <div key={i} className="flex items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            <button
              onClick={() => navigateTo(i)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {part}
            </button>
          </div>
        ))}
      </div>

      {(showNewFile || showNewFolder) && (
        <Card>
          <CardContent className="p-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                showNewFile ? handleCreateFile() : handleCreateFolder();
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={showNewFile ? "filename.txt" : "folder-name"}
                className="flex-1 bg-secondary border border-border rounded-lg px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-500"
                autoFocus
              />
              <Button type="submit" size="sm">
                Create
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowNewFile(false);
                  setShowNewFolder(false);
                  setNewName("");
                }}
              >
                Cancel
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-6 py-3 font-medium text-muted-foreground">Name</th>
                <th className="text-left px-6 py-3 font-medium text-muted-foreground w-32">Size</th>
                <th className="text-left px-6 py-3 font-medium text-muted-foreground w-48">Modified</th>
                <th className="text-right px-6 py-3 font-medium text-muted-foreground w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-muted-foreground">
                    Loading files...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-destructive">
                    Failed to load files.
                  </td>
                </tr>
              ) : files && files.length > 0 ? (
                files.map((entry) => {
                  const Icon = getFileIcon(entry);
                  return (
                    <tr
                      key={entry.name}
                      className="border-b border-border last:border-0 hover:bg-secondary/50 transition-colors"
                    >
                      <td className="px-6 py-3">
                        <button
                          onClick={() => handleClick(entry)}
                          className="flex items-center gap-3 text-left"
                        >
                          <Icon className={`h-4 w-4 ${entry.type === "directory" ? "text-yellow-400" : "text-muted-foreground"}`} />
                          <span className={entry.type === "directory" ? "font-medium" : ""}>
                            {entry.name}
                          </span>
                        </button>
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">
                        {entry.type === "directory" ? "–" : formatBytes(entry.size)}
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">
                        {new Date(entry.modified).toLocaleString()}
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {entry.type === "file" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => openEditor(entry.name)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                            onClick={() => handleDelete(entry.name)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-muted-foreground">
                    This directory is empty.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
