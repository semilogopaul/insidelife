/**
 * The part of a multer file (memory storage) the promotions module reads. Declared here so the module doesn't depend
 * on `@types/multer`; `originalname` and `mimetype` are deliberately absent — they are client-controlled and unused.
 */
export interface UploadedMedia {
  readonly buffer: Buffer;
  readonly size: number;
}
