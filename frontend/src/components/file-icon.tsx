"use client";

interface FileIconProps {
  filename: string;
  isDirectory?: boolean;
  className?: string;
}

const EXT_MAP: Record<string, { color: string; label: string }> = {
  js:   { color: "#f7df1e", label: "JS" },
  jsx:  { color: "#61dafb", label: "JSX" },
  ts:   { color: "#3178c6", label: "TS" },
  tsx:  { color: "#3178c6", label: "TSX" },
  json: { color: "#f7df1e", label: "{ }" },
  jsonc:{ color: "#f7df1e", label: "{ }" },
  py:   { color: "#3572a5", label: "PY" },
  rb:   { color: "#cc342d", label: "RB" },
  go:   { color: "#00add8", label: "GO" },
  rs:   { color: "#dea584", label: "RS" },
  java: { color: "#b07219", label: "JV" },
  kt:   { color: "#a97bff", label: "KT" },
  swift:{ color: "#f05138", label: "SW" },
  c:    { color: "#555555", label: "C" },
  h:    { color: "#555555", label: "H" },
  cpp:  { color: "#f34b7d", label: "C++" },
  cs:   { color: "#178600", label: "C#" },
  php:  { color: "#4f5d95", label: "PHP" },
  html: { color: "#e34c26", label: "< >" },
  htm:  { color: "#e34c26", label: "< >" },
  xml:  { color: "#0060ac", label: "XML" },
  svg:  { color: "#ffb13b", label: "SVG" },
  css:  { color: "#563d7c", label: "CSS" },
  scss: { color: "#c6538c", label: "SC" },
  less: { color: "#1d365d", label: "LS" },
  md:   { color: "#083fa1", label: "MD" },
  mdx:  { color: "#fcb32c", label: "MX" },
  yml:  { color: "#cb171e", label: "YM" },
  yaml: { color: "#cb171e", label: "YM" },
  toml: { color: "#9c4124", label: "TM" },
  ini:  { color: "#7a7a7a", label: "IN" },
  cfg:  { color: "#7a7a7a", label: "CF" },
  conf: { color: "#7a7a7a", label: "CF" },
  env:  { color: "#ecd53f", label: "EN" },
  sh:   { color: "#89e051", label: "SH" },
  bash: { color: "#89e051", label: "SH" },
  zsh:  { color: "#89e051", label: "SH" },
  sql:  { color: "#e38c00", label: "SQL" },
  dockerfile: { color: "#2496ed", label: "DK" },
  makefile: { color: "#6d8086", label: "MK" },
  txt:  { color: "#6e7681", label: "TX" },
  log:  { color: "#6e7681", label: "LG" },
  png:  { color: "#a25ddf", label: "IMG" },
  jpg:  { color: "#a25ddf", label: "IMG" },
  jpeg: { color: "#a25ddf", label: "IMG" },
  gif:  { color: "#a25ddf", label: "IMG" },
  webp: { color: "#a25ddf", label: "IMG" },
  ico:  { color: "#a25ddf", label: "IMG" },
  zip:  { color: "#eca546", label: "ZP" },
  tar:  { color: "#eca546", label: "TAR" },
  gz:   { color: "#eca546", label: "GZ" },
  rar:  { color: "#eca546", label: "RAR" },
  "7z": { color: "#eca546", label: "7Z" },
  pdf:  { color: "#e23e2f", label: "PDF" },
  doc:  { color: "#2b5797", label: "DOC" },
  docx: { color: "#2b5797", label: "DOC" },
  xls:  { color: "#207245", label: "XLS" },
  xlsx: { color: "#207245", label: "XLS" },
  ppt:  { color: "#d04423", label: "PPT" },
  lock: { color: "#6e7681", label: "LCK" },
  gitignore: { color: "#f05032", label: "GI" },
  gitattributes: { color: "#f05032", label: "GA" },
};

const DIR_COLORS: Record<string, string> = {
  src: "#3b82f6",
  lib: "#8b5cf6",
  dist: "#6366f1",
  build: "#f97316",
  node_modules: "#22c55e",
  test: "#ef4444",
  tests: "#ef4444",
  __tests__: "#ef4444",
  spec: "#ef4444",
  docs: "#06b6d4",
  public: "#14b8a6",
  assets: "#f59e0b",
  config: "#64748b",
  scripts: "#a855f7",
  ".github": "#6e7681",
};

export default function FileIcon({ filename, isDirectory, className = "" }: FileIconProps) {
  if (isDirectory) {
    const dirColor = DIR_COLORS[filename.toLowerCase()] || "#546e7a";
    return (
      <svg viewBox="0 0 24 24" className={className} width="20" height="20">
        <path
          d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"
          fill={dirColor}
        />
      </svg>
    );
  }

  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const isDockerfile = filename.toLowerCase() === "dockerfile";
  const isMakefile = filename.toLowerCase() === "makefile";
  const isGitignore = filename.toLowerCase() === ".gitignore";
  const isGitAttr = filename.toLowerCase() === ".gitattributes";

  let match;
  if (isDockerfile) match = EXT_MAP.dockerfile;
  else if (isMakefile) match = EXT_MAP.makefile;
  else if (isGitignore) match = EXT_MAP.gitignore;
  else if (isGitAttr) match = EXT_MAP.gitattributes;
  else match = EXT_MAP[ext];

  const color = match?.color || "#6e7681";
  const label = match?.label || ext.toUpperCase().slice(0, 3) || "?";

  return (
    <svg viewBox="0 0 24 24" className={className} width="20" height="20">
      <path
        d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6z"
        fill={color}
        opacity="0.2"
      />
      <path
        d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5z"
        fill={color}
      />
      <text
        x="12"
        y="17"
        textAnchor="middle"
        fontSize="5.5"
        fontWeight="700"
        fontFamily="system-ui, sans-serif"
        fill="white"
      >
        {label}
      </text>
    </svg>
  );
}
