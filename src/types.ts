// ─── Public types ────────────────────────────────────────────────────────────

/** Configuration for a BowlsLink client instance. */
export interface BowlsLinkConfig {
  /** The BowlsLink club UUID (found on the club's BowlsLink results page). */
  clubId: string;
  /**
   * Optional base URL for the results API.
   * @default "https://api.bowlslink.com.au/results-api"
   */
  baseUrl?: string;
  /**
   * Optional custom fetch implementation (for testing or environments without
   * a global fetch). Defaults to the global `fetch`.
   */
  fetch?: typeof globalThis.fetch;
}

/** A club's pennant team within a competition. */
export interface Team {
  name: string;
  competitionId: string;
  competitionName: string | null;
  competitionStatus: string | null;
  bowlslinkUrl: string;
  ladder: LadderEntry | null;
  matches: Match[];
}

/** Ladder (standings) row for a team. */
export interface LadderEntry {
  position: number;
  played: number;
  wins: number;
  losses: number;
  draws: number;
  byes: number;
  score: number;
  againstScore: number;
  scoreDifference: number;
  points: number;
}

/** A single match for a team. */
export interface Match {
  matchId: string;
  round: number;
  roundLabel: string;
  dateUtc: number;
  state: string;
  isHome: boolean;
  isFinals: boolean;
  opponent: string;
  opponentId: string;
  myCompetitorId: string;
  teamScore: number | null;
  opponentScore: number | null;
  outcome: "W" | "L" | "draw" | "np" | null;
  teamPoints: number | null;
}

/** Full pennant data response for a club. */
export interface PennantData {
  lastUpdated: string;
  teams: Team[];
}

/** A player within a rink. */
export interface Player {
  name: string;
  position: string;
}

/** A rink (sub-team) within a match. */
export interface Rink {
  label: string;
  players: Player[];
}

/** A team's rink/player data for a specific match. */
export interface MatchTeam {
  competitorId: string;
  teamName: string;
  rinks: Rink[];
}

/** Match detail response with team sheets. */
export interface MatchDetail {
  matchId: string;
  teams: MatchTeam[];
}

// ─── Internal JSON:API types ─────────────────────────────────────────────────

/** A single item in a JSON:API `include` array. */
export interface JsonApiInclude {
  type: string;
  id: string;
  attributes: Record<string, unknown>;
  includes?: Record<string, { type: string; id: string } | { type: string; id: string }[]>;
}

/** Shape of a JSON:API response from BowlsLink. */
export interface JsonApiResponse {
  data: unknown;
  include: JsonApiInclude[];
  metadata?: unknown;
}
