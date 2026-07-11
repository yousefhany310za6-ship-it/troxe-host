"use client";

import { useState, useRef, useCallback } from "react";
import useSWR from "swr";
import { fetchApi, sanitizeFilename } from "@/lib/api";
import Editor from "@monaco-editor/react";
import {
  Upload,
  FilePlus,
  FolderPlus,
  Pencil,
  Trash2,
  ChevronRight,
  X,
  Save,
  Loader2,
  Hash,
  Download,
  CheckSquare,
  Square,
  Archive,
  ArchiveRestore,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import FileIcon from "@/components/file-icon";
import DropdownMenu from "@/components/dropdown-menu";
import ConfirmModal from "@/components/confirm-modal";

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

function detectLanguage(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    js: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript",
    json: "json", jsonc: "json", jsonl: "json",
    py: "python", pyw: "python",
    rs: "rust", go: "go", rb: "ruby", php: "php",
    java: "java", kt: "kotlin", swift: "swift", cs: "csharp",
    c: "c", h: "c", cpp: "cpp", hpp: "cpp", cc: "cpp", cxx: "cpp",
    css: "css", scss: "scss", less: "less",
    html: "html", htm: "html", xml: "xml", svg: "xml",
    md: "markdown", mdx: "markdown",
    sh: "shell", bash: "shell", zsh: "shell", fish: "shell", ps1: "powershell",
    yml: "yaml", yaml: "yaml",
    toml: "ini", ini: "ini", cfg: "ini", conf: "ini",
    sql: "sql", graphql: "graphql", gql: "graphql",
    dockerfile: "dockerfile",
    makefile: "makefile",
    env: "dotenv",
    txt: "plaintext", log: "plaintext",
    gitignore: "plaintext", gitattributes: "plaintext",
    lock: "json",
  };
  return map[ext] || "plaintext";
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
  const [lineCount, setLineCount] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<{ type: "single" | "bulk" } | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ fileName: string; loaded: number; total: number; percent: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<any>(null);
  const pendingDeleteRef = useRef<string[]>([]);

  const { data, error, isLoading, mutate } = useSWR<{ files: FileEntry[] }>(
    `/api/v1/servers/${id}/files/list?path=${encodeURIComponent(path)}`,
    (url: string) => fetchApi<{ files: FileEntry[] }>(url)
  );
  const files = data?.files;

  const pathParts = path ? path.split("/").filter(Boolean) : [];
  const allSelected = files && files.length > 0 && selected.size === files.length;

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

  function toggleSelect(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function toggleSelectAll() {
    if (!files) return;
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(files.map((f) => f.name)));
    }
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
      setLineCount((data.content || "").split("\n").length);
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

  function handleDelete(name: string) {
    setConfirmTarget({ type: "single" });
    pendingDeleteRef.current = [name];
    setConfirmOpen(true);
  }

  async function executeDelete() {
    const names = pendingDeleteRef.current;
    if (!names || names.length === 0) return;
    try {
      await Promise.all(
        names.map((name) =>
          fetchApi(`/api/v1/servers/${id}/files/${fullPath(name)}`, { method: "DELETE" })
        )
      );
      setSelected((prev) => {
        const n = new Set(prev);
        names.forEach((name) => n.delete(name));
        return n;
      });
      mutate();
    } catch {}
  }

  function handleDeleteSelected() {
    const names = Array.from(selected);
    if (names.length === 0) return;
    setConfirmTarget({ type: "bulk" });
    pendingDeleteRef.current = names;
    setConfirmOpen(true);
  }

  async function handleDownload(name: string) {
    try {
      const data = await fetchApi<FileContent>(
        `/api/v1/servers/${id}/files/${fullPath(name)}`
      );
      const blob = new Blob([data.content || ""], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = sanitizeFilename(name);
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Download failed");
    }
  }

  async function handleDownloadSelected() {
    const names = Array.from(selected);
    for (const name of names) {
      await handleDownload(name);
    }
  }

  async function handleCompress(name: string) {
    try {
      await fetchApi(`/api/v1/servers/${id}/files/compress`, {
        method: "POST",
        body: JSON.stringify({ path: fullPath(name) }),
      });
      mutate();
    } catch {
      alert("Compression failed");
    }
  }

  async function handleCompressSelected() {
    const names = Array.from(selected).filter((n) => {
      const f = files?.find((fe) => fe.name === n);
      return f?.type === "file";
    });
    for (const name of names) {
      await handleCompress(name);
    }
  }

  async function handleDecompress(name: string) {
    try {
      await fetchApi(`/api/v1/servers/${id}/files/decompress`, {
        method: "POST",
        body: JSON.stringify({ path: fullPath(name) }),
      });
      mutate();
    } catch {
      alert("Decompression failed");
    }
  }

  async function handleDecompressSelected() {
    const archiveExts = [".zip", ".gz", ".tar", ".tgz", ".tar.gz", ".tar.bz2", ".tar.xz", ".bz2", ".xz"];
    const names = Array.from(selected).filter((n) => archiveExts.some((ext) => n.toLowerCase().endsWith(ext)));
    for (const name of names) {
      await handleDecompress(name);
    }
  }

  async function handleRename(oldName: string) {
    const newName = renameValue.trim();
    if (!newName || newName === oldName) {
      setRenaming(null);
      return;
    }
    try {
      await fetchApi(`/api/v1/servers/${id}/files/rename`, {
        method: "POST",
        body: JSON.stringify({ from: fullPath(oldName), to: fullPath(newName) }),
      });
      setRenaming(null);
      mutate();
    } catch {
      alert("Rename failed");
    }
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

    const file = fileList[0];
    const total = file.size;
    const fileName = file.name;

    setUploadProgress({ fileName, loaded: 0, total, percent: 0 });

    const formData = new FormData();
    for (let i = 0; i < fileList.length; i++) {
      formData.append("file", fileList[i]);
    }
    if (path) formData.append("path", path);

    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `/api/v1/servers/${id}/files/upload`);
        xhr.withCredentials = true;

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            setUploadProgress({ fileName, loaded: e.loaded, total: e.total, percent });
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Upload failed: ${xhr.status}`));
          }
        };

        xhr.onerror = () => reject(new Error("Upload failed"));
        xhr.send(formData);
      });
      mutate();
    } catch {
      alert("Upload failed");
    } finally {
      setUploadProgress(null);
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [id, path, mutate]);

  // Editor view
  if (editingFile) {
    return (
      <div className="flex flex-col h-[70vh] md:h-full">
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleUpload} />
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <FileIcon filename={editingFile} className="h-5 w-5 flex-shrink-0" />
            <h1 className="text-lg sm:text-2xl font-bold truncate">{editingFile}</h1>
            <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full flex-shrink-0">
              {detectLanguage(editingFile)}
            </span>
            {lineCount > 0 && (
              <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full flex-shrink-0 hidden sm:flex items-center gap-1">
                <Hash className="h-3 w-3" />
                {lineCount} lines
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button variant="outline" size="sm" onClick={() => setEditingFile(null)}>
              <X className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline">Close</span>
            </Button>
            <Button size="sm" onClick={saveFile} disabled={saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 sm:mr-1.5 animate-spin" />
              ) : (
                <Save className="h-4 w-4 sm:mr-1.5" />
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
            <Editor
              language={detectLanguage(editingFile)}
              value={fileContent}
              theme="vs-dark"
              onChange={(value) => {
                setFileContent(value || "");
                setLineCount((value || "").split("\n").length);
              }}
              onMount={(editor) => {
                editorRef.current = editor;
                editor.addCommand(2048 | 49, () => saveFile());
                editor.focus();
              }}
              options={{
                fontSize: 13,
                fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace",
                fontLigatures: true,
                lineNumbers: "on",
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
                wordWrap: "on",
                padding: { top: 12 },
                renderWhitespace: "selection",
                bracketPairColorization: { enabled: true },
                cursorBlinking: "smooth",
                smoothScrolling: true,
              }}
              className="flex-1 min-h-0"
            />
          )}
        </Card>
        <p className="text-xs text-muted-foreground mt-2">Press Ctrl+S to save</p>
      </div>
    );
  }

  // File listing
  return (
    <div className="space-y-4">
      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleUpload} />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <FileIcon filename=".folder" isDirectory className="h-5 w-5" />
          <h1 className="text-2xl font-bold">Files</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setShowNewFile(true)}>
            <FilePlus className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline">New File</span>
            <span className="sm:hidden">File</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowNewFolder(true)}>
            <FolderPlus className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline">New Folder</span>
            <span className="sm:hidden">Folder</span>
          </Button>
          <Button size="sm" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4 sm:mr-1.5" />
            Upload
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-1 text-sm">
        <button onClick={() => setPath("")} className="text-muted-foreground hover:text-foreground transition-colors">
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

      {uploadProgress && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Loader2 className="h-4 w-4 animate-spin text-brand-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium truncate">{uploadProgress.fileName}</span>
                  <span className="text-xs text-muted-foreground ml-2 flex-shrink-0">
                    {uploadProgress.percent}% — {(uploadProgress.loaded / 1024).toFixed(1)} / {(uploadProgress.total / 1024).toFixed(1)} KB
                  </span>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-brand-500 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress.percent}%` }}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {(showNewFile || showNewFolder) && (
        <Card>
          <CardContent className="p-4">
            <form
              onSubmit={(e) => { e.preventDefault(); showNewFile ? handleCreateFile() : handleCreateFolder(); }}
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
              <Button type="submit" size="sm">Create</Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => { setShowNewFile(false); setShowNewFolder(false); setNewName(""); }}
              >
                Cancel
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 p-3 bg-brand-500/10 border border-brand-500/30 rounded-lg">
          <span className="text-sm font-medium text-brand-400">{selected.size} selected</span>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={handleDownloadSelected}>
            <Download className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Download</span>
            <span className="sm:hidden">DL</span>
          </Button>
          <Button variant="outline" size="sm" onClick={handleCompressSelected}>
            <Archive className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Zip</span>
          </Button>
          <Button variant="outline" size="sm" onClick={handleDecompressSelected}>
            <ArchiveRestore className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Extract</span>
          </Button>
          <Button variant="destructive" size="sm" onClick={handleDeleteSelected}>
            <Trash2 className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Delete</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="w-10 px-4 sm:px-5 py-3">
                  <button onClick={toggleSelectAll} className="text-muted-foreground hover:text-foreground">
                    {allSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                  </button>
                </th>
                <th className="text-left px-2 sm:px-3 py-3 font-medium text-muted-foreground">Name</th>
                <th className="text-left px-2 sm:px-3 py-3 font-medium text-muted-foreground w-20 sm:w-32 hidden sm:table-cell">Size</th>
                <th className="text-left px-2 sm:px-3 py-3 font-medium text-muted-foreground w-36 sm:w-48 hidden md:table-cell">Modified</th>
                <th className="w-10 px-2 sm:px-3 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">Loading files...</td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-destructive">Failed to load files.</td>
                </tr>
              ) : files && files.length > 0 ? (
                files.map((entry) => (
                  <tr
                    key={entry.name}
                    className={`border-b border-border last:border-0 transition-colors ${
                      selected.has(entry.name) ? "bg-brand-500/5" : "hover:bg-secondary/50"
                    }`}
                  >
                    <td className="px-4 sm:px-5 py-3">
                      <button
                        onClick={() => toggleSelect(entry.name)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        {selected.has(entry.name) ? <CheckSquare className="h-4 w-4 text-brand-400" /> : <Square className="h-4 w-4" />}
                      </button>
                    </td>
                    <td className="px-2 sm:px-3 py-3">
                      {renaming === entry.name ? (
                        <form
                          onSubmit={(e) => { e.preventDefault(); handleRename(entry.name); }}
                          className="flex items-center gap-2"
                        >
                          <input
                            type="text"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            className="flex-1 min-w-0 bg-secondary border border-border rounded px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
                            autoFocus
                            onBlur={() => setRenaming(null)}
                          />
                          <Button type="submit" size="sm" variant="ghost" className="h-7 px-2">
                            <Save className="h-3.5 w-3.5" />
                          </Button>
                        </form>
                      ) : (
                        <button
                          onClick={() => handleClick(entry)}
                          className="flex items-center gap-2 sm:gap-3 text-left w-full"
                        >
                          <FileIcon filename={entry.name} isDirectory={entry.type === "directory"} className="h-5 w-5 flex-shrink-0" />
                          <div className="min-w-0">
                            <span className={`${entry.type === "directory" ? "font-medium" : ""} block truncate`}>
                              {entry.name}
                            </span>
                            <span className="text-xs text-muted-foreground sm:hidden">
                              {entry.type === "directory" ? "Folder" : formatBytes(entry.size)}
                            </span>
                          </div>
                        </button>
                      )}
                    </td>
                    <td className="px-2 sm:px-3 py-3 text-muted-foreground hidden sm:table-cell">
                      {entry.type === "directory" ? "–" : formatBytes(entry.size)}
                    </td>
                    <td className="px-2 sm:px-3 py-3 text-muted-foreground hidden md:table-cell">
                      {new Date(entry.modified).toLocaleString()}
                    </td>
                    <td className="px-2 sm:px-3 py-3">
                      <DropdownMenu
                        items={[
                          {
                            label: "Rename",
                            icon: <Pencil className="h-4 w-4" />,
                            onClick: () => {
                              setRenaming(entry.name);
                              setRenameValue(entry.name);
                            },
                          },
                          {
                            label: "Download",
                            icon: <Download className="h-4 w-4" />,
                            onClick: () => handleDownload(entry.name),
                            disabled: entry.type === "directory",
                          },
                          {
                            label: "Compress (Zip)",
                            icon: <Archive className="h-4 w-4" />,
                            onClick: () => handleCompress(entry.name),
                          },
                          ...(entry.type === "file" && [".zip",".gz",".tar",".tgz",".tar.gz",".tar.bz2",".tar.xz",".bz2",".xz"].some((ext) => entry.name.toLowerCase().endsWith(ext))
                            ? [{
                                label: "Extract",
                                icon: <ArchiveRestore className="h-4 w-4" />,
                                onClick: () => handleDecompress(entry.name),
                              }]
                            : []),
                          {
                            label: "Delete",
                            icon: <Trash2 className="h-4 w-4" />,
                            onClick: () => handleDelete(entry.name),
                            destructive: true,
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">This directory is empty.</td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <ConfirmModal
        open={confirmOpen}
        title={confirmTarget?.type === "bulk" ? `Delete ${pendingDeleteRef.current.length} item(s)?` : `Delete "${pendingDeleteRef.current[0]}"?`}
        description="This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          executeDelete();
          setConfirmOpen(false);
          setConfirmTarget(null);
          pendingDeleteRef.current = [];
        }}
        onCancel={() => {
          setConfirmOpen(false);
          setConfirmTarget(null);
          pendingDeleteRef.current = [];
        }}
      />
    </div>
  );
}
