# CareNear

CareNear is a public website for finding U.S. healthcare locations that government agencies have already published.

Searches use:

- HRSA Health Center Service Delivery and Look-Alike Sites
- SAMHSA FindTreatment.gov
- CMS NPPES organizational provider records
- U.S. Census Bureau geocoding and gazetteer files

Missing phones, websites, hours, and coordinates are shown as “Information unavailable.” The site does not rank providers.

## Run locally

```bash
npm install
npm run ingest
npm run dev
```

`npm run ingest` downloads the HRSA site file and the Census ZIP and place gazetteers, then writes `data/hrsa-sites.json`, `data/zcta.json`, and `data/places.json`. Refresh that file before a production deploy so health-center phones and coordinates stay current.

Open [http://localhost:3000](http://localhost:3000) and search a real ZIP code such as `10001`, `60601`, or `77002`.

## Checks

```bash
npm test
npm run build
```

Powered by Codyza.
