const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const morgan = require("morgan");
require("dotenv").config();

const postsRoutes = require("./routes/routes");

const app = express();

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