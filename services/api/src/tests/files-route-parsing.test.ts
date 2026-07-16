import assert from "node:assert/strict";
import {
  normalizeLabosDevicePath,
  parseDirectoryEntries,
  parseStatDirectoryEntries,
  parseStatMediaEntries,
} from "../routes/files.js";

function main() {
  const lsEntries = parseDirectoryEntries(`
total 2034016
-rw-rw---- 1 root everybody    336793 2026-04-10 23:25 IMG_20260410_232532.jpg
drwxrwx--- 2 root everybody      4096 2026-04-10 22:42 videos
`);
  assert.equal(lsEntries.length, 2);
  assert.equal(lsEntries[0].name, "IMG_20260410_232532.jpg");
  assert.equal(lsEntries[0].size, 336793);
  assert.equal(lsEntries[1].isDirectory, true);

  const statEntries = parseStatDirectoryEntries(`
regular file\t/sdcard/LabOS/media/IMG_20260411_000139.jpg\t703651\t2026-04-11 00:01:39.976000002 +0000\t-rw-rw----
directory\t/sdcard/LabOS/media/streams\t4096\t2026-04-27 03:23:00.000000000 +0000\tdrwxrwx---
`);
  assert.equal(statEntries.length, 2);
  assert.equal(statEntries[0].path, "/sdcard/LabOS/media/IMG_20260411_000139.jpg");
  assert.equal(statEntries[0].modified, "2026-04-11 00:01");
  assert.equal(statEntries[1].isDirectory, true);

  const mediaEntries = parseStatMediaEntries(`
/sdcard/LabOS/media/IMG_20260411_000139.jpg\t703651\t2026-04-11 00:01:39.976000002 +0000
/sdcard/LabOS/media/VID_20260429_190855.mp4\t8210706\t2026-04-29 19:08:55.000000000 +0000
`);
  assert.equal(mediaEntries.length, 2);
  assert.equal(mediaEntries[0].name, "VID_20260429_190855.mp4");
  assert.equal(mediaEntries[0].path, "/sdcard/LabOS/media/VID_20260429_190855.mp4");
  assert.equal(mediaEntries[1].size, 703651);

  const androidEscapedMediaEntries = parseStatMediaEntries(
    String.raw`/sdcard/LabOS/media/VID_20260429_190855.mp4\t271234225\t2026-04-29 19:12:34.562823720 +0000`,
  );
  assert.equal(androidEscapedMediaEntries[0].name, "VID_20260429_190855.mp4");
  assert.equal(androidEscapedMediaEntries[0].size, 271234225);

  assert.equal(
    normalizeLabosDevicePath("/storage/emulated/0/LabOS/media/VID_20260429_190855.mp4"),
    "/sdcard/LabOS/media/VID_20260429_190855.mp4",
  );
  assert.equal(
    normalizeLabosDevicePath("/sdcard/LabOS/media/VID_20260429_190855.mp4"),
    "/sdcard/LabOS/media/VID_20260429_190855.mp4",
  );

  console.log("[files-route-parsing] all checks passed");
}

main();
