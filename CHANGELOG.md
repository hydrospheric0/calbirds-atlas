# Changelog

All notable changes to CA Bird Atlas are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [20260822.01] - 2026-08-22

### Added
- High-accuracy GPS tracking: responsive updates every 1-2 seconds on iPad (previously 5-30 seconds)
- Real-time GPS accuracy indicator bubble (Excellent/Good/Fair/Poor)
- Automatic fallback to network location if GPS unavailable after 6 seconds
- GPS accuracy validation: reject poor fixes with accuracy > 50m
- Version display in app info modal (shows current deployed version)
- Location tracking status banner on auto-resume

### Changed
- GPS settings: switched from network-assisted location to high-accuracy GPS
  - `enableHighAccuracy: true` (was `false`)
  - `timeout: 5000ms` (was `20000ms`)
  - `maximumAge: 0` (was `5000ms`)
- Optimized marker updates: now use in-place updates instead of recreate/remove
- Legend redesign: narrower (25% width), left-aligned, 2x taller swatches
- Watchdog timeout aligned with geolocation timeout (4s watchdog for 5s geolocation)

### Fixed
- iPad GPS tracking was laggy due to cached network location reuse
- Prevent wrong block selection when GPS signal is poor (>50m accuracy)
- Confusing UX when GPS times out (now falls back to network location gracefully)
- Memory efficiency during long field sessions

### Technical Details
- **Commits:** 3e8fe52, 56f58b3, 24e4053
- **Files modified:** mobile/index.html
- **Lines added:** 114
- **Build:** Cloudflare Pages

### Breaking Changes
None

### Known Issues
None

---

## Release Notes Guidelines

For future releases, document changes in these sections:
- **Added:** New features
- **Changed:** Changes to existing functionality
- **Fixed:** Bug fixes
- **Removed:** Removed features
- **Deprecated:** Deprecated features (will be removed in future)
- **Security:** Security fixes or improvements

### Version Format
Use date-based versioning: `YYYYMMDD.XX`
- `YYYYMMDD` = Release date
- `XX` = Release number for that date (01, 02, etc.)

Example: `20260822.01` = August 22, 2026, release 1

### Before Release
1. Update version in [index.html](mobile/index.html) info modal
2. Update this CHANGELOG.md
3. Commit changes
4. Create git tag: `git tag -a v20260822.XX -m "Release description"`
5. Push tag: `git push origin v20260822.XX`
6. Create GitHub release with detailed notes

### After Release
- Monitor deployment at Cloudflare Dashboard
- Test on iOS device to verify changes
- Check browser cache is cleared if users report old version
- Announce release in project updates/docs

---
