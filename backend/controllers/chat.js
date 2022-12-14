const Chat = require("../models/chat");
const User = require("../models/user");
const asyncHandler = require("express-async-handler");

// GET ONE ON ONE CHAT
exports.getOneOnOneChat = asyncHandler(async (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    res.status(404);
    throw new Error("UserId missing");
  }

  if (userId === req.user._id)
    return res.status(400).send("You can't chat with yourself");

  const user = await User.findById(userId);
  if (!user) return res.status(404).send({ message: "User not found" });

  let chat = await Chat.findOne({
    users: { $all: [req.user._id, userId] },
    isGroup: false,
  })
    .populate("users", "-password")
    .populate("latestMessage");

  if (!chat) {
    // CREATE NEW ONE ON ONE CHAT
    try {
      const newChat = await Chat.create({
        name: "sender",
        users: [req.user._id, userId],
      });

      chat = await Chat.findById(newChat._id).populate("users", "-password");
    } catch (error) {
      res.status(400);
      throw error;
    }
  } else {
    chat = await User.populate(chat, {
      path: "latestMessage.sender",
      select: "name avatar",
    });
  }
  res.status(200).json(chat);
});

// GET ALL CHATS FOR A USER
exports.getAllChats = asyncHandler(async (req, res) => {
  try {
    let chats = await Chat.find({
      users: { $all: [req.user._id] },
    })
      .populate("users", "-password")
      .populate("groupAdmin", "-password")
      .populate("latestMessage")
      .sort({ updatedAt: -1 });

    chats = await User.populate(chats, {
      path: "latestMessage.sender",
      select: "name avatar",
    });

    res.status(200).json(chats);
  } catch (error) {
    res.status(400);
    throw error;
  }
});

// CREATE GROUP CHAT
exports.newGroupChat = asyncHandler(async (req, res) => {
  const { name, users } = req.body;
  if (!name || !users)
    return res.status(400).send({ message: "Please fill all details" });

  if (users.length < 2)
    return res.status(400).send({ message: "Please select at least 2 users" });

  users.unshift(req.user);

  try {
    const newGrpChat = await Chat.create({
      name,
      users,
      isGroup: true,
      groupAdmin: req.user,
    });

    const chat = await Chat.findById(newGrpChat._id)
      .populate("users", "-password")
      .populate("groupAdmin", "-password");
    res.status(201).json(chat);
  } catch (error) {
    res.status(400);
    throw error;
  }
});

// RENAME GROUP CHAT
exports.renameGroupChat = asyncHandler(async (req, res) => {
  const { chatName, chatId } = req.body;
  if (!chatName || !chatId)
    return res.status(400).send("Please fill all details");

  try {
    const updatedChat = await Chat.findByIdAndUpdate(
      chatId,
      { name: chatName },
      { new: true }
    )
      .populate("users", "-password")
      .populate("groupAdmin", "-password");

    if (!updatedChat) {
      return res.status(404).send({ message: "Chat Not found" });
    } else {
      res.status(200).json(updatedChat);
    }
  } catch (error) {
    throw error;
  }
});

// ADD USERS TO GROUP CHAT
exports.addToGroup = asyncHandler(async (req, res) => {
  const { userIds, chatId } = req.body;
  if (!userIds || !chatId)
    return res.status(400).send({ message: "Please fill all required fields" });

  try {
    // Check if user is already in the chat
    const chat = await Chat.findById(chatId);

    if (chat.groupAdmin.toString() !== req.user._id.toString()) {
      return res.status(401).send({ message: "You do not have permission" });
    }
    const { users } = chat;

    for (let i = 0; i < users.length; i++) {
      if (users.includes(userIds[i])) {
        return res.status(400).send({ message: "User already in chat" });
      }
    }

    const updatedChat = await Chat.findByIdAndUpdate(
      chatId,
      { $push: { users: { $each: userIds } } },
      { new: true }
    )
      .populate("users", "-password")
      .populate("groupAdmin", "-password");

    if (!updatedChat) {
      return res.status(404).send({ message: "Chat Not found" });
    } else {
      res.status(200).json(updatedChat);
    }
  } catch (error) {
    throw error;
  }
});

// EXIT FROM GROUP
exports.exitGroup = asyncHandler(async (req, res) => {
  const { chatId } = req.body;
  if (!chatId)
    return res.status(400).send({ message: "Please fill all required fields" });
  try {
    let message = "";
    const chat = await Chat.findById(chatId);
    
    if (chat.groupAdmin.toString() === req.user._id.toString()) {
      await Chat.findByIdAndDelete(chatId);
      message = "You left and the group was deleted";
    } else {
      await Chat.findByIdAndUpdate(chatId, {
        $pull: { users: req.user._id },
      });
      message = "You left the group";
    }

    let chats = await Chat.find({
      users: { $all: [req.user._id] },
    })
      .populate("users", "-password")
      .populate("groupAdmin", "-password")
      .populate("latestMessage")
      .sort({ updatedAt: -1 });

    chats = await User.populate(chats, {
      path: "latestMessage.sender",
      select: "name avatar",
    });

    res.status(200).json({ chats: chats, message: message });
  } catch (error) {
    throw error;
  }
});

// REMOVE USER FROM GROUP CHAT
exports.removeFromGroup = asyncHandler(async (req, res) => {
  const { userId, chatId } = req.body;
  if (!userId || !chatId)
    return res.status(400).send({ message: "Please fill all required fields" });

  try {
    const chat = await Chat.findById(chatId);
    if (chat.groupAdmin.toString() !== req.user._id.toString()) {
      res.status(401).send({ message: "You do not have permission" });
    }

    const updatedChat = await Chat.findByIdAndUpdate(
      chatId,
      { $pull: { users: userId } },
      { new: true }
    )
      .populate("users", "-password")
      .populate("groupAdmin", "-password");

    if (!updatedChat) {
      return res.status(404).send({ message: "Chat Not found" });
    } else {
      res.status(200).json(updatedChat);
    }
  } catch (error) {
    throw error;
  }
});
