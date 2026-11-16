const mongoose = require("mongoose");

const teamHistorySchema = new mongoose.Schema(
  {
    constructor_id: { type: String, ref: "constructors", required: true },
    team_name: { type: String, required: true },
    start_year: { type: Number, required: true },
    end_year: { type: Number },
    drivers_titles_won: { type: Number, default: 0 },
    races_won: { type: Number, default: 0 },
  },
  { _id: false },
);

const driverSchema = new mongoose.Schema(
  {
    _id: { type: Number, required: true },
    driver_id: { type: String, required: true, unique: true },
    first_name: { type: String, required: true },
    last_name: { type: String, required: true },
    date_of_birth: { type: String },
    status_info: { type: String },
    biographical_notes: { type: String },
    name_length_id: { type: Number, ref: "name_lengths" },
    nationality: { type: String, required: true },
    car_number: { type: Number, default: null },
    active_status: {
      type: String,
      enum: ["En activité", "Retraité", "Décédé"],
      default: "Retraité",
    },
    world_titles: { type: Number, default: 0 },
    career_stats: {
      total_races: { type: Number, default: 0 },
      total_wins: { type: Number, default: 0 },
      total_podiums: { type: Number, default: 0 },
      total_poles: { type: Number, default: 0 },
    },
    teams: [teamHistorySchema],
  },
  { versionKey: false },
);

module.exports = mongoose.model("drivers", driverSchema);
