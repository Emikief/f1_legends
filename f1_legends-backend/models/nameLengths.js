const mongoose = require("mongoose");

const nameLengthSchema = new mongoose.Schema(
  {
    _id: { type: Number, required: true }, // Longueur en lettres (ex: 5, 6, 8, 10)
    category_name: { type: String, required: true },
    description: { type: String, required: true },
    difficulty_pronunciation: { type: String },
  },
  { versionKey: false }
);

module.exports = mongoose.model("name_lengths", nameLengthSchema);
