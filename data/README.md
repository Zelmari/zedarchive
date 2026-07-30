# Data licensing and provenance

The repository's original source code and supporting documentation are
licensed under the root [MIT License](../LICENSE).

Catalogue records that declare `wikidata` as their source incorporate factual
structured data from [Wikidata](https://www.wikidata.org/). Wikidata's
structured data is available under the
[Creative Commons CC0 1.0 dedication](https://www.wikidata.org/wiki/Wikidata:Copyright).
Their Wikidata item identifiers are retained as provenance even though CC0 does
not require attribution.

The current catalogue data does not include third-party artwork, descriptions,
logos, Wikipedia article text, or other separately copyrighted media.

Reduced files under `fixtures/wikidata/` preserve only provider structures used
by deterministic importer tests. Live provider responses and generated review
artifacts are not authoritative catalogue data and remain ignored. The compact
Markdown review is generated from the same validated artifact to make semantic
catalogue mistakes easier to spot; the JSON is the machine-readable evidence.
Records are promoted only as reviewed, normalized entries in the committed
development seed.

The version-1 release catalogue has a separate, committed public boundary:

- `releases/anime-catalogue.v1.json` is the strict 500-item normalized source;
- `releases/anime-catalogue.v1.index.json` records deterministic coverage and
  binds the corpus, ordered manifests, review ledger, and semantic summary by
  SHA-256;
- `releases/anime-catalogue.v1.review.json` retains public-safe approvals and
  factual override evidence; and
- `imports/releases/anime-v1/` contains the twenty reviewed 25-item Wikidata
  manifests.

Those files may contain only eligible Wikidata CC0 facts, zedarchive-owned
normalization and curation, public catalogue identifiers, fixed review
outcomes, and concise factual rationales. They are not a PostgreSQL dump and
contain no user or archive data. Raw provider responses, generated batch
reviews, discovery pools, free-form private notes, credentials, database
exports, and backups remain ignored and must not be promoted.

Future imported datasets and assets must document their own source, licence,
attribution, and reuse restrictions. The root MIT License does not override or
replace third-party terms.

## Public catalogue boundary

The shared development catalogue, reviewed candidate manifests, reduced test
fixtures, and their source identifiers are intentionally public when committed
to this repository. Catalogue states such as `draft` and `hidden` control what
the application serves; they are not confidentiality controls for tracked
files.

This public boundary is useful for a portfolio project because it makes the
catalogue model, source review, deterministic seed, and licensing decisions
auditable and reproducible. It also means competitors can inspect or reuse
eligible factual data, mistakes are visible in Git history, and repository size
can grow as the catalogue grows.

Never commit user accounts or archives, private custom items, credentials,
database exports, unreviewed private curation notes, embargoed information, or
assets whose terms do not permit redistribution. Those belong in protected
application storage or ignored local review artifacts, as appropriate.

The release commands preserve this boundary: `catalogue:release:check`
validates committed data without a database, `plan` is read-only against an
allowed target, and `rehearse` writes atomically only to the exact disposable
local rehearsal database. The production-capable `apply` mode remains disabled
until Milestone 47. Corrections use reviewed successor releases, and disputed
public records move to `hidden`; ordinary correction does not delete shared
catalogue identities that user archives may reference.
