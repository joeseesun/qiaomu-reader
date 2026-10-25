# Public installation gate

On 2026-10-25 the default manifest advertised 4.9.0 while its Release was a draft. All three anonymous 4.9.0 installation URLs returned HTTP 404, affecting both updates and fresh installation.

The `public-release-assets` PR check detects a version change against the exact base commit and anonymously downloads main.js, manifest.json and styles.css from the exact candidate version. Every byte must match the committed candidate. Missing assets, drafts and mismatched builds fail. A plugin-ID change fails separately. PRs without a version change still report the required job.

Publish from the frozen candidate first; rerun the check after the Release becomes public; only then merge the version promotion. Keep normal build and runtime checks. Configure this job as a required branch check and read back the actual protection state. Never bypass it to publish. No credentials are used for asset downloads.

This gate verifies downloadable installation artifacts, not official approval or Windows/mobile runtime behavior.
