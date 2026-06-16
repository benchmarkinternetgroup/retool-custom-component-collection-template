# NXG-3171 — ReTool Upload Cutover (Phase 5.6): Implementation Draft

**Ticket:** [NXG-3171](https://benchmark.atlassian.net/browse/NXG-3171) — *Retool: upload images from Unlayer component using template-image API*
**Phase plan:** `bme-nxg-docs/private-image-bucket/private-image-bucket-phase5.6-plan.md`
**API PR (already merged):** [bme-nxg-api#1379](https://github.com/benchmarkinternetgroup/bme-nxg-api/pull/1379)
**Status:** Draft for review

## Decision & scope

- **Architecture: Approach #2 — delegated to Retool queries.** The custom component does **not** call the BME API directly. It registers the Unlayer file-storage hooks and bridges each operation (upload / list / delete) out to the Retool app via component **state + events**; Retool queries (using the existing **`Admin APIs`** resource, which holds the admin token) perform the HTTP calls and feed results back into the component. The admin token never leaves Retool's resource config.
- **Editors in scope:** **both** the email editor (`UnlayerEditor` → Retool instance `unlayerEditor1`) and the signup-form editor (`UnlayerFormEditor` → `unlayerEditor2`).
- **Progress UX:** indeterminate (report `progress: 100` on completion only).
- **Stock/free photos:** left **enabled** (they insert external CDN URLs, no bucket write, so FR-021 is unaffected).
- **Component library version bump: v4 → v5.** This change adds new state/event fields, so deploying it publishes a new Retool **Custom Component Library** version. The "Support Admin" app currently pins **v4**; after deploy it must be repointed to **v5** (collection `3771b68f-f2cb-4f0e-aa55-7e7953e7bde6`). The new bridge fields (`imageUploadRequest`, `onImageUploadRequested`, …) **only exist on v5** — Part 2's query wiring can't be done until the instances are on v5 (or the live `retool-ccl dev` build). See the sequencing note below.

## Goal (why this work exists)

Today every in-design image (toolbar upload, drag-drop, paste) goes through Unlayer's **managed** upload, which PUTs to the **bucket root**. Phase 5.6 repoints all of it at `POST /api/admin/template-image`, so new images land under `template-uploads/` instead of the root — satisfying **FR-021** and unblocking the final migration sweep (5.7) and the root-deny flip (Phase 6).

> Out of scope / unchanged: the existing **save thumbnail** flow (`exportImage()` in `saveDesign`, stored as `imageUrl`). That is the template preview, a separate concern from in-design images, and is not touched.

---

## The API contract (PR #1379)

Mounted at `bme-nxg-api/api/index.js:233` → `app.use("/api/admin/template-image", adminTemplateImage)`, behind `adminSecurityContext` (admin JWT / `adm|` token).

| Op | Method & path | Request | Success response |
|----|---------------|---------|------------------|
| Upload | `POST /api/admin/template-image` | `multipart/form-data`, field **`file`** | `201` → `{ fileId, url, originalName, mimeType, fileSize, createdAt, width?, height? }` |
| List | `GET /api/admin/template-image?pageNumber={n}&pageSize={s}` | `pageSize` clamped **10–100**, `pageNumber` 1–1000 | `200` → `{ files: FileItem[], total, pageNumber, pageSize }` |
| Delete | `DELETE /api/admin/template-image/:fileId` | `:fileId` = **v4 UUID** | `204` (soft-delete; S3 object retained) |

`FileItem` (from `file-store-core.js → fileResourceFromDynamoItem`): `{ fileId, url, originalName, mimeType, fileSize, createdAt, width?, height? }`.

Constraints (`api/src/utility/helpers/file-upload-helper.js`):
- **Max size:** 10 MB (`FILE_UPLOAD_MAX_SIZE_BYTES`).
- **Allowed types:** `image/jpeg`, `image/png`, `image/gif`, `image/webp`.
- `url` is the **canonical public** `template-uploads/{fileId}/{name}` URL — never presigned. The upload callback consumes only `url`.
- Server generates the S3 key, so callers can never write to the root.
- Invalid type → `ModelValidationError` (`InvalidTypeError`); error body shape `{ errors: [{ errorType, ... }] }`.

**Reference implementation to mirror:** `bme-nxg-app/src/utils/unlayerFileStorage.ts` (`registerUnlayerFileStorageCallbacks`). Same three hooks, but it calls the user-facing `/file-upload` directly. We reuse its **logic** (extension inference, mapping, `hasMore = page*perPage < total`, placeholder-on-failure) but replace the direct `fetch` with the Retool bridge below.

---

## The bridge contract (shared interface — read this first)

`Retool.useEventCallback` **carries no payload** (per the SDK: "set state before firing an event, then reference that state in the handler"). So each Unlayer hook becomes a **request → event → Retool query → result** round-trip correlated by a `requestId`.

```
Unlayer hook fires (image / userUploads / image:removed)
        │  component generates requestId, stores the Unlayer `done` fn in a pending map,
        │  writes the request payload to an OUTBOUND state, then fires the event
        ▼
Retool event handler runs the matching query (Admin APIs resource → /api/admin/template-image)
        │  query returns { requestId, ...result | error }
        ▼
INBOUND result state (bound to {{ query.data }}) updates → component re-renders
        │  useEffect matches requestId in the pending map → calls the stored `done(...)`
        ▼
Unlayer continues (inserts image / renders library / removes thumbnail)
```

**Concurrency:** because each request channel is a single state field, the component runs a **single-flight FIFO queue per operation** — it writes the next request only after the current one's result returns. (Unlayer can fire `image` several times at once on multi-file drag.) `requestId` also guards against stale/late results.

### State & event fields the component exposes (per editor instance)

**Outbound** (component `setValue` → Retool reads; `inspector: 'hidden'`):

| Field | Type | Shape |
|-------|------|-------|
| `imageUploadRequest` | object | `{ requestId, file: { name, type, sizeBytes, base64Data } }` — `file` is a **Retool-native file object** (same shape `fileButton`/`fileDropzone` produce), so the form-data part consumes it directly. Cleared to `{ requestId: null }` after each result. |
| `userUploadsRequest` | object | `{ requestId, page, perPage }` |
| `imageRemoveRequest` | object | `{ requestId, fileId }` |

**Events** (component fires → Retool attaches a handler):

| Event | Fired when |
|-------|-----------|
| `onImageUploadRequested` | Unlayer `image` callback has a file ready to upload |
| `onUserUploadsRequested` | Unlayer `userUploads` provider requests a page |
| `onImageRemoveRequested` | Unlayer `image:removed` callback fires |

**Inbound** (Retool binds to `{{ query.data }}` → component reads; `inspector: 'text'`, component never writes these):

| Field | Type | Shape on success / failure |
|-------|------|----------------------------|
| `imageUploadResult` | object | `{ requestId, url }` / `{ requestId, error }` |
| `userUploadsResult` | object | `{ requestId, files, total, page, perPage }` / `{ requestId, error }` |
| `imageRemoveResult` | object | `{ requestId }` / `{ requestId, error }` |

> Rule: a field is one-directional. Outbound fields are written only by the component (builder must **not** bind them). Inbound fields are bound only by the builder (component must **not** `setValue` them).

---

## Rollout sequencing & versioning (v4 → v5)

The component library version bump makes ordering matter — the new fields don't exist on v4:

1. **Implement + deploy the component** → publishes CCL **v5** (Part 1). Or run `retool-ccl dev` for a live build to wire against first.
2. **In the app, repoint both instances to v5** (`unlayerEditor1`, `unlayerEditor2`) so the new state/event fields appear (Part 2 §2.0).
3. **Run the §2.5 multipart sanity check**, then **wire the queries, events, and result bindings** (Part 2 §2.1–§2.4).
4. **Verify** uploads land in `template-uploads/`; then BME runs the ≥72h root-write gate.

**Rollback is a version repoint, not a code revert:** if cutover breaks authoring, set the two instances back to **v4** — managed upload (and the existing thumbnail flow) resume immediately. New uploads return to the root, which is harmless pre-flip and caught by the Phase 5.7 sweep. The flip stays held until v5 is confirmed stable.

---

# PART 1 — Changes in the Unlayer component (I will implement)

Repo: `retool-custom-component-collection-template`.

### 1.1 New module: `src/unlayerImageBridge.ts`

A framework-agnostic helper, ported from `unlayerFileStorage.ts`, that registers the three Unlayer hooks but routes them through injected request/result callbacks instead of `fetch`. Responsibilities:

- `registerUnlayerImageBridge(unlayer, bridge)` where `bridge` supplies:
  - `requestUpload({ requestId, file: { name, type, sizeBytes, base64Data } })`
  - `requestList({ requestId, page, perPage })`
  - `requestRemove({ requestId, fileId })`
  - and a way to resolve results (pending-map keyed by `requestId`).
- `registerCallback('image', …)`: take `file.attachments[0]`; reuse `ensureUploadFileHasExtension` (filename-extension inference from MIME) from the reference; **read the File to base64** (`FileReader.readAsDataURL`, then strip the `data:…;base64,` prefix → raw base64); package as a **Retool-native file object** `{ name, type, sizeBytes, base64Data }`; enqueue an upload request; on result call `done({ progress: 100, url })`, or on failure `done({ progress: 100, url: <placeholder> })` (mirror `finishEditorImageUploadWithoutUrl`).
- `registerProvider('userUploads', …)`: enqueue a list request with `page`/`perPage`; on result map each file with `mapFileToUnlayerImage` → `{ id: fileId, location: url, width, height, contentType: mimeType, source: 'user', size: fileSize }` and call `done(images, { hasMore: page*perPage < total, page, perPage, total })`; on failure `done([], { hasMore: false, page, perPage })`.
- `registerCallback('image:removed', …)`: enqueue a remove request with `fileId = String(image.id)`; on result call `done()`.
- **Single-flight FIFO queue** per op (upload/list/delete), plus the `requestId` pending-map for correlation.
- `requestId` via `crypto.randomUUID()`.

Copy these helpers from the reference verbatim (logic unchanged): `ensureUploadFileHasExtension`, `getExtensionFromFileName`, `MIME_TO_EXT`, `mapFileToUnlayerImage`, placeholder-on-failure.

### 1.2 Shared hook wiring: `src/unlayerEditorShared.ts`

Add to `useUnlayerEditor`:

- **Outbound state:** `imageUploadRequest`, `userUploadsRequest`, `imageRemoveRequest` via `useStateObject({ name, inspector: 'hidden' })`.
- **Events:** `onImageUploadRequested`, `onUserUploadsRequested`, `onImageRemoveRequested` via `useEventCallback`.
- **Inbound state:** `imageUploadResult`, `userUploadsResult`, `imageRemoveResult` via `useStateObject({ name, inspector: 'text' })`.
- Three `useEffect`s — one per inbound result — that look up `result.requestId` in the pending map, resolve the stored Unlayer `done`, then advance that op's queue.
  - The upload effect additionally **clears the request state** after resolving — `setImageUploadRequest({ requestId: null })` — so the ~13 MB base64 payload is evicted from the Retool model instead of lingering until the next upload.
- A `registerImageBridge(unlayer)` function the editors call in `onReady`, wiring the bridge's request callbacks to (set outbound state → fire event) and exposing the pending map for the result effects. The set-then-fire ordering is safe: `setValue` and the event are both `postMessage`s to the host (ordered delivery), and Retool applies the state update before running the event handler — the pattern Retool's docs prescribe.

The base64 encoding the `image` callback performs before enqueuing:

```ts
const dataUrl = await new Promise<string>((res, rej) => {
  const r = new FileReader()
  r.onload = () => res(String(r.result))   // "data:image/png;base64,iVBORw0K..."
  r.onerror = rej
  r.readAsDataURL(fileWithExt)
})
const base64Data = dataUrl.split(',', 2)[1] // raw base64, prefix stripped
// → { requestId, file: { name: fileWithExt.name, type: fileWithExt.type, sizeBytes: fileWithExt.size, base64Data } }
```

### 1.3 Register in both editors, in `onReady`

In `onReady` (email) and `onReadyForm` (form), after the editor instance exists:

```ts
const unlayer = emailEditorRef.current?.editor
if (unlayer) registerImageBridge(unlayer)   // before loadDesign / user interaction
loadEmailDesignFromState()                   // existing
```

`emailEditorRef.current.editor` exposes `registerCallback` / `registerProvider` (confirmed in `unlayer-types/embed.d.ts:3066-3069`). Registering in `onReady` guarantees the custom `image` callback is in place before any user upload, so **no managed-upload path remains** — this is the FR-021 requirement. (Stock photos stay enabled per decision; they don't write to the bucket.)

### 1.4 Notes / edge cases handled in the component

- **Base64 transfer (the cost of approach #2):** binary can't cross the component iframe as a `File` — only serializable state can — so a 10 MB image becomes a ~13.3 MB base64 string in the Retool model. Mitigations: single-flight keeps only one blob in memory; the upload effect **clears the request after each result**; optionally reject >10 MB before encoding (the API rejects it anyway). (No client-side type check is required for correctness — the API rejects invalid types — but we may add a friendly pre-check mirroring the reference's `onInvalidImageType`.)
- **Failure path:** every hook must terminate Unlayer's `done` even on error (upload → placeholder URL; list → empty page; delete → no-op) so the editor never hangs.
- **Idempotency / stale results:** results whose `requestId` is not in the pending map are ignored.

### 1.5 Deploy — publishes Custom Component Library **v5**

`npm run deploy` (`npx retool-ccl deploy`) publishes a new CCL version. Because this change adds state/event fields, it lands as **v5** (current deployed version is **v4**). The new bridge fields are not visible to the app until each component instance is repointed to v5 (Part 2, §2.0). For iterating before deploy, `npm run dev` (`npx retool-ccl dev`) exposes a live build the app can target while wiring queries.

---

# PART 2 — Changes in the Retool app (you implement manually)

App: **Support Admin**. Resource: **`Admin APIs`** (`a9a4ce61-d305-4635-9fbe-0776286d6e8a`) — already wired with the admin token; existing admin queries set **no** `Authorization` header (auth is in the resource). URL base pattern: `https://api-{{ regionParam }}-a.{{ retoolContext.configVars.domain }}/api/admin/template-image`.

> Do everything below **twice — once per editor instance** (`unlayerEditor1` = email, `unlayerEditor2` = form). Below uses `unlayerEditor1`; duplicate with `unlayerEditor2` and a `…2` query-name suffix. (Or build a shared module-level set if you prefer; per-instance is simplest.)

### 2.0 Repoint the component instances to library v5 (do this first)

Once Part 1 is deployed, open each Unlayer component instance (`unlayerEditor1`, `unlayerEditor2`; collection `3771b68f-f2cb-4f0e-aa55-7e7953e7bde6`) and set its **library version to v5** (was v4). Until this is done, the new bridge fields (`imageUploadRequest`, `onImageUploadRequested`, `imageUploadResult`, …) won't be available to reference/bind. The existing props (`emailDesign`/`emailHtml`/`emailImage`/`projectId`/`triggerSave`) carry over unchanged.

### 2.1 Upload — `POST`

**REST query `uploadTemplateImageRest1`** (resource: Admin APIs)
- Method `POST`, URL `…/api/admin/template-image`.
- Body type **Form Data**, one part:
  - key `file`, type **File**, value = the component's file object **directly**:
    `{{ unlayerEditor1.imageUploadRequest.file }}`
  - The component already emits Retool's native file-object shape (`{ name, type, sizeBytes, base64Data }` — what `fileButton`/`fileDropzone` produce), so the File part consumes it with no reconstruction.
  - ⚠️ **Verify in your Retool version** (see §2.5): whether the File part wants the base64 key as `base64Data` (newer) vs `data` (older), and whether it wants **raw** base64 vs a full `data:` URL. If your version differs, it's a one-field change in the component, not the query.

**JS query `uploadTemplateImage1`** (wired to the component event):
```js
const req = unlayerEditor1.imageUploadRequest;
try {
  const res = await uploadTemplateImageRest1.trigger();
  return { requestId: req.requestId, url: res.url };
} catch (e) {
  return { requestId: req.requestId, error: e?.message ?? String(e) };
}
```

- **Event wiring:** component event **`onImageUploadRequested`** → run `uploadTemplateImage1`.
- **Result binding:** component inbound field **`imageUploadResult`** = `{{ uploadTemplateImage1.data }}`.

### 2.2 List (library panel) — `GET`

**REST query `listTemplateImagesRest1`**
- Method `GET`, URL `…/api/admin/template-image?pageNumber={{ unlayerEditor1.userUploadsRequest.page }}&pageSize={{ unlayerEditor1.userUploadsRequest.perPage }}`.

**JS query `listTemplateImages1`:**
```js
const req = unlayerEditor1.userUploadsRequest;
try {
  const res = await listTemplateImagesRest1.trigger();
  return { requestId: req.requestId, files: res.files, total: res.total, page: req.page, perPage: req.perPage };
} catch (e) {
  return { requestId: req.requestId, error: e?.message ?? String(e) };
}
```
- **Event:** **`onUserUploadsRequested`** → run `listTemplateImages1`.
- **Binding:** **`userUploadsResult`** = `{{ listTemplateImages1.data }}`.

### 2.3 Delete (library remove) — `DELETE`

**REST query `deleteTemplateImageRest1`**
- Method `DELETE`, URL `…/api/admin/template-image/{{ unlayerEditor1.imageRemoveRequest.fileId }}`.

**JS query `deleteTemplateImage1`:**
```js
const req = unlayerEditor1.imageRemoveRequest;
try {
  await deleteTemplateImageRest1.trigger();
  return { requestId: req.requestId };
} catch (e) {
  return { requestId: req.requestId, error: e?.message ?? String(e) };
}
```
- **Event:** **`onImageRemoveRequested`** → run `deleteTemplateImage1`.
- **Binding:** **`imageRemoveResult`** = `{{ deleteTemplateImage1.data }}`.

### 2.4 Query options
- Disable success toasters (`showSuccessToaster=false`), keep failure toasters off if you don't want noise (the component already surfaces failures to the editor). Match existing admin queries' conventions.
- Leave `runWhenModelUpdates=false` — these run only from events.

### 2.5 One-off multipart sanity check (do this first)
Before wiring all six instances, prove the multipart file-object shape: create a throwaway REST query posting a small file to `…/template-image` (Form Data, part `file`, value = a hardcoded `{ name, type, sizeBytes, base64Data }`) and confirm `201` + a `template-uploads/…` `url`. This settles both unknowns at once — the base64 key name (`base64Data` vs `data`) and raw-base64 vs `data:` URL. Whatever works here, mirror it in the component's file-object shape, then replicate the queries.

---

## Acceptance criteria (phase plan §3)

- [ ] New image uploaded in the ReTool editor lands under `template-uploads/` (not bucket root) — verified via the GET library / bucket.
- [ ] Library panel lists template images via GET; removing one calls DELETE (soft-delete).
- [ ] No Unlayer-managed upload path remains: confirm **toolbar upload, drag-drop, and clipboard paste** all route through the custom `image` callback, and the library uses `userUploads`. (Stock photos intentionally left enabled — external URLs, no bucket write.)
- [ ] Both email and form editors covered, both instances repointed to component library **v5**.
- [ ] BME verification gate: **zero** new root-level `PutObject`s by the ReTool upload identity over **≥72h** (CloudTrail/Athena), named-owner sign-off — this unblocks Phase 5.7 sweep and the flip.
- [ ] Rollback verified: repointing the two instances back to **v4** restores managed upload + authoring immediately (new uploads resume at root — harmless pre-flip, caught by 5.7 sweep).

---

## Open questions / verification items

1. **Retool file-object encoding** — base64 key name (`base64Data` vs `data` vs `contents`) and raw-base64 vs `data:` URL. Confirm via §2.5 before full wiring; whatever wins is a one-field change in the component's file object. *(Only real unknown.)*
2. **Unlayer File Manager / `userUploads` availability** — the reference app uses it, so the Unlayer project supports the library panel; confirm it's enabled for the project IDs used by the admin app.
3. **`region`/`domain` config vars** — the new queries reuse `regionParam` + `retoolContext.configVars.domain` exactly like existing admin queries; no new config expected.
4. **Per-instance vs shared queries** — draft assumes per-instance duplication (6 REST + 6 JS queries total). Say if you'd prefer a single shared set parameterized by a "which editor" state.
