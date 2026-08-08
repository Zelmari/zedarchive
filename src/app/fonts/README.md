# Local font provenance

The application bundles only the Roman webfonts required by the accepted
"Quiet Archive, Warmed" interface direction. Builds and deployed pages do not
download fonts from a third-party service.

## Instrument Serif

- Upstream: `https://github.com/Instrument/instrument-serif`
- Revision: `65c0ef225f386a3c7e87570a4aa9cc0262c2fd81`
- Source file: `fonts/webfonts/InstrumentSerif-Regular.woff2`
- Bundled file: `instrument-serif-regular.woff2`
- SHA-256: `ca21b99b0d6b88a0dc34cebfe48104611e5c7f8f92746bed26c37aa470174322`
- Weight/style: 400 Roman
- Licence: SIL Open Font License 1.1
- Retained notice: `licenses/instrument-serif-OFL.txt`

## IBM Plex Mono

- Upstream: `https://github.com/IBM/plex`
- Revision: `bf260093582f04622aacc1e9f9ca604d7ccd0c42`
- Source files:
  - `packages/plex-mono/fonts/split/woff2/IBMPlexMono-Regular-Latin1.woff2`
  - `packages/plex-mono/fonts/split/woff2/IBMPlexMono-Medium-Latin1.woff2`
- Bundled files and SHA-256:
  - `ibm-plex-mono-regular-latin1.woff2` — `e8993d946649b9d01abb1ed06d574b19d8ea3e66b5c3948602db335c44c18e56`
  - `ibm-plex-mono-medium-latin1.woff2` — `41201b658a328b9d00368215c2f1102770f80b15952ab82631e4006255e6365d`
- Weights/style: 400 and 500 Roman, Latin-1 split
- Licence: SIL Open Font License 1.1
- Retained notice: `licenses/ibm-plex-OFL.txt`

The source revisions and hashes are intentionally recorded so a future agent
can audit or reproduce the vendored files without trusting a moving branch or
a package registry.
