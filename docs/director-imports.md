# Director import and portability profile

The local editor accepts its schema-v1 JSON or hashed ZIP package, original PNG/JPEG stills, MP4/WebM clips, WAV/MP3/M4A/OGG/WebM audio, and a bounded static GLB 2.0 subset. File pickers never fetch a remote URL. Failed imports leave the current document and timeline intact; the error appears in the active dialog. A successful project replacement remains available in Undo for the current browser session.

## Static GLB models

The GLB importer checks file/chunk lengths before loading Three.js resources. Limits are 50 MiB per file, 2 MiB JSON metadata, 64 MiB decoded accessor allocation, 100,000 triangles including node instances, 64 meshes, 256 nodes, depth 64 and 500,000 imported triangles per scene. It checks view/accessor byte bounds and alignment, attributes and index ranges, finite vertices/transforms, node cycles and repeated parents. Models must contain a default scene and embedded binary geometry. An original 12-triangle fixture is in `fixtures/director-relay.glb`.

This first GLB profile supports static geometry and material colors. Textures, external resources, extensions/compression, animation, skeletal rigs, sparse accessors and morph targets are explicitly rejected. It does **not** claim the specification's later 2K-texture profile. The GLTFLoader's resource manager additionally refuses external resolution. Imported source, declared rights, SHA-256, bytes and triangle counts travel with immutable scene versions. Old shot frames and scene versions remain unchanged when a model is moved or recolored.

## Validation and browser fallback

Image dimensions are checked from PNG/JPEG headers before decoding, with a maximum 8192 pixels per side and 32 megapixels. File signatures must match selected media MIME types, and browser decoding must successfully determine a bounded duration. ZIP import checks file names, counts, expansion limits, project schema and hashes; embedded GLB geometry is revalidated before acceptance. Unknown schemas and bad hashes never replace a good document.

The default app creates five actual frames. If WebGL is absent, the same scene can be edited in a 2D floor plan and captured to real 1280×720 JPEG frames with a visible **2D-PLAN** label. Saved shot metadata records `frameMode: plan`; 3D camera frames use `frameMode: 3d`. The timeline, storyboard, JSON/ZIP/PDF and local MP4 remain usable in the 2D path. This is floor-plan review, not a substitute perspective render.

The local persistence profile uses IndexedDB and browser storage quotas. Large embedded projects can exceed a device's quota; the editor preserves the in-memory document, shows the storage error and offers export. Cloud synchronization and account isolation are disconnected.
