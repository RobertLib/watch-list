import { describe, expect, it } from "vitest";
import {
  entryKey,
  mergeEntries,
  parseExport,
  timestamp,
  wantedFromArchive,
} from "./formats";
import type { ImportEntry, ImportFile } from "./types";

/**
 * The header rows below are the services' own, copied from real exports – the
 * importers are only as good as their idea of what a file looks like, and that
 * idea is exactly what these pin.
 */

function file(name: string, content: string): ImportFile {
  return { name, text: async () => content };
}

async function entriesOf(...files: ImportFile[]): Promise<ImportEntry[]> {
  return (await parseExport(files)).entries;
}

describe("timestamp", () => {
  it.each([
    ["2023-09-26", "2023-09-26T00:00:00.000Z"],
    ["2024-11-02 11:53:58", "2024-11-02T11:53:58.000Z"],
    ["2019-09-10T08:01:29Z", "2019-09-10T08:01:29.000Z"],
    ["2026-08-21T06:41:00.000Z", "2026-08-21T06:41:00.000Z"],
  ])("reads %s", (input, expected) => {
    expect(timestamp(input)).toBe(expected);
  });

  // IMDb's exports before late 2017.
  it("reads the long form IMDb used to write", () => {
    expect(timestamp("Sun Aug 26 15:14:50 2012")?.slice(0, 10)).toBe("2012-08-26");
  });

  it("answers nothing rather than a wrong date", () => {
    // TV Time's "unknown" is the year 1.
    expect(timestamp("0001-01-01 00:00:00")).toBeUndefined();
    expect(timestamp("")).toBeUndefined();
    expect(timestamp("not a date")).toBeUndefined();
    expect(timestamp("2999-01-01")).toBeUndefined();
    expect(timestamp(undefined)).toBeUndefined();
  });
});

describe("Letterboxd", () => {
  it("reads the watchlist", async () => {
    const entries = await entriesOf(
      file(
        "watchlist.csv",
        'Date,Name,Year,Letterboxd URI\n2023-09-26,Sanctuary,2022,https://boxd.it/wPKW\n2018-01-27,"Three Billboards Outside Ebbing, Missouri",2017,https://boxd.it/ceBS\n',
      ),
    );

    expect(entries).toEqual([
      {
        ref: { mediaType: "movie", title: "Sanctuary", year: 2022 },
        watchlist: true,
        watchlistAt: "2023-09-26T00:00:00.000Z",
      },
      {
        ref: { mediaType: "movie", title: "Three Billboards Outside Ebbing, Missouri", year: 2017 },
        watchlist: true,
        watchlistAt: "2018-01-27T00:00:00.000Z",
      },
    ]);
  });

  // The same four columns as the watchlist: only the name says which it is.
  it("reads the watched list as watched", async () => {
    const [entry] = await entriesOf(
      file("watched.csv", "Date,Name,Year,Letterboxd URI\n2023-09-26,Sanctuary,2022,https://boxd.it/wPKW\n"),
    );

    expect(entry).toMatchObject({ watched: true, watchedAt: "2023-09-26T00:00:00.000Z" });
    expect(entry.watchlist).toBeUndefined();
  });

  it("turns stars out of five into a score out of ten", async () => {
    const entries = await entriesOf(
      file(
        "ratings.csv",
        "Date,Name,Year,Letterboxd URI,Rating\n2023-09-02,On the Line,2022,https://boxd.it/B0DK,1.5\n2023-09-30,Past Lives,2023,https://boxd.it/oNB8,5\n2023-10-01,Half,2020,https://boxd.it/x,0.5\n",
      ),
    );

    expect(entries.map((entry) => entry.rating)).toEqual([3, 10, 1]);
    // Rating a title is having watched it, here as in the app.
    expect(entries.every((entry) => entry.watched)).toBe(true);
  });

  it("dates a diary entry by when the film was watched, not when it was logged", async () => {
    const [entry] = await entriesOf(
      file(
        "diary.csv",
        "Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date\n2023-09-10,No Hard Feelings,2023,https://boxd.it/4P7hnr,4.5,,,2023-09-09\n",
      ),
    );

    expect(entry).toMatchObject({
      watched: true,
      watchedAt: "2023-09-09T00:00:00.000Z",
      rating: 9,
      ratedAt: "2023-09-10T00:00:00.000Z",
    });
  });

  // The diary and the watched list name the same film by different links, so
  // they are joined on name and year.
  it("folds the diary, the watched list and the ratings into one entry per film", async () => {
    const entries = await entriesOf(
      file("watched.csv", "Date,Name,Year,Letterboxd URI\n2023-09-10,No Hard Feelings,2023,https://boxd.it/xouu\n"),
      file(
        "diary.csv",
        "Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date\n2023-09-10,No Hard Feelings,2023,https://boxd.it/4P7hnr,4.5,,,2023-09-09\n",
      ),
      file("ratings.csv", "Date,Name,Year,Letterboxd URI,Rating\n2023-09-11,No Hard Feelings,2023,https://boxd.it/xouu,4\n"),
    );

    expect(entries).toHaveLength(1);
    // The score given last stands.
    expect(entries[0]).toMatchObject({ watched: true, rating: 8 });
  });

  it("leaves a file it cannot place out, by name", async () => {
    const parsed = await parseExport([
      file("films.csv", "Date,Name,Year,Letterboxd URI\n2023-09-26,Sanctuary,2022,https://boxd.it/wPKW\n"),
    ]);

    expect(parsed.entries).toEqual([]);
    expect(parsed.unrecognised).toEqual(["films.csv"]);
  });
});

describe("IMDb", () => {
  const RATINGS =
    "Const,Your Rating,Date Rated,Title,Original Title,URL,Title Type,IMDb Rating,Runtime (mins),Year,Genres,Num Votes,Release Date,Directors";
  const LIST =
    "Position,Const,Created,Modified,Description,Title,Original Title,URL,Title Type,IMDb Rating,Runtime (mins),Year,Genres,Num Votes,Release Date,Directors,Your Rating,Date Rated";

  it("reads the current ratings export", async () => {
    const parsed = await parseExport([
      file(
        "ratings.csv",
        `${RATINGS}\ntt4846340,10,2026-04-19,"Hidden Figures","Hidden Figures",https://www.imdb.com/title/tt4846340,Movie,7.8,127,2016,"Drama, History, Biography",288657,"2017-01-06","Theodore Melfi"\ntt1475582,10,2025-06-03,"Sherlock","Sherlock",https://www.imdb.com/title/tt1475582,TV Series,9.0,90,2010,"Crime, Drama",1049945,"2017-10-05",\ntt1444426,9,2024-10-24,"Dexter: If I Had A Hammer","Dexter: If I Had A Hammer",https://www.imdb.com/title/tt1444426,TV Episode,8.6,55,2009,"Crime, Drama",5719,"2009-11-01","Romeo Tirone"\n`,
      ),
    ]);

    expect(parsed.sources).toEqual(["imdb"]);
    expect(parsed.entries).toEqual([
      {
        ref: { mediaType: "movie", imdbId: "tt4846340", title: "Hidden Figures", year: 2016 },
        rating: 10,
        ratedAt: "2026-04-19T00:00:00.000Z",
        watched: true,
        watchedAt: "2026-04-19T00:00:00.000Z",
      },
      {
        ref: { mediaType: "tv", imdbId: "tt1475582", title: "Sherlock", year: 2010 },
        rating: 10,
        ratedAt: "2025-06-03T00:00:00.000Z",
        watched: true,
        watchedAt: "2025-06-03T00:00:00.000Z",
      },
    ]);
    // An episode has no page here.
    expect(parsed.skippedRows).toBe(1);
  });

  it("reads the older ratings export, with its camel-cased types", async () => {
    const entries = await entriesOf(
      file(
        "ratings.csv",
        "Const,Your Rating,Date Rated,Title,URL,Title Type,IMDb Rating,Runtime (mins),Year,Genres,Num Votes,Release Date,Directors\ntt7366338,9,2019-06-14,Chernobyl,https://www.imdb.com/title/tt7366338/,tvMiniSeries,9.4,330,2019,\"Drama, History, Thriller\",743411,2019-05-06,\n",
      ),
    );

    expect(entries[0]).toMatchObject({
      ref: { mediaType: "tv", imdbId: "tt7366338", title: "Chernobyl" },
      rating: 9,
    });
  });

  it("reads a watchlist as titles to watch", async () => {
    const entries = await entriesOf(
      file(
        "watchlist.csv",
        `${LIST}\n20,tt0371724,2016-03-31,2016-03-31,,"The Hitchhiker's Guide to the Galaxy","The Hitchhiker's Guide to the Galaxy",https://www.imdb.com/title/tt0371724/,Movie,6.7,109,2005,"Adventure, Comedy, Sci-Fi",210827,2005-04-29,"Garth Jennings",,\n`,
      ),
    );

    expect(entries).toEqual([
      {
        ref: { mediaType: "movie", imdbId: "tt0371724", title: "The Hitchhiker's Guide to the Galaxy", year: 2005 },
        watchlist: true,
        watchlistAt: "2016-03-31T00:00:00.000Z",
      },
    ]);
  });

  // A list row carries the member's score once they have rated the title:
  // that is a watched film, not one still to watch.
  it("reads a rated row of a list as watched, not as to watch", async () => {
    const [entry] = await entriesOf(
      file(
        "watchlist.csv",
        `${LIST}\n3,tt7366338,2021-08-01,2021-08-01,,"Chernobyl","Chernobyl",https://www.imdb.com/title/tt7366338/,TV Mini Series,9.3,60,2019,"Drama, History, Thriller",1017204,2019-05-06,,10,2019-06-06\n`,
      ),
    );

    expect(entry).toMatchObject({ rating: 10, watched: true, ratedAt: "2019-06-06T00:00:00.000Z" });
    expect(entry.watchlist).toBeUndefined();
  });

  // The type is written in the account's language. The id is not.
  it("leaves a type it does not recognise for TMDB to decide", async () => {
    const [entry] = await entriesOf(
      file(
        "ratings.csv",
        `${RATINGS}\ntt0211915,9,2024-01-01,"Le Fabuleux Destin d'Amélie Poulain","Le Fabuleux Destin d'Amélie Poulain",https://www.imdb.com/title/tt0211915,Film,8.3,122,2001,"Comédie, Romance",800000,"2001-04-25","Jean-Pierre Jeunet"\n`,
      ),
    );

    expect(entry.ref).toEqual({
      mediaType: undefined,
      imdbId: "tt0211915",
      title: "Le Fabuleux Destin d'Amélie Poulain",
      year: 2001,
    });
  });

  it("reads the pre-2017 export, quoted throughout and named differently", async () => {
    const entries = await entriesOf(
      file(
        "list.csv",
        '"position","const","created","modified","description","Title","Title type","Directors","You rated","IMDb Rating","Runtime (mins)","Year","Genres","Num. Votes","Release Date (month/day/year)","URL"\n"1","tt0443680","Sun Aug 26 15:14:50 2012","Sun Aug 26 15:14:50 2012","","The Assassination of Jesse James by the Coward Robert Ford","Feature Film","Andrew Dominik","7","7.5","160","2007","biography, crime","136229","2007-09-02","http://www.imdb.com/title/tt0443680/"\n',
      ),
    );

    expect(entries[0]).toMatchObject({
      ref: { mediaType: "movie", imdbId: "tt0443680", year: 2007 },
      rating: 7,
      watched: true,
    });
  });
});

describe("Trakt", () => {
  const heat = { title: "Heat", year: 1995, ids: { trakt: 1, slug: "heat-1995", imdb: "tt0113277", tmdb: 949 } };
  const severance = {
    title: "Severance", year: 2022,
    ids: { trakt: 153017, slug: "severance", tvdb: 371980, imdb: "tt11280740", tmdb: 95396 },
  };

  it("reads the watchlist, by TMDB id", async () => {
    const entries = await entriesOf(
      file(
        "lists-watchlist.json",
        JSON.stringify([
          { rank: 1, id: 1, listed_at: "2026-08-21T06:41:00.000Z", notes: null, type: "movie", movie: heat },
          { rank: 2, id: 2, listed_at: "2026-08-22T06:41:00.000Z", type: "show", show: severance },
          // A single episode on a watchlist has nowhere to go here.
          { rank: 3, id: 3, listed_at: "2026-08-23T06:41:00.000Z", type: "episode", episode: { season: 1, number: 1 }, show: severance },
        ]),
      ),
    );

    expect(entries).toEqual([
      {
        ref: { mediaType: "movie", tmdbId: 949, imdbId: "tt0113277", tvdbId: undefined, title: "Heat", year: 1995 },
        watchlist: true,
        watchlistAt: "2026-08-21T06:41:00.000Z",
      },
      {
        ref: { mediaType: "tv", tmdbId: 95396, imdbId: "tt11280740", tvdbId: 371980, title: "Severance", year: 2022 },
        watchlist: true,
        watchlistAt: "2026-08-22T06:41:00.000Z",
      },
    ]);
  });

  it("reads films and ticked episodes out of the history, across its pages", async () => {
    const entries = await entriesOf(
      file(
        "watched-history-1.json",
        JSON.stringify([
          { id: 9001, watched_at: "2026-08-21T06:41:00.000Z", action: "watch", type: "movie", movie: heat },
          { id: 9002, watched_at: "2026-08-22T06:41:00.000Z", action: "scrobble", type: "episode", episode: { season: 1, number: 1 }, show: severance },
        ]),
      ),
      file(
        "watched-history-2.json",
        JSON.stringify([
          { id: 9003, watched_at: "2026-08-23T06:41:00.000Z", type: "episode", episode: { season: 1, number: 2 }, show: severance },
          // A special: numbered differently on every service.
          { id: 9004, watched_at: "2026-08-24T06:41:00.000Z", type: "episode", episode: { season: 0, number: 1 }, show: severance },
        ]),
      ),
    );

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ ref: { tmdbId: 949 }, watched: true });
    expect(entries[1]).toMatchObject({
      ref: { mediaType: "tv", tmdbId: 95396 },
      episodes: [{ season: 1, episode: 1 }, { season: 1, episode: 2 }],
    });
    expect(entries[1].watched).toBeUndefined();
  });

  it("reads per-episode detail out of watched-shows where the export has it", async () => {
    const entries = await entriesOf(
      file(
        "watched-shows.json",
        JSON.stringify([
          { plays: 2, show: severance, seasons: [{ number: 1, episodes: [{ number: 1 }, { number: 2 }] }] },
          // Some exports have no seasons here at all; the history covers those.
          { plays: 5, show: { title: "Dark", year: 2017, ids: { tmdb: 70523 } } },
        ]),
      ),
    );

    expect(entries).toEqual([
      expect.objectContaining({ episodes: [{ season: 1, episode: 1 }, { season: 1, episode: 2 }] }),
    ]);
  });

  it("reads scores, out of ten as they are", async () => {
    const entries = await entriesOf(
      file(
        "ratings-movies.json",
        JSON.stringify([{ rated_at: "2026-01-02T03:04:05.000Z", rating: 9, type: "movie", movie: heat }]),
      ),
    );

    expect(entries[0]).toMatchObject({ rating: 9, ratedAt: "2026-01-02T03:04:05.000Z", watched: true });
  });

  it("passes over the rest of the archive without calling it unreadable", async () => {
    const parsed = await parseExport([
      file("user-settings.json", JSON.stringify({ user: { email: "someone@example.com" } })),
      file("lists-favorites.json", JSON.stringify([{ type: "movie", movie: heat }])),
      file("ratings-episodes.json", "[]"),
    ]);

    expect(parsed.entries).toEqual([]);
    expect(parsed.unrecognised).toEqual([]);
  });

  it("names a JSON file it has never heard of", async () => {
    const parsed = await parseExport([file("something-else.json", "[]")]);

    expect(parsed.unrecognised).toEqual(["something-else.json"]);
  });
});

describe("TV Time", () => {
  it("reads the 2026 export: watched episodes, followed series, films", async () => {
    const parsed = await parseExport([
      file(
        "tvtime-series-episodes.csv",
        "series_tvdb_id,series_imdb_id,series_uuid,title,season,episode,tvdb_id,is_watched,watched_at,rewatch_count,special\n346328,,u1,Elite,1,1,6671792,true,2019-10-04 03:43:42,0,false\n346328,,u1,Elite,6,1,9367539,false,,0,false\n248736,,u2,Grimm,0,1,4139574,true,2019-10-04 03:43:42,0,true\n",
      ),
      file(
        "tvtime-series.csv",
        "uuid,tvdb_id,imdb_id,title,status,created_at\nu1,346328,,Elite,continuing,2018-12-18T12:39:15Z\nu3,447665,,Amirli,not_started_yet,2025-03-20T10:15:42.067614Z\n",
      ),
      file(
        "tvtime-movies.csv",
        "uuid,tvdb_id,imdb_id,title,year,created_at,watched_at,is_watched,rewatch_count\nm1,1435,tt1396484,It,2017,2019-09-10T08:01:29Z,2019-09-10T08:01:29Z,true,0\nm2,340491,tt17196124,Grimcutty,2022,2022-10-18T22:12:05Z,,false,0\n",
      ),
    ]);

    expect(parsed.sources).toEqual(["tvtime"]);
    expect(parsed.entries).toEqual([
      {
        // Followed, with an episode ticked: the unwatched row and the special add nothing.
        ref: { mediaType: "tv", tvdbId: 346328, imdbId: undefined, title: "Elite", tmdbId: undefined, year: undefined },
        episodes: [{ season: 1, episode: 1 }],
        followed: true,
        watchlistAt: "2018-12-18T12:39:15.000Z",
        watchedAt: undefined,
      },
      {
        ref: { mediaType: "tv", tvdbId: 447665, imdbId: undefined, title: "Amirli" },
        followed: true,
        watchlistAt: "2025-03-20T10:15:42.067Z",
      },
      {
        ref: { mediaType: "movie", imdbId: "tt1396484", title: "It", year: 2017 },
        watched: true,
        watchedAt: "2019-09-10T08:01:29.000Z",
      },
      {
        ref: { mediaType: "movie", imdbId: "tt17196124", title: "Grimcutty", year: 2022 },
        watchlist: true,
        watchlistAt: "2022-10-18T22:12:05.000Z",
      },
    ]);
    // The special.
    expect(parsed.skippedRows).toBe(1);
  });

  // The column order differs from one account's export to the next; these two
  // headers are from two real ones.
  it.each([
    [
      "the order of one export",
      "created_at,user_id,key,total_series_runtime,updated_at,total_movies_runtime,movie_watch_count,ep_watch_count,series_follow_count,uuid,is_archived,is_followed,s_id,is_for_later,most_recent_ep_watched,followed_at,runtime,bulk_type,s_no,ep_no,is_unitary,ep_id,rewatch_count,gsi,is_special,movie_name,series_name,season_number,episode_number",
      [
        "2024-11-02 11:53:58,0,watch-episode-a-b,,2024-11-02 11:53:58,,,,,,,,413526,,,,2520,season,1,5,false,9476788,,,,,Treason,1,5",
        "2020-03-22 00:18:25,0,user-series-c,,2020-03-22 00:18:29,,,,,00000000-0000-0000-0000-000000000009,false,true,320724,true,,,,,,,,,,,,,Legion,,",
        "2021-11-12 17:11:33,0,tracking-stats,13800540,2026-06-04 14:04:56,0,0,4868,200,,,,,,,,,,,,,,,,,,,,",
      ],
    ],
    [
      "the order of another",
      "user_id,s_id,ep_no,runtime,s_no,gsi,ep_id,key,created_at,series_follow_count,ep_watch_count,total_series_runtime,movie_watch_count,total_movies_runtime,updated_at,most_recent_ep_watched,is_archived,is_for_later,uuid,is_followed,followed_at,is_unitary,rewatch_count,bulk_type,movie_name,series_name,season_number,episode_number",
      [
        "0,413526,5,2520,1,,9476788,watch-episode-a-b,2024-11-02 11:53:58,,,,,,2024-11-02 11:53:58,,,,,,,false,,season,,Treason,1,5",
        "0,320724,,,,,,user-series-c,2020-03-22 00:18:25,,,,,,2020-03-22 00:18:29,,false,true,00000000-0000-0000-0000-000000000009,true,,,,,,Legion,,",
        "0,,,,,,,tracking-stats,2021-11-12 17:11:33,200,4868,13800540,0,0,2026-06-04 14:04:56,,,,,,,,,,,,,",
      ],
    ],
  ])("reads the GDPR tracking file in %s", async (_, header, rows) => {
    const entries = await entriesOf(
      file("gdpr-data/tracking-prod-records-v2.csv", `${header}\n${rows.join("\n")}\n`),
    );

    expect(entries).toEqual([
      { ref: { mediaType: "tv", tvdbId: 413526, imdbId: undefined, title: "Treason" }, episodes: [{ season: 1, episode: 5 }] },
      {
        ref: { mediaType: "tv", tvdbId: 320724, imdbId: undefined, title: "Legion" },
        followed: true,
        watchlistAt: "2020-03-22T00:18:25.000Z",
      },
    ]);
  });

  it("reads films out of the older tracking file, by name and release year", async () => {
    const header =
      "updated_at,series_id,type-uuid-n,type,user_id,watch_count,created_at,uuid,watches,follow_date_range_key,release_date,entity_type,rewatch_count,runtime,release_date_range_key,alpha_range_key,season_number,episode_number,episode_id,series_uuid,watch_date,total_series_runtime,total_movies_runtime,bulk_type,watched_episode_range_key,unitarian,country,watch_date_range_key,movie_name,series_name";
    const row = (values: Record<string, string>) =>
      header.split(",").map((column) => values[column] ?? "").join(",");

    const entries = await entriesOf(
      file(
        "tracking-prod-records.csv",
        [
          header,
          // An unknown release date is written as the year 1.
          row({ type: "watch", entity_type: "movie", uuid: "a", movie_name: "What Happened to Monday", release_date: "0001-01-01 00:00:00", created_at: "2019-08-28 19:02:14" }),
          row({ type: "towatch", entity_type: "movie", uuid: "b", movie_name: "Transformers: Rise of the Beasts", release_date: "2023-06-07 00:00:00", created_at: "2025-12-11 01:08:43" }),
          row({ type: "follow", entity_type: "movie", uuid: "a", movie_name: "What Happened to Monday", release_date: "0001-01-01 00:00:00", created_at: "2019-08-28 19:02:14" }),
          row({ type: "watch", entity_type: "episode", series_id: "72454", season_number: "2", episode_number: "3", series_name: "Detective Conan", created_at: "2019-01-01 00:00:00" }),
          row({ type: "time-count" }),
        ].join("\n"),
      ),
    );

    expect(entries).toEqual([
      {
        ref: { mediaType: "movie", title: "What Happened to Monday", year: undefined, tmdbId: undefined, imdbId: undefined, tvdbId: undefined },
        watched: true,
        watchedAt: "2019-08-28T19:02:14.000Z",
        followed: true,
        watchlistAt: "2019-08-28T19:02:14.000Z",
      },
      {
        ref: { mediaType: "movie", title: "Transformers: Rise of the Beasts", year: 2023 },
        watchlist: true,
        watchlistAt: "2025-12-11T01:08:43.000Z",
      },
      {
        ref: { mediaType: "tv", tvdbId: 72454, imdbId: undefined, title: "Detective Conan" },
        episodes: [{ season: 2, episode: 3 }],
      },
    ]);
  });

  it("reads followed shows", async () => {
    const entries = await entriesOf(
      file(
        "followed_tv_show.csv",
        "active,folder_id,notification_offset,tv_show_name,updated_at,tv_show_id,created_at,diffusion,notification_type,archived,user_id\n0,,1440,Detective Conan,2018-10-29 14:49:20,72454,2018-09-17 10:55:12,original,2,0,123\n",
      ),
    );

    expect(entries).toEqual([
      {
        ref: { mediaType: "tv", tvdbId: 72454, imdbId: undefined, title: "Detective Conan" },
        followed: true,
        watchlistAt: "2018-09-17T10:55:12.000Z",
      },
    ]);
  });

  const SEEN =
    "user_id,fb_action_id,episode_season_number,episode_id,created_at,updated_at,tweet_id,tv_show_name,episode_number\n1,,2,9040148,2024-01-08 17:56:32,2024-01-08 17:56:32,,Tsukimichi -Moonlit Fantasy-,1\n";

  it("reads the oldest episode file where it is all there is", async () => {
    const entries = await entriesOf(file("seen_episode.csv", SEEN));

    // No show id in this file: the show is a name.
    expect(entries).toEqual([
      { ref: { mediaType: "tv", title: "Tsukimichi -Moonlit Fantasy-" }, episodes: [{ season: 2, episode: 1 }] },
    ]);
  });

  // In an account with twelve thousand episode watches, this file had
  // twenty-seven rows – and names its shows where the other gives ids.
  it("leaves the oldest episode file out when the tracking file is there", async () => {
    const parsed = await parseExport([
      file("seen_episode.csv", SEEN),
      file("tracking-prod-records-v2.csv", "user_id,s_id,ep_no,s_no,key,created_at,series_name\n0,413526,5,1,watch-episode-a-b,2024-11-02 11:53:58,Treason\n"),
    ]);

    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0].ref.tvdbId).toBe(413526);
    expect(parsed.unrecognised).toEqual([]);
  });

  it("reads the JSON form of the 2026 export", async () => {
    const entries = await entriesOf(
      file(
        "tvtime-series.json",
        JSON.stringify([
          {
            id: { tvdb: 455514, imdb: null }, title: "A Series", status: "continuing",
            seasons: [{ number: 1, episodes: [
              { id: { tvdb: 1 }, number: 1, is_watched: true, watched_at: "2025-05-13T00:37:58Z" },
              { id: { tvdb: 2 }, number: 2, is_watched: false },
            ] }],
          },
        ]),
      ),
      file(
        "tvtime-movies.json",
        JSON.stringify([{ id: { tvdb: 135073, imdb: "tt10545296" }, title: "A Film", year: 2023, is_watched: true, watched_at: "2026-06-03T13:02:31Z" }]),
      ),
    );

    expect(entries).toEqual([
      {
        ref: { mediaType: "tv", tvdbId: 455514, imdbId: undefined, title: "A Series" },
        followed: true,
        episodes: [{ season: 1, episode: 1 }],
      },
      {
        ref: { mediaType: "movie", imdbId: "tt10545296", title: "A Film", year: 2023 },
        watched: true,
        watchedAt: "2026-06-03T13:02:31.000Z",
      },
    ]);
  });
});

describe("parseExport", () => {
  it("says which files it read, and names the ones it could not", async () => {
    const parsed = await parseExport([
      file("watchlist.csv", "Date,Name,Year,Letterboxd URI\n2023-09-26,Sanctuary,2022,https://boxd.it/wPKW\n"),
      file("notes.txt", "remember to cancel the subscription"),
      {
        name: "broken.csv",
        text: async () => {
          throw new Error("unreadable");
        },
      },
    ]);

    expect(parsed.files).toEqual([{ name: "watchlist.csv", source: "letterboxd", rows: 1 }]);
    expect(parsed.unrecognised).toEqual(["notes.txt", "broken.csv"]);
  });

  it("reads exports from more than one service together", async () => {
    const parsed = await parseExport([
      file("watchlist.csv", "Date,Name,Year,Letterboxd URI\n2023-09-26,Sanctuary,2022,https://boxd.it/wPKW\n"),
      file("lists-watchlist.json", JSON.stringify([{ type: "movie", movie: { title: "Heat", ids: { tmdb: 949 } } }])),
    ]);

    expect(parsed.sources).toEqual(["letterboxd", "trakt"]);
    expect(parsed.entries).toHaveLength(2);
  });
});

describe("mergeEntries", () => {
  it("keeps the first time a title was listed and the last time it was watched", () => {
    const ref = { mediaType: "movie" as const, tmdbId: 949 };
    const [merged] = mergeEntries([
      { ref, watchlist: true, watchlistAt: "2020-05-01T00:00:00.000Z" },
      { ref, watchlist: true, watchlistAt: "2019-01-01T00:00:00.000Z" },
      { ref, watched: true, watchedAt: "2021-01-01T00:00:00.000Z" },
      { ref, watched: true, watchedAt: "2023-01-01T00:00:00.000Z" },
    ]);

    expect(merged).toMatchObject({
      watchlist: true,
      watchlistAt: "2019-01-01T00:00:00.000Z",
      watched: true,
      watchedAt: "2023-01-01T00:00:00.000Z",
    });
  });

  it("ticks each episode once", () => {
    const ref = { mediaType: "tv" as const, tvdbId: 1 };
    const [merged] = mergeEntries([
      { ref, episodes: [{ season: 1, episode: 1 }] },
      { ref, episodes: [{ season: 1, episode: 1 }, { season: 1, episode: 2 }] },
    ]);

    expect(merged.episodes).toEqual([{ season: 1, episode: 1 }, { season: 1, episode: 2 }]);
  });
});

describe("entryKey", () => {
  it("uses the strongest id a title has", () => {
    expect(entryKey({ mediaType: "movie", tmdbId: 949, imdbId: "tt0113277", title: "Heat" })).toBe("tmdb:movie:949");
    expect(entryKey({ imdbId: "tt0113277", title: "Heat" })).toBe("imdb:tt0113277");
    expect(entryKey({ mediaType: "tv", tvdbId: 72454 })).toBe("tvdb:tv:72454");
  });

  it("matches a name whatever its case, accents and punctuation", () => {
    expect(entryKey({ mediaType: "movie", title: "Amélie", year: 2001 })).toBe(
      entryKey({ mediaType: "movie", title: "AMELIE!", year: 2001 }),
    );
    // A remake is another film.
    expect(entryKey({ mediaType: "movie", title: "Dune", year: 1984 })).not.toBe(
      entryKey({ mediaType: "movie", title: "Dune", year: 2021 }),
    );
  });
});

describe("wantedFromArchive", () => {
  it.each([
    "watchlist.csv",
    "letterboxd-someone/diary.csv",
    "watched-history-12.json",
    "lists-watchlist.json",
    "ratings-shows.json",
    "gdpr-data/tracking-prod-records-v2.csv",
    "gdpr-data/followed_tv_show.csv",
    "tvtime-series-episodes.csv",
    "tvtime-movies.json",
  ])("reads %s", (path) => {
    expect(wantedFromArchive(path)).toBe(true);
  });

  // The account's profile, email address and device list are in the same
  // archives. They are not opened.
  it.each([
    "profile.csv",
    "reviews.csv",
    "comments.csv",
    "deleted/diary.csv",
    "orphaned/diary.csv",
    "likes/films.csv",
    "lists/favourites.csv",
    "user-settings.json",
    "user-profile.json",
    "lists-favorites.json",
    "gdpr-data/user.csv",
    "gdpr-data/access_token.csv",
  ])("does not open %s", (path) => {
    expect(wantedFromArchive(path)).toBe(false);
  });
});
