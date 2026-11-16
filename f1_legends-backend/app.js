var path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
require("dotenv").config();
var express = require("express");
var cookieParser = require("cookie-parser");
var logger = require("morgan");
var cors = require("cors");

// Import de la connexion BDD
require("./models/connection");

var indexRouter = require("./routes/index");
var driversRouter = require("./routes/drivers");
var constructorsRouter = require("./routes/constructors");
var racesRouter = require("./routes/races");
var stepsRouter = require("./routes/steps");

var app = express();

app.use(cors());
app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

app.use("/", indexRouter);
app.use("/drivers", driversRouter);
app.use("/constructors", constructorsRouter);
app.use("/races", racesRouter);
app.use("/api/steps", stepsRouter);
app.use("/steps", stepsRouter);

module.exports = app;
