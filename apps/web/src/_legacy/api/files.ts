import { deleteJson, parseHumanSizeToMB, request, withQuery } from "./core";

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modified: string;
}

export interface FileListResponse {
  path: string;
  entries: FileEntry[];
}

export interface FileStats {
  totalPhotos: number;
  totalVideos: number;
  usedMB: number;
  freeMB: number;
}

export interface MediaEvidenceLink {
  runId: string;
  manifestRef: string;
  protocolId?: string;
  protocolName?: string;
  runStatus?: string;
  stepNumber?: number;
  stepInstruction?: string;
  segmentId?: string;
  attemptId?: string;
  attemptNumber?: number;
  attemptStatus?: string;
  savedAt?: string;
  adherenceActions: string[];
  deviationCount: number;
}

export interface MediaFile {
  name: string;
  path: string;
  size: number;
  date: string;
  thumbnailUrl?: string;
  evidenceLinks: MediaEvidenceLink[];
  linkedRunCount: number;
  deviationCount: number;
}

export interface PhotoList {
  photos: MediaFile[];
}

export interface VideoList {
  videos: Array<MediaFile & { duration?: string }>;
}

const DEFAULT_MEDIA_PATH = "/sdcard/LabOS/media/";

function defaultMediaFilePath(name: string, path?: string) {
  return path ?? `${DEFAULT_MEDIA_PATH}${name}`;
}

export const fetchFileList = async (filePath: string): Promise<FileListResponse> => {
  const raw = await request<any>(withQuery("/api/files/list", { path: filePath }));
  return {
    path: raw.path ?? filePath,
    entries: (raw.entries ?? []).map((entry: any) => ({
      name: entry.name ?? "",
      path: entry.path ?? `${raw.path ?? ""}/${entry.name ?? ""}`,
      isDirectory: entry.isDirectory ?? false,
      size: entry.size ?? 0,
      modified: entry.modified ?? "",
    })),
  };
};

export const fetchFileStats = async (): Promise<FileStats> => {
  const raw = await request<any>("/api/files/stats");
  return {
    totalPhotos: raw.photoCount ?? 0,
    totalVideos: raw.videoCount ?? 0,
    usedMB: parseHumanSizeToMB(raw.totalSize),
    freeMB: parseHumanSizeToMB(raw.freeSpace),
  };
};

export const fetchPhotos = async (): Promise<PhotoList> => {
  const raw = await request<any>("/api/files/photos");
  return {
    photos: (raw.photos ?? []).map((photo: any) => ({
      name: photo.name ?? "",
      path: defaultMediaFilePath(photo.name ?? "", photo.path),
      size: photo.size ?? 0,
      date: photo.modified ?? photo.date ?? "",
      thumbnailUrl: photo.thumbnailUrl,
      evidenceLinks: photo.evidenceLinks ?? [],
      linkedRunCount: photo.linkedRunCount ?? 0,
      deviationCount: photo.deviationCount ?? 0,
    })),
  };
};

export const fetchVideos = async (): Promise<VideoList> => {
  const raw = await request<any>("/api/files/videos");
  return {
    videos: (raw.videos ?? []).map((video: any) => ({
      name: video.name ?? "",
      path: defaultMediaFilePath(video.name ?? "", video.path),
      size: video.size ?? 0,
      date: video.modified ?? video.date ?? "",
      duration: video.duration,
      thumbnailUrl: video.thumbnailUrl,
      evidenceLinks: video.evidenceLinks ?? [],
      linkedRunCount: video.linkedRunCount ?? 0,
      deviationCount: video.deviationCount ?? 0,
    })),
  };
};

export const deleteFile = (path: string) =>
  deleteJson<{ success: boolean }>("/api/files/delete", { path });
