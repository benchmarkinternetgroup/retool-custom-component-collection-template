# NXG-3171 — Part 2: Retool App Manual (step-by-step)

**Audience:** ReTool maintainer implementing the image-upload cutover by hand in the **Support Admin** app.
**Prerequisite:** Part 1 deployed — custom component library **v5** is published (done 2026-06-16). Part 1 details: [`NXG-3171-image-upload-cutover.md`](./NXG-3171-image-upload-cutover.md).

## What you're building

The component (v5) now emits an image **upload / list / delete** request as component **state + an event**, and waits for a **result** you bind back. Your job: for each editor instance, create the queries that call `/api/admin/template-image`, wire them to the events, and bind their results back into the component.

- **Resource:** `Admin APIs` (`a9a4ce61-d305-4635-9fbe-0776286d6e8a`) — holds the admin token; **do not add an `Authorization` header**, the resource handles auth.
- **URL base:** `https://api-{{ regionParam }}-a.{{ retoolContext.configVars.domain }}/api/admin/template-image`
- **`regionParam` = `"us-west-2"` (constant).** The URL needs `regionParam`, but unlike the account-scoped admin queries there is no per-record region here — **template galleries are region-pinned to us-west-2** (every gallery bucket/table is `*-us-west-2` across all environments). So each REST query below references `{{ regionParam }}` and each JS wrapper passes `additionalScope: { regionParam: 'us-west-2' }`. *(Simpler alternative: hardcode `api-us-west-2-a.…` directly in each query URL and skip the additionalScope entirely — same result, since the region never varies for templates.)*
- **Editor instances:** `unlayerEditor1` (email, in `unlayerModal`) and `unlayerEditor2` (form, in `formUnlayerModal`).

### The component's v5 interface (read these names carefully)

| Direction | Field / event | Shape |
|-----------|---------------|-------|
| Outbound state | `imageUploadRequest` | `{ requestId, file: { name, type, sizeBytes, base64Data } }` |
| Outbound state | `userUploadsRequest` | `{ requestId, page, perPage }` |
| Outbound state | `imageRemoveRequest` | `{ requestId, fileId }` |
| Event | `onImageUploadRequested` | fires after a file is ready to upload |
| Event | `onUserUploadsRequested` | fires when the library needs a page |
| Event | `onImageRemoveRequested` | fires when an image is removed |
| Inbound (you bind) | `imageUploadResult` | `{ requestId, url }` or `{ requestId, error }` |
| Inbound (you bind) | `userUploadsResult` | `{ requestId, files, total, page, perPage }` or `{ requestId, error }` |
| Inbound (you bind) | `imageRemoveResult` | `{ requestId }` or `{ requestId, error }` |

> **Golden rule:** never bind the outbound `*Request` fields (the component owns them). Only bind the inbound `*Result` fields. The `requestId` round-trips so the component can match a result to the right pending upload — your result queries must echo it back (the JS snippets below do).

---

## Step 0 — Repoint both instances to v5

Do this first, or the new fields won't appear.

1. Open the **Support Admin** app in the editor.
2. Open the modal containing `unlayerEditor1` (email). Select the component.
3. In the inspector, find the **component version** selector and set it to **v5** (was v4). The collection is `UnlayerEditor` (`3771b68f-f2cb-4f0e-aa55-7e7953e7bde6`).
4. Repeat for `unlayerEditor2` (form) in `formUnlayerModal`.
5. Confirm the new fields are visible: select the component, the inspector should now list `imageUploadResult`, `userUploadsResult`, `imageRemoveResult` (editable text fields) and the events `On image upload requested`, etc. under event handlers.

Existing props (`emailDesign`, `emailHtml`, `emailImage`, `projectId`, `triggerSave`) carry over unchanged.

---

## Step 1 — Multipart sanity check (do this once, before wiring everything)

> ✅ **Confirmed 2026-06-17 (dev):** the shape below works as-is — `201`, file stored at `…/template-uploads/<uuid>/pixel.png`. Retool decoded **raw base64** from key **`base64Data`**, with `name` → filename and `type` → Content-Type. This is exactly what the v5 component emits, so **no component change is needed**. You can skip ahead to Step 2 (kept here for reference / other environments).

Prove the file-object shape works against the real endpoint before building six queries.

1. Create a temporary REST query `tmpUploadTest` on the **Admin APIs** resource.
2. Method **POST**, URL `…/api/admin/template-image`.
3. Body type **Form Data**, one entry:
   - Key: `file`
   - Type: **File**
   - Value:
     ```
     {{ { name: 'pixel.png', type: 'image/png', sizeBytes: 70,
          base64Data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' } }}
     ```
4. Run it. **Expected:** `201` with a body like `{ "fileId": "…", "url": "https://…/template-uploads/<uuid>/pixel.png", … }`.
5. If it fails on the file part, adjust the key names until it works:
   - base64 key: try `base64Data` → `data` → `contents`.
   - value: try raw base64 (above) → full data URL (`data:image/png;base64,iVBOR…`).
   - **Whatever wins, tell me** — if it isn't `base64Data` + raw base64, Part 1 needs a one-field change in the component's file object and a redeploy.
6. Delete `tmpUploadTest` once confirmed.

---

## Step 2 — Wire `unlayerEditor1` (email)

Create three REST queries, three JS queries, three event handlers, three result bindings.

### 2a. Upload (POST)

**REST query `uploadTemplateImageRest1`** (resource: Admin APIs)
- Method **POST**, URL `…/api/admin/template-image`.
- Body type **Form Data**, one entry:
  - Key `file`, Type **File**, Value: `{{ unlayerEditor1.imageUploadRequest.file }}`
    *(the component already emits the exact file-object shape that worked in Step 1)*.
- Run automatically when inputs change: **OFF**. Success/failure toasters: **OFF**.

**JS query `uploadTemplateImage1`:**
```js
const req = unlayerEditor1.imageUploadRequest;
try {
  const res = await uploadTemplateImageRest1.trigger({
    additionalScope: { regionParam: 'us-west-2' } // templates are region-pinned to us-west-2
  });
  return { requestId: req.requestId, url: res.url };
} catch (e) {
  return { requestId: req.requestId, error: e?.message ?? String(e) };
}
```

**Event handler:** select `unlayerEditor1` → Event handlers → **On image upload requested** → Action: **Run query** → `uploadTemplateImage1`.

**Result binding:** select `unlayerEditor1` → inspector field **`imageUploadResult`** → set to `{{ uploadTemplateImage1.data }}`.

### 2b. List / library (GET)

**REST query `listTemplateImagesRest1`**
- Method **GET**, URL:
  `…/api/admin/template-image?pageNumber={{ unlayerEditor1.userUploadsRequest.page }}&pageSize={{ unlayerEditor1.userUploadsRequest.perPage }}`
- Run automatically: **OFF**.

**JS query `listTemplateImages1`:**
```js
const req = unlayerEditor1.userUploadsRequest;
try {
  const res = await listTemplateImagesRest1.trigger({
    additionalScope: { regionParam: 'us-west-2' }
  });
  return { requestId: req.requestId, files: res.files, total: res.total, page: req.page, perPage: req.perPage };
} catch (e) {
  return { requestId: req.requestId, error: e?.message ?? String(e) };
}
```

**Event handler:** `unlayerEditor1` → **On user uploads requested** → Run query → `listTemplateImages1`.

**Result binding:** field **`userUploadsResult`** → `{{ listTemplateImages1.data }}`.

### 2c. Delete (DELETE)

**REST query `deleteTemplateImageRest1`**
- Method **DELETE**, URL `…/api/admin/template-image/{{ unlayerEditor1.imageRemoveRequest.fileId }}`.
- Run automatically: **OFF**.

**JS query `deleteTemplateImage1`:**
```js
const req = unlayerEditor1.imageRemoveRequest;
try {
  await deleteTemplateImageRest1.trigger({
    additionalScope: { regionParam: 'us-west-2' }
  });
  return { requestId: req.requestId };
} catch (e) {
  return { requestId: req.requestId, error: e?.message ?? String(e) };
}
```

**Event handler:** `unlayerEditor1` → **On image remove requested** → Run query → `deleteTemplateImage1`.

**Result binding:** field **`imageRemoveResult`** → `{{ deleteTemplateImage1.data }}`.

---

## Step 3 — Wire `unlayerEditor2` (form)

Repeat **all of Step 2**, replacing every `unlayerEditor1` → `unlayerEditor2` and every `…1` query name → `…2`. Each `…2` JS wrapper passes the same `additionalScope: { regionParam: 'us-west-2' }`. Six new queries:

| Op | REST query | JS query | Event | Binds `unlayerEditor2.…` |
|----|------------|----------|-------|--------------------------|
| Upload | `uploadTemplateImageRest2` | `uploadTemplateImage2` | On image upload requested | `imageUploadResult` = `{{ uploadTemplateImage2.data }}` |
| List | `listTemplateImagesRest2` | `listTemplateImages2` | On user uploads requested | `userUploadsResult` = `{{ listTemplateImages2.data }}` |
| Delete | `deleteTemplateImageRest2` | `deleteTemplateImage2` | On image remove requested | `imageRemoveResult` = `{{ deleteTemplateImage2.data }}` |

Each JS query reads `unlayerEditor2.imageUploadRequest` / `userUploadsRequest` / `imageRemoveRequest`.

---

## Step 4 — Test (both editors)

In a preview/edit session:

1. **Toolbar upload:** add an image block, upload a file → it appears in the editor; confirm its `src` is a `…/template-uploads/<uuid>/…` URL (not the bucket root, not a `cdn.tools.unlayer.com` URL).
2. **Drag-and-drop:** drag an image file onto the canvas → same result.
3. **Clipboard paste:** paste an image → same result.
4. **Library ("Uploads" tab):** open it → previously uploaded images list (via GET); paginate if you have >20.
5. **Remove from library:** delete one → it disappears (soft-delete; the GET no longer returns it).
6. **Failure sanity:** temporarily break the upload query (e.g. bad URL) and upload → the editor shows the placeholder image and doesn't hang; restore the query.
7. **Save flow unchanged:** the existing Save (thumbnail + HTML + JSON to S3) still works as before.

> If the **Uploads** library tab doesn't appear, the `userUploads` provider is registered by the component but the tab visibility may depend on the Unlayer project's File Manager setting — check the Unlayer project used by `projectId`.

---

## Step 5 — Acceptance & handoff

- [ ] Both instances on v5; all 12 queries (6 REST + 6 JS) created and wired; 6 result bindings set.
- [ ] New uploads land under `template-uploads/` (verified via the URL / GET library), **never** the bucket root.
- [ ] Toolbar, drag-drop, paste, and library all route through the endpoint (stock photos intentionally left enabled — external URLs, no bucket write).
- [ ] Notify BME to run the **≥72h** CloudTrail/Athena root-write gate (zero new root `PutObject`s by the ReTool identity) → unblocks Phase 5.7 sweep and the flip.

## Rollback

If anything breaks template authoring: select each component instance and **set the version back to v4**. Managed upload (and the existing save/thumbnail flow) resume immediately. New uploads return to the bucket root — harmless pre-flip and swept up by Phase 5.7. The flip stays held until v5 is confirmed stable.

---

## Quick reference — what calls what

```
Editor action ──▶ component v5 hook ──▶ sets unlayerEditor1.imageUploadRequest
                                    └─▶ fires onImageUploadRequested
        onImageUploadRequested handler ──▶ runs uploadTemplateImage1 (JS)
        uploadTemplateImage1 ──▶ triggers uploadTemplateImageRest1 (POST multipart → Admin APIs)
                             └─▶ returns { requestId, url }
        imageUploadResult ⟵ bound {{ uploadTemplateImage1.data }}
        component matches requestId ──▶ inserts image at the returned template-uploads/ URL
```
