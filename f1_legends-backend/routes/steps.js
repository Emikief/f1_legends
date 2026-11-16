const express = require("express");
const router = express.Router();
const Driver = require("../models/drivers");
const Constructor = require("../models/constructors");
const Race = require("../models/races");
const NameLength = require("../models/nameLengths");

/* ==========================================================================
   ÉTAPE 2 : REQUÊTES DE LECTURE (FIND)
   ========================================================================== */

// 2.1 Recherche par _id numérique
router.get("/step2/q1-id", async (req, res) => {
  try {
    const id = parseInt(req.query.id, 10) || 1;
    const result = await Driver.findOne({ _id: id });
    res.json({
      success: true,
      mongoCommand: `db.drivers.findOne({ _id: ${id} })`,
      data: result,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2.2 Recherche par ID métier (driver_id)
router.get("/step2/q2-driver-id", async (req, res) => {
  try {
    const driverId = req.query.id || "alonso";
    const result = await Driver.findOne({ driver_id: driverId });
    res.json({
      success: true,
      mongoCommand: `db.drivers.findOne({ driver_id: "${driverId}" })`,
      data: result,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2.3 Tri sur deux champs (.sort)
router.get("/step2/q3-sort", async (req, res) => {
  try {
    const results = await Driver.find(
      {},
      {
        _id: 1,
        driver_id: 1,
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
      count: results.length,
      mongoCommand:
        'db.drivers.find({}, { first_name: 1, last_name: 1, world_titles: 1, "career_stats.total_wins": 1 }).sort({ world_titles: -1, "career_stats.total_wins": -1 }).limit(10)',
      data: results,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2.4 Projection ciblée (3 documents, 1 seul champ hors _id)
router.get("/step2/q4-projection", async (req, res) => {
  try {
    const results = await Constructor.find({}, { _id: 0, name: 1 }).limit(3);
    res.json({
      success: true,
      count: results.length,
      mongoCommand: "db.constructors.find({}, { _id: 0, name: 1 }).limit(3)",
      data: results,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2.5 Filtre de comparaison ($gt)
router.get("/step2/q5-gt", async (req, res) => {
  try {
    const threshold = parseInt(req.query.wins, 10) || 50;
    const results = await Constructor.find(
      { total_wins: { $gt: threshold } },
      { _id: 1, constructor_id: 1, name: 1, total_wins: 1, nationality: 1 },
    ).sort({ total_wins: -1 });

    res.json({
      success: true,
      count: results.length,
      mongoCommand: `db.constructors.find({ total_wins: { $gt: ${threshold} } }, { name: 1, total_wins: 1, nationality: 1 }).sort({ total_wins: -1 })`,
      data: results,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2.6 Combinaison logique ($and)
router.get("/step2/q6-and", async (req, res) => {
  try {
    const results = await Driver.find(
      {
        $and: [{ active_status: "En activité" }, { world_titles: { $gt: 0 } }],
      },
      {
        _id: 1,
        driver_id: 1,
        first_name: 1,
        last_name: 1,
        world_titles: 1,
        nationality: 1,
      },
    );
    res.json({
      success: true,
      count: results.length,
      mongoCommand:
        'db.drivers.find({ $and: [{ active_status: "En activité" }, { world_titles: { $gt: 0 } }] }, { first_name: 1, last_name: 1, world_titles: 1 })',
      data: results,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2.7 Regex sans $limit renvoyant exactement 3 documents
router.get("/step2/q7-regex", async (req, res) => {
  try {
    const pattern = "^(Prost|Senna|Mansell)$";
    const results = await Driver.find(
      { last_name: { $regex: pattern, $options: "i" } },
      {
        _id: 1,
        driver_id: 1,
        first_name: 1,
        last_name: 1,
        nationality: 1,
        world_titles: 1,
      },
    );
    res.json({
      success: true,
      count: results.length,
      mongoCommand: `db.drivers.find({ last_name: { $regex: "${pattern}", $options: "i" } })`,
      data: results,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/* ==========================================================================
   ÉTAPE 4 : RÉFÉRENCES ($strLenCP) ET JOINTURE ($lookup)
   ========================================================================== */
router.get("/step4/lookup", async (req, res) => {
  try {
    // S'assurer que la table de référence name_lengths contient bien les catégories
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
        description: "Ex: Leclerc, Russell",
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

    const pipeline = [
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
              "antonelli",
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
          category_description: "$category_details.description",
        },
      },
    ];

    const results = await Driver.aggregate(pipeline);

    res.json({
      success: true,
      count: results.length,
      mongoCommand: `db.drivers.aggregate(${JSON.stringify(pipeline)})`,
      data: results,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/* ==========================================================================
   ÉTAPE 5 : OPTIMISATION PAR LES INDEX & EXPLAIN (IXSCAN)
   ========================================================================== */
router.all("/step5/create-indexes", async (req, res) => {
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
      mongoCommand:
        "db.drivers.createIndex({ driver_id: 1 }, { unique: true }); db.constructors.createIndex({ total_wins: -1 }); db.drivers.createIndex({ nationality: 1, world_titles: -1 });",
      data: {
        message:
          "Les 3 index ont été créés/vérifiés avec succès sur MongoDB Atlas.",
        indexes: [
          { collection: "drivers", index: "driver_id: 1 (unique)", name: idx1 },
          { collection: "constructors", index: "total_wins: -1", name: idx2 },
          {
            collection: "drivers",
            index: "nationality: 1, world_titles: -1",
            name: idx3,
          },
        ],
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/step5/explain", async (req, res) => {
  try {
    const explanation = await Driver.find({
      nationality: "British",
      world_titles: { $gt: 0 },
    })
      .sort({ world_titles: -1 })
      .explain("executionStats");

    const stats = explanation.executionStats || {};
    res.json({
      success: true,
      mongoCommand:
        'db.drivers.find({ nationality: "British", world_titles: { $gt: 0 } }).sort({ world_titles: -1 }).explain("executionStats")',
      data: {
        executionSuccess: stats.executionSuccess,
        nReturned: stats.nReturned,
        totalKeysExamined: stats.totalKeysExamined,
        totalDocsExamined: stats.totalDocsExamined,
        executionTimeMillis: stats.executionTimeMillis,
        winningPlan: explanation.queryPlanner?.winningPlan,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
