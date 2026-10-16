# Studio file versions and provenance

Each artifact version is immutable and contains exact bytes, SHA-256, MIME, rights and provenance. The inspector's version selector changes both the preview and the usage list: only runs that locked that exact version, and deliveries that actually output it, are shown. Links open the corresponding run or review. New metadata does not rewrite historical claims on already delivered work.

Editing text preserves the selected source's MIME, rights and provenance. Editing an older version records that exact source in `derivedFrom` while allocating a new version after the current latest version. A source must exist within the same artifact family and have a lower version number; foreign references, cycles and forward references are rejected. Binary files cannot be edited as text. They can be uploaded as a new file version.

**Afklar ophav og rettigheder** records a new immutable version with unchanged content, byte count and SHA-256. The user must provide a provenance description and explicitly select rights. Earlier versions keep their original metadata. Newly typed standalone files default to manually created, owned content; uploaded files default to unknown rights until the user selects a status. Studio records these declarations and does not independently verify a license.

The additive `derivedFrom` field is optional for earlier local projects. Project JSON and ZIP exports retain it; imports validate its references. All historical bytes remain available. The full local file history still counts against the 48 MB project limit, including a metadata-only version's independently exportable file bytes.

Verification uses actual upload, editing, IndexedDB reload and ZIP roundtrip in Chromium, Firefox and WebKit, plus exact-source domain fixtures. The file preview keeps HTML and SVG sandboxed. Uploaded scripts and external requests remain blocked by the existing security regression gate.
