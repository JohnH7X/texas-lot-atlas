# Texas Lot Atlas

Static browser map of Texas parcels from TxGIO StratMap Land Parcels (compiled from all 254 county appraisal districts): owner and mailing address, property ID, legal description, acreage and land/improvement/market value where the district shares them, with satellite imagery, Street View, side lengths on every parcel line and the property-file module (branded reports, TREC-oriented agreement and disclosure worksheets, pre-offer checklist). No backend; property files stay in the browser.

The StratMap map service only answers `identify`, so parcels are fetched with identify calls per view and per click. Address search uses the Esri World geocoder limited to Texas. Rebuild the county layers with `python3 scripts/prepare_state.py --state 48 --name Texas --office "appraisal district" --count 0 --output public/data --checked-date YYYY-MM-DD`. Texas is a non-disclosure state (no sale prices); zoning is local (Houston has none).
