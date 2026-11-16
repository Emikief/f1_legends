const mongoose = require("mongoose");

const circuitSchema = new mongoose.Schema(
  {
    circuit_id: { type: String, required: true },
    name: { type: String, required: true },
    city: { type: String },
    country: { type: String },
    length_km: { type: Number },
    fastest_lap_ever: {
      season: { type: String },
      driver_id: { type: String, ref: "drivers" },
      constructor_id: { type: String, ref: "constructors" },
      lap_time: { type: String },
    },
  },
  { _id: false },
);

const sessionResultsSchema = new mongoose.Schema(
  {
    qualifications: {
      poleman_driver_id: { type: String, ref: "drivers" },
      qualif_fastest_lap: { type: String }, // ex: "1:24.312"
    },
    winner_driver_id: { type: String, ref: "drivers" },
    winner_constructor_id: { type: String, ref: "constructors" },
    winning_time: { type: String }, // ex: "1:32:06.250"
    fastest_lap: {
      driver_id: { type: String, ref: "drivers" },
      constructor_id: { type: String, ref: "constructors" },
      lap_time: { type: String },
    },
    podium: [
      {
        position: { type: Number, enum: [1, 2, 3] },
        driver_id: { type: String, ref: "drivers" },
        constructor_id: { type: String, ref: "constructors" },
      },
    ],
  },
  { _id: false },
);

const raceSchema = new mongoose.Schema(
  {
    _id: { type: Number, required: true }, // Numéro chronologique du GP (ex: 1, 2, 3...)
    gp_number: { type: Number, required: true },
    gp_id: { type: String, required: true, unique: true }, // ex: "2005_australia"
    season: { type: Number, required: true },
    round_number: { type: Number, required: true },
    gp_name: { type: String, required: true },
    laps: { type: Number, required: true },
    circuit: circuitSchema,
    race_results: sessionResultsSchema,
    sprint_results: sessionResultsSchema,
  },
  { versionKey: false },
);

const Race = mongoose.model("races", raceSchema);

module.exports = Race;
