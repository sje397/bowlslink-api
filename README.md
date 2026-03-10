# bowlslink-client

A TypeScript client library for the [BowlsLink](https://results.bowlslink.com.au/) Results API. Fetch pennant teams, match results, ladder standings, and team sheets for any Australian bowls club.

Built for club website maintainers who want to display live pennant data without reverse-engineering the API themselves.

## Install

```bash
npm install bowlslink-client
```

## Quick Start

```ts
import { BowlsLinkClient } from "bowlslink-client";

const client = new BowlsLinkClient({
  clubId: "2d83742c-5153-4f22-bcb3-68868f34e0d2", // Your club's BowlsLink UUID
});

// Get all pennant teams, matches, and standings
const data = await client.getPennantData();

for (const team of data.teams) {
  console.log(`${team.name} — ${team.competitionName}`);
  console.log(`  Ladder: ${team.ladder?.position ?? "?"} (W${team.ladder?.wins} L${team.ladder?.losses})`);
  console.log(`  Matches: ${team.matches.length}`);
}

// Get team sheets (player/rink data) for a specific match
const detail = await client.getMatchDetail("c0acaf56-ec90-4112-ac48-9d1d8412e7d8");

for (const team of detail.teams) {
  console.log(`\n${team.teamName}`);
  for (const rink of team.rinks) {
    console.log(`  ${rink.label}: ${rink.players.map((p) => `${p.name} (${p.position})`).join(", ")}`);
  }
}
```

## Finding Your Club ID

Your club's BowlsLink UUID is in the URL when you view your club on the results site:

```
https://results.bowlslink.com.au/club/2d83742c-5153-4f22-bcb3-68868f34e0d2
                                       ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                       This is your club ID
```

You can also find it by searching for your club at [results.bowlslink.com.au/search](https://results.bowlslink.com.au/search).

## API

### `new BowlsLinkClient(config)`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `clubId` | `string` | ✅ | Your club's BowlsLink UUID |
| `baseUrl` | `string` | | API base URL (default: `https://api.bowlslink.com.au/results-api`) |
| `fetch` | `typeof fetch` | | Custom fetch implementation for testing or non-browser environments |

### `client.getPennantData(): Promise<PennantData>`

Returns all active pennant entries for the club with competition details, ladder standings, and match history including finals.

```ts
interface PennantData {
  lastUpdated: string;  // ISO 8601 timestamp
  teams: Team[];
}

interface Team {
  name: string;                    // e.g. "Keilor 1"
  competitionId: string;
  competitionName: string | null;  // e.g. "2025-26 Metro Pennant Weekend Division 2"
  competitionStatus: string | null;
  bowlslinkUrl: string;            // Link to competition on BowlsLink
  ladder: LadderEntry | null;
  matches: Match[];
}

interface Match {
  matchId: string;
  round: number;
  roundLabel: string;       // "Round 1", "Semi-Finals", "Grand Final", etc.
  dateUtc: number;          // Unix timestamp
  state: string;            // "PLAYED" | "SCHEDULED" | etc.
  isHome: boolean;
  isFinals: boolean;        // true for finals-series matches
  opponent: string;
  opponentId: string;
  myCompetitorId: string;
  teamScore: number | null;
  opponentScore: number | null;
  outcome: "W" | "L" | "draw" | "np" | null;
  teamPoints: number | null;
}
```

### `client.getMatchDetail(matchId): Promise<MatchDetail>`

Returns team sheets with rink and player data for a specific match.

```ts
interface MatchDetail {
  matchId: string;
  teams: MatchTeam[];
}

interface MatchTeam {
  competitorId: string;
  teamName: string;
  rinks: Rink[];
}

interface Rink {
  label: string;       // "Rink 1", "Rink 2", etc.
  players: Player[];   // Sorted: lead, second, third, skip
}

interface Player {
  name: string;
  position: string;    // "lead" | "second" | "third" | "skip"
}
```

## Known Quirks

Things we've discovered about the BowlsLink API that this library handles for you:

- **Finals are a separate endpoint.** Regular season matches come from `/competition/{id}/matches`, but finals come from `/competition/{id}/finals-series-matches`. This library fetches both and merges them.

- **Higher-division finals are separate competitions.** Divisions 1–3 have their finals as entirely separate competition entries (e.g. "Division 2 Finals (Divisional)"). The regular season competition moves to `completed` status and drops off the active club entries feed. Lower divisions (4+) keep finals within the same competition using the `isFinalsSeries` flag.

- **Ladder API only returns pool 1.** In multi-section competitions, the `/ladder` endpoint only returns standings for Section 1. For teams in other sections, this library automatically computes standings from match results as a fallback.

- **The API is public but undocumented.** These endpoints are reverse-engineered from the BowlsLink SPA. They could change without notice.

## Server-Side Usage

The BowlsLink API has CORS headers allowing browser access, but for club websites we recommend calling it server-side to avoid exposing your requests to rate limiting and to enable caching:

```ts
import express from "express";
import { BowlsLinkClient } from "bowlslink-client";

const app = express();
const client = new BowlsLinkClient({ clubId: "your-club-id" });

let cache = null;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

app.get("/api/pennant", async (req, res) => {
  if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
    return res.json(cache.data);
  }
  const data = await client.getPennantData();
  cache = { data, timestamp: Date.now() };
  res.json(data);
});
```

## License

MIT
