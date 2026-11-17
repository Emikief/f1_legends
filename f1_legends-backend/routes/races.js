const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const Race = require("../models/races");
const Driver = require("../models/drivers");
const Constructor = require("../models/constructors");
const NameLength = require("../models/nameLengths");

const CACHE_FILE = path.join(__dirname, "cache_races.json");
const FETCH_OPTIONS = { headers: { "User-Agent": "F1LegendsApp/1.0" } };
const API_PACE_DELAY = 750;

// Regroupement des identifiants Ergast fragmentés par motoriste (avant 1971)
// Permet d'obtenir les totaux officiels FIA (ex: Team Lotus = 79, McLaren = 206, Brabham = 35)
const CONSTRUCTOR_ALIASES = {
  // Team Lotus : lotus-climax (24) + lotus-brm (1) + lotus-ford (47) + team_lotus (7) = 79
  // (lotus_f1 2012-2015 reste distinct conformément au palmarès FIA)
  "lotus-climax": { id: "team_lotus", name: "Team Lotus" },
  "lotus-brm": { id: "team_lotus", name: "Team Lotus" },
  "lotus-ford": { id: "team_lotus", name: "Team Lotus" },
  "lotus-maserati": { id: "team_lotus", name: "Team Lotus" },
  team_lotus: { id: "team_lotus", name: "Team Lotus" },

  // McLaren : mclaren-ford (4 victoires en 1968-1969) + mclaren (202) = 206
  "mclaren-ford": { id: "mclaren", name: "McLaren" },
  "mclaren-brm": { id: "mclaren", name: "McLaren" },
  "mclaren-serenissima": { id: "mclaren", name: "McLaren" },
  mclaren: { id: "mclaren", name: "McLaren" },

  // Brabham (35 victoires)
  "brabham-climax": { id: "brabham", name: "Brabham" },
  "brabham-repco": { id: "brabham", name: "Brabham" },
  "brabham-ford": { id: "brabham", name: "Brabham" },
  "brabham-alfa_romeo": { id: "brabham", name: "Brabham" },
  "brabham-bmw": { id: "brabham", name: "Brabham" },
  brabham: { id: "brabham", name: "Brabham" },

  // Cooper (16 victoires)
  "cooper-climax": { id: "cooper", name: "Cooper" },
  "cooper-maserati": { id: "cooper", name: "Cooper" },
  "cooper-brm": { id: "cooper", name: "Cooper" },
  cooper: { id: "cooper", name: "Cooper" },

  // Matra (9), March (3) & BRM (17)
  "matra-ford": { id: "matra", name: "Matra" },
  matra: { id: "matra", name: "Matra" },
  "march-ford": { id: "march", name: "March" },
  march: { id: "march", name: "March" },
  "brm-ford": { id: "brm", name: "BRM" },
  brm: { id: "brm", name: "BRM" },
};

const normalizeConstructor = (rawId, rawName) => {
  if (CONSTRUCTOR_ALIASES[rawId]) {
    return CONSTRUCTOR_ALIASES[rawId];
  }
  return { id: rawId, name: rawName };
};

let isSyncingConstructors = false;
let constructorsSyncedThisBoot = false;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchWithRetry = async (url, retries = 6, throwOnFail = false) => {
  for (let i = 0; i < retries; i++) {
    try {
      await sleep(API_PACE_DELAY);
      const res = await fetch(url, FETCH_OPTIONS);
      if (res.status === 429) {
        const waitTime = 10000 + i * 5000;
        await sleep(waitTime);
        continue;
      }
      if (!res.ok) {
        await sleep(2500 * (i + 1));
        continue;
      }
      return await res.json();
    } catch (err) {
      await sleep(2500 * (i + 1));
    }
  }
  if (throwOnFail) {
    throw new Error(
      `Impossible de récupérer ${url} après ${retries} tentatives.`,
    );
  }
  return null;
};

// Fusion par round pour éviter le découpage multi-pages de Jolpica/Ergast
const fetchAllJolpi = async (year, endpoint) => {
  let offset = 0;
  const limit = 100;
  const racesByRound = {};

  while (true) {
    const url = `https://api.jolpi.ca/ergast/f1/${year}/${endpoint}.json?limit=${limit}&offset=${offset}`;
    const data = await fetchWithRetry(url);

    if (!data?.MRData?.RaceTable?.Races) break;

    const races = data.MRData.RaceTable.Races;
    const total = parseInt(data.MRData.total, 10) || 0;
    let fetchedRowsCount = 0;

    for (const race of races) {
      const roundKey = String(race.round);
      if (!racesByRound[roundKey]) {
        racesByRound[roundKey] = {
          ...race,
          Results: race.Results ? [...race.Results] : [],
          QualifyingResults: race.QualifyingResults
            ? [...race.QualifyingResults]
            : [],
          SprintResults: race.SprintResults ? [...race.SprintResults] : [],
        };
      } else {
        if (race.Results) racesByRound[roundKey].Results.push(...race.Results);
        if (race.QualifyingResults) {
          racesByRound[roundKey].QualifyingResults.push(
            ...race.QualifyingResults,
          );
        }
        if (race.SprintResults) {
          racesByRound[roundKey].SprintResults.push(...race.SprintResults);
        }
      }

      fetchedRowsCount +=
        (race.Results?.length || 0) +
        (race.QualifyingResults?.length || 0) +
        (race.SprintResults?.length || 0);
    }

    offset += fetchedRowsCount || limit;
    if (offset >= total || races.length === 0) break;
  }

  return Object.values(racesByRound);
};

// Récupère le calendrier complet d'une saison (courses passées + Grands Prix à venir)
const fetchSeasonSchedule = async (year) => {
  const url = `https://api.jolpi.ca/ergast/f1/${year}.json?limit=100`;
  const data = await fetchWithRetry(url);
  return data?.MRData?.RaceTable?.Races || [];
};

// Récupère et met à jour les victoires officielles de CHAQUE constructeur via Ergast (1950 -> 2026)
const syncAllConstructorWinsFromErgast = async () => {
  if (isSyncingConstructors) {
    while (isSyncingConstructors) {
      await sleep(500);
    }
    const current = await Constructor.find({ total_wins: { $gt: 0 } })
      .sort({ total_wins: -1 })
      .lean();
    return current.map((c) => ({
      constructor_id: c.constructor_id,
      name: c.name,
      wins: c.total_wins,
    }));
  }

  isSyncingConstructors = true;
  try {
    let offset = 0;
    const limit = 100;
    const winnersByRaceKey = new Map();
    let expectedTotal = null;

    // 1. Récupération de l'historique complet (/results/1.json)
    while (true) {
      const url = `https://api.jolpi.ca/ergast/f1/results/1.json?limit=${limit}&offset=${offset}`;
      const data = await fetchWithRetry(url, 6, true);

      const races = data?.MRData?.RaceTable?.Races || [];
      expectedTotal = parseInt(data?.MRData?.total, 10) || 0;
      let fetchedRowsCount = 0;

      for (const race of races) {
        const results = race.Results || [];
        fetchedRowsCount += results.length;

        const winner = results.find(
          (r) => String(r.position) === "1" || String(r.positionText) === "1",
        );
        if (!winner?.Constructor?.constructorId) continue;

        const normalized = normalizeConstructor(
          winner.Constructor.constructorId,
          winner.Constructor.name,
        );

        const raceKey = `${race.season}_${race.round}`;
        if (!winnersByRaceKey.has(raceKey)) {
          winnersByRaceKey.set(raceKey, {
            season: String(race.season),
            round: String(race.round),
            circuitId: race.Circuit?.circuitId || null,
            driverId: winner.Driver?.driverId || null,
            constructorId: normalized.id,
            constructorName: normalized.name,
            constructorNationality: winner.Constructor.nationality || "Unknown",
          });
        }
      }

      offset += fetchedRowsCount || limit;
      if (offset >= expectedTotal || races.length === 0) break;
    }

    // 2. Fusion explicite de la saison 2026
    const data2026 = await fetchWithRetry(
      "https://api.jolpi.ca/ergast/f1/2026/results/1.json?limit=100",
      4,
      false,
    );
    const races2026 = data2026?.MRData?.RaceTable?.Races || [];
    for (const race of races2026) {
      const winner = (race.Results || []).find(
        (r) => String(r.position) === "1" || String(r.positionText) === "1",
      );
      if (!winner?.Constructor?.constructorId) continue;

      const normalized = normalizeConstructor(
        winner.Constructor.constructorId,
        winner.Constructor.name,
      );

      const raceKey = `${race.season}_${race.round}`;
      winnersByRaceKey.set(raceKey, {
        season: String(race.season),
        round: String(race.round),
        circuitId: race.Circuit?.circuitId || null,
        driverId: winner.Driver?.driverId || null,
        constructorId: normalized.id,
        constructorName: normalized.name,
        constructorNationality: winner.Constructor.nationality || "Unknown",
      });
    }

    if (!expectedTotal || winnersByRaceKey.size < 1100) {
      throw new Error(
        `Données Ergast incomplètes (${winnersByRaceKey.size} courses récupérées sur ${expectedTotal}).`,
      );
    }

    // 3. Agrégation par constructeur unifié
    const winsByConstructor = {};
    const raceWinnerUpdates = [];

    for (const entry of winnersByRaceKey.values()) {
      const cId = entry.constructorId;
      if (!winsByConstructor[cId]) {
        winsByConstructor[cId] = {
          constructor_id: cId,
          name: entry.constructorName,
          nationality: entry.constructorNationality,
          wins: 0,
          by_season: {},
        };
      }
      winsByConstructor[cId].wins += 1;
      winsByConstructor[cId].by_season[entry.season] =
        (winsByConstructor[cId].by_season[entry.season] || 0) + 1;

      if (entry.circuitId) {
        raceWinnerUpdates.push({
          updateOne: {
            filter: { gp_id: `${entry.season}_${entry.circuitId}` },
            update: {
              $set: {
                "race_results.winner_constructor_id": cId,
                ...(entry.driverId
                  ? { "race_results.winner_driver_id": entry.driverId }
                  : {}),
              },
            },
          },
        });
      }
    }

    // 4. Mise à jour dans MongoDB Atlas (remet à 0 les anciens segments fragmentés)
    await Constructor.updateMany({}, { $set: { total_wins: 0 } });

    const entries = Object.values(winsByConstructor);
    const bulkOps = entries.map((c) => ({
      updateOne: {
        filter: { constructor_id: c.constructor_id },
        update: {
          $set: {
            total_wins: c.wins,
            name: c.name,
          },
        },
      },
    }));
    await Constructor.bulkWrite(bulkOps);

    const existingDocs = await Constructor.find(
      { constructor_id: { $in: entries.map((e) => e.constructor_id) } },
      { constructor_id: 1 },
    );
    const existingSet = new Set(existingDocs.map((d) => d.constructor_id));
    const missingEntries = entries.filter(
      (e) => !existingSet.has(e.constructor_id),
    );

    if (missingEntries.length > 0) {
      const lastConstructor = await Constructor.findOne().sort({ _id: -1 });
      let nextId =
        typeof lastConstructor?._id === "number" ? lastConstructor._id + 1 : 1;

      const newDocs = missingEntries.map((m) => ({
        _id: nextId++,
        constructor_id: m.constructor_id,
        name: m.name,
        nationality: m.nationality,
        total_wins: m.wins,
      }));
      await Constructor.insertMany(newDocs);
    }

    if (raceWinnerUpdates.length > 0) {
      await Race.bulkWrite(raceWinnerUpdates);
    }

    constructorsSyncedThisBoot = true;
    const ranked = entries.sort((a, b) => b.wins - a.wins);
    console.log(
      "[Ergast Sync 2026] Top 6 :",
      ranked
        .slice(0, 6)
        .map((c) => `${c.name}: ${c.wins}`)
        .join(" | "),
    );
    return ranked;
  } finally {
    isSyncingConstructors = false;
  }
};

const extractSessionData = (resultsList, qualifData = null) => {
  if (!resultsList || resultsList.length === 0) return null;

  const winner = resultsList.find(
    (r) => r.position === "1" || r.positionText === "1",
  );

  const podium = resultsList
    .filter((r) => ["1", "2", "3"].includes(String(r.position)))
    .map((r) => ({
      position: parseInt(r.position, 10),
      driver_id: r.Driver.driverId,
      constructor_id: normalizeConstructor(
        r.Constructor.constructorId,
        r.Constructor.name,
      ).id,
    }))
    .sort((a, b) => a.position - b.position);

  let fastestLap = null;
  const flResult = resultsList.find(
    (r) => r.FastestLap && String(r.FastestLap.rank) === "1",
  );
  if (flResult) {
    fastestLap = {
      driver_id: flResult.Driver.driverId,
      constructor_id: normalizeConstructor(
        flResult.Constructor.constructorId,
        flResult.Constructor.name,
      ).id,
      lap_time: flResult.FastestLap.Time.time,
    };
  }

  let qualifications = null;
  if (qualifData && qualifData.length > 0) {
    const sortedQualif = [...qualifData].sort(
      (a, b) => parseInt(a.position, 10) - parseInt(b.position, 10),
    );
    const poleman =
      sortedQualif.find((q) => String(q.position) === "1") || sortedQualif[0];

    qualifications = {
      poleman_driver_id: poleman.Driver.driverId,
      qualif_fastest_lap:
        poleman.Q3 ||
        poleman.Q2 ||
        poleman.Q1 ||
        (poleman.Time ? poleman.Time.time : null),
    };
  }

  return {
    qualifications,
    winner_driver_id: winner ? winner.Driver.driverId : null,
    winner_constructor_id: winner
      ? normalizeConstructor(
          winner.Constructor.constructorId,
          winner.Constructor.name,
        ).id
      : null,
    winning_time: winner && winner.Time ? winner.Time.time : null,
    fastest_lap: fastestLap,
    podium,
  };
};

const circuitDataMap = {
  silverstone: {
    length_km: 5.891,
    fastest_lap_ever: {
      season: "2020",
      driver_id: "hamilton",
      constructor_id: "mercedes",
      lap_time: "1:27.097",
    },
  },
  monaco: {
    length_km: 3.337,
    fastest_lap_ever: {
      season: "2021",
      driver_id: "hamilton",
      constructor_id: "mercedes",
      lap_time: "1:12.909",
    },
  },
  spa: {
    length_km: 7.004,
    fastest_lap_ever: {
      season: "2020",
      driver_id: "hamilton",
      constructor_id: "mercedes",
      lap_time: "1:41.252",
    },
  },
  monza: {
    length_km: 5.793,
    fastest_lap_ever: {
      season: "2004",
      driver_id: "barrichello",
      constructor_id: "ferrari",
      lap_time: "1:21.046",
    },
  },
  interlagos: {
    length_km: 4.309,
    fastest_lap_ever: {
      season: "2018",
      driver_id: "bottas",
      constructor_id: "mercedes",
      lap_time: "1:10.540",
    },
  },
  rodriguez: {
    length_km: 4.304,
    fastest_lap_ever: {
      season: "2021",
      driver_id: "bottas",
      constructor_id: "mercedes",
      lap_time: "1:17.774",
    },
  },
  suzuka: {
    length_km: 5.807,
    fastest_lap_ever: {
      season: "2019",
      driver_id: "hamilton",
      constructor_id: "mercedes",
      lap_time: "1:30.983",
    },
  },
  catalunya: {
    length_km: 4.675,
    fastest_lap_ever: {
      season: "2021",
      driver_id: "max_verstappen",
      constructor_id: "red_bull",
      lap_time: "1:18.149",
    },
  },
};

/* =========================================================
   GET /races/debug-constructor/:id - Détail par saison renvoyé par Ergast
   ========================================================= */
router.get("/debug-constructor/:id", async (req, res) => {
  try {
    const cId = req.params.id;
    const ranked = await syncAllConstructorWinsFromErgast();
    const found = ranked.find((c) => c.constructor_id === cId);
    if (!found) {
      return res
        .status(404)
        .json({ success: false, message: `Constructeur ${cId} introuvable` });
    }
    res.json({
      success: true,
      constructor_id: found.constructor_id,
      name: found.name,
      total_wins: found.wins,
      by_season: found.by_season,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* =========================================================
   ALL /races/sync-constructors-wins - Synchronisation Ergast complète
   ========================================================= */
router.all("/sync-constructors-wins", async (req, res) => {
  try {
    const rankedConstructors = await syncAllConstructorWinsFromErgast();
    const byId = Object.fromEntries(
      rankedConstructors.map((c) => [c.constructor_id, c.wins]),
    );
    res.json({
      success: true,
      message:
        "Victoires constructeurs synchronisées avec fusion des châssis-moteurs historiques !",
      check: {
        ferrari: byId.ferrari || 0,
        mclaren: byId.mclaren || 0,
        mercedes: byId.mercedes || 0,
        red_bull: byId.red_bull || 0,
        williams: byId.williams || 0,
        team_lotus: byId.team_lotus || 0,
      },
      constructorsUpdated: rankedConstructors.length,
      top10: rankedConstructors
        .slice(0, 10)
        .map(({ by_season, ...rest }) => rest),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* =========================================================
   GET /races/dashboard-stats - KPIs & Top 10 synchronisés
   ========================================================= */
router.get("/dashboard-stats", async (req, res) => {
  try {
    if (!constructorsSyncedThisBoot || req.query.refreshWins === "true") {
      await syncAllConstructorWinsFromErgast();
    }

    const [
      totalRaces,
      totalDrivers,
      totalConstructors,
      topDriversRaw,
      topConstructorsRaw,
      latestRaces,
    ] = await Promise.all([
      Race.countDocuments(),
      Driver.countDocuments(),
      Constructor.countDocuments(),
      Driver.find(
        { "career_stats.total_wins": { $gt: 0 } },
        {
          driver_id: 1,
          first_name: 1,
          last_name: 1,
          nationality: 1,
          "career_stats.total_wins": 1,
        },
      )
        .sort({ "career_stats.total_wins": -1 })
        .limit(10),
      Constructor.find(
        { total_wins: { $gt: 0 } },
        { constructor_id: 1, name: 1, total_wins: 1 },
      )
        .sort({ total_wins: -1 })
        .limit(10),
      Race.find().sort({ season: -1, round_number: -1 }).limit(10),
    ]);

    const topDrivers = topDriversRaw.map((d) => ({
      _id: d.driver_id,
      name: `${d.first_name} ${d.last_name}`,
      nationality: d.nationality,
      wins: d.career_stats?.total_wins || 0,
    }));

    const topConstructors = topConstructorsRaw.map((c) => ({
      _id: c.constructor_id,
      name: c.name,
      wins: c.total_wins || 0,
    }));

    res.json({
      success: true,
      mongoCommand:
        "db.constructors.find({ total_wins: { $gt: 0 } }, { constructor_id: 1, name: 1, total_wins: 1 }).sort({ total_wins: -1 }).limit(10)",
      kpis: { totalRaces, totalDrivers, totalConstructors },
      topDrivers,
      topConstructors,
      latestRaces,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* =========================================================
   GET /api/races/sync/:year - Synchronisation complète (GP passés + GP à venir)
   ========================================================= */
router.get("/sync/:year", async (req, res) => {
  try {
    const year = parseInt(req.params.year, 10);
    const targetCircuits = req.query.circuits
      ? req.query.circuits.split(",").map((c) => c.trim())
      : null;

    // 1. Récupération du calendrier complet + résultats des courses déjà disputées
    const [scheduleData, resultsData, qualifData, sprintData] =
      await Promise.all([
        fetchSeasonSchedule(year),
        fetchAllJolpi(year, "results"),
        fetchAllJolpi(year, "qualifying"),
        year >= 2021 ? fetchAllJolpi(year, "sprint") : Promise.resolve([]),
      ]);

    const resultsByRound = {};
    resultsData.forEach(
      (r) => (resultsByRound[String(r.round)] = r.Results || []),
    );

    const qualifByRound = {};
    qualifData.forEach(
      (q) => (qualifByRound[String(q.round)] = q.QualifyingResults),
    );

    const sprintByRound = {};
    sprintData.forEach(
      (s) => (sprintByRound[String(s.round)] = s.SprintResults),
    );

    // Utilise le calendrier complet pour inclure les GP pas encore effectués
    const racesList = scheduleData.length > 0 ? scheduleData : resultsData;

    const lastRace = await Race.findOne().sort({ _id: -1 });
    let nextGpId = lastRace ? lastRace._id + 1 : 1;
    const updatedGps = [];
    const upcomingGps = [];

    for (const race of racesList) {
      const circuitId = race.Circuit.circuitId;
      if (targetCircuits && !targetCircuits.includes(circuitId)) continue;

      const roundKey = String(race.round);
      const gpId = `${year}_${circuitId}`;
      const existingRace = await Race.findOne({ gp_id: gpId });
      const results = resultsByRound[roundKey] || [];
      const hasResults = results.length > 0;

      const winner = hasResults
        ? results.find((r) => String(r.position) === "1")
        : null;
      const laps = winner ? parseInt(winner.laps, 10) : existingRace?.laps || 0;
      const staticCircuit = circuitDataMap[circuitId] || {};
      const numericId = existingRace ? existingRace._id : nextGpId++;

      const raceDoc = {
        _id: numericId,
        gp_number: numericId,
        gp_id: gpId,
        season: year,
        round_number: parseInt(race.round, 10),
        gp_name: race.raceName,
        date: race.date || existingRace?.date || null,
        laps,
        circuit: {
          circuit_id: circuitId,
          name: race.Circuit.circuitName,
          city: race.Circuit.Location?.locality,
          country: race.Circuit.Location?.country,
          length_km:
            staticCircuit.length_km || existingRace?.circuit?.length_km || null,
          fastest_lap_ever:
            staticCircuit.fastest_lap_ever ||
            existingRace?.circuit?.fastest_lap_ever ||
            null,
        },
        race_results: hasResults
          ? extractSessionData(results, qualifByRound[roundKey])
          : null,
        sprint_results: sprintByRound[roundKey]
          ? extractSessionData(sprintByRound[roundKey], null)
          : null,
      };

      await Race.updateOne(
        { gp_id: gpId },
        { $set: raceDoc },
        { upsert: true },
      );

      if (hasResults) {
        updatedGps.push(gpId);
        if (!existingRace) {
          const participantDriverIds = results.map((r) => r.Driver.driverId);
          await Driver.updateMany(
            { driver_id: { $in: participantDriverIds } },
            { $inc: { "career_stats.total_races": 1 } },
          );
        }
      } else {
        upcomingGps.push(gpId);
      }
    }

    // Recalcul des victoires pilotes & constructeurs (ignore automatiquement race_results: null)
    const driverWins = await Race.aggregate([
      { $match: { "race_results.winner_driver_id": { $ne: null } } },
      { $group: { _id: "$race_results.winner_driver_id", count: { $sum: 1 } } },
    ]);
    for (const d of driverWins) {
      await Driver.updateOne(
        { driver_id: d._id },
        { $set: { "career_stats.total_wins": d.count } },
      );
    }

    const rankedConstructors = await syncAllConstructorWinsFromErgast();

    res.json({
      success: true,
      message: `Calendrier ${year} synchronisé (${updatedGps.length} GP disputés, ${upcomingGps.length} GP à venir) !`,
      completed_gps: updatedGps,
      upcoming_gps: upcomingGps,
      topConstructors: rankedConstructors
        .slice(0, 6)
        .map(({ by_season, ...rest }) => rest),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ========================================================= 
   GET /api/races - Liste paginée avec recherche 
   ========================================================= */
router.get("/", async (req, res) => {
  try {
    const { season, search, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (season) filter.season = parseInt(season, 10);
    if (search) {
      filter.$or = [
        { gp_name: { $regex: search, $options: "i" } },
        { "circuit.name": { $regex: search, $options: "i" } },
        { "circuit.country": { $regex: search, $options: "i" } },
      ];
    }
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const [races, total, driversList, constructorsList] = await Promise.all([
      Race.find(filter)
        .sort({ season: -1, round_number: -1 })
        .skip(skip)
        .limit(parseInt(limit, 10))
        .lean(),
      Race.countDocuments(filter),
      Driver.find(
        {},
        { driver_id: 1, first_name: 1, last_name: 1, nationality: 1 },
      ).lean(),
      Constructor.find(
        {},
        { constructor_id: 1, name: 1, nationality: 1 },
      ).lean(),
    ]);

    const driversMap = Object.fromEntries(
      driversList.map((d) => [d.driver_id, d]),
    );
    const constructorsMap = Object.fromEntries(
      constructorsList.map((c) => [c.constructor_id, c]),
    );

    const enrichedRaces = races.map((race) => {
      if (race.race_results?.podium) {
        race.race_results.podium = race.race_results.podium.map((p) => ({
          ...p,
          driver_id: driversMap[p.driver_id] || p.driver_id,
          constructor_id: constructorsMap[p.constructor_id] || p.constructor_id,
        }));
      }
      if (race.race_results?.winner_driver_id) {
        const winId = race.race_results.winner_driver_id;
        race.race_results.winner_driver_id = driversMap[winId] || winId;
      }
      if (race.race_results?.qualifications?.poleman_driver_id) {
        const poleId = race.race_results.qualifications.poleman_driver_id;
        race.race_results.qualifications.poleman_driver_id =
          driversMap[poleId] || poleId;
      }
      if (race.race_results?.fastest_lap?.driver_id) {
        const flId = race.race_results.fastest_lap.driver_id;
        race.race_results.fastest_lap.driver_id = driversMap[flId] || flId;
      }
      return race;
    });

    res.json({
      result: true,
      count: enrichedRaces.length,
      total,
      page: parseInt(page, 10),
      totalPages: Math.ceil(total / parseInt(limit, 10)),
      races: enrichedRaces,
    });
  } catch (error) {
    res.status(500).json({ result: false, error: error.message });
  }
});

/* GET /api/races/detail/:id */
router.get("/detail/:id", async (req, res) => {
  try {
    const param = req.params.id;
    const query = /^\d+$/.test(param)
      ? { _id: parseInt(param, 10) }
      : { gp_id: param };

    const race = await Race.findOne(query)
      .populate({
        path: "race_results.podium.driver_id",
        select: "driver_id first_name last_name nationality",
      })
      .populate({
        path: "race_results.podium.constructor_id",
        select: "constructor_id name nationality",
      });

    if (!race)
      return res
        .status(404)
        .json({ result: false, message: "Course non trouvée" });
    res.json({ result: true, race });
  } catch (error) {
    res.status(500).json({ result: false, error: error.message });
  }
});

/* ALL /api/races/enrich */
router.all("/enrich", async (req, res) => {
  try {
    const bulkOperations = Object.entries(circuitDataMap).map(
      ([circuitId, data]) => ({
        updateMany: {
          filter: { "circuit.circuit_id": circuitId },
          update: {
            $set: {
              "circuit.length_km": data.length_km,
              "circuit.fastest_lap_ever": data.fastest_lap_ever,
            },
          },
        },
      }),
    );
    const result = await Race.bulkWrite(bulkOperations);
    res.status(200).json({
      success: true,
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/* ========================================================================== 
   ÉTAPE 2 : REQUÊTES DE LECTURE (FIND) 
   ========================================================================== */
router.get("/step2/q1-id", async (req, res) => {
  try {
    const id = parseInt(req.query.id, 10) || 1;
    const result = await Driver.findOne({ _id: id });
    res.json({
      success: true,
      step: 2,
      queryNumber: 1,
      title: "Recherche par _id numérique",
      mongoCommand: `db.drivers.findOne({ _id: ${id} })`,
      data: result,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/step2/q2-custom-id", async (req, res) => {
  try {
    const driverId = req.query.id || "alonso";
    const result = await Driver.findOne({ driver_id: driverId });
    res.json({
      success: true,
      step: 2,
      queryNumber: 2,
      title: "Recherche par ID métier personnalisé (driver_id)",
      mongoCommand: `db.drivers.findOne({ driver_id: "${driverId}" })`,
      data: result,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/step2/q3-sort", async (req, res) => {
  try {
    const results = await Driver.find(
      {},
      {
        first_name: 1,
        last_name: 1,
        world_titles: 1,
        "career_stats.total_wins": 1,
      },
    )
      .sort({ world_titles: -1, "career_stats.total_wins": -1 })
      .limit(10);
    res.json({
      success: true,
      step: 2,
      queryNumber: 3,
      mongoCommand:
        'db.drivers.find({}, { first_name: 1, last_name: 1, world_titles: 1, "career_stats.total_wins": 1 }).sort({ world_titles: -1, "career_stats.total_wins": -1 })',
      data: results,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/step2/q4-projection", async (req, res) => {
  try {
    const results = await Constructor.find({}, { _id: 0, name: 1 }).limit(3);
    res.json({
      success: true,
      step: 2,
      queryNumber: 4,
      mongoCommand: "db.constructors.find({}, { _id: 0, name: 1 }).limit(3)",
      data: results,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/step2/q5-gt", async (req, res) => {
  try {
    const threshold = parseInt(req.query.wins, 10) || 50;
    const results = await Constructor.find(
      { total_wins: { $gt: threshold } },
      { name: 1, total_wins: 1, nationality: 1 },
    ).sort({ total_wins: -1 });
    res.json({
      success: true,
      step: 2,
      queryNumber: 5,
      mongoCommand: `db.constructors.find({ total_wins: { $gt: ${threshold} } }, { name: 1, total_wins: 1 })`,
      data: results,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/step2/q6-and", async (req, res) => {
  try {
    const results = await Driver.find(
      {
        $and: [{ active_status: "En activité" }, { world_titles: { $gt: 0 } }],
      },
      { first_name: 1, last_name: 1, world_titles: 1, nationality: 1 },
    );
    res.json({
      success: true,
      step: 2,
      queryNumber: 6,
      mongoCommand:
        'db.drivers.find({ $and: [{ active_status: "En activité" }, { world_titles: { $gt: 0 } }] })',
      data: results,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/step2/q7-regex", async (req, res) => {
  try {
    const pattern = "^(Prost|Senna|Mansell)$";
    const results = await Driver.find(
      { last_name: { $regex: pattern, $options: "i" } },
      { first_name: 1, last_name: 1, nationality: 1, world_titles: 1 },
    );
    res.json({
      success: true,
      step: 2,
      queryNumber: 7,
      mongoCommand: `db.drivers.find({ last_name: { $regex: "${pattern}", $options: "i" } })`,
      count: results.length,
      data: results,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/* ========================================================================== 
   ÉTAPE 3 : MISES À JOUR (UPDATE) ET SUPPRESSION
   ========================================================================== */
router.post("/step3/q1-update-one", async (req, res) => {
  try {
    const note = req.body.note || "Légende vivante de la Formule 1";
    const result = await Driver.updateOne(
      { nationality: "British", "career_stats.total_wins": { $gt: 100 } },
      { $set: { status_info: note } },
    );
    res.json({ success: true, step: 3, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/step3/q2-inc-many", async (req, res) => {
  try {
    const increment = parseInt(req.body.increment, 10) || 1;
    const result = await Constructor.updateMany(
      {},
      { $inc: { podiums: increment } },
    );
    res.json({ success: true, step: 3, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/step3/q3-push-array", async (req, res) => {
  try {
    const newTeamEntry = req.body.team || {
      constructor_id: "ferrari",
      team_name: "Scuderia Ferrari",
      start_year: 2025,
      end_year: 2026,
      drivers_titles_won: 0,
      races_won: 0,
    };
    const result = await Driver.updateOne(
      { driver_id: "hamilton" },
      { $push: { teams: newTeamEntry } },
    );
    res.json({ success: true, step: 3, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/step3/q4-rename-field", async (req, res) => {
  try {
    const result = await Driver.updateMany(
      {},
      { $rename: { status_info: "biographical_notes" } },
    );
    res.json({ success: true, step: 3, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/step3/q5-delete-many", async (req, res) => {
  try {
    const tempCollection = Driver.db.collection("test_archive_races");
    await tempCollection.insertMany([
      { test_id: 1, label: "Archive test 1" },
      { test_id: 2, label: "Archive test 2" },
    ]);
    const result = await tempCollection.deleteMany({});
    res.json({ success: true, step: 3, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/* ========================================================================== 
   ÉTAPE 4 : RÉFÉRENCES ($strLenCP) ET JOINTURE ($lookup)
   ========================================================================== */
router.post("/step4/setup-reference", async (req, res) => {
  try {
    const categories = [
      {
        _id: 4,
        category_name: "Patronyme Très Court (4 lettres)",
        description: "Ex: Hill, Moss",
      },
      {
        _id: 5,
        category_name: "Patronyme Court (5 lettres)",
        description: "Ex: Senna, Prost",
      },
      {
        _id: 6,
        category_name: "Patronyme Moyen (6 lettres)",
        description: "Ex: Alonso, Lauda",
      },
      {
        _id: 7,
        category_name: "Patronyme Standard (7 lettres)",
        description: "Ex: Leclerc, Mansell",
      },
      {
        _id: 8,
        category_name: "Patronyme Long (8 lettres)",
        description: "Ex: Hamilton, Fangio",
      },
      {
        _id: 9,
        category_name: "Patronyme à 9 lettres",
        description: "Ex: Antonelli",
      },
      {
        _id: 10,
        category_name: "Patronyme Très Long (10 lettres)",
        description: "Ex: Verstappen",
      },
    ];

    for (const cat of categories) {
      await NameLength.updateOne(
        { _id: cat._id },
        { $set: cat },
        { upsert: true },
      );
    }

    const updateResult = await Driver.updateMany(
      { last_name: { $exists: true } },
      [{ $set: { name_length_id: { $strLenCP: "$last_name" } } }],
    );

    res.json({
      success: true,
      step: 4,
      driversUpdated: updateResult.modifiedCount,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/step4/lookup", async (req, res) => {
  try {
    const results = await Driver.aggregate([
      {
        $match: {
          driver_id: {
            $in: [
              "hamilton",
              "alonso",
              "senna",
              "prost",
              "max_verstappen",
              "leclerc",
            ],
          },
        },
      },
      {
        $lookup: {
          from: "name_lengths",
          localField: "name_length_id",
          foreignField: "_id",
          as: "category_details",
        },
      },
      {
        $unwind: {
          path: "$category_details",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 1,
          driver_id: 1,
          full_name: { $concat: ["$first_name", " ", "$last_name"] },
          calculated_length: "$name_length_id",
          category_title: "$category_details.category_name",
        },
      },
    ]);

    res.json({ success: true, step: 4, data: results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/* ========================================================================== 
   ÉTAPE 5 : OPTIMISATION PAR LES INDEX
   ========================================================================== */
router.post("/step5/create-indexes", async (req, res) => {
  try {
    try {
      await Driver.collection.dropIndex("custom_id_1");
    } catch (_) {}

    const idx1 = await Driver.collection.createIndex(
      { driver_id: 1 },
      { unique: true },
    );
    const idx2 = await Constructor.collection.createIndex({ total_wins: -1 });
    const idx3 = await Driver.collection.createIndex({
      nationality: 1,
      world_titles: -1,
    });

    res.json({
      success: true,
      step: 5,
      indexes: [idx1, idx2, idx3],
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
