# CHANGELOG.md
## 1.0.0
- Message types 16 20 and 22 now decoded (issue 5).
- Error decoding message type 25 (1,0) fixed (issue 17).
- IEC 61162 sentence type now returned (issue 19).

## 0.6.0
- API documentation now moved to the [Github wiki](https://github.com/chrisadie/node-red-contrib-ais-decoder/wiki).
- `navigationStatus` value of 15 no longer returned (issue 1).
- `positionAccuracy` renamed to `positionAccurate` and is now Boolean (issue 2).
- `dgnssCorrection`, `radioStatus` and `DTE` now returned (issues 3, 4 and 7).
- Vessel dimensions not returned if not available (issue 6).
- `binaryData` only returned when the nature of the data is completely opaque (issue 8).
- `messageSubtype` returned for types 6 8 24 and 25 (issue 9).
- Message type 24 part B dimensions and `mothershipMmsi` no longer both returned (issue 10).
- `fixType` value of 15 no longer returned (issue 12).
- Message type 25 subtype 1,0 (text message) now decoded and returned (issue 13).
- `assignedMode` flag now returned from all messages containing it (issue 14).


## 0.5.0
- `originalAisMessage` is now an array of strings, not just one string. This makes subsequent processing of multi-part AIS messages easier.
- Every integer-valued "controlled vocabulary" output now has a `*_text` parallel output giving the English language meaning.
- Node is now called `ais`, and has an appearance similar to other 'parser' nodes.
- `destination` output now correctly named.
- Examples updated, particularly the online decoder.
- Various bug fixes.



## 0.4.0

- Initial release.
