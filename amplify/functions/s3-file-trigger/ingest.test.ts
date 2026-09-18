import { describe, expect, it } from 'vitest';
import {
  UPLOAD_POLICY,
  classifyUpload,
  extensionOf,
  parseUploadKey,
  shortHash,
  validateUpload,
} from './ingest';

describe('parseUploadKey', () => {
  it('splits uploads/<entity>/<file…>', () => {
    expect(parseUploadKey('uploads/case-1/abc-IMG_0401.jpg')).toEqual({
      prefix: 'uploads',
      entityId: 'case-1',
      fileName: 'abc-IMG_0401.jpg',
    });
    expect(parseUploadKey('uploads/case-1/nested/dir/file.mov')?.fileName).toBe('nested/dir/file.mov');
  });
  it('rejects other prefixes and incomplete keys', () => {
    expect(parseUploadKey('logos/org/logo.png')).toBeNull();
    expect(parseUploadKey('uploads/case-1/')).toBeNull();
    expect(parseUploadKey('uploads/')).toBeNull();
  });
});

describe('classifyUpload', () => {
  it('uses the stored content type first', () => {
    expect(classifyUpload('video/quicktime', 'clip.bin')).toEqual({ cls: 'video', contentType: 'video/quicktime' });
    expect(classifyUpload('image/jpeg; charset=binary', 'x')).toEqual({ cls: 'image', contentType: 'image/jpeg' });
  });
  it('falls back to the extension for opaque types', () => {
    expect(classifyUpload('application/octet-stream', 'IMG_0431.MOV')?.cls).toBe('video');
    expect(classifyUpload('', 'photo.HEIC')?.cls).toBe('image');
    expect(classifyUpload(undefined, 'report.pdf')?.cls).toBe('document');
  });
  it('rejects unknown types and extensions', () => {
    expect(classifyUpload('application/x-msdownload', 'tool.exe')).toBeNull();
    expect(classifyUpload('', 'archive.zip')).toBeNull();
    expect(classifyUpload('text/html', 'page.html')).toBeNull();
  });
  it('extensionOf handles paths and missing extensions', () => {
    expect(extensionOf('a/b/c.TIF')).toBe('tif');
    expect(extensionOf('noext')).toBe('');
  });
});

describe('validateUpload', () => {
  it('accepts allowlisted media within the class cap', () => {
    expect(validateUpload({ contentType: 'image/jpeg', fileName: 'a.jpg', sizeBytes: 12_000_000 })).toEqual({
      ok: true,
      cls: 'image',
      contentType: 'image/jpeg',
    });
  });
  it('rejects empty files, unsupported types and oversize files with a message', () => {
    expect(validateUpload({ contentType: 'image/jpeg', fileName: 'a.jpg', sizeBytes: 0 })).toEqual({
      ok: false,
      message: 'Empty file',
    });
    const bad = validateUpload({ contentType: 'application/zip', fileName: 'a.zip', sizeBytes: 10 });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.message).toMatch(/Unsupported file type/);
    const big = validateUpload({ contentType: 'image/png', fileName: 'a.png', sizeBytes: UPLOAD_POLICY.image.maxBytes + 1 });
    expect(big.ok).toBe(false);
    if (!big.ok) expect(big.message).toMatch(/image exceeds/);
  });
  it('video cap is large enough for multi-GB drone clips', () => {
    expect(UPLOAD_POLICY.video.maxBytes).toBeGreaterThan(4 * 1024 ** 3);
  });
});

describe('shortHash', () => {
  it('abbreviates a 64-hex digest', () => {
    expect(shortHash('a'.repeat(60) + 'bcde')).toBe('aaaaaaaa…bcde');
  });
});
