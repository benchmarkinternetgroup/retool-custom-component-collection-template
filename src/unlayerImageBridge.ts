/**
 * Unlayer image bridge (NXG-3171, Phase 5.6).
 *
 * Routes Unlayer's File Manager hooks (image upload / userUploads library / image:removed)
 * through the Retool app instead of Unlayer's managed upload, so template images land under
 * `template-uploads/` via the BME admin endpoint rather than the bucket root (FR-021).
 *
 * Architecture (approach #2 — delegated to Retool queries): the component does NOT call the
 * BME API directly. Each Unlayer hook is turned into a request → event → Retool query → result
 * round-trip correlated by a `requestId`. Because a Retool custom component can only talk to the
 * app through serializable state + payload-less events, binary is base64-encoded and the actual
 * HTTP call is performed by Retool queries (which hold the admin token in the `Admin APIs` resource).
 *
 * Logic for filename-extension inference, file→image mapping and placeholder-on-failure is ported
 * from the reference implementation `bme-nxg-app/src/utils/unlayerFileStorage.ts`.
 */

/** Public file URL shown when an upload fails — keeps Unlayer's `done` terminal so the editor never hangs. */
const PLACEHOLDER_IMAGE_URL = 'https://cdn.tools.unlayer.com/image/placeholder.png'

/** API hard cap (bme-nxg-api FILE_UPLOAD_MAX_SIZE_BYTES = 10 MB). Reject before base64-ing what the API would refuse. */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
  'image/webp': '.webp',
}

// ---------------------------------------------------------------------------
// Cross-boundary payload shapes (must match the doc's bridge contract + Part 2 wiring)
// ---------------------------------------------------------------------------

/** Retool-native file object — the shape `fileButton`/`fileDropzone` produce, consumed directly by a form-data File part. */
export type RetoolFileObject = {
  name: string
  type: string
  sizeBytes: number
  base64Data: string
}

export type ImageUploadRequest = {
  requestId: string
  file: RetoolFileObject
}

export type UserUploadsRequest = {
  requestId: string
  page: number
  perPage: number
}

export type ImageRemoveRequest = {
  requestId: string
  fileId: string
}

export type ImageUploadResult = {
  requestId: string
  url?: string
  error?: string
}

/** One entry of the GET /template-image `files` array. width/height are best-effort (a probe may return none). */
export type TemplateImageFile = {
  fileId: string
  url: string
  originalName?: string
  mimeType?: string
  fileSize?: number
  createdAt?: string
  width?: number
  height?: number
}

export type UserUploadsResult = {
  requestId: string
  files?: TemplateImageFile[]
  total?: number
  page?: number
  perPage?: number
  error?: string
}

export type ImageRemoveResult = {
  requestId: string
  error?: string
}

/** Set outbound state + fire the matching event. Supplied by the React hook. */
export type BridgeHandlers = {
  dispatchUpload: (req: ImageUploadRequest) => void
  dispatchList: (req: UserUploadsRequest) => void
  dispatchRemove: (req: ImageRemoveRequest) => void
}

// ---------------------------------------------------------------------------
// Unlayer hook surface (subset we use; see unlayer-types/embed.d.ts:3066-3069)
// ---------------------------------------------------------------------------

type UnlayerImageDone = (opts: { progress?: number; url?: string }) => void
type UnlayerImageUploadFile = { attachments?: File[] }

type UnlayerUserUploadImage = {
  id: string | number
  location: string
  width?: number
  height?: number
  contentType?: string
  source: 'user'
  size?: number
}
type UnlayerUserUploadParams = { page?: number; perPage?: number }
type UnlayerUserUploadsDone = (
  images: UnlayerUserUploadImage[],
  meta?: { hasMore?: boolean; page?: number; perPage?: number; total?: number }
) => void

type UnlayerImageRemovedPayload = { id: string | number }

export type UnlayerWithFileStorage = {
  registerCallback(event: 'image', fn: (file: UnlayerImageUploadFile, done: UnlayerImageDone) => void): void
  registerCallback(event: 'image:removed', fn: (image: UnlayerImageRemovedPayload, done: () => void) => void): void
  registerProvider(name: 'userUploads', fn: (params: UnlayerUserUploadParams, done: UnlayerUserUploadsDone) => void): void
}

// ---------------------------------------------------------------------------
// Single-flight FIFO queue: one request of a given op is in flight at a time.
// Unlayer can fire `image` several times at once (multi-file drag); serializing dispatch
// keeps at most one base64 blob in the Retool model and makes requestId correlation safe.
// ---------------------------------------------------------------------------

type QueueItem<TResult> = {
  requestId: string
  dispatch: () => void
  settle: (result: TResult) => void
}

class OpQueue<TResult extends { requestId: string }> {
  private readonly pending: QueueItem<TResult>[] = []
  private current: QueueItem<TResult> | null = null

  enqueue(item: QueueItem<TResult>): void {
    this.pending.push(item)
    this.pump()
  }

  /** Resolve the in-flight request. Stale/unknown requestIds are ignored. */
  resolve(result: TResult): void {
    if (!this.current || this.current.requestId !== result.requestId) {
      return
    }
    const { settle } = this.current
    this.current = null
    try {
      settle(result)
    } finally {
      this.pump()
    }
  }

  private pump(): void {
    if (this.current || this.pending.length === 0) {
      return
    }
    this.current = this.pending.shift() ?? null
    this.current?.dispatch()
  }
}

// ---------------------------------------------------------------------------
// Helpers (ported from unlayerFileStorage.ts)
// ---------------------------------------------------------------------------

function newRequestId(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID()
  }
  // Fallback for environments without crypto.randomUUID.
  return 'req-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function getFileNameSegment(fileName: string): string {
  const normalized = fileName.replace(/\\/g, '/')
  const lastSlash = normalized.lastIndexOf('/')
  return lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized
}

/** Extension without leading dot, or undefined when none (no dot, or only a leading dot). */
function getExtensionFromFileName(fileName: string): string | undefined {
  const segment = getFileNameSegment(fileName)
  const lastDot = segment.lastIndexOf('.')
  if (lastDot <= 0) {
    return undefined
  }
  const ext = segment.slice(lastDot + 1)
  return ext ? ext.toLowerCase() : undefined
}

function getBasenameWithoutExtension(fileName: string): string {
  const segment = getFileNameSegment(fileName)
  const lastDot = segment.lastIndexOf('.')
  return lastDot <= 0 ? segment : segment.slice(0, lastDot)
}

function extensionDotForMime(mime: string): string | undefined {
  return MIME_TO_EXT[mime.trim().toLowerCase()]
}

/** If the filename has no extension, append one from `file.type` when known. */
function ensureUploadFileHasExtension(upload: File): File {
  if (getExtensionFromFileName(upload.name) !== undefined) {
    return upload
  }
  const extDot = extensionDotForMime(upload.type)
  if (!extDot) {
    console.warn('[unlayer image bridge] No filename extension and unknown/empty MIME; uploading as-is.', {
      fileName: upload.name,
      mimeType: upload.type,
    })
    return upload
  }
  const base = getBasenameWithoutExtension(upload.name) || 'upload'
  return new File([upload], `${base}${extDot}`, { type: upload.type })
}

/** Read a File as raw base64 (the `data:...;base64,` prefix stripped). */
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result)
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'))
    reader.readAsDataURL(file)
  })
}

function mapFileToUnlayerImage(file: TemplateImageFile): UnlayerUserUploadImage {
  return {
    id: file.fileId,
    location: file.url,
    width: file.width,
    height: file.height,
    contentType: file.mimeType,
    source: 'user',
    size: file.fileSize,
  }
}

function finishUploadWithoutUrl(done: UnlayerImageDone): void {
  done({ progress: 100, url: PLACEHOLDER_IMAGE_URL })
}

// ---------------------------------------------------------------------------
// Bridge controller
// ---------------------------------------------------------------------------

export type ImageBridge = {
  /** Register the three Unlayer hooks on an editor instance. Idempotent per instance is the caller's concern. */
  register: (unlayer: UnlayerWithFileStorage) => void
  resolveUpload: (result: ImageUploadResult) => void
  resolveList: (result: UserUploadsResult) => void
  resolveRemove: (result: ImageRemoveResult) => void
}

/**
 * Create a bridge controller. `getHandlers` is read lazily on each dispatch so the controller can
 * live in a stable ref while always using the latest Retool setters/event triggers.
 */
export function createUnlayerImageBridge(getHandlers: () => BridgeHandlers): ImageBridge {
  const uploadQueue = new OpQueue<ImageUploadResult>()
  const listQueue = new OpQueue<UserUploadsResult>()
  const removeQueue = new OpQueue<ImageRemoveResult>()

  function register(unlayer: UnlayerWithFileStorage): void {
    // Toolbar upload, drag-and-drop and clipboard paste all funnel through the `image` callback.
    unlayer.registerCallback('image', (file, done) => {
      const upload = file.attachments?.[0]
      if (!upload) {
        console.error('[unlayer image bridge] No file in upload callback.')
        finishUploadWithoutUrl(done)
        return
      }
      if (upload.size > MAX_UPLOAD_BYTES) {
        console.error('[unlayer image bridge] File exceeds 10 MB limit; not uploading.', { size: upload.size })
        finishUploadWithoutUrl(done)
        return
      }

      void (async () => {
        let fileObject: RetoolFileObject
        try {
          const withExt = ensureUploadFileHasExtension(upload)
          const base64Data = await readFileAsBase64(withExt)
          fileObject = { name: withExt.name, type: withExt.type, sizeBytes: withExt.size, base64Data }
        } catch (e) {
          console.error('[unlayer image bridge] Failed to read file for upload.', e)
          finishUploadWithoutUrl(done)
          return
        }

        const requestId = newRequestId()
        uploadQueue.enqueue({
          requestId,
          dispatch: () => getHandlers().dispatchUpload({ requestId, file: fileObject }),
          settle: (result) => {
            if (result.url) {
              done({ progress: 100, url: result.url })
            } else {
              console.error('[unlayer image bridge] Upload failed.', result.error)
              finishUploadWithoutUrl(done)
            }
          },
        })
      })()
    })

    // Library panel ("Uploads" tab).
    unlayer.registerProvider('userUploads', (params, done) => {
      const page = params.page || 1
      const perPage = params.perPage || 20
      const requestId = newRequestId()
      listQueue.enqueue({
        requestId,
        dispatch: () => getHandlers().dispatchList({ requestId, page, perPage }),
        settle: (result) => {
          if (result.error || !result.files) {
            console.error('[unlayer image bridge] Could not load uploads.', result.error)
            done([], { hasMore: false, page, perPage })
            return
          }
          const total = result.total ?? 0
          done(result.files.map(mapFileToUnlayerImage), {
            hasMore: page * perPage < total,
            page,
            perPage,
            total,
          })
        },
      })
    })

    // Removing an image from the library (soft-delete server-side).
    unlayer.registerCallback('image:removed', (image, done) => {
      const fileId = String(image.id)
      const requestId = newRequestId()
      removeQueue.enqueue({
        requestId,
        dispatch: () => getHandlers().dispatchRemove({ requestId, fileId }),
        // Mirror the reference: only confirm removal on success; on failure leave the thumbnail in place.
        settle: (result) => {
          if (result.error) {
            console.error('[unlayer image bridge] Could not delete the file.', result.error)
            return
          }
          done()
        },
      })
    })
  }

  return {
    register,
    resolveUpload: (result) => uploadQueue.resolve(result),
    resolveList: (result) => listQueue.resolve(result),
    resolveRemove: (result) => removeQueue.resolve(result),
  }
}
