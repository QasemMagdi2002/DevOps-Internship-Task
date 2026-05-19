const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const morgan = require("morgan");
require("dotenv").config();
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const postsRoutes = require("./routes/routes");

const app = express();

app.use(helmet());

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100
  })
);

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;

app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

app.get("/", (req, res) => {
  res.status(200).json({
    message: "Posts Backend API is running",
    endpoints: {
      health: "/health",
      posts: "/api/posts"
    }
  });
});

app.get("/health", (req, res) => {
  const dbState = mongoose.connection.readyState;

  res.status(200).json({
    status: "ok",
    database: dbState === 1 ? "connected" : "not connected"
  });
});

app.get("/cpu", (req, res) => {
  const end = Date.now() + 700;

  while (Date.now() < end) {
    Math.sqrt(Math.random());
  }

  res.status(200).json({
    message: "CPU load generated"
  });
});

app.use("/api/posts", postsRoutes);

if (!MONGO_URI) {
  console.error("MONGO_URI environment variable is missing");
  process.exit(1);
}

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log("Connected to MongoDB");

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("MongoDB connection failed:", error.message);
    process.exit(1);
  });