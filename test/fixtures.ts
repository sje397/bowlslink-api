/**
 * Minimal JSON:API fixtures that exercise the main code paths:
 * - Entry parsing from club entries endpoint
 * - Competition detail extraction
 * - Ladder row from the API (pool 1 team)
 * - Ladder fallback computation (pool 2 team not in ladder response)
 * - Regular season match shaping (home/away, outcomes)
 * - Finals-series-matches merging
 * - Match detail with rinks and players
 */

const COMP_ID = "comp-001";
const CLUB_ID = "club-001";
const ENTRY_1_ID = "entry-001";
const ENTRY_2_ID = "entry-002";
const COMPETITOR_1_ID = "comp1";
const COMPETITOR_2_ID = "comp2";
const OPPONENT_A_ID = "oppA";
const OPPONENT_B_ID = "oppB";
const MATCH_1_ID = "match-001";
const MATCH_2_ID = "match-002";
const MATCH_FINALS_ID = "match-finals-001";
const RESULT_1_ID = "result-001";
const RESULT_2_ID = "result-002";
const RESULT_F_ID = "result-f-001";

// ─── /club/{id}/entries ──────────────────────────────────────────────────────

export const entriesResponse = {
  data: { entries: [{ type: "entry", id: ENTRY_1_ID }, { type: "entry", id: ENTRY_2_ID }] },
  include: [
    {
      type: "entry",
      id: ENTRY_1_ID,
      attributes: { name: "Test Club 1" },
      includes: {
        competitor: { type: "competitor", id: COMPETITOR_1_ID },
        competition: { type: "competition", id: COMP_ID },
      },
    },
    {
      type: "entry",
      id: ENTRY_2_ID,
      attributes: { name: "Test Club 2" },
      includes: {
        competitor: { type: "competitor", id: COMPETITOR_2_ID },
        competition: { type: "competition", id: COMP_ID },
      },
    },
  ],
};

// ─── /competition/{id} ──────────────────────────────────────────────────────

export const competitionResponse = {
  data: {},
  include: [
    {
      type: "competition",
      id: COMP_ID,
      attributes: {
        name: "2025-26 Test Division",
        competitionStatus: "in-play",
      },
    },
  ],
};

// ─── /competition/{id}/ladder ────────────────────────────────────────────────
// Only returns data for COMPETITOR_1 (pool 1); COMPETITOR_2 will need fallback.

export const ladderResponse = {
  data: {},
  include: [
    {
      type: "ladderRow",
      id: "lr-001",
      attributes: {
        competitorId: COMPETITOR_1_ID,
        fields: {
          position: 1,
          played: 2,
          wins: 2,
          losses: 0,
          draws: 0,
          byes: 0,
          score: 150,
          againstScore: 100,
          scoreDifference: 50,
          points: 20,
        },
      },
    },
  ],
};

// ─── /competition/{id}/matches ──────────────────────────────────────────────

export const matchesResponse = {
  data: {},
  include: [
    // Competitors
    {
      type: "competitor",
      id: COMPETITOR_1_ID,
      attributes: { name: "Test Club 1" },
      includes: { entry: { type: "entry", id: ENTRY_1_ID } },
    },
    {
      type: "competitor",
      id: COMPETITOR_2_ID,
      attributes: { name: "Test Club 2" },
      includes: { entry: { type: "entry", id: ENTRY_2_ID } },
    },
    {
      type: "competitor",
      id: OPPONENT_A_ID,
      attributes: { name: "Opponent A" },
      includes: { entry: { type: "entry", id: "entry-opp-a" } },
    },
    {
      type: "competitor",
      id: OPPONENT_B_ID,
      attributes: { name: "Opponent B" },
      includes: { entry: { type: "entry", id: "entry-opp-b" } },
    },
    // Results
    {
      type: "multiFormatResult",
      id: RESULT_1_ID,
      attributes: {
        isCompleted: true,
        winnerId: COMPETITOR_1_ID,
        status: "completed",
        competitorOneScore: 80,
        competitorTwoScore: 60,
        competitorOnePoints: 10,
        competitorTwoPoints: 2,
      },
    },
    {
      type: "multiFormatResult",
      id: RESULT_2_ID,
      attributes: {
        isCompleted: true,
        winnerId: COMPETITOR_2_ID,
        status: "completed",
        competitorOneScore: 50,
        competitorTwoScore: 70,
        competitorOnePoints: 2,
        competitorTwoPoints: 10,
      },
    },
    // Match 1: COMPETITOR_1 (home) vs OPPONENT_A — pool 1
    {
      type: "match",
      id: MATCH_1_ID,
      attributes: {
        round: 1,
        pool: 1,
        roundLabel: "Round 1",
        matchDayUtc: 1700000000,
        matchState: "PLAYED",
        isFinalsSeries: false,
        sectionLabel: "Section 1",
      },
      includes: {
        competitorOne: { type: "competitor", id: COMPETITOR_1_ID },
        competitorTwo: { type: "competitor", id: OPPONENT_A_ID },
        result: { type: "multiFormatResult", id: RESULT_1_ID },
      },
    },
    // Match 2: OPPONENT_B (home) vs COMPETITOR_2 — pool 2
    {
      type: "match",
      id: MATCH_2_ID,
      attributes: {
        round: 1,
        pool: 2,
        roundLabel: "Round 1",
        matchDayUtc: 1700000000,
        matchState: "PLAYED",
        isFinalsSeries: false,
        sectionLabel: "Section 2",
      },
      includes: {
        competitorOne: { type: "competitor", id: OPPONENT_B_ID },
        competitorTwo: { type: "competitor", id: COMPETITOR_2_ID },
        result: { type: "multiFormatResult", id: RESULT_2_ID },
      },
    },
  ],
};

// ─── /competition/{id}/finals-series-matches ────────────────────────────────

export const finalsMatchesResponse = {
  data: {},
  include: [
    // Reuse competitors (they'd normally be duplicated in the response)
    {
      type: "competitor",
      id: COMPETITOR_1_ID,
      attributes: { name: "Test Club 1" },
      includes: { entry: { type: "entry", id: ENTRY_1_ID } },
    },
    {
      type: "competitor",
      id: OPPONENT_A_ID,
      attributes: { name: "Opponent A" },
      includes: { entry: { type: "entry", id: "entry-opp-a" } },
    },
    {
      type: "multiFormatResult",
      id: RESULT_F_ID,
      attributes: {
        isCompleted: false,
        winnerId: null,
        status: "scheduled",
        competitorOneScore: null,
        competitorTwoScore: null,
        competitorOnePoints: null,
        competitorTwoPoints: null,
      },
    },
    {
      type: "match",
      id: MATCH_FINALS_ID,
      attributes: {
        round: 1,
        pool: 1,
        roundLabel: "Semi-Finals",
        matchDayUtc: 1700100000,
        matchState: "SCHEDULED",
        isFinalsSeries: true,
        sectionLabel: "Section 1",
      },
      includes: {
        competitorOne: { type: "competitor", id: COMPETITOR_1_ID },
        competitorTwo: { type: "competitor", id: OPPONENT_A_ID },
        result: { type: "multiFormatResult", id: RESULT_F_ID },
      },
    },
  ],
};

// ─── /match/{id} (match detail) ─────────────────────────────────────────────

export const matchDetailResponse = {
  data: {},
  include: [
    { type: "competitor", id: COMPETITOR_1_ID, attributes: { name: "Test Club 1" } },
    { type: "competitor", id: OPPONENT_A_ID, attributes: { name: "Opponent A" } },
    // Players
    {
      type: "competitorPlayer",
      id: "p1",
      attributes: { fullName: "Alice Smith", assignedPosition: "skip" },
      includes: { competitor: { type: "competitor", id: COMPETITOR_1_ID } },
    },
    {
      type: "competitorPlayer",
      id: "p2",
      attributes: { fullName: "Bob Jones", assignedPosition: "lead" },
      includes: { competitor: { type: "competitor", id: COMPETITOR_1_ID } },
    },
    {
      type: "competitorPlayer",
      id: "p3",
      attributes: { fullName: "Carol White", assignedPosition: "skip" },
      includes: { competitor: { type: "competitor", id: OPPONENT_A_ID } },
    },
    // Rink
    {
      type: "rinkMatchResult",
      id: "rink-001",
      attributes: { specialisation: "Team 1" },
      includes: {
        competitorOnePlayers: [{ id: "p1" }, { id: "p2" }],
        competitorTwoPlayers: [{ id: "p3" }],
      },
    },
  ],
};

export const constants = {
  COMP_ID,
  CLUB_ID,
  ENTRY_1_ID,
  ENTRY_2_ID,
  COMPETITOR_1_ID,
  COMPETITOR_2_ID,
  OPPONENT_A_ID,
  OPPONENT_B_ID,
  MATCH_1_ID,
  MATCH_2_ID,
  MATCH_FINALS_ID,
};

// ─── Shared-competition completed-entries fixture ─────────────────────────────
// Simulates the end-of-season state where two teams are in the SAME completed
// competition (e.g. Keilor 3 and Keilor 4 in Weekend Div 6). The active
// entries endpoint returns nothing; both entries come from completed only.

const SHARED_COMP_ID = "comp-shared";
const SHARED_COMP_NAME = "2025-26 Shared Division";
const SHARED_ENTRY_A_ID = "entry-A";
const SHARED_ENTRY_B_ID = "entry-B";
const SHARED_COMPETITOR_A_ID = "compA";
const SHARED_COMPETITOR_B_ID = "compB";
const SHARED_MATCH_1_ID = "shared-match-1";
const SHARED_RESULT_1_ID = "shared-result-1";

/** Empty active entries — the whole season has ended. */
export const sharedCompEmptyActiveEntries = {
  data: { entries: [] as unknown[] },
  include: [] as unknown[],
};

/** Completed entries — two different teams in the same competition. */
export const sharedCompCompletedEntries = {
  data: {
    entries: [
      { type: "entry", id: SHARED_ENTRY_A_ID },
      { type: "entry", id: SHARED_ENTRY_B_ID },
    ],
  },
  include: [
    {
      type: "entry",
      id: SHARED_ENTRY_A_ID,
      attributes: { name: "Club A" },
      includes: {
        competitor: { type: "competitor", id: SHARED_COMPETITOR_A_ID },
        competition: { type: "competition", id: SHARED_COMP_ID },
      },
    },
    {
      type: "entry",
      id: SHARED_ENTRY_B_ID,
      attributes: { name: "Club B" },
      includes: {
        competitor: { type: "competitor", id: SHARED_COMPETITOR_B_ID },
        competition: { type: "competition", id: SHARED_COMP_ID },
      },
    },
  ],
};

/** Competition detail for the shared competition. */
export const sharedCompCompetitionResponse = {
  data: {},
  include: [
    {
      type: "competition",
      id: SHARED_COMP_ID,
      attributes: {
        name: SHARED_COMP_NAME,
        competitionStatus: "completed",
      },
    },
  ],
};

/** Ladder with both competitors. */
export const sharedCompLadderResponse = {
  data: {},
  include: [
    {
      type: "ladderRow",
      id: "shared-lr-A",
      attributes: {
        competitorId: SHARED_COMPETITOR_A_ID,
        fields: {
          position: 1, played: 5, wins: 5, losses: 0, draws: 0,
          byes: 0, score: 100, againstScore: 50,
          scoreDifference: 50, points: 50,
        },
      },
    },
    {
      type: "ladderRow",
      id: "shared-lr-B",
      attributes: {
        competitorId: SHARED_COMPETITOR_B_ID,
        fields: {
          position: 2, played: 5, wins: 3, losses: 2, draws: 0,
          byes: 0, score: 80, againstScore: 70,
          scoreDifference: 10, points: 30,
        },
      },
    },
  ],
};

/** One played match between the two teams. */
export const sharedCompMatchesResponse = {
  data: {},
  include: [
    {
      type: "competitor",
      id: SHARED_COMPETITOR_A_ID,
      attributes: { name: "Club A" },
    },
    {
      type: "competitor",
      id: SHARED_COMPETITOR_B_ID,
      attributes: { name: "Club B" },
    },
    {
      type: "match",
      id: SHARED_MATCH_1_ID,
      attributes: {
        round: 1,
        roundLabel: "Round 1",
        matchDayUtc: 1700000000,
        matchState: "PLAYED",
        isFinalsSeries: false,
        pool: 1,
      },
      includes: {
        competitorOne: { id: SHARED_COMPETITOR_A_ID },
        competitorTwo: { id: SHARED_COMPETITOR_B_ID },
        result: { id: SHARED_RESULT_1_ID },
      },
    },
    {
      type: "multiFormatResult",
      id: SHARED_RESULT_1_ID,
      attributes: {
        isCompleted: true,
        competitorOneScore: 25,
        competitorTwoScore: 15,
        competitorOnePoints: 12,
        competitorTwoPoints: 0,
        winnerId: SHARED_COMPETITOR_A_ID,
        status: "complete",
      },
    },
  ],
};

export const sharedCompConstants = {
  SHARED_COMP_ID,
  SHARED_ENTRY_A_ID,
  SHARED_ENTRY_B_ID,
  SHARED_COMPETITOR_A_ID,
  SHARED_COMPETITOR_B_ID,
};
