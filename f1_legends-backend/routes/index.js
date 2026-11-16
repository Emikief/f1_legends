var express = require("express");
var router = express.Router();

/* GET API health & root */
router.get("/", function (req, res, next) {
  res.json({
    status: "ok",
    message: "F1 Legends API is operational",
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
