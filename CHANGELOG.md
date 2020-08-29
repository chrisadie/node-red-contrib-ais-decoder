# CHANGELOG.md

## 0.5.0
- `originalAisMessage` is now an array of strings, not just one string. This makes subsequent processing of multi-part AIS messages easier.
- Every integer-valued "controlled vocabulary" output now has a `*_text` parallel output giving the English language meaning.
- Node is now called `ais`, and has an appearance similar to other 'parser' nodes.
`destination` output now correctly named.
- Examples updated, particularly the online decoder.
- Various bug fixes.



## 0.4.0

- Initial release.
