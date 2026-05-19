const express = require("express");
const mongoose = require("mongoose");
const Post = require("../models/Post");

const router = express.Router();

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function cleanPostInput(body) {
  return {
    title: typeof body.title === "string" ? body.title.trim() : body.title,
    content: typeof body.content === "string" ? body.content.trim() : body.content,
    author: typeof body.author === "string" ? body.author.trim() : body.author
  };
}

router.post("/", async (req, res) => {
  try {
    const { title, content, author } = cleanPostInput(req.body);

    if (!title || !content) {
      return res.status(400).json({
        message: "Title and content are required"
      });
    }

    const post = await Post.create({
      title,
      content,
      author
    });

    res.status(201).json({
      message: "Post created successfully",
      data: post
    });
  } catch (error) {
    console.error("Create post failed:", error.message);

    res.status(500).json({
      message: "Failed to create post"
    });
  }
});

router.get("/", async (req, res) => {
  try {
    const posts = await Post.find().sort({ createdAt: -1 });

    res.status(200).json({
      count: posts.length,
      data: posts
    });
  } catch (error) {
    console.error("Fetch posts failed:", error.message);

    res.status(500).json({
      message: "Failed to fetch posts"
    });
  }
});

router.get("/:id", async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({
        message: "Invalid post ID"
      });
    }

    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({
        message: "Post not found"
      });
    }

    res.status(200).json({
      data: post
    });
  } catch (error) {
    console.error("Fetch post failed:", error.message);

    res.status(500).json({
      message: "Failed to fetch post"
    });
  }
});

router.put("/:id", async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({
        message: "Invalid post ID"
      });
    }

    const { title, content, author } = cleanPostInput(req.body);
    const update = {};

    if (title !== undefined) update.title = title;
    if (content !== undefined) update.content = content;
    if (author !== undefined) update.author = author;

    if (Object.keys(update).length === 0) {
      return res.status(400).json({
        message: "At least one field is required"
      });
    }

    if (update.title === "" || update.content === "") {
      return res.status(400).json({
        message: "Title and content cannot be empty"
      });
    }

    const post = await Post.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true
    });

    if (!post) {
      return res.status(404).json({
        message: "Post not found"
      });
    }

    res.status(200).json({
      message: "Post updated successfully",
      data: post
    });
  } catch (error) {
    console.error("Update post failed:", error.message);

    res.status(500).json({
      message: "Failed to update post"
    });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({
        message: "Invalid post ID"
      });
    }

    const post = await Post.findByIdAndDelete(req.params.id);

    if (!post) {
      return res.status(404).json({
        message: "Post not found"
      });
    }

    res.status(200).json({
      message: "Post deleted successfully"
    });
  } catch (error) {
    console.error("Delete post failed:", error.message);

    res.status(500).json({
      message: "Failed to delete post"
    });
  }
});

module.exports = router;