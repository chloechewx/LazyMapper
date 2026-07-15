# Lazy Mapper

I'm lazy when it comes to travel planning.

Saving travel ideas on Instagram is easy - I can spam the bookmark button whenever I see somewhere interesting. But organising all those saved posts later is a completely different story. Copying and pasting links into another app feels like work.

So I built Lazy Mapper.

Export your Instagram saved collections, upload the JSON file, and let the app do the organising for you. It extracts the places, researches missing details, shows you what needs review, and creates a clean map-ready list.

When you're done, export an XML/KML file and upload it directly to Google My Maps.

**Save everything, organise later.**

Lazy Mapper is a local-first web app that turns an Instagram saved-collections JSON export into a searchable place workspace, map, CSV spreadsheet, and Google My Maps KML file.

The core workflow does not require an Instagram login or browser extension. Your workspace stays in the browser, while private API keys remain on the local server.

## Features

- Import an Instagram `saved_collections.json` export.
- Select and replace one collection without deleting other collections.
- Extract place clues from captions and profile handles with Gemini.
- Verify official listings through Google Places.
- Use grounded search only when textual clues remain unresolved.
- Review uncertain or ambiguous matches instead of accepting invented details.
- Filter by collection, category, Research state, and Map state.
- View approved coordinates on a Leaflet and OpenStreetMap map.
- Export non-rejected records to CSV and mapped records to KML.
- Delete individual places with a 10-second Undo option.
- Clear and restore the local workspace without changing the source export.

## Research workflow

The automated pipeline runs in this order:

1. Gemini extracts structured clues from exported captions and handles.
2. Google Places checks direct place-name and location evidence.
3. Grounded Google Search researches unresolved textual clues only.
4. Google Places verifies grounded candidates before they can become ready.

The Gemini model is fixed to `gemini-2.5-flash-lite`. AI-derived candidates below the required confidence threshold remain unresolved. Malformed Gemini output receives one repair attempt and then fails safely instead of being treated as a negative result.

Research and mapping readiness are shown separately:

- **Research:** Ready, Review, Visual access required, or Unresolved.
- **Map:** Address found, Map ready, Google verified, or No address.

The app does not invent branches, addresses, coordinates, citations, or confidence scores. Weak clues remain available for review and do not receive a guessed Google Maps link.

## Requirements

- Node.js 20 or newer
- npm
- A Gemini API key for automatic caption extraction
- A Google Maps Platform key with **Places API (New)** enabled

The app can still parse and review local JSON without every external service enabled, but automatic research depends on the relevant API configuration.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env`.

3. Add your private API keys to `.env`:

   ```env
   GEMINI_API_KEY=your_key_here
   GOOGLE_PLACES_API_KEY=your_key_here
   ```

4. Build and start the production app:

   ```bash
   npm start
   ```

5. Open [http://127.0.0.1:4173](http://127.0.0.1:4173).

Never commit `.env`. API keys are used only by the loopback server and are not included in client-side JavaScript.

## Development

Run the API server and Vite development server in separate terminals:

```bash
npm run dev:server
```

```bash
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173).

Useful verification commands:

```bash
npm test
npm run typecheck
npm run build
```

## Local usage protection

Default local hard stops are provided in `.env.example`:

- 20 Gemini requests per day
- 100,000 Gemini tokens per day
- 100 grounded Gemini searches per day
- 100 Google Places searches per month

A grounded request consumes both the normal Gemini request allowance and the independent grounding allowance. New outbound requests stop when the applicable configured cap is reached, while completed results remain in the workspace. The Usage panel shows the current local counters and allows the caps to be changed.

These counters protect this local app only. Provider dashboards remain authoritative for billing and quota information.

## Exports

CSV includes every non-rejected record matching the selected collection and category filters, including Review, Visual access required, and Unresolved records. Unknown fields remain blank.

KML uses the same filters but includes only records with approved coordinates and a mappable status. It can be imported into Google My Maps.

## Visual-only posts

Some Instagram posts expose the venue name only inside a reel or carousel. These records use the **Visual access required** state and remain available for review and export.

The inspector includes a **Process with Instagram extension** placeholder for this case. The extension is not included in this repository yet, and the app never requests Instagram credentials. There is no manual screenshot or video upload workflow.

## Privacy

- The raw Instagram export remains local and is not uploaded wholesale.
- Raw import data is held temporarily in browser memory during import.
- Normalized workspace records persist in browser local storage.
- API keys, usage settings, and usage ledgers remain in the local server environment.
- Caption and handle clues are sent to Gemini for structured extraction.
- Unresolved textual clues may be sent for grounded public search.
- Place-name and location queries are sent to Google Places.
- Nothing is uploaded to a Lazy Mapper account or cloud database.

Review the applicable Gemini and Google data policies before processing sensitive content.

## Tech stack

- Vite
- React 19
- TypeScript
- Tailwind CSS
- Leaflet and OpenStreetMap
- Local browser storage
- Node.js loopback API server

## Project status

The core JSON-first workflow is complete. The optional Instagram visual-recovery extension is intentionally planned as a separate later package.
