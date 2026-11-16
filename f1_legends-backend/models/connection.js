const mongoose = require("mongoose");

const connectionString = process.env.CONNECTION_STRING;

if (!connectionString) {
  console.warn("⚠️ Attention : CONNECTION_STRING n'est pas définie dans l'environnement !");
}

// Configuration mongoose pour autoriser la mise en mémoire tampon des requêtes
mongoose.set("bufferCommands", true);

// Cache de connexion global pour Vercel Serverless (évite d'ouvrir de multiples sockets)
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function connectDB() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      connectTimeoutMS: 15000,
      serverSelectionTimeoutMS: 15000,
    };

    cached.promise = mongoose
      .connect(connectionString, opts)
      .then((mongooseInstance) => {
        console.log("Database connected 🏁🏎️ 💨");
        return mongooseInstance;
      })
      .catch((err) => {
        console.error("🚩 Erreur de connexion BDD :", err.message);
        cached.promise = null;
        throw err;
      });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

// Tentative de connexion immédiate dès le chargement du module
if (connectionString) {
  connectDB().catch(() => {});
}

module.exports = connectDB;
