import { apiFetch, buildLookup } from "./api.js";
import type {
  BowlsLinkConfig,
  JsonApiInclude,
  LadderEntry,
  Match,
  MatchDetail,
  MatchTeam,
  PennantData,
  Rink,
  Team,
} from "./types.js";

const DEFAULT_BASE_URL = "https://api.bowlslink.com.au/results-api";
const POSITION_ORDER = ["lead", "second", "third", "skip"];

/**
 * BowlsLink client for fetching a single club's pennant data.
 *
 * @example
 * ```ts
 * import { BowlsLinkClient } from "bowlslink-client";
 *
 * const client = new BowlsLinkClient({ clubId: "2d83742c-..." });
 * const data = await client.getPennantData();
 * console.log(data.teams);
 * ```
 */
export class BowlsLinkClient {
  private readonly clubId: string;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: BowlsLinkConfig) {
    this.clubId = config.clubId;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchFn = config.fetch ?? globalThis.fetch;
  }

  /**
   * Fetch all active pennant entries for the club, including competition
   * details, ladder standings, regular-season matches, and finals.
   *
   * For divisions where BowlsLink splits regular season and finals into
   * separate competitions, the regular-season matches are automatically
   * merged into the finals entry so each team shows the full season.
   */
  async getPennantData(): Promise<PennantData> {
    // 1. Fetch all active entries for the club
    const entriesPayload = await this.fetch(
      `/club/${this.clubId}/entries?filter%5Bstate%5D=active`,
    );

    const entries = this.parseEntries(entriesPayload);

    // 2. Fetch competition detail, ladder, and matches per unique competition
    const uniqueCompIds = [...new Set(entries.map((e) => e.competitionId).filter(Boolean))] as string[];
    const competitionData = await this.fetchCompetitionData(uniqueCompIds);

    // 3. For finals-only competitions, find and merge completed regular-season data.
    //    BowlsLink splits some divisions into separate regular-season and finals
    //    competitions. The regular-season entry only appears under state=completed.
    await this.mergeRegularSeasonData(entries, competitionData);

    // 4. Build each team
    const teams = entries
      .filter((e) => e.competitionId && competitionData[e.competitionId])
      .map((entry) => this.buildTeam(entry, competitionData[entry.competitionId!]));

    // Drop entries with no matches and sort by name
    const activeTeams = teams
      .filter((t) => t.matches.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

    return {
      lastUpdated: new Date().toISOString(),
      teams: activeTeams,
    };
  }

  private parseEntries(payload: { include: JsonApiInclude[] }) {
    return payload.include
      .filter((item) => item.type === "entry")
      .map((item) => ({
        id: item.id,
        name: String(item.attributes.name ?? ""),
        competitorId: (item.includes?.competitor as { id: string } | undefined)?.id,
        competitionId: (item.includes?.competition as { id: string } | undefined)?.id,
      }));
  }

  private async fetchCompetitionData(compIds: string[]) {
    const competitionData: Record<string, {
      compPayload: { include: JsonApiInclude[] };
      ladderPayload: { include: JsonApiInclude[] };
      matchesPayload: { include: JsonApiInclude[] };
    }> = Object.fromEntries(
      await Promise.all(
        compIds.map(async (compId) => {
          const [compPayload, ladderPayload, matchesPayload, finalsPayload] = await Promise.all([
            this.fetch(`/competition/${compId}`),
            this.fetch(`/competition/${compId}/ladder`),
            this.fetch(`/competition/${compId}/matches`),
            this.fetch(`/competition/${compId}/finals-series-matches`).catch(() => null),
          ]);

          // Merge finals-series-matches into regular matches so the rest of
          // the processing (competitor lookup, match shaping) works unchanged.
          if (finalsPayload?.include?.length) {
            matchesPayload.include = [...matchesPayload.include, ...finalsPayload.include];
          }

          return [compId, { compPayload, ladderPayload, matchesPayload }];
        }),
      ),
    );
    return competitionData;
  }

  /**
   * For entries in finals-only competitions (knockout comps), find the
   * corresponding completed regular-season competition and redirect the entry
   * to use it instead. The regular-season comp already includes finals matches
   * via the finals-series-matches endpoint, giving us the full season in one
   * place without duplication.
   */
  private async mergeRegularSeasonData(
    entries: { id: string; name: string; competitorId?: string; competitionId?: string }[],
    competitionData: Record<string, {
      compPayload: { include: JsonApiInclude[] };
      ladderPayload: { include: JsonApiInclude[] };
      matchesPayload: { include: JsonApiInclude[] };
    }>,
  ): Promise<void> {
    // Identify active entries whose competition name contains "Finals"
    const finalsEntries: {
      entry: typeof entries[number];
      compName: string;
    }[] = [];

    for (const entry of entries) {
      if (!entry.competitionId || !competitionData[entry.competitionId]) continue;
      const comp = competitionData[entry.competitionId].compPayload.include
        .find((i) => i.type === "competition");
      const compName = String(comp?.attributes?.name ?? "");
      if (compName.includes("Finals")) {
        finalsEntries.push({ entry, compName });
      }
    }

    if (finalsEntries.length === 0) return;

    // Fetch completed entries to find matching regular-season competitions
    const completedPayload = await this.fetch(
      `/club/${this.clubId}/entries?filter%5Bstate%5D=completed`,
    );
    const completedEntries = this.parseEntries(completedPayload);

    // Find matching regular-season comp IDs to fetch
    type MatchCandidate = {
      finalsEntry: typeof entries[number];
      finalsCompName: string;
      completedEntry: typeof entries[number];
    };
    const candidates: MatchCandidate[] = [];
    const compIdsToFetch = new Set<string>();

    for (const { entry: finalsEntry, compName: finalsCompName } of finalsEntries) {
      for (const completedEntry of completedEntries) {
        if (completedEntry.name !== finalsEntry.name) continue;
        if (!completedEntry.competitionId) continue;
        if (completedEntry.competitionId === finalsEntry.competitionId) continue;

        compIdsToFetch.add(completedEntry.competitionId);
        candidates.push({ finalsEntry, finalsCompName, completedEntry });
      }
    }

    if (compIdsToFetch.size === 0) return;

    // Fetch regular-season competition data (includes finals-series-matches)
    const regularSeasonData = await this.fetchCompetitionData([...compIdsToFetch]);

    // For each match, redirect the entry to use the regular-season comp data
    for (const { finalsEntry, finalsCompName, completedEntry } of candidates) {
      const rsData = regularSeasonData[completedEntry.competitionId!];
      if (!rsData) continue;

      const rsComp = rsData.compPayload.include.find((i) => i.type === "competition");
      const rsCompName = String(rsComp?.attributes?.name ?? "");

      // The finals comp name should start with the regular-season comp name
      // e.g. "...Division 2 Finals (Divisional)" starts with "...Division 2"
      if (!finalsCompName.startsWith(rsCompName)) continue;

      // Redirect: point the entry at the regular-season competition and competitor
      competitionData[completedEntry.competitionId!] = rsData;
      finalsEntry.competitionId = completedEntry.competitionId;
      finalsEntry.competitorId = completedEntry.competitorId;
    }
  }

  /**
   * Fetch match detail (team sheets with rink/player data) for a single match.
   */
  async getMatchDetail(matchId: string): Promise<MatchDetail> {
    const payload = await this.fetch(`/match/${matchId}`);
    const includes = payload.include ?? [];

    // Index competitors
    const competitors: Record<string, string> = {};
    for (const i of includes) {
      if (i.type === "competitor") {
        competitors[i.id] = String(i.attributes.name ?? "");
      }
    }

    // Index players
    const playerIndex: Record<string, { name: string; position: string; competitorId?: string }> = {};
    for (const i of includes) {
      if (i.type === "competitorPlayer") {
        playerIndex[i.id] = {
          name: String(i.attributes.fullName ?? ""),
          position: String(i.attributes.assignedPosition ?? "player"),
          competitorId: (i.includes?.competitor as { id: string } | undefined)?.id,
        };
      }
    }

    // Build rinks per competitor from rinkMatchResult objects
    const rinksByComp: Record<string, Rink[]> = {};
    for (const i of includes) {
      if (i.type === "rinkMatchResult") {
        const rinkLabel = String(i.attributes.specialisation ?? "").replace(/^Team\s+/i, "Rink ");
        const processPlayers = (refs: { id: string }[] | undefined) =>
          (refs ?? [])
            .map((ref) => playerIndex[ref.id])
            .filter(Boolean)
            .sort((a, b) => POSITION_ORDER.indexOf(a.position) - POSITION_ORDER.indexOf(b.position));

        const c1Players = processPlayers(
          i.includes?.competitorOnePlayers as { id: string }[] | undefined,
        );
        const c2Players = processPlayers(
          i.includes?.competitorTwoPlayers as { id: string }[] | undefined,
        );

        for (const players of [c1Players, c2Players]) {
          if (players.length === 0) continue;
          const compId = players[0].competitorId;
          if (!compId) continue;
          if (!rinksByComp[compId]) rinksByComp[compId] = [];
          rinksByComp[compId].push({
            label: rinkLabel,
            players: players.map(({ name, position }) => ({ name, position })),
          });
        }
      }
    }

    // Sort rinks within each team
    for (const rinks of Object.values(rinksByComp)) {
      rinks.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
    }

    const teams: MatchTeam[] = Object.entries(competitors).map(([compId, name]) => ({
      competitorId: compId,
      teamName: name,
      rinks: rinksByComp[compId] ?? [],
    }));

    return { matchId, teams };
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  private fetch(path: string) {
    return apiFetch(path, this.baseUrl, this.fetchFn);
  }

  private buildTeam(
    entry: { id: string; name: string; competitorId?: string; competitionId?: string },
    data: {
      compPayload: { include: JsonApiInclude[] };
      ladderPayload: { include: JsonApiInclude[] };
      matchesPayload: { include: JsonApiInclude[] };
    },
  ): Team {
    const { compPayload, ladderPayload, matchesPayload } = data;

    // Competition details
    const competition = compPayload.include.find((i) => i.type === "competition");
    const compAttrs = competition?.attributes ?? {};

    // Ladder row (may only be present for pool 1 in multi-section competitions)
    const ladderRow = ladderPayload.include.find(
      (i) =>
        i.type === "ladderRow" &&
        i.attributes?.competitorId === entry.competitorId,
    );
    let ladder = ladderRow ? this.parseLadderRow(ladderRow.attributes.fields as LadderEntry) : null;

    // Build lookups from matches payload
    const competitorNames = buildLookup(matchesPayload.include, "competitor");
    const resultMap = buildLookup(matchesPayload.include, "multiFormatResult");

    // Compute ladder from match data if the API didn't return one
    if (!ladder && entry.competitorId) {
      ladder = this.computeLadder(entry.competitorId, matchesPayload.include, resultMap);
    }

    // Filter and shape matches for this team
    const matches = this.buildMatches(entry, matchesPayload.include, competitorNames, resultMap);

    return {
      name: entry.name,
      competitionId: entry.competitionId ?? "",
      competitionName: compAttrs.name as string | null ?? null,
      competitionStatus: compAttrs.competitionStatus as string | null ?? null,
      bowlslinkUrl: `https://results.bowlslink.com.au/competition/${entry.competitionId}`,
      ladder,
      matches,
    };
  }

  /**
   * When the ladder API doesn't return data for a competitor (common in
   * multi-section competitions where /ladder only returns pool 1), compute
   * standings from match results as a fallback.
   */
  private computeLadder(
    competitorId: string,
    includes: JsonApiInclude[],
    resultMap: Record<string, Record<string, unknown>>,
  ): LadderEntry | null {
    // Determine which pool this competitor plays in
    const poolMatch = includes.find(
      (i) =>
        i.type === "match" &&
        ((i.includes?.competitorOne as { id: string } | undefined)?.id === competitorId ||
          (i.includes?.competitorTwo as { id: string } | undefined)?.id === competitorId),
    );
    const competitorPool = poolMatch?.attributes?.pool as number | null ?? null;
    if (competitorPool === null) return null;

    // Gather all played matches in this pool (exclude finals)
    const poolMatches = includes.filter(
      (i) =>
        i.type === "match" &&
        i.attributes?.pool === competitorPool &&
        i.attributes?.matchState === "PLAYED" &&
        !i.attributes?.isFinalsSeries,
    );

    // Build per-competitor stats
    const standings: Record<string, {
      played: number; wins: number; losses: number; draws: number;
      score: number; againstScore: number; points: number;
    }> = {};

    const ensure = (id: string) => {
      if (!standings[id]) {
        standings[id] = { played: 0, wins: 0, losses: 0, draws: 0, score: 0, againstScore: 0, points: 0 };
      }
    };

    for (const m of poolMatches) {
      const c1id = (m.includes?.competitorOne as { id: string } | undefined)?.id;
      const c2id = (m.includes?.competitorTwo as { id: string } | undefined)?.id;
      const resultId = (m.includes?.result as { id: string } | undefined)?.id;
      const result = resultId ? resultMap[resultId] : undefined;
      if (!result?.isCompleted) continue;

      if (c1id) ensure(c1id);
      if (c2id) ensure(c2id);

      const s1 = (result.competitorOneScore as number) ?? 0;
      const s2 = (result.competitorTwoScore as number) ?? 0;
      const p1 = (result.competitorOnePoints as number) ?? 0;
      const p2 = (result.competitorTwoPoints as number) ?? 0;

      if (c1id) {
        standings[c1id].played += 1;
        standings[c1id].score += s1;
        standings[c1id].againstScore += s2;
        standings[c1id].points += p1;
      }
      if (c2id) {
        standings[c2id].played += 1;
        standings[c2id].score += s2;
        standings[c2id].againstScore += s1;
        standings[c2id].points += p2;
      }

      const winnerId = result.winnerId as string | null;
      if (winnerId === c1id) {
        if (c1id) standings[c1id].wins += 1;
        if (c2id) standings[c2id].losses += 1;
      } else if (winnerId === c2id) {
        if (c2id) standings[c2id].wins += 1;
        if (c1id) standings[c1id].losses += 1;
      } else {
        if (c1id) standings[c1id].draws += 1;
        if (c2id) standings[c2id].draws += 1;
      }
    }

    // Sort by points desc, then score difference
    const sorted = Object.entries(standings).sort(([, a], [, b]) => {
      const ptsDiff = b.points - a.points;
      if (ptsDiff !== 0) return ptsDiff;
      return (b.score - b.againstScore) - (a.score - a.againstScore);
    });

    const myIdx = sorted.findIndex(([cid]) => cid === competitorId);
    if (myIdx === -1) return null;

    const my = sorted[myIdx][1];
    return {
      position: myIdx + 1,
      played: my.played,
      wins: my.wins,
      losses: my.losses,
      draws: my.draws,
      byes: 0,
      score: my.score,
      againstScore: my.againstScore,
      scoreDifference: my.score - my.againstScore,
      points: my.points,
    };
  }

  private buildMatches(
    entry: { competitorId?: string },
    includes: JsonApiInclude[],
    competitorNames: Record<string, Record<string, unknown>>,
    resultMap: Record<string, Record<string, unknown>>,
  ): Match[] {
    if (!entry.competitorId) return [];

    return includes
      .filter((i) => i.type === "match")
      .filter((m) => {
        const c1 = (m.includes?.competitorOne as { id: string } | undefined)?.id;
        const c2 = (m.includes?.competitorTwo as { id: string } | undefined)?.id;
        return c1 === entry.competitorId || c2 === entry.competitorId;
      })
      .map((m) => {
        const attrs = m.attributes;
        const c1 = (m.includes?.competitorOne as { id: string } | undefined)?.id;
        const isHome = c1 === entry.competitorId;
        const opponentId = isHome
          ? (m.includes?.competitorTwo as { id: string } | undefined)?.id ?? ""
          : c1 ?? "";
        const resultId = (m.includes?.result as { id: string } | undefined)?.id;
        const result = resultId ? resultMap[resultId] : undefined;

        let outcome: Match["outcome"] = null;
        if (result?.isCompleted) {
          if (result.winnerId === null) {
            outcome = result.status === "non-played" ? "np" : "draw";
          } else {
            outcome = result.winnerId === entry.competitorId ? "W" : "L";
          }
        }

        return {
          matchId: m.id,
          round: attrs.round as number,
          roundLabel: String(attrs.roundLabel ?? ""),
          dateUtc: attrs.matchDayUtc as number,
          state: String(attrs.matchState ?? ""),
          isHome,
          isFinals: Boolean(attrs.isFinalsSeries),
          opponent: String(competitorNames[opponentId]?.name ?? "TBD"),
          opponentId,
          myCompetitorId: entry.competitorId!,
          teamScore: result
            ? (isHome ? result.competitorOneScore : result.competitorTwoScore) as number | null
            : null,
          opponentScore: result
            ? (isHome ? result.competitorTwoScore : result.competitorOneScore) as number | null
            : null,
          outcome,
          teamPoints: result
            ? (isHome ? result.competitorOnePoints : result.competitorTwoPoints) as number | null
            : null,
        };
      })
      .sort((a, b) => {
        // Regular season before finals, then by round number within each group
        if (a.isFinals !== b.isFinals) return a.isFinals ? 1 : -1;
        return a.round - b.round;
      });
  }

  private parseLadderRow(fields: LadderEntry): LadderEntry {
    return {
      position: fields.position,
      played: fields.played,
      wins: fields.wins,
      losses: fields.losses,
      draws: fields.draws,
      byes: fields.byes,
      score: fields.score,
      againstScore: fields.againstScore,
      scoreDifference: fields.scoreDifference,
      points: fields.points,
    };
  }
}
