const express = require("express");
const router = express.Router();
const fs = require("fs");
const os = require("os");
const path = require("path");
const Driver = require("../models/drivers");
const Constructor = require("../models/constructors");
const NameLength = require("../models/nameLengths");

const FETCH_OPTIONS = {
  headers: { "User-Agent": "F1LegendsApp/1.0 (admin@f1legends.local)" },
};
const CACHE_FILE = path.join(os.tmpdir(), "f1_cache_drivers.json");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchWithRetry = async (url, retries = 5) => {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, FETCH_OPTIONS);
      if (res.status === 429) {
        const waitTime = 7000 + i * 2000;
        console.warn(`⏳ Quota API (429). Pause ${waitTime / 1000}s...`);
        await sleep(waitTime);
        continue;
      }
      if (!res.ok) {
        await sleep(5000);
        continue;
      }
      return res;
    } catch (error) {
      await sleep(5000);
    }
  }
  throw new Error(`Échec critique sur l'URL : ${url}`);
};

const parseCarNumber = (val) => {
  if (!val) return null;
  const parsed = parseInt(val, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

const calculateAgeInfo = (dob) => {
  if (!dob) return "";
  const birthDate = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
  return `${age} ans`;
};

/* ========================================================= 
  GET /drivers - Liste complète avec filtres, tri et pagination 
  ========================================================= */

router.get("/", async (req, res) => {
  try {
    const {
      search,
      nationality,
      status,
      minWins,
      page = 1,
      limit = 50,
      sort = "wins_desc",
    } = req.query;
    const filter = {};
    if (search) {
      filter.$or = [
        { first_name: { $regex: search, $options: "i" } },
        { last_name: { $regex: search, $options: "i" } },
        { driver_id: { $regex: search, $options: "i" } },
        { nationality: { $regex: search, $options: "i" } },
      ];
    }
    if (nationality) filter.nationality = nationality;
    if (status) filter.active_status = status;
    if (minWins) {
      filter["career_stats.total_wins"] = { $gte: parseInt(minWins, 10) };
    }
    const sortOption = {};
    if (sort === "wins_desc") sortOption["career_stats.total_wins"] = -1;
    else if (sort === "titles_desc") sortOption.world_titles = -1;
    else if (sort === "name_asc") sortOption.last_name = 1;
    else if (sort === "races_desc") sortOption["career_stats.total_races"] = -1;
    else sortOption._id = 1;
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const [drivers, total] = await Promise.all([
      Driver.find(filter)
        .sort(sortOption)
        .skip(skip)
        .limit(parseInt(limit, 10)),
      Driver.countDocuments(filter),
    ]);
    res.json({
      result: true,
      count: drivers.length,
      total,
      page: parseInt(page, 10),
      totalPages: Math.ceil(total / parseInt(limit, 10)),
      drivers,
    });
  } catch (error) {
    res.status(500).json({ result: false, error: error.message });
  }
});

/* ========================================================= 
  GET /drivers/detail/:id - Recherche par _id numérique ou driver_id 
  ========================================================= */
router.get("/detail/:id", async (req, res) => {
  try {
    const param = req.params.id;
    const query = /^\d+$/.test(param)
      ? { _id: parseInt(param, 10) }
      : { driver_id: param };
    const driver = await Driver.findOne(query);
    if (!driver) {
      return res
        .status(404)
        .json({ result: false, message: "Pilote non trouvé" });
    }
    res.json({ result: true, driver });
  } catch (error) {
    res.status(500).json({ result: false, error: error.message });
  }
});

/* ========================================================= 
  PASSE 1 : Base des pilotes avec _id numérique (1..N) et driver_id 
  GET /drivers/seed/1-base 
  ========================================================= */
router.get("/seed/1-base", async (req, res) => {
  try {
    console.log(
      "➡️ [PASSE 1] Nettoyage index obsolètes & initialisation des pilotes...",
    );
    try {
      await Driver.collection.dropIndex("custom_id_1");
    } catch (_) {}
    await Driver.deleteMany({});
    let offset = 0;
    const limit = 100;
    let hasMore = true;
    let numericId = 1;
    while (hasMore) {
      const url = `https://api.jolpi.ca/ergast/f1/drivers.json?limit=${limit}&offset=${offset}`;
      const resApi = await fetchWithRetry(url);
      const data = await resApi.json();
      const drivers = data.MRData.DriverTable.Drivers;
      const total = parseInt(data.MRData.total, 10);
      if (!drivers || drivers.length === 0) break;
      const docs = drivers.map((d) => ({
        _id: numericId++,
        driver_id: d.driverId,
        first_name: d.givenName,
        last_name: d.familyName,
        date_of_birth: d.dateOfBirth || null,
        status_info: calculateAgeInfo(d.dateOfBirth),
        name_length_id: d.familyName ? d.familyName.length : null,
        nationality: d.nationality || "Unknown",
        car_number: parseCarNumber(d.permanentNumber),
        active_status: "Retraité",
        world_titles: 0,
        career_stats: {
          total_races: 0,
          total_wins: 0,
          total_podiums: 0,
          total_poles: 0,
        },
        teams: [],
      }));
      await Driver.insertMany(docs);
      offset += limit;
      if (offset >= total) hasMore = false;
      await sleep(200);
    }
    const createdCount = numericId - 1;
    res.json({
      success: true,
      message: `✅ PASSE 1 terminée : ${createdCount} pilotes créés avec _id numérique (1 à ${createdCount}).`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* =========================================================
   PASSE 2 : Courses, Podiums, Pôles & Écuries (1950-2026)
   GET /drivers/seed/2-results (ajouter ?resume=true en cas de coupure)
   ========================================================= */
router.get("/seed/2-results", async (req, res) => {
  req.setTimeout(0);
  res.setTimeout(0);

  try {
    console.log(
      "➡️ [PASSE 2] Analyse complète des courses, pôles et écuries...",
    );

    let cache = {};
    let startYear = 1950;

    // Repart de zéro sauf si ?resume=true est passé dans l'URL
    if (req.query.resume === "true" && fs.existsSync(CACHE_FILE)) {
      const savedState = JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
      cache = savedState.data;
      startYear = savedState.lastCompletedYear + 1;
      console.log(`♻️ Reprise à partir de la saison ${startYear}...`);
    } else if (fs.existsSync(CACHE_FILE)) {
      fs.unlinkSync(CACHE_FILE);
    }

    for (let year = startYear; year <= 2026; year++) {
      console.log(`  > Extraction de la saison ${year}...`);
      let offset = 0;
      const limit = 100; // Plafond réel de l'API Jolpica
      let hasMoreResults = true;

      while (hasMoreResults) {
        const url = `https://api.jolpi.ca/ergast/f1/${year}/results.json?limit=${limit}&offset=${offset}`;
        const resApi = await fetchWithRetry(url);
        const data = await resApi.json();
        const races = data.MRData.RaceTable.Races;
        const totalResults = parseInt(data.MRData.total, 10) || 0;
        const apiLimit = parseInt(data.MRData.limit, 10) || limit;

        if (!races || races.length === 0) break;

        for (const race of races) {
          if (!race.Results) continue;

          for (const result of race.Results) {
            const driverId = result.Driver.driverId;
            const status = result.status || "";

            if (
              [
                "Did not start",
                "Did not qualify",
                "Did not prequalify",
                "Withdrew",
              ].includes(status)
            ) {
              continue;
            }

            if (!cache[driverId]) {
              cache[driverId] = {
                total_races: 0,
                total_wins: 0,
                total_podiums: 0,
                total_poles: 0,
                last_car_number: null,
                active2026: false,
                teamsMap: [],
              };
            }

            const dCache = cache[driverId];
            dCache.total_races += 1;
            if (year === 2026) dCache.active2026 = true;
            if (result.grid === "1") dCache.total_poles += 1;

            const permNum = parseCarNumber(result.Driver.permanentNumber);
            const raceNum = parseCarNumber(result.number);
            if (permNum !== null) {
              dCache.last_car_number = permNum;
            } else if (raceNum !== null && dCache.last_car_number === null) {
              dCache.last_car_number = raceNum;
            }

            const posText = result.positionText;
            const isWin = posText === "1";
            const isPodium = ["1", "2", "3"].includes(posText);
            if (isWin) dCache.total_wins += 1;
            if (isPodium) dCache.total_podiums += 1;

            const constructorId =
              result.Constructor?.constructorId || "unknown";
            const teamName = result.Constructor?.name || "Unknown";
            const currentPeriod = dCache.teamsMap[dCache.teamsMap.length - 1];

            if (
              currentPeriod &&
              currentPeriod.constructor_id === constructorId
            ) {
              currentPeriod.end_year = year;
              if (isWin) currentPeriod.races_won += 1;
            } else {
              dCache.teamsMap.push({
                constructor_id: constructorId,
                team_name: teamName,
                start_year: year,
                end_year: year,
                drivers_titles_won: 0,
                races_won: isWin ? 1 : 0,
              });
            }
          }
        }

        offset += apiLimit;
        if (offset >= totalResults) hasMoreResults = false;
        await sleep(150);
      }

      fs.writeFileSync(
        CACHE_FILE,
        JSON.stringify({ lastCompletedYear: year, data: cache }),
      );
    }

    console.log("➡️ Écriture dans MongoDB Atlas...");
    const bulkOps = Object.entries(cache).map(([driverId, dStats]) => {
      const updateData = {
        "career_stats.total_races": dStats.total_races,
        "career_stats.total_wins": dStats.total_wins,
        "career_stats.total_podiums": dStats.total_podiums,
        "career_stats.total_poles": dStats.total_poles,
        active_status: dStats.active2026 ? "En activité" : "Retraité",
        teams: dStats.teamsMap,
      };
      if (dStats.last_car_number !== null) {
        updateData.car_number = dStats.last_car_number;
      }
      return {
        updateOne: {
          filter: { driver_id: driverId },
          update: { $set: updateData },
        },
      };
    });

    const bulkRes = await Driver.bulkWrite(bulkOps);
    if (fs.existsSync(CACHE_FILE)) fs.unlinkSync(CACHE_FILE);

    res.json({
      success: true,
      modified: bulkRes.modifiedCount,
      message:
        "✅ PASSE 2 terminée : Courses, Pôles et Podiums complets (1950-2026).",
    });
  } catch (err) {
    console.error("🛑 Erreur Passe 2 :", err);
    res.status(500).json({ error: err.message });
  }
});

/* ========================================================= 
PASSE 3 : Titres Mondiaux (1950-2025) 
GET /drivers/seed/3-titles 
========================================================= */
router.get("/seed/3-titles", async (req, res) => {
  try {
    console.log("➡️ [PASSE 3] Titres Mondiaux...");
    await Driver.updateMany(
      {},
      { $set: { world_titles: 0, "teams.$[].drivers_titles_won": 0 } },
    );
    for (let year = 1950; year <= 2025; year++) {
      const url = `https://api.jolpi.ca/ergast/f1/${year}/driverstandings.json?limit=1`;
      const resApi = await fetchWithRetry(url);
      const data = await resApi.json();

      const standingsLists = data.MRData.StandingsTable.StandingsLists;
      if (!standingsLists || standingsLists.length === 0) continue;

      const championObj = standingsLists[0].DriverStandings[0];
      if (championObj) {
        const champDriverId = championObj.Driver.driverId;
        const constructorsArr = championObj.Constructors || [];
        const champConstructorId =
          constructorsArr.length > 0
            ? constructorsArr[constructorsArr.length - 1].constructorId
            : null;

        const driver = await Driver.findOne({ driver_id: champDriverId });
        if (driver) {
          driver.world_titles += 1;
          if (champConstructorId) {
            const teamPeriod = driver.teams.find(
              (t) =>
                t.constructor_id === champConstructorId &&
                t.start_year <= year &&
                t.end_year >= year,
            );
            if (teamPeriod) teamPeriod.drivers_titles_won += 1;
          }
          await driver.save();
        }
      }
      await sleep(100);
    }

    res.json({ success: true, message: "✅ PASSE 3 terminée." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* =========================================================
   PASSE RAPIDE : Reconstitution de l'historique des écuries (teams)
   GET /drivers/seed/teams (1 requête par saison = ~30 secondes)
   ========================================================= */
router.get("/seed/teams", async (req, res) => {
  req.setTimeout(0);
  res.setTimeout(0);

  try {
    console.log(
      "➡️ [TEAMS] Reconstitution des écuries par pilote (1950-2026)...",
    );
    const teamsByDriver = {};

    for (let year = 1950; year <= 2026; year++) {
      const url = `https://api.jolpi.ca/ergast/f1/${year}/driverstandings.json?limit=100`;
      const resApi = await fetchWithRetry(url);
      const data = await resApi.json();

      const standingsLists = data?.MRData?.StandingsTable?.StandingsLists;
      if (!standingsLists || standingsLists.length === 0) continue;

      const driverStandings = standingsLists[0].DriverStandings || [];

      for (const entry of driverStandings) {
        const driverId = entry.Driver.driverId;
        const constructors = entry.Constructors || [];
        const winsThisYear = parseInt(entry.wins, 10) || 0;
        const isChampion = year <= 2025 && String(entry.position) === "1";

        if (!teamsByDriver[driverId]) {
          teamsByDriver[driverId] = [];
        }

        constructors.forEach((c, idx) => {
          const isLastTeamOfYear = idx === constructors.length - 1;
          const driverTeams = teamsByDriver[driverId];
          const lastEntry = driverTeams[driverTeams.length - 1];

          // Fusionner les saisons consécutives dans la même écurie
          if (lastEntry && lastEntry.constructor_id === c.constructorId) {
            lastEntry.end_year = year;
            if (isLastTeamOfYear) {
              lastEntry.races_won += winsThisYear;
              if (isChampion) lastEntry.drivers_titles_won += 1;
            }
          } else {
            driverTeams.push({
              constructor_id: c.constructorId,
              team_name: c.name,
              start_year: year,
              end_year: year,
              drivers_titles_won: isLastTeamOfYear && isChampion ? 1 : 0,
              races_won: isLastTeamOfYear ? winsThisYear : 0,
            });
          }
        });
      }

      await sleep(350);
    }

    const bulkOps = Object.entries(teamsByDriver).map(([driverId, teams]) => ({
      updateOne: {
        filter: { driver_id: driverId },
        update: { $set: { teams } },
      },
    }));

    const result = await Driver.bulkWrite(bulkOps);

    res.json({
      success: true,
      driversUpdated: result.modifiedCount,
      message:
        "✅ Historique des écuries (teams) reconstitué pour tous les pilotes !",
    });
  } catch (err) {
    console.error("🛑 Erreur seed teams :", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
