const mongoose = require("mongoose");

const constructorSchema = new mongoose.Schema(
  {
    _id: { type: Number, required: true }, // ex: 1, 2, 3...
    constructor_id: { type: String, required: true, unique: true }, // ex: "mercedes", "ferrari"
    name: { type: String, required: true }, // ex: "Scuderia Ferrari"
    nationality: { type: String, required: true }, // ex: "Italia"
    debut_year: { type: Number }, // ex: 1950
    total_wins: { type: Number, default: 0 }, // Victoires en Grand Prix
    championships: {
      championships_wins: { type: Number, default: 0 }, // Nombre de titres mondiaux
      championship_years: [{ type: Number }], // Années de sacre
    },
    podiums: { type: Number, default: 0 },
    driver_championships: { type: Number, default: 0 },
  },
  { versionKey: false },
);

const Constructor = mongoose.model("constructors", constructorSchema);

module.exports = Constructor;
