/**
 * The part of a multer file (memory storage) the promotions module reads. Declared here so the module doesn't depend
 * on `@types/multer`; `originalname` and `mimetype` are deliberately absent — they are client-controlled and unused.
 */
export interface UploadedMedia {
  readonly buffer: Buffer;
  readonly size: number;
}

/** The buyer's character, when they have one (brands may not): its id is stored, its @handle shown on the checkout. */
export interface Buyer {
  readonly id: string;
  readonly handle: string;
}
