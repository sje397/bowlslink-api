import { describe, it, expect } from "vitest";
import { BowlsLinkClient } from "../src/client.js";
import {
  entriesResponse,
  competitionResponse,
  ladderResponse,
  matchesResponse,
  finalsMatchesResponse,
  matchDetailResponse,
  constants,
  sharedCompEmptyActiveEntries,
  sharedCompCompletedEntries,
  sharedCompCompetitionResponse,
  sharedCompLadderResponse,
  sharedCompMatchesResponse,
} from "./fixtures.js";

/**
 * Create a mock fetch that returns fixture data based on the URL path.
 */
function createMockFetch() {
  return async (url: string | URL | Request): Promise<Response> => {
    const urlStr = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
    const path = new URL(urlStr).pathname.replace("/results-api", "");

    if (path.includes("/entries")) {
      return Response.json(entriesResponse);
    }
    if (path.includes("/finals-series-matches")) {
      return Response.json(finalsMatchesResponse);
    }
    if (path.includes("/matches")) {
      return Response.json(matchesResponse);
    }
    if (path.includes("/ladder")) {
      return Response.json(ladderResponse);
    }
    if (path.includes(`/match/${constants.MATCH_1_ID}`)) {
      return Response.json(matchDetailResponse);
    }
    if (path.includes(`/competition/${constants.COMP_ID}`)) {
      return Response.json(competitionResponse);
    }
    throw new Error(`Unexpected fetch URL: ${urlStr}`);
  };
}

describe("BowlsLinkClient", () => {
  const client = new BowlsLinkClient({
    clubId: constants.CLUB_ID,
    fetch: createMockFetch() as typeof globalThis.fetch,
  });

  describe("getPennantData", () => {
    it("returns teams sorted by name", async () => {
      const data = await client.getPennantData();
      expect(data.teams).toHaveLength(2);
      expect(data.teams[0].name).toBe("Test Club 1");
      expect(data.teams[1].name).toBe("Test Club 2");
    });

    it("includes lastUpdated as ISO string", async () => {
      const data = await client.getPennantData();
      expect(data.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("populates competition metadata", async () => {
      const data = await client.getPennantData();
      const team = data.teams[0];
      expect(team.competitionName).toBe("2025-26 Test Division");
      expect(team.competitionStatus).toBe("in-play");
      expect(team.competitionId).toBe(constants.COMP_ID);
      expect(team.bowlslinkUrl).toContain(constants.COMP_ID);
    });

    it("uses ladder from API when available (pool 1)", async () => {
      const data = await client.getPennantData();
      const team1 = data.teams.find((t) => t.name === "Test Club 1")!;
      expect(team1.ladder).not.toBeNull();
      expect(team1.ladder!.position).toBe(1);
      expect(team1.ladder!.wins).toBe(2);
      expect(team1.ladder!.score).toBe(150);
    });

    it("computes ladder from match data as fallback (pool 2)", async () => {
      const data = await client.getPennantData();
      const team2 = data.teams.find((t) => t.name === "Test Club 2")!;
      expect(team2.ladder).not.toBeNull();
      expect(team2.ladder!.wins).toBe(1);
      expect(team2.ladder!.losses).toBe(0);
      expect(team2.ladder!.score).toBe(70);
      expect(team2.ladder!.againstScore).toBe(50);
    });

    it("shapes regular season matches correctly", async () => {
      const data = await client.getPennantData();
      const team1 = data.teams.find((t) => t.name === "Test Club 1")!;
      const regularMatch = team1.matches.find((m) => m.matchId === constants.MATCH_1_ID)!;

      expect(regularMatch.isHome).toBe(true);
      expect(regularMatch.opponent).toBe("Opponent A");
      expect(regularMatch.outcome).toBe("W");
      expect(regularMatch.teamScore).toBe(80);
      expect(regularMatch.opponentScore).toBe(60);
      expect(regularMatch.isFinals).toBe(false);
    });

    it("shapes away matches correctly", async () => {
      const data = await client.getPennantData();
      const team2 = data.teams.find((t) => t.name === "Test Club 2")!;
      const match = team2.matches.find((m) => m.matchId === constants.MATCH_2_ID)!;

      expect(match.isHome).toBe(false);
      expect(match.opponent).toBe("Opponent B");
      expect(match.outcome).toBe("W");
      expect(match.teamScore).toBe(70);
      expect(match.opponentScore).toBe(50);
    });

    it("merges finals-series matches", async () => {
      const data = await client.getPennantData();
      const team1 = data.teams.find((t) => t.name === "Test Club 1")!;
      const finalsMatch = team1.matches.find((m) => m.matchId === constants.MATCH_FINALS_ID);

      expect(finalsMatch).toBeDefined();
      expect(finalsMatch!.isFinals).toBe(true);
      expect(finalsMatch!.roundLabel).toBe("Semi-Finals");
      expect(finalsMatch!.state).toBe("SCHEDULED");
      expect(finalsMatch!.outcome).toBeNull();
    });
  });

  describe("end-of-season: multiple teams in same completed competition", () => {
    // Regression test: when two teams share a competition and all entries are
    // in the completed state (active returns nothing), both teams must appear.
    // Previously, the second team was silently dropped because the competition ID
    // was marked "covered" after the first team was added.

    const sharedCompClient = new BowlsLinkClient({
      clubId: "club-shared",
      fetch: (async (url: string | URL | Request): Promise<Response> => {
        const urlStr = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
        const path = new URL(urlStr).pathname.replace("/results-api", "");

        if (path.includes("/entries")) {
          const isCompleted = urlStr.includes("completed");
          return Response.json(isCompleted ? sharedCompCompletedEntries : sharedCompEmptyActiveEntries);
        }
        if (path.includes("/finals-series-matches")) {
          return Response.json({ data: {}, include: [] });
        }
        if (path.includes("/matches")) {
          return Response.json(sharedCompMatchesResponse);
        }
        if (path.includes("/ladder")) {
          return Response.json(sharedCompLadderResponse);
        }
        if (path.includes("/competition/")) {
          return Response.json(sharedCompCompetitionResponse);
        }
        throw new Error(`Unexpected fetch URL: ${urlStr}`);
      }) as typeof globalThis.fetch,
    });

    it("returns both teams when they share a completed competition", async () => {
      const data = await sharedCompClient.getPennantData();
      const names = data.teams.map((t) => t.name).sort();
      expect(names).toEqual(["Club A", "Club B"]);
    });

    it("each team shows their matches correctly", async () => {
      const data = await sharedCompClient.getPennantData();
      const clubA = data.teams.find((t) => t.name === "Club A")!;
      const clubB = data.teams.find((t) => t.name === "Club B")!;

      expect(clubA.matches).toHaveLength(1);
      expect(clubA.matches[0].outcome).toBe("W");

      expect(clubB.matches).toHaveLength(1);
      expect(clubB.matches[0].outcome).toBe("L");
    });
  });


  describe("getMatchDetail", () => {
    it("returns team names and rinks", async () => {
      const detail = await client.getMatchDetail(constants.MATCH_1_ID);
      expect(detail.matchId).toBe(constants.MATCH_1_ID);
      expect(detail.teams).toHaveLength(2);

      const team1 = detail.teams.find((t) => t.teamName === "Test Club 1")!;
      expect(team1.rinks).toHaveLength(1);
      expect(team1.rinks[0].label).toBe("Rink 1");
    });

    it("sorts players by position within a rink", async () => {
      const detail = await client.getMatchDetail(constants.MATCH_1_ID);
      const team1 = detail.teams.find((t) => t.teamName === "Test Club 1")!;
      const players = team1.rinks[0].players;

      // lead should come before skip
      expect(players[0].name).toBe("Bob Jones");
      expect(players[0].position).toBe("lead");
      expect(players[1].name).toBe("Alice Smith");
      expect(players[1].position).toBe("skip");
    });
  });
});
