const mongoose = require("mongoose");

const WhatsappMessageSchema = new mongoose.Schema({
  messageId: { type: String, required: true, unique: true },
  sender: { type: String, required: true },
  receiver: { type: String, required: true },
  text: { type: String },
  timestamp: { type: Date, required: true },
  status: { type: String, required: true },
  conversationId: { type: String, required: true },
  expirationTimestamp: { type: Date },
  pricing: {
    billable: { type: Boolean },
    pricingModel: { type: String },
    category: { type: String },
  },
});

const WhatsappMessage = mongoose.model("WhatsappMessage", WhatsappMessageSchema);

module.exports = WhatsappMessage;
